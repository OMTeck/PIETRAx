import type { NormalizedPoint } from './types';
import { simplifyPolygon } from './geometry';

/**
 * "Magic wand" free selection: the visitor clicks any part of the photo and
 * the connected region of similar colour (bounded by strong edges) becomes a
 * surface polygon. Runs entirely in the browser on a downscaled copy, so it is
 * instant and costs nothing on the server.
 *
 * Coordinates are normalized (0..1) against the cover-cropped box at `aspect`,
 * the same convention used by the AI segments and clip paths.
 */

export interface WandImage {
  w: number;
  h: number;
  /** CIE-Lab triplets, length 3*w*h. */
  lab: Float32Array;
  /** Sobel gradient magnitude of L*, length w*h. */
  grad: Float32Array;
}

export interface WandOptions {
  /** Max colour distance (ΔE76) from the running region mean. */
  tolerance?: number;
  /** Gradient magnitude above which a pixel counts as an edge and blocks growth. */
  edgeThreshold?: number;
}

const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const labF = (t: number): number => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** Converts RGBA pixels into a Lab + gradient image. Exported for tests. */
export function wandImageFromRgba(rgba: Uint8ClampedArray, w: number, h: number): WandImage {
  const n = w * h;
  // Light 3x3 box blur so stone veining / fabric texture doesn't fragment the region.
  const blurred = new Float32Array(n * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const i = (yy * w + xx) * 4;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; c++;
        }
      }
      const o = (y * w + x) * 3;
      blurred[o] = r / c; blurred[o + 1] = g / c; blurred[o + 2] = b / c;
    }
  }

  const lab = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const R = srgbToLinear(blurred[i * 3]);
    const G = srgbToLinear(blurred[i * 3 + 1]);
    const B = srgbToLinear(blurred[i * 3 + 2]);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const fx = labF(X), fy = labF(Y), fz = labF(Z);
    lab[i * 3] = 116 * fy - 16;
    lab[i * 3 + 1] = 500 * (fx - fy);
    lab[i * 3 + 2] = 200 * (fy - fz);
  }

  const grad = new Float32Array(n);
  const L = (x: number, y: number): number => {
    const xx = Math.max(0, Math.min(w - 1, x));
    const yy = Math.max(0, Math.min(h - 1, y));
    return lab[(yy * w + xx) * 3];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = -L(x - 1, y - 1) - 2 * L(x - 1, y) - L(x - 1, y + 1) + L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1);
      const gy = -L(x - 1, y - 1) - 2 * L(x, y - 1) - L(x + 1, y - 1) + L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1);
      grad[y * w + x] = Math.hypot(gx, gy) / 4;
    }
  }
  return { w, h, lab, grad };
}

/** Draws `img` cover-cropped to `aspect` at <= maxDim px and builds the wand image. */
export function prepareWandImage(img: HTMLImageElement, aspect: number, maxDim = 360): WandImage | null {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  if (!iw || !ih) return null;
  const w = aspect >= 1 ? maxDim : Math.max(1, Math.round(maxDim * aspect));
  const h = aspect >= 1 ? Math.max(1, Math.round(maxDim / aspect)) : maxDim;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  // object-fit: cover crop, centred (matches the <img className="object-cover">).
  const scale = Math.max(w / iw, h / ih);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  return wandImageFromRgba(data, w, h);
}

/**
 * Region growing from the clicked point. A pixel joins when it is close to the
 * running region mean, close to the neighbour it was reached from, and is not
 * on a strong edge.
 */
export function floodSelect(img: WandImage, nx: number, ny: number, opts: WandOptions = {}): Uint8Array {
  const { w, h, lab, grad } = img;
  const tol = opts.tolerance ?? 14;
  const edge = opts.edgeThreshold ?? 18;
  const mask = new Uint8Array(w * h);
  const sx = Math.max(0, Math.min(w - 1, Math.floor(nx * w)));
  const sy = Math.max(0, Math.min(h - 1, Math.floor(ny * h)));
  const seed = sy * w + sx;

  let mL = lab[seed * 3], mA = lab[seed * 3 + 1], mB = lab[seed * 3 + 2];
  let count = 1;
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  queue[tail++] = seed;
  mask[seed] = 1;
  const tolSq = tol * tol;
  const localSq = (tol * 0.6) ** 2;

  while (head < tail) {
    const p = queue[head++];
    const px = p % w, py = (p - px) / w;
    const pL = lab[p * 3], pA = lab[p * 3 + 1], pB = lab[p * 3 + 2];
    for (let k = 0; k < 4; k++) {
      const qx = k === 0 ? px - 1 : k === 1 ? px + 1 : px;
      const qy = k === 2 ? py - 1 : k === 3 ? py + 1 : py;
      if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
      const q = qy * w + qx;
      if (mask[q]) continue;
      if (grad[q] > edge) continue;
      const L = lab[q * 3], A = lab[q * 3 + 1], B = lab[q * 3 + 2];
      const dm = (L - mL) ** 2 + (A - mA) ** 2 + (B - mB) ** 2;
      if (dm > tolSq) continue;
      const dl = (L - pL) ** 2 + (A - pA) ** 2 + (B - pB) ** 2;
      if (dl > localSq) continue;
      mask[q] = 1;
      queue[tail++] = q;
      count++;
      mL += (L - mL) / count;
      mA += (A - mA) / count;
      mB += (B - mB) / count;
    }
  }
  return mask;
}

function morph(mask: Uint8Array, w: number, h: number, r: number, dilate: boolean): Uint8Array {
  // Separable square structuring element: horizontal then vertical pass.
  const tmp = new Uint8Array(w * h);
  const out = new Uint8Array(w * h);
  const want = dilate ? 1 : 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let d = -r; d <= r && v !== want; d++) {
        const xx = x + d;
        const m = xx < 0 || xx >= w ? (dilate ? 0 : 1) : mask[y * w + xx];
        if (m === want) v = want;
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = dilate ? 0 : 1;
      for (let d = -r; d <= r && v !== want; d++) {
        const yy = y + d;
        const m = yy < 0 || yy >= h ? (dilate ? 0 : 1) : tmp[yy * w + x];
        if (m === want) v = want;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/** Keeps only the largest 4-connected component. */
function largestComponent(mask: Uint8Array, w: number, h: number): Uint8Array {
  const label = new Int32Array(w * h);
  const queue = new Int32Array(w * h);
  let best = 0, bestSize = 0, next = 0;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || label[i]) continue;
    next++;
    let head = 0, tail = 0, size = 0;
    queue[tail++] = i;
    label[i] = next;
    while (head < tail) {
      const p = queue[head++];
      size++;
      const px = p % w, py = (p - px) / w;
      const nb = [px > 0 ? p - 1 : -1, px < w - 1 ? p + 1 : -1, py > 0 ? p - w : -1, py < h - 1 ? p + w : -1];
      for (const q of nb) {
        if (q >= 0 && mask[q] && !label[q]) { label[q] = next; queue[tail++] = q; }
      }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  const out = new Uint8Array(w * h);
  if (best) for (let i = 0; i < w * h; i++) out[i] = label[i] === best ? 1 : 0;
  return out;
}

/** Fills enclosed holes (a polygon cannot represent them anyway). */
function fillHoles(mask: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let tail = 0;
  const push = (i: number) => { if (!mask[i] && !outside[i]) { outside[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  let head = 0;
  while (head < tail) {
    const p = queue[head++];
    const px = p % w, py = (p - px) / w;
    if (px > 0) push(p - 1);
    if (px < w - 1) push(p + 1);
    if (py > 0) push(p - w);
    if (py < h - 1) push(p + w);
  }
  const out = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = outside[i] ? 0 : 1;
  return out;
}

/** Closing (smooths ragged borders and bridges grout lines) + largest blob + hole fill. */
export function cleanMask(mask: Uint8Array, w: number, h: number, radius = 2): Uint8Array {
  const closed = morph(morph(mask, w, h, radius, true), w, h, radius, false);
  return fillHoles(largestComponent(closed, w, h), w, h);
}

// Clockwise on screen (y down), starting West.
const DX = [-1, -1, 0, 1, 1, 1, 0, -1];
const DY = [0, -1, -1, -1, 0, 1, 1, 1];
const dirOf = (dx: number, dy: number): number => {
  for (let i = 0; i < 8; i++) if (DX[i] === dx && DY[i] === dy) return i;
  return 0;
};

/** Moore-neighbour boundary trace of the (single) blob, in pixel coordinates. */
export function traceContour(mask: Uint8Array, w: number, h: number): { x: number; y: number }[] {
  const fg = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  let start = -1;
  for (let i = 0; i < w * h; i++) if (mask[i]) { start = i; break; }
  if (start < 0) return [];
  const sx = start % w, sy = (start - sx) / w;
  const out: { x: number; y: number }[] = [{ x: sx, y: sy }];

  let px = sx, py = sy;
  let d = 0; // backtrack direction from p (the West neighbour is background in raster order)
  let second: { x: number; y: number } | null = null;
  const cap = 4 * w * h + 8;
  for (let iter = 0; iter < cap; iter++) {
    let found = -1;
    for (let k = 1; k <= 8; k++) {
      const idx = (d + k) % 8;
      if (fg(px + DX[idx], py + DY[idx])) { found = idx; break; }
    }
    if (found < 0) break; // isolated pixel
    const qx = px + DX[found], qy = py + DY[found];
    const prev = (found + 7) % 8;
    const bx = px + DX[prev], by = py + DY[prev];
    if (px === sx && py === sy) {
      if (second && second.x === qx && second.y === qy) break;
      if (!second) second = { x: qx, y: qy };
    }
    d = dirOf(bx - qx, by - qy);
    px = qx; py = qy;
    if (px === sx && py === sy) continue;
    out.push({ x: px, y: py });
  }
  return out;
}

/** Mask -> simplified normalized polygon (pixel centres). */
export function maskToPolygon(mask: Uint8Array, w: number, h: number): NormalizedPoint[] {
  const contour = traceContour(mask, w, h);
  if (contour.length < 3) return [];
  const pts = contour.map((p) => ({ x: (p.x + 0.5) / w, y: (p.y + 0.5) / h }));
  // Snap to the frame when touching the border so the material reaches the edge.
  for (const p of pts) {
    if (p.x <= 0.75 / w) p.x = 0;
    if (p.x >= 1 - 0.75 / w) p.x = 1;
    if (p.y <= 0.75 / h) p.y = 0;
    if (p.y >= 1 - 0.75 / h) p.y = 1;
  }
  return simplifyPolygon(pts, 0.0025, 200);
}

export type WandMode = 'replace' | 'add' | 'subtract';

/** Combines a fresh click selection into the existing mask according to `mode`. */
export function combineMasks(prev: Uint8Array | null, next: Uint8Array, mode: WandMode): Uint8Array {
  if (!prev || mode === 'replace' || prev.length !== next.length) return next;
  const out = new Uint8Array(next.length);
  for (let i = 0; i < next.length; i++) {
    out[i] = mode === 'add' ? (prev[i] | next[i]) : (prev[i] & (next[i] ^ 1));
  }
  return out;
}

/**
 * Subtracting must not have its hole re-filled, so only the closing + largest
 * blob is applied in that case.
 */
export function finalizeMask(mask: Uint8Array, w: number, h: number, mode: WandMode): Uint8Array {
  if (mode === 'subtract') return largestComponent(mask, w, h);
  return cleanMask(mask, w, h);
}
