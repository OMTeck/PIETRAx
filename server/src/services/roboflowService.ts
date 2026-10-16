import { config } from '../config.js';
import { AppError } from '../http/errors.js';

export interface RoboflowPoint {
  x: number;
  y: number;
}

export interface RoboflowSegment {
  surfaceType: string;
  label: string;
  confidence: number;
  points: RoboflowPoint[];
  bbox: { x: number; y: number; width: number; height: number };
}

export interface RoboflowResult {
  segments: RoboflowSegment[];
  width: number;
  height: number;
}

interface RoboflowApiResponse {
  image?: { width: number; height: number };
  predictions?: Array<{
    class?: string;
    confidence?: number;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    points?: Array<{ x: number; y: number }>;
  }>;
}

/** Surface classes Roboflow is trained on; anything else is kept verbatim. */
const KNOWN_SURFACE_TYPES = new Set([
  'FLOOR',
  'WALL',
  'CEILING',
  'COUNTERTOP',
  'BACKSPLASH',
  'ISLAND',
  'FEATURE_WALL',
]);

function normalizeSurfaceType(label: string): string {
  const upper = label.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return KNOWN_SURFACE_TYPES.has(upper) ? upper : upper;
}

/**
 * Adapter for the Roboflow hosted inference API (legacy infer endpoint).
 * The client never sees the API key: it only posts a compressed image and
 * receives normalized polygons back.
 */
export async function segmentRoomImage(imageBuffer: Buffer, imageMime: string): Promise<RoboflowResult> {
  if (!config.roboflow.enabled || !config.roboflow.apiKey || !config.roboflow.model) {
    throw new AppError(503, 'Image AI analysis is not enabled.', 'AI_DISABLED');
  }

  const url = new URL(`/${config.roboflow.model}`, config.roboflow.baseUrl);
  url.searchParams.set('api_key', config.roboflow.apiKey);
  url.searchParams.set('confidence', String(config.roboflow.confidence));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.roboflow.timeoutMs);

  try {
    // The hosted inference endpoint expects a base64-encoded image body
    // (form-urlencoded), not raw bytes.
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: imageBuffer.toString('base64'),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new AppError(502, 'Image analysis service did not respond successfully.', 'AI_ERROR');
    }

    const data = (await res.json()) as RoboflowApiResponse;
    const imageW = data.image?.width ?? 0;
    const imageH = data.image?.height ?? 0;
    if (imageW <= 0 || imageH <= 0) {
      throw new AppError(502, 'Image analysis returned no image dimensions.', 'AI_ERROR');
    }

    const segments = (data.predictions ?? [])
      .filter((p) => Array.isArray(p.points) && p.points.length >= 3)
      .map((p) => {
        const surfaceType = normalizeSurfaceType(p.class ?? 'UNKNOWN');
        return {
          surfaceType,
          label: (p.class ?? 'UNKNOWN').trim(),
          confidence: p.confidence ?? 0,
          points: (p.points ?? []).map((pt) => ({
            x: Math.max(0, Math.min(imageW, pt.x)),
            y: Math.max(0, Math.min(imageH, pt.y)),
          })),
          bbox: {
            x: p.x ?? 0,
            y: p.y ?? 0,
            width: p.width ?? 0,
            height: p.height ?? 0,
          },
        };
      });

    return { segments, width: imageW, height: imageH };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
      throw new AppError(504, 'Image analysis service timed out.', 'AI_TIMEOUT');
    }
    throw new AppError(502, 'Image analysis service is unreachable.', 'AI_ERROR');
  } finally {
    clearTimeout(timer);
  }
}