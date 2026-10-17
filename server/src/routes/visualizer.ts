import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, badRequest } from '../http/errors.js';
import { validateBody } from '../lib/validate.js';
import { visualizerSegmentLimiter, visualizerAiEditLimiter } from '../http/rateLimit.js';
import { runSurfaceAnalysis } from '../services/segmentationService.js';
import { editImageWithFlux } from '../services/cloudflareAiService.js';
import { getPublicVisualizerConfig } from '../services/visualizerSettings.js';

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
 * The backend alone holds every provider credential: the admin-configured
 * vision LLM (see visionProviderService) and/or Roboflow (see
 * visualizerSettings.analysis).
 */
visualizerRouter.post(
  '/segment',
  visualizerSegmentLimiter,
  validateBody(segmentSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof segmentSchema>;
    const { buffer, mime } = dataUrlToBuffer(body.image);

    const { result, engine } = await runSurfaceAnalysis(buffer, body.mime || mime);

    res.json({
      status: 'ok',
      engine,
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

const aiEditSchema = z.object({
  prompt: z.string().min(1).max(4000), // admin prompt templates + framing can be long
  image: z.string().max(MAX_IMAGE_BYTES * 2), // data URL base64 (~1.33x)
  mime: z.string().max(64).default('image/jpeg'),
  reference: z.string().max(MAX_IMAGE_BYTES * 2).optional(), // e.g. the exact material texture
  referenceMime: z.string().max(64).default('image/jpeg'),
});

/**
 * AI image editing for the visualizer upload flow, powered by FLUX.2 klein 4B
 * on Cloudflare Workers AI (via the pietrax-ai Worker). The client sends a
 * <=512px image + prompt; the backend holds the Worker secret and returns the
 * generated image as a data URL. An optional second reference image lets the
 * model apply a specific material rather than an invented one.
 */
visualizerRouter.post(
  '/ai-edit',
  visualizerAiEditLimiter,
  validateBody(aiEditSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof aiEditSchema>;
    const { buffer, mime } = dataUrlToBuffer(body.image);
    const reference = body.reference ? dataUrlToBuffer(body.reference) : null;

    const result = await editImageWithFlux(
      body.prompt,
      buffer,
      body.mime || mime,
      reference ? { buffer: reference.buffer, mime: body.referenceMime || reference.mime } : undefined,
    );

    res.json({
      status: 'ok',
      image: `data:${result.mime};base64,${result.imageBase64}`,
    });
  }),
);

/** Lets the SPA decide whether/which visualizer features to show. */
visualizerRouter.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json(await getPublicVisualizerConfig());
  }),
);

export {};