import { segmentRoomImage } from './roboflowService.js';
import type { RoboflowResult } from './roboflowService.js';
import { analyzeSurfacesWithProvider, getActiveVisionProvider } from './visionProviderService.js';
import { getVisualizerSettings } from './visualizerSettings.js';

export interface SegmentOutcome {
  result: RoboflowResult;
  engine: 'vision' | 'roboflow';
}

/**
 * Chooses the image-analysis engine. A separately configured vision LLM is
 * tried first when enabled; Roboflow stays available as an explicit fallback
 * so a provider outage degrades instead of breaking the try-on-your-room flow.
 */
export async function runSurfaceAnalysis(imageBuffer: Buffer, imageMime: string): Promise<SegmentOutcome> {
  const settings = await getVisualizerSettings();
  const provider = await getActiveVisionProvider();

  if (provider) {
    try {
      const result = await analyzeSurfacesWithProvider(provider, imageBuffer);
      return { result, engine: 'vision' };
    } catch (err) {
      if (!settings.vision.fallbackToRoboflow) throw err;
    }
  }

  return { result: await segmentRoomImage(imageBuffer, imageMime), engine: 'roboflow' };
}
