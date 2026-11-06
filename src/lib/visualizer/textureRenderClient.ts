import { renderSurfaceTexture, renderSurfacePixels, type RenderSurfaceOptions } from './textureMapper';

/**
 * Asynchronous texture render: same output as renderSurfaceTexture, but the
 * per-pixel work runs in a Web Worker. Falls back to the synchronous render
 * when workers are unavailable or the worker fails.
 */

type Pending = { resolve: (px: Uint8ClampedArray) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./textureWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; pixels?: Uint8ClampedArray; error?: string }>) => {
      const job = pending.get(e.data.id);
      if (!job) return;
      pending.delete(e.data.id);
      if (e.data.pixels) job.resolve(e.data.pixels);
      else job.reject(new Error(e.data.error || 'worker render failed'));
    };
    worker.onerror = () => {
      // A broken worker (e.g. blocked by CSP) must not break the visualizer.
      workerBroken = true;
      worker?.terminate();
      worker = null;
      for (const job of pending.values()) job.reject(new Error('worker crashed'));
      pending.clear();
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

/** Texture pixels are reused across renders of the same material. */
const textureCache = new WeakMap<object, { data: Uint8ClampedArray; w: number; h: number }>();

function texturePixels(texture: HTMLImageElement | HTMLCanvasElement) {
  const hit = textureCache.get(texture);
  if (hit) return hit;
  const w = texture instanceof HTMLCanvasElement ? texture.width : texture.naturalWidth;
  const h = texture instanceof HTMLCanvasElement ? texture.height : texture.naturalHeight;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx || !w || !h) return null;
  ctx.drawImage(texture, 0, 0);
  const entry = { data: ctx.getImageData(0, 0, w, h).data, w, h };
  textureCache.set(texture, entry);
  return entry;
}

export async function renderSurfaceTextureAsync(opts: RenderSurfaceOptions): Promise<HTMLCanvasElement> {
  const w = getWorker();
  if (!w) return renderSurfaceTexture(opts);

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
  const tex = texturePixels(texture);
  if (!tex) return canvas;
  const out = ctx.getImageData(0, 0, W, H);

  const input = {
    pixels: out.data,
    W,
    H,
    // Copy: the cached texture must survive the transfer to the worker.
    texData: new Uint8ClampedArray(tex.data),
    texW: tex.w,
    texH: tex.h,
    polygon,
    params,
    pxPerMeter,
    scale,
    surfaceKind,
  };

  let pixels: Uint8ClampedArray;
  try {
    pixels = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, input }, [input.pixels.buffer, input.texData.buffer]);
    });
  } catch {
    // Worker failed mid-way: render on the main thread from fresh buffers.
    const fresh = ctx.getImageData(0, 0, W, H);
    renderSurfacePixels({ ...input, pixels: fresh.data, texData: tex.data });
    ctx.putImageData(fresh, 0, 0);
    return canvas;
  }
  ctx.putImageData(new ImageData(pixels, W, H), 0, 0);
  return canvas;
}
