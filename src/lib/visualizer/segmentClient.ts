import { publicApi, type PubAISegment } from '@/lib/public';
import { compressImage } from './imagePreprocessor';

export interface RoomSegments {
  segments: PubAISegment[];
  width: number;
  height: number;
}

/**
 * Compresses the room photo client-side, then asks the backend vision LLM
 * (Gemini/OpenAI/…) for the surface masks. The provider key never leaves the
 * server; the browser only receives normalized polygons.
 *
 * `cropAspect` center-crops before analysis so the returned coordinates line up
 * with the on-screen box (preset rooms are object-cover in a fixed aspect;
 * uploads keep the photo's own aspect).
 */
export async function requestRoomSegments(imageUrl: string, cropAspect?: number): Promise<RoomSegments> {
  const compressed = await compressImage(imageUrl, cropAspect ? { cropAspect } : undefined);
  const res = await publicApi.segmentRoom({ image: compressed.dataUrl, mime: 'image/jpeg' });
  return { segments: res.segments, width: res.width, height: res.height };
}
