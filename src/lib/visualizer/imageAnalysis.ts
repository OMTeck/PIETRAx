import type { RoomLuma, RoomLayout } from './types';

export function imageLuma(img: HTMLImageElement, maxW: number, maxH: number): RoomLuma | null {
  try {
    const scale = Math.min(1, maxW / (img.naturalWidth || 1), maxH / (img.naturalHeight || 1));
    const w = Math.max(48, Math.round((img.naturalWidth || 48) * scale));
    const h = Math.max(48, Math.round((img.naturalHeight || 48) * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const luma = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
      luma[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    }
    return { w, h, luma };
  } catch {
    return null;
  }
}

/** Find the row where the vertical luminance gradient is strongest (wall/floor seam). */
export function detectHorizon(room: RoomLuma): number {
  const { luma, w, h } = room;
  const amp = new Float32Array(h);
  for (let y = 1; y < h - 1; y++) {
    let acc = 0;
    for (let x = 0; x < w; x++) {
      acc += Math.abs(luma[(y + 1) * w + x] - luma[(y - 1) * w + x]);
    }
    amp[y] = acc / w;
  }
  // prefer strong seam in the lower-middle band (room scenes)
  let best = Math.round(h * 0.55);
  let bestScore = -1;
  const from = Math.round(h * 0.3);
  const to = Math.round(h * 0.85);
  for (let y = from; y < to; y++) {
    const score = amp[y] - amp[y - 3] - amp[y + 3];
    if (score > bestScore) {
      bestScore = score;
      best = y;
    }
  }
  return Math.max(from, Math.min(to, best)) / h;
}

/** Rough pixels-per-meter from the assumption that a room edge is ~4 m across. */
export function estimatePxPerMeter(imgW: number): number {
  return Math.max(80, Math.round((imgW || 1200) / 4));
}

export function analyzeRoomPhoto(img: HTMLImageElement): RoomLayout {
  const room = imageLuma(img, 256, 256);
  const horizonY = room ? detectHorizon(room) : 0.55;
  return { horizonY, pxPerMeter: estimatePxPerMeter(img.naturalWidth) };
}