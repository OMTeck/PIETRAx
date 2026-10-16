import { AppError } from '../http/errors.js';
import { getVisualizerSettings } from './visualizerSettings.js';

export interface CloudflareAiResult {
  imageBase64: string;
  mime: string;
}

/**
 * Reads the intrinsic dimensions of a PNG/JPEG buffer. FLUX always returns a
 * square frame unless told otherwise, so we use the input's aspect ratio to ask
 * for a matching output size instead of letting the browser center-crop.
 */
function imageDimensions(buffer: Buffer): { w: number; h: number } | null {
  // PNG: 8-byte signature, then the IHDR chunk (width/height at bytes 16..23).
  if (buffer.length > 24 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    const w = buffer.readUInt32BE(16);
    const h = buffer.readUInt32BE(20);
    if (w > 0 && h > 0) return { w, h };
    return null;
  }
  // JPEG: walk markers until the start-of-frame segment.
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buffer.length) {
    if (buffer[i] !== 0xff) return null;
    const marker = buffer[i + 1];
    if (marker === undefined) return null;
    // Standalone markers carry no length field.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
      i += 2;
      continue;
    }
    const len = buffer.readUInt16BE(i + 2);
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 && // DHT
      marker !== 0xc8 && // JPG
      marker !== 0xcc; // DAC
    if (isSof) {
      const h = buffer.readUInt16BE(i + 5);
      const w = buffer.readUInt16BE(i + 7);
      if (w > 0 && h > 0) return { w, h };
      return null;
    }
    if (marker === 0xda) break; // SOS: no SOF ahead of it
    i += 2 + len;
  }
  return null;
}

interface SizeOptions {
  longEdge: number;
  minEdge: number;
  multiple: number;
}

/**
 * Output size that keeps the input's aspect ratio while snapping to the sizes
 * FLUX.2 klein accepts (multiples of `multiple`, comfortably below the verified
 * 1152x832 ceiling) so the result isn't cropped to a different shape.
 */
function targetSize(w: number, h: number, opts: SizeOptions): { width: number; height: number } {
  const { longEdge, minEdge, multiple } = opts;
  if (!w || !h) return { width: longEdge, height: longEdge };
  const ratio = w / h;
  let tw = ratio >= 1 ? longEdge : longEdge * ratio;
  let th = ratio >= 1 ? longEdge / ratio : longEdge;
  const shortest = Math.min(tw, th);
  if (shortest < minEdge) {
    const k = minEdge / shortest;
    tw *= k;
    th *= k;
  }
  tw = Math.max(multiple, Math.round(tw / multiple) * multiple);
  th = Math.max(multiple, Math.round(th / multiple) * multiple);
  return { width: tw, height: th };
}

/**
 * Calls the pietrax-ai Cloudflare Worker, which runs FLUX.2 klein 4B via a
 * Workers AI binding. The Worker is protected by a shared secret that only the
 * backend holds — it is never exposed to the browser. Endpoint, secret,
 * guidance, target-size rules and timeout come from the runtime settings edited
 * in the admin.
 */
export async function editImageWithFlux(
  prompt: string,
  imageBuffer: Buffer,
  mime: string,
): Promise<CloudflareAiResult> {
  const settings = await getVisualizerSettings();
  const { enabled, workerUrl, workerSecret, guidance, timeoutMs } = settings.edit;

  if (!enabled || !workerUrl || !workerSecret) {
    throw new AppError(503, 'AI image editing is not enabled.', 'AI_DISABLED');
  }

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('guidance', String(guidance));
  form.append('input_image_0', new Blob([imageBuffer], { type: mime || 'image/png' }), 'input.png');
  const dims = imageDimensions(imageBuffer);
  if (dims) {
    const { width, height } = targetSize(dims.w, dims.h, {
      longEdge: settings.edit.targetLongEdge,
      minEdge: settings.edit.minEdge,
      multiple: settings.edit.sizeMultiple,
    });
    form.append('width', String(width));
    form.append('height', String(height));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'x-ai-secret': workerSecret },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new AppError(502, 'AI image editing service did not respond successfully.', 'AI_ERROR');
    }
    const data = (await res.json()) as { image?: string; mime?: string };
    if (!data.image) {
      throw new AppError(502, 'AI image editing returned no image.', 'AI_ERROR');
    }
    return { imageBase64: data.image, mime: data.mime || 'image/png' };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
      throw new AppError(504, 'AI image editing timed out.', 'AI_TIMEOUT');
    }
    throw new AppError(502, 'AI image editing service is unreachable.', 'AI_ERROR');
  } finally {
    clearTimeout(timer);
  }
}
