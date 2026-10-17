import { publicApi, type PubAISegment } from '@/lib/public';
import { compressImage } from './imagePreprocessor';

export interface RoomSegments {
  segments: PubAISegment[];
  width: number;
  height: number;
}

/** Edge tracing does not need full resolution; a smaller variant downloads and
 *  uploads several times faster with no loss of mask quality (coordinates are
 *  normalized, so resolution is irrelevant downstream). */
const ANALYSIS_MAX_DIM = 1024;

/** CDNs like Pexels expose resized variants through the `w` query param. Ask
 *  for a smaller one so auto-analysis does not re-download a 1600px photo.
 *  Non-CDN URLs (uploads, blob/data URLs) are returned unchanged. */
function shrinkSource(url: string): string {
  try {
    const u = new URL(url);
    const w = Number(u.searchParams.get('w'));
    if (Number.isFinite(w) && w > ANALYSIS_MAX_DIM) {
      u.searchParams.set('w', String(ANALYSIS_MAX_DIM));
      return u.toString();
    }
  } catch {
    /* relative or data URL — leave as-is */
  }
  return url;
}

// Session cache keyed by source photo (+ crop aspect) so switching back to an
// already-analysed room is instant instead of re-calling the vision model.
const cache = new Map<string, RoomSegments>();

/**
 * Compresses the room photo client-side, then asks the backend vision LLM
 * (Gemini/OpenAI/…) for the surface masks. The provider key never leaves the
 * server; the browser only receives normalized polygons.
 *
 * `cropAspect` center-crops before analysis so the returned coordinates line up
 * with the on-screen box (preset rooms are object-cover in a fixed aspect;
 * uploads keep the photo's own aspect).
 */
export async function requestRoomSegments(
  imageUrl: string,
  cropAspect?: number,
  opts: { force?: boolean } = {},
): Promise<RoomSegments> {
  const key = `${imageUrl}|${cropAspect ?? ''}`;
  if (!opts.force) {
    const hit = cache.get(key);
    if (hit) return hit;
  }

  const source = shrinkSource(imageUrl);
  const compressed = await compressImage(source, { maxDim: ANALYSIS_MAX_DIM, ...(cropAspect ? { cropAspect } : {}) });
  const res = await publicApi.segmentRoom({ image: compressed.dataUrl, mime: 'image/jpeg' });
  const value: RoomSegments = { segments: res.segments, width: res.width, height: res.height };
  cache.set(key, value);
  return value;
}
