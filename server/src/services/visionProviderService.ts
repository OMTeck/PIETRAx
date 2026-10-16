import sharp from 'sharp';
import { AppError } from '../http/errors.js';
import { getVisualizerSettings } from './visualizerSettings.js';
import type { VisionProvider, VisionProviderType } from './visualizerSettings.js';
import { normalizeSurfaceType } from './roboflowService.js';

/**
 * Adapters for separately configured vision LLMs (image understanding /
 * surface detection). These *read* images; they are not the FLUX pipeline,
 * which *generates* images. Provider credentials stay server-side â€” the admin
 * types them once and the browser only ever sees a mask.
 */

export interface VisionProviderMeta {
  type: VisionProviderType;
  label: string;
  defaultBaseUrl: string;
  modelHint: string;
  keyHint: string;
}

export const VISION_PROVIDER_META: Record<VisionProviderType, VisionProviderMeta> = {
  openai: {
    type: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    modelHint: 'gpt-4o-mini',
    keyHint: 'sk-â€¦',
  },
  anthropic: {
    type: 'anthropic',
    label: 'Anthropic',
    defaultBaseUrl: 'https://api.anthropic.com',
    modelHint: 'claude-3-5-sonnet-latest',
    keyHint: 'sk-ant-â€¦',
  },
  google: {
    type: 'google',
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    modelHint: 'gemini-2.5-flash',
    keyHint: 'AIzaâ€¦',
  },
  custom: {
    type: 'custom',
    label: 'Custom (OpenAI-compatible)',
    defaultBaseUrl: '',
    modelHint: 'any vision model your endpoint serves',
    keyHint: 'provider-specific',
  },
};

export interface VisionPoint {
  x: number;
  y: number;
}

export interface VisionSegment {
  surfaceType: string;
  label: string;
  confidence: number;
  points: VisionPoint[];
  bbox: { x: number; y: number; width: number; height: number };
}

export interface VisionAnalysisResult {
  segments: VisionSegment[];
  width: number;
  height: number;
  provider: string;
  modelId: string;
}

export interface VisionTestResult {
  ok: boolean;
  message: string;
  latencyMs: number;
}

const SURFACE_PROMPT = [
  'You are analyzing an interior room photo for a surface-placement tool.',
  'Identify the major planar surfaces and respond with ONLY JSON, no prose:',
  '{"surfaces":[{"type":"FLOOR|WALL|CEILING|COUNTERTOP","confidence":0.0,"points":[{"x":0.0,"y":0.0}]}]}',
  'Rules:',
  '- "points" are normalized coordinates in 0..1 relative to the image (x from left, y from top) forming a closed polygon for that surface region.',
  '- Return at most 4 surfaces. Use only the listed types.',
  '- Omit any surface you cannot locate with confidence.',
].join('\n');

const PING_PROMPT = 'ping';

function baseUrlFor(provider: VisionProvider): string {
  const configured = provider.baseUrl.trim();
  const fallback = VISION_PROVIDER_META[provider.providerType].defaultBaseUrl;
  const base = configured || fallback;
  if (!base) {
    throw new AppError(400, 'This provider needs an API base URL.', 'VISION_NO_BASE_URL');
  }
  return base.replace(/\/+$/, '');
}

function assertUsable(provider: VisionProvider): void {
  if (!provider.enabled) {
    throw new AppError(503, 'This vision provider is disabled.', 'VISION_DISABLED');
  }
  if (!provider.supportsVision) {
    throw new AppError(400, 'This model is not marked as vision-capable.', 'VISION_UNSUPPORTED');
  }
  if (!provider.apiKey) {
    throw new AppError(503, 'This vision provider has no API key configured.', 'VISION_NO_KEY');
  }
  if (!provider.modelId.trim()) {
    throw new AppError(400, 'This vision provider has no model ID configured.', 'VISION_NO_MODEL');
  }
}

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  providerLabel: string,
): Promise<{ ok: boolean; status: number; json?: unknown; text?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const raw = await res.text();
    let json: unknown;
    try {
      json = raw ? JSON.parse(raw) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const detail = extractErrorMessage(json) ?? raw.slice(0, 200);
      throw new AppError(
        502,
        `${providerLabel} responded ${res.status}${detail ? `: ${detail}` : ''}.`,
        'VISION_ERROR',
      );
    }
    return { ok: true, status: res.status, json, text: raw };
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'AbortError') {
      throw new AppError(504, `${providerLabel} timed out.`, 'VISION_TIMEOUT');
    }
    throw new AppError(502, `${providerLabel} is unreachable.`, 'VISION_ERROR');
  } finally {
    clearTimeout(timer);
  }
}

/** Pulls a human-readable message out of a provider error body without
 *  echoing credentials back to the caller. */
function extractErrorMessage(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const obj = json as Record<string, unknown>;
  const err = obj.error;
  if (typeof err === 'string') return err.slice(0, 200);
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    if (typeof e.message === 'string') return e.message.slice(0, 200);
    if (typeof e.type === 'string') return e.type.slice(0, 120);
  }
  if (typeof obj.message === 'string') return obj.message.slice(0, 200);
  return undefined;
}

/** Downscale to the provider's max long edge so we never ship a full-res
 *  photo to a third party when a smaller one will do. */
async function prepareImage(buffer: Buffer, maxDim: number): Promise<{ data: Buffer; mime: string }> {
  const meta = await sharp(buffer).metadata();
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
  const mime = meta.format === 'png' ? 'image/png' : meta.format === 'webp' ? 'image/webp' : 'image/jpeg';
  if (!longEdge || longEdge <= maxDim) return { data: buffer, mime };
  const data = await sharp(buffer)
    .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { data, mime: 'image/jpeg' };
}

function buildRequest(
  provider: VisionProvider,
  parts: { text: string; dataUrl?: string; mediaType?: string; data?: string },
): { url: string; init: RequestInit } {
  const base = baseUrlFor(provider);
  const model = provider.modelId.trim();
  const key = provider.apiKey;

  if (provider.providerType === 'anthropic') {
    const content: unknown[] = [];
    if (parts.data && parts.mediaType) {
      content.push({ type: 'image', source: { type: 'base64', media_type: parts.mediaType, data: parts.data } });
    }
    content.push({ type: 'text', text: parts.text });
    return {
      url: `${base}/v1/messages`,
      init: {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content }] }),
      },
    };
  }

  if (provider.providerType === 'google') {
    const partList: unknown[] = [{ text: parts.text }];
    if (parts.data && parts.mediaType) {
      partList.push({ inline_data: { mime_type: parts.mediaType, data: parts.data } });
    }
    return {
      url: `${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: partList }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    };
  }

  // openai + custom (OpenAI-compatible) chat completions
  const content: unknown[] = [];
  if (parts.dataUrl) {
    content.push({ type: 'image_url', image_url: { url: parts.dataUrl } });
  }
  content.push({ type: 'text', text: parts.text });
  return {
    url: `${base}/chat/completions`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content }] }),
    },
  };
}

function extractText(provider: VisionProvider, json: unknown): string {
  if (!json || typeof json !== 'object') return '';
  const obj = json as Record<string, unknown>;

  if (provider.providerType === 'anthropic') {
    const blocks = obj.content;
    if (Array.isArray(blocks)) {
      return blocks
        .map((b) => (b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? (b as { text: string }).text : ''))
        .join('');
    }
  }

  if (provider.providerType === 'google') {
    const candidates = obj.candidates;
    if (Array.isArray(candidates) && candidates[0] && typeof candidates[0] === 'object') {
      const parts = (candidates[0] as Record<string, unknown>).content;
      if (parts && typeof parts === 'object' && Array.isArray((parts as Record<string, unknown>).parts)) {
        return ((parts as Record<string, unknown>).parts as Array<Record<string, unknown>>)
          .map((p) => (typeof p.text === 'string' ? p.text : ''))
          .join('');
      }
    }
    return '';
  }

  const choices = obj.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === 'object') {
    const message = (choices[0] as Record<string, unknown>).message;
    if (message && typeof message === 'object' && typeof (message as { content?: unknown }).content === 'string') {
      return (message as { content: string }).content;
    }
  }
  return '';
}

/** Strips code fences / surrounding prose so a JSON payload can be parsed. */
function parseJsonPayload(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
}

/** Cheap, token-free liveness check: a text-only ping against the provider. */
export async function testVisionProvider(provider: VisionProvider): Promise<VisionTestResult> {
  const started = Date.now();
  const label = VISION_PROVIDER_META[provider.providerType].label;
  assertUsable(provider);
  const { url, init } = buildRequest(provider, { text: PING_PROMPT });
  await requestJson(url, init, Math.min(provider.timeoutMs, 20000), label);
  return { ok: true, message: `${label} reachable with model ${provider.modelId}.`, latencyMs: Date.now() - started };
}

/** Asks the vision model for normalized surface polygons and returns them in
 *  the same shape the Roboflow adapter produces, so callers are interchangeable. */
export async function analyzeSurfacesWithProvider(
  provider: VisionProvider,
  imageBuffer: Buffer,
): Promise<VisionAnalysisResult> {
  const label = VISION_PROVIDER_META[provider.providerType].label;
  assertUsable(provider);

  const { data, mime } = await prepareImage(imageBuffer, provider.maxImageDim);
  const width = (await sharp(data).metadata()).width ?? 0;
  const height = (await sharp(data).metadata()).height ?? 0;
  if (!width || !height) {
    throw new AppError(502, 'Could not read the image dimensions.', 'VISION_BAD_IMAGE');
  }

  const { url, init } = buildRequest(provider, {
    text: SURFACE_PROMPT,
    dataUrl: `data:${mime};base64,${data.toString('base64')}`,
    mediaType: mime,
    data: data.toString('base64'),
  });
  const res = await requestJson(url, init, provider.timeoutMs, label);

  const text = extractText(provider, res.json);
  const payload = parseJsonPayload(text) as { surfaces?: Array<{ type?: string; confidence?: number; points?: VisionPoint[] }> } | undefined;
  const surfaces = Array.isArray(payload?.surfaces) ? payload.surfaces : [];

  const classMap = (await getVisualizerSettings()).analysis.classMap;
  const segments: VisionSegment[] = surfaces
    .filter((s) => Array.isArray(s.points) && s.points.length >= 3)
    .map((s) => {
      const points = (s.points ?? []).map((p) => ({
        x: Math.max(0, Math.min(width, (Number(p.x) || 0) * width)),
        y: Math.max(0, Math.min(height, (Number(p.y) || 0) * height)),
      }));
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const label = (s.type ?? 'UNKNOWN').trim();
      return {
        surfaceType: normalizeSurfaceType(label, classMap),
        label,
        confidence: Math.max(0, Math.min(1, Number(s.confidence) || 0)),
        points,
        bbox: {
          x: minX,
          y: minY,
          width: Math.max(...xs) - minX,
          height: Math.max(...ys) - minY,
        },
      };
    });

  if (segments.length === 0) {
    throw new AppError(502, `${label} returned no usable surfaces.`, 'VISION_NO_SURFACES');
  }

  return { segments, width, height, provider: label, modelId: provider.modelId };
}

/** The configured, enabled, vision-capable provider to use for analysis. */
export async function getActiveVisionProvider(): Promise<VisionProvider | null> {
  const { vision } = await getVisualizerSettings();
  if (!vision.enabled) return null;
  const chosen =
    vision.providers.find((p) => p.id === vision.defaultProviderId && p.enabled) ??
    vision.providers.find((p) => p.enabled && p.supportsVision);
  return chosen ?? null;
}
