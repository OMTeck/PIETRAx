import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest } from '../http/errors.js';
import { validateBody } from '../lib/validate.js';
import { visualizerSegmentLimiter } from '../http/rateLimit.js';
import { segmentRoomImage } from '../services/roboflowService.js';
import { config } from '../config.js';

export const visualizerRouter = Router();

const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // client compresses to ~1280px JPEG before posting

const segmentSchema = z.object({
  image: z.string().max(MAX_IMAGE_BYTES * 2), // data URL base64 (~1.33x) with a little slack
  mime: z.string().max(64).default('image/jpeg'),
});

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } {
  const comma = dataUrl.indexOf(',');
  const head = comma >= 0 ? dataUrl.slice(0, comma) : '';
  const mimeMatch = head.match(/data:([^;]+)/);
  const mime = mimeMatch?.[1] ?? 'image/jpeg';
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const buffer = Buffer.from(b64, 'base64');
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw badRequest('Image too large or unreadable.', 'IMAGE_TOO_LARGE');
  }
  return { buffer, mime };
}

/**
 * Public, cloud-backed segmentation for the room visualizer upload flow.
 * The client sends a compressed image (never the API key) and receives
 * normalized polygons {surfaceType, confidence, points[]} back.
 * The backend alone holds the Roboflow credentials (see config.roboflow).
 */
visualizerRouter.post(
  '/segment',
  visualizerSegmentLimiter,
  validateBody(segmentSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof segmentSchema>;
    const { buffer, mime } = dataUrlToBuffer(body.image);

    const result = await segmentRoomImage(buffer, body.mime || mime);

    res.json({
      status: 'ok',
      width: result.width,
      height: result.height,
      segments: result.segments.map((s) => ({
        surfaceType: s.surfaceType,
        label: s.label,
        confidence: Math.round(s.confidence * 1000) / 1000,
        points: s.points,
      })),
    });
  }),
);

/** Lets the SPA decide whether to show the "Analyze with AI" button. */
visualizerRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({ ai: { enabled: config.roboflow.enabled && Boolean(config.roboflow.apiKey && config.roboflow.model) } });
  }),
);

export {};