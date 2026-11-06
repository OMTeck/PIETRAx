import { wandImageFromRgba, floodSelect, finalizeMask } from './magicWand';

/**
 * Follows the tapped surface across live camera frames. Each analysis frame
 * reruns the smart-select region growing from the tap point; if that lands on
 * something else (the phone moved), it retries from the previous region's
 * centroid and keeps whichever result overlaps the previous mask more. The
 * mask is smoothed over time so it does not flicker.
 */
export interface TrackResult {
  /** Soft mask 0..255, w×h. */
  soft: Uint8Array;
  /** Binary mask of this frame (for capture). */
  binary: Uint8Array;
  /** Share of the frame covered. */
  coverage: number;
  /** Mean luma 0..1 of the masked region. */
  lumaMean: number;
  /** Screen y of the region's top edge (0..1). */
  top: number;
}

export class LiveTracker {
  private acc: Float32Array | null = null;
  private prev: Uint8Array | null = null;
  private centroid: { x: number; y: number } | null = null;

  constructor(public readonly w: number, public readonly h: number) {}

  reset(): void {
    this.acc = null;
    this.prev = null;
    this.centroid = null;
  }

  /**
   * @param allowed optional w×h mask of pixels that may belong to the surface
   *   (for floors with gyroscope geometry: below the horizon), so the region
   *   cannot leak up a wall of similar colour.
   */
  track(rgba: Uint8ClampedArray, seed: { x: number; y: number }, tolerance: number, allowed?: Uint8Array | null): TrackResult | null {
    const { w, h } = this;
    const img = wandImageFromRgba(rgba, w, h);
    const grow = (x: number, y: number) => {
      const raw = floodSelect(img, x, y, { tolerance, edgeThreshold: tolerance * 1.3 });
      if (allowed) for (let i = 0; i < raw.length; i++) raw[i] &= allowed[i];
      return finalizeMask(raw, w, h, 'replace', true);
    };

    let mask = grow(seed.x, seed.y);
    if (this.prev && this.centroid) {
      const a = iou(mask, this.prev);
      if (a < 0.35) {
        const alt = grow(this.centroid.x, this.centroid.y);
        if (iou(alt, this.prev) > a) mask = alt;
      }
    }

    let n = 0, sx = 0, sy = 0, lsum = 0, top = h;
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!mask[i]) continue;
        n++; sx += x; sy += y; row++;
        const o = i * 4;
        lsum += (0.299 * rgba[o] + 0.587 * rgba[o + 1] + 0.114 * rgba[o + 2]) / 255;
      }
      if (row > w * 0.12 && y < top) top = y;
    }
    if (n < w * h * 0.004) {
      // Lost it: fade out what was shown.
      if (this.acc) for (let i = 0; i < this.acc.length; i++) this.acc[i] *= 0.6;
      this.prev = null;
      this.centroid = null;
      return this.acc ? { soft: toBytes(this.acc), binary: new Uint8Array(w * h), coverage: 0, lumaMean: 0.5, top: 1 } : null;
    }
    this.centroid = { x: sx / n / w, y: sy / n / h };
    this.prev = mask;

    // Temporal smoothing, then a light blur for soft edges.
    if (!this.acc) this.acc = new Float32Array(w * h);
    const k = 0.55;
    for (let i = 0; i < w * h; i++) this.acc[i] = this.acc[i] * (1 - k) + mask[i] * k;
    return {
      soft: toBytes(blur3(this.acc, w, h)),
      binary: mask,
      coverage: n / (w * h),
      lumaMean: lsum / n,
      top: (top === h ? h - 1 : top) / h,
    };
  }
}

function iou(a: Uint8Array, b: Uint8Array): number {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.length; i++) {
    inter += a[i] & b[i];
    uni += a[i] | b[i];
  }
  return uni ? inter / uni : 0;
}

function blur3(src: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0, c = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          s += src[yy * w + xx]; c++;
        }
      }
      out[y * w + x] = s / c;
    }
  }
  return out;
}

function toBytes(f: Float32Array): Uint8Array {
  const out = new Uint8Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(f[i] * 255)));
  return out;
}
