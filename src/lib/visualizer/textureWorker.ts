/// <reference lib="webworker" />
import { renderSurfacePixels, type RenderPixelsInput } from './textureMapper';

/**
 * Off-main-thread texture render. Receives plain pixel buffers, runs the
 * same render core as the synchronous path and transfers the pixels back,
 * so the page stays responsive while the visitor drags sliders.
 */
type Job = { id: number; input: RenderPixelsInput };

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, input } = e.data;
  try {
    renderSurfacePixels(input);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, pixels: input.pixels }, [input.pixels.buffer]);
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, error: String((err as Error)?.message ?? err) });
  }
};
