import { config } from '../config.js';
import { AppError } from '../http/errors.js';

export interface CloudflareAiResult {
  imageBase64: string;
  mime: string;
}

/**
 * Calls the pietrax-ai Cloudflare Worker, which runs FLUX.2 klein 4B via a
 * Workers AI binding. The Worker is protected by a shared secret that only the
 * backend holds (CLOUDFLARE_AI_WORKER_SECRET) — it is never exposed to the
 * browser. Input images must be <=512x512 (the client downscales before
 * posting), matching the model's documented limit.
 */
export async function editImageWithFlux(
  prompt: string,
  imageBuffer: Buffer,
  mime: string,
): Promise<CloudflareAiResult> {
  const { workerUrl, workerSecret } = config.cloudflareAi;
  if (!workerUrl || !workerSecret) {
    throw new AppError(503, 'AI image editing is not enabled.', 'AI_DISABLED');
  }

  const form = new FormData();
  form.append('prompt', prompt);
  form.append('input_image_0', new Blob([imageBuffer], { type: mime || 'image/png' }), 'input.png');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
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
