/**
 * Realistic stone installation engine.
 *
 * Maps a real material texture onto a room surface the way an installer would
 * lay it: the layout is computed in real-world units (metres) from the product's
 * physical dimensions, so each piece has correct scale and aspect, joints fall
 * between pieces, and pieces are cut cleanly at the surface boundary.
 *
 * The material's *identity* is preserved: every output pixel is a sample of the
 * source texture. It is transformed geometrically and modulated by the room's
 * own luminance (lighting/shadow) — never regenerated, recoloured or repainted.
 *
 * AI/computer vision is used ONLY upstream to produce the surface polygon and
 * (optionally) geometry hints. Everything here is pure geometry + sampling.
 */

import type { NormalizedPoint, SurfaceKind } from './types';

export type SamplingMode = 'nearest' | 'bilinear';
export type InstallPattern = 'stack' | 'running-bond' | 'third-bond';
export type LightingMode = 'neutral' | 'realistic';

export interface TextureMapParams {
  /** Physical piece width in centimetres. */
  tileWidthCm: number;
  /** Physical piece height in centimetres. */
  tileHeightCm: number;
  /** Multiplier applied to the piece size. 1 = real size, 2 = twice as large. */
  patternScale: number;
  /** Pattern rotation within the surface plane, degrees. */
  rotationDeg: number;
  /** Pattern offset in piece units. */
  offsetX: number;
  offsetY: number;
  /** Explicit repeat count across the surface. 0 = derive from piece size. */
  repeatX: number;
  repeatY: number;
  /** Joint width in centimetres (0 = butt-jointed). */
  groutWidthCm: number;
  /** Joint colour as #rrggbb. */
  groutColor: string;
  /** Mirror the pattern horizontally. */
  flipX: boolean;
  /** Mirror the pattern vertically. */
  flipY: boolean;
  /** Nearest = exact source pixels. Bilinear = smoother geometric sampling. */
  sampling: SamplingMode;
  /** Installation bond/layout. */
  pattern: InstallPattern;
  /** Neutral flat light, or realistic light derived from the room photo. */
  lightingMode: LightingMode;
  /** How strongly the room lighting modulates the stone (0..1). */
  lightingStrength: number;
  /** Ambient/contact shadow strength at surface edges (0..1). */
  shadowStrength: number;
  /** Blend the surface boundary into the room over N px (0 = hard edge). */
  featherPx: number;
  /** Front-edge thickness for countertops in cm (0 = none). */
  edgeThicknessCm: number;
}

export const DEFAULT_TEXTURE_PARAMS: TextureMapParams = {
  tileWidthCm: 60,
  tileHeightCm: 120,
  patternScale: 1,
  rotationDeg: 0,
  offsetX: 0,
  offsetY: 0,
  repeatX: 0,
  repeatY: 0,
  groutWidthCm: 0.2,
  groutColor: '#c9c4bb',
  flipX: false,
  flipY: false,
  sampling: 'bilinear',
  pattern: 'stack',
  lightingMode: 'realistic',
  lightingStrength: 0.85,
  shadowStrength: 0.4,
  featherPx: 2,
  edgeThicknessCm: 0,
};

export interface RenderSurfaceOptions {
  /** Room image (already decoded). */
  roomImage: HTMLImageElement | HTMLCanvasElement;
  /** Surface polygon in image space (normalized 0..1). */
  polygon: NormalizedPoint[];
  /** Source texture (already decoded). */
  texture: HTMLImageElement | HTMLCanvasElement;
  /** Mapping parameters. */
  params: TextureMapParams;
  /** Pixels per metre used to convert the polygon into physical size. */
  pxPerMeter: number;
  /** Cap the render long edge (keeps previews fast). */
  maxDimension?: number;
  /** Which kind of surface we are dressing (drives countertop edge, etc.). */
  surfaceKind?: SurfaceKind;
}

interface Pt {
  x: number;
  y: number;
}

const UNIT_SQUARE: Pt[] = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Convex hull (Andrew monotone chain). */
function convexHull(points: Pt[]): Pt[] {
  if (points.length <= 3) return points.slice();
  const pts = points.slice().sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/**
 * Orders a set of points as a quad: clockwise in image space (y down), starting
 * from the top-left-most corner. Keeps the homography correspondence stable.
 */
function orderQuad(points: Pt[]): Pt[] {
  if (points.length < 3) return points;
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const pts = points
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  const ordered = area > 0 ? pts : pts.slice().reverse();
  let start = 0;
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].y < ordered[start].y || (ordered[i].y === ordered[start].y && ordered[i].x < ordered[start].x)) {
      start = i;
    }
  }
  return [...ordered.slice(start), ...ordered.slice(0, start)];
}

/** Fit a quadrilateral to an arbitrary surface polygon (planar region). */
function fitQuad(points: Pt[]): Pt[] {
  const hull = convexHull(points);
  if (hull.length <= 4) return orderQuad(hull);
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  const corners: (Pt | null)[] = [null, null, null, null];
  const best: number[] = [-1, -1, -1, -1];
  for (const p of hull) {
    const q = (p.y < cy ? 0 : 2) + (p.x < cx ? 0 : 1);
    const d = (p.x - cx) ** 2 + (p.y - cy) ** 2;
    if (d > best[q]) {
      best[q] = d;
      corners[q] = p;
    }
  }
  const quad = corners.filter((p): p is Pt => p !== null);
  if (quad.length < 3) return orderQuad(hull);
  return orderQuad(quad);
}

/** Solve an 8x8 linear system via Gaussian elimination with partial pivoting. */
function solve8(a: number[][], b: number[]): number[] | null {
  const n = 8;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    }
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / m[col][col];
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Homography (h00..h21, h22 = 1) mapping `src` -> `dst` for four points. */
function homography(src: Pt[], dst: Pt[]): number[] | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = src[i];
    const d = dst[i];
    a.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]);
    b.push(d.x);
    a.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]);
    b.push(d.y);
  }
  return solve8(a, b);
}

function applyH(h: number[], x: number, y: number): Pt {
  const w = h[6] * x + h[7] * y + 1;
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}

function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distToSegment(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
}

function distToEdges(px: number, py: number, poly: Pt[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const d = distToSegment(px, py, poly[i], poly[(i + 1) % poly.length]);
    if (d < min) min = d;
  }
  return min;
}

function parseColor(hex: string): { r: number; g: number; b: number } {
  const m = hex.replace('#', '');
  const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m.padEnd(6, '0').slice(0, 6);
  const n = parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 200, g: 200, b: 200 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function sampleTexture(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  fx: number,
  fy: number,
  mode: SamplingMode,
): { r: number; g: number; b: number } {
  if (mode === 'nearest') {
    const sx = Math.min(w - 1, Math.max(0, Math.floor(fx * w)));
    const sy = Math.min(h - 1, Math.max(0, Math.floor(fy * h)));
    const i = (sy * w + sx) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  }
  const gx = fx * (w - 1);
  const gy = fy * (h - 1);
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const x1 = Math.min(w - 1, x0 + 1);
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = gx - x0;
  const ty = gy - y0;
  const at = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]] as const;
  };
  const p00 = at(x0, y0);
  const p10 = at(x1, y0);
  const p01 = at(x0, y1);
  const p11 = at(x1, y1);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  return {
    r: Math.round(lerp(lerp(p00[0], p10[0], tx), lerp(p01[0], p11[0], tx), ty)),
    g: Math.round(lerp(lerp(p00[1], p10[1], tx), lerp(p01[1], p11[1], tx), ty)),
    b: Math.round(lerp(lerp(p00[2], p10[2], tx), lerp(p01[2], p11[2], tx), ty)),
  };
}

/** Separable box blur over a luminance field. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const denom = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / denom;
      sum += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / denom;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Renders the material onto the room image inside `polygon` as a realistic
 * installation. Returns a new canvas; the inputs are not modified.
 */
export function renderSurfaceTexture(opts: RenderSurfaceOptions): HTMLCanvasElement {
  const { roomImage, polygon, texture, params, pxPerMeter, maxDimension, surfaceKind } = opts;
  const srcW = roomImage instanceof HTMLCanvasElement ? roomImage.width : roomImage.naturalWidth;
  const srcH = roomImage instanceof HTMLCanvasElement ? roomImage.height : roomImage.naturalHeight;
  if (!srcW || !srcH) throw new Error('Room image has no dimensions');

  const scale = Math.min(1, (maxDimension ?? 1600) / Math.max(srcW, srcH));
  const W = Math.max(1, Math.round(srcW * scale));
  const H = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(roomImage, 0, 0, W, H);

  const out = ctx.getImageData(0, 0, W, H);
  const pixels = out.data;

  const texW = texture instanceof HTMLCanvasElement ? texture.width : texture.naturalWidth;
  const texH = texture instanceof HTMLCanvasElement ? texture.height : texture.naturalHeight;
  if (!texW || !texH) return canvas;

  const texCanvas = document.createElement('canvas');
  texCanvas.width = texW;
  texCanvas.height = texH;
  const texCtx = texCanvas.getContext('2d', { willReadFrequently: true });
  if (!texCtx) return canvas;
  texCtx.drawImage(texture, 0, 0);
  const texData = texCtx.getImageData(0, 0, texW, texH).data;

  const poly = polygon.map((p) => ({ x: p.x * W, y: p.y * H }));
  const quad = fitQuad(poly);
  const h = homography(UNIT_SQUARE, quad);
  if (!h) return canvas;
  const hi = homography(quad, UNIT_SQUARE);
  if (!hi) return canvas;

  const topW = dist(quad[0], quad[1]);
  const bottomW = dist(quad[3], quad[2]);
  const leftH = dist(quad[0], quad[3]);
  const rightH = dist(quad[1], quad[2]);
  const widthPx = (topW + bottomW) / 2;
  const heightPx = (leftH + rightH) / 2;
  const ppm = Math.max(20, pxPerMeter * scale);
  const surfaceWm = Math.max(0.01, widthPx / ppm);
  const surfaceHm = Math.max(0.01, heightPx / ppm);

  const tileWm = params.repeatX > 0 ? surfaceWm / params.repeatX : Math.max(0.01, (params.tileWidthCm * params.patternScale) / 100);
  const tileHm = params.repeatY > 0 ? surfaceHm / params.repeatY : Math.max(0.01, (params.tileHeightCm * params.patternScale) / 100);

  const rot = (params.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const cx = surfaceWm / 2;
  const cy = surfaceHm / 2;

  const groutWm = Math.max(0, params.groutWidthCm / 100);
  const groutX = Math.min(0.6, groutWm / tileWm);
  const groutY = Math.min(0.6, groutWm / tileHm);
  const grout = parseColor(params.groutColor || '#cccccc');

  const minX = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.x))));
  const maxX = Math.min(W - 1, Math.ceil(Math.max(...quad.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...quad.map((p) => p.y))));
  const maxY = Math.min(H - 1, Math.ceil(Math.max(...quad.map((p) => p.y))));

  // --- Lighting field derived from the room photograph -----------------------
  // Only brightness is modulated; hue/pattern of the stone are untouched.
  const useLight = params.lightingMode === 'realistic' && params.lightingStrength > 0;
  let luma: Float32Array | null = null;
  let meanLuma = 0;
  if (useLight) {
    luma = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      luma[i] = 0.299 * pixels[i * 4] + 0.587 * pixels[i * 4 + 1] + 0.114 * pixels[i * 4 + 2];
    }
    const radius = Math.max(2, Math.round(Math.min(W, H) / 120));
    luma = boxBlur(luma, W, H, radius);
    let acc = 0;
    let count = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!pointInPolygon(x + 0.5, y + 0.5, poly)) continue;
        acc += luma[y * W + x];
        count++;
      }
    }
    meanLuma = count > 0 ? acc / count : 0;
  }

  const feather = Math.max(0, params.featherPx);
  const shadowStrength = Math.max(0, Math.min(1, params.shadowStrength));
  const shadowBand = Math.max(6, Math.min(widthPx, heightPx) * 0.05);
  const lightStrength = Math.max(0, Math.min(1, params.lightingStrength));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      if (!pointInPolygon(px, py, poly)) continue;
      const uv = applyH(hi, px, py);
      if (uv.x < 0 || uv.x > 1 || uv.y < 0 || uv.y > 1) continue;

      // Physical position on the surface (metres), rotated about the centre.
      let lx = uv.x * surfaceWm;
      let ly = uv.y * surfaceHm;
      const dx = lx - cx;
      const dy = ly - cy;
      lx = cx + dx * cos - dy * sin;
      ly = cy + dx * sin + dy * cos;

      // Piece grid in real-world units, with the chosen bond.
      const gyRaw = ly / tileHm + params.offsetY;
      const row = Math.floor(gyRaw);
      let bond = 0;
      if (params.pattern === 'running-bond') bond = ((row % 2) + 2) % 2 === 0 ? 0 : 0.5;
      else if (params.pattern === 'third-bond') bond = (((row % 3) + 3) % 3) / 3;

      let gx = lx / tileWm + params.offsetX + bond;
      let gy = gyRaw;
      if (params.flipX) gx = -gx;
      if (params.flipY) gy = -gy;

      const fx = gx - Math.floor(gx);
      const fy = gy - Math.floor(gy);

      let r: number;
      let g: number;
      let b: number;
      if ((groutX > 0 && fx < groutX) || (groutY > 0 && fy < groutY)) {
        r = grout.r;
        g = grout.g;
        b = grout.b;
      } else {
        const u = groutX > 0 ? (fx - groutX) / (1 - groutX) : fx;
        const v = groutY > 0 ? (fy - groutY) / (1 - groutY) : fy;
        const c = sampleTexture(texData, texW, texH, u, v, params.sampling);
        r = c.r;
        g = c.g;
        b = c.b;
      }

      // Realistic lighting: modulate brightness by the room's own luminance.
      if (useLight && luma) {
        const l = luma[y * W + x];
        const ratio = meanLuma > 1 ? l / meanLuma : 1;
        const shade = Math.max(0.45, Math.min(1.6, 1 + (ratio - 1) * lightStrength));
        r = Math.min(255, r * shade);
        g = Math.min(255, g * shade);
        b = Math.min(255, b * shade);
      }

      // Contact/ambient shadow + boundary feather (single distance pass).
      let alpha = 1;
      if (shadowStrength > 0 || feather > 0) {
        const edge = distToEdges(px, py, poly);
        if (shadowStrength > 0 && edge < shadowBand) {
          const t = 1 - edge / shadowBand;
          const darken = 1 - shadowStrength * t * t * 0.6;
          r *= darken;
          g *= darken;
          b *= darken;
        }
        if (feather > 0) alpha = Math.max(0, Math.min(1, edge / feather + 0.25));
      }

      const idx = (y * W + x) * 4;
      if (alpha >= 1) {
        pixels[idx] = r;
        pixels[idx + 1] = g;
        pixels[idx + 2] = b;
      } else {
        pixels[idx] = r * alpha + pixels[idx] * (1 - alpha);
        pixels[idx + 1] = g * alpha + pixels[idx + 1] * (1 - alpha);
        pixels[idx + 2] = b * alpha + pixels[idx + 2] * (1 - alpha);
      }
      pixels[idx + 3] = 255;
    }
  }

  // --- Countertop front edge (material thickness) ---------------------------
  if (surfaceKind === 'countertop' && params.edgeThicknessCm > 0) {
    const edgePx = Math.max(2, Math.round((params.edgeThicknessCm / 100) * ppm * 0.7));
    for (let x = minX; x <= maxX; x++) {
      // Find the lowest inside pixel in this column (the front edge).
      let bottom = -1;
      for (let y = maxY; y >= minY; y--) {
        if (pointInPolygon(x + 0.5, y + 0.5, poly)) { bottom = y; break; }
      }
      if (bottom < 0) continue;
      const uv = applyH(hi, x + 0.5, bottom + 0.5);
      const c = sampleTexture(texData, texW, texH, uv.x, uv.y, params.sampling);
      for (let d = 1; d <= edgePx; d++) {
        const y = bottom + d;
        if (y > H - 1) break;
        const fade = 1 - (d / edgePx) * 0.45;
        const idx = (y * W + x) * 4;
        pixels[idx] = c.r * fade * 0.85;
        pixels[idx + 1] = c.g * fade * 0.85;
        pixels[idx + 2] = c.b * fade * 0.85;
        pixels[idx + 3] = 255;
      }
    }
  }

  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** Loads an image with CORS so its pixels can be read by the canvas. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

/**
 * Draws an image into a canvas of a fixed aspect using "cover" semantics
 * (scale to fill, centre-crop). Preset-room clip-paths are authored against
 * this display box, so the surface polygon stays aligned with the pixels.
 */
export function coverCanvas(img: HTMLImageElement, aspect: number, maxDimension = 1600): HTMLCanvasElement {
  const w = img.naturalWidth || 1;
  const h = img.naturalHeight || 1;
  const a = aspect > 0 && Number.isFinite(aspect) ? aspect : w / h;
  const longEdge = Math.max(1, Math.min(maxDimension, Math.max(w, h)));
  const cw = a >= 1 ? longEdge : Math.max(1, Math.round(longEdge * a));
  const ch = a >= 1 ? Math.max(1, Math.round(longEdge / a)) : longEdge;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const s = Math.max(cw / w, ch / h);
  const dw = w * s;
  const dh = h * s;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  return c;
}

/** Parses a CSS `polygon(...)` clip-path into normalized points. */
export function parseClipPath(path: string): NormalizedPoint[] {
  const match = path.match(/polygon\((.*)\)/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((chunk) => chunk.trim().split(/\s+/))
    .filter((pair) => pair.length >= 2)
    .map((pair) => ({ x: parseFloat(pair[0]) / 100, y: parseFloat(pair[1]) / 100 }));
}

/** Parses a product size label such as "60×120" or "60 x 120 cm" into cm. */
export function parseSizeCm(label: string): { w: number; h: number } | null {
  const m = label.replace(/×/g, 'x').replace(/[xX]/g, 'x').match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) return null;
  return { w, h };
}

/** Typical marble/stone slab footprint used when only "Slab" is known. */
const SLAB_DIMENSIONS = { w: 280, h: 160 };

/**
 * Derives realistic installation defaults from a material's stored config and
 * product dimensions. Real product measurements always win over the fallback.
 */
export function paramsFromMaterial(
  material: {
    tileWidth?: number | null;
    tileHeight?: number | null;
    patternScale?: number | null;
    rotation?: number | null;
    groutWidth?: number | null;
    groutColor?: string | null;
    sizeLabel?: string | null;
  },
  mode: LightingMode = 'realistic',
): TextureMapParams {
  let w = material.tileWidth && material.tileWidth > 0 ? material.tileWidth : 0;
  let h = material.tileHeight && material.tileHeight > 0 ? material.tileHeight : 0;
  if ((!w || !h) && material.sizeLabel) {
    const parsed = parseSizeCm(material.sizeLabel);
    if (parsed) {
      w = parsed.w;
      h = parsed.h;
    } else if (/slab/i.test(material.sizeLabel)) {
      w = SLAB_DIMENSIONS.w;
      h = SLAB_DIMENSIONS.h;
    }
  }
  if (!w || !h) {
    w = DEFAULT_TEXTURE_PARAMS.tileWidthCm;
    h = DEFAULT_TEXTURE_PARAMS.tileHeightCm;
  }
  const strict = mode === 'neutral';
  return {
    ...DEFAULT_TEXTURE_PARAMS,
    tileWidthCm: w,
    tileHeightCm: h,
    patternScale: material.patternScale && material.patternScale > 0 ? material.patternScale : 1,
    rotationDeg: material.rotation ?? 0,
    // Catalog joint width is stored in millimetres; the engine works in centimetres.
    groutWidthCm: material.groutWidth && material.groutWidth > 0 ? material.groutWidth / 10 : DEFAULT_TEXTURE_PARAMS.groutWidthCm,
    groutColor: material.groutColor || DEFAULT_TEXTURE_PARAMS.groutColor,
    sampling: strict ? 'nearest' : 'bilinear',
    lightingMode: strict ? 'neutral' : 'realistic',
    shadowStrength: strict ? 0 : DEFAULT_TEXTURE_PARAMS.shadowStrength,
    featherPx: strict ? 0 : DEFAULT_TEXTURE_PARAMS.featherPx,
  };
}
