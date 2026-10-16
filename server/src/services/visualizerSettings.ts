import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';

/**
 * Single source of truth for every tunable in the room visualizer, including
 * the AI analysis (Roboflow) and AI edit (FLUX/Cloudflare) pipeline. Stored as
 * one JSON blob in `SiteSetting` under key `visualizer` and edited from the
 * admin. Environment variables still act as the seed/fallback for secrets and
 * connection endpoints so existing deployments keep working unchanged.
 */
export const VISUALIZER_SETTINGS_KEY = 'visualizer';

/** Placeholder returned to the admin for a secret that is set; sent back
 *  unchanged to mean "keep the stored value". */
export const SECRET_MASK = '••••••••';

export const DEFAULT_PROMPT_TEMPLATE =
  'Use image 0 as the base photo. Replace the {noun} with {material}, keeping the exact same room, walls, ceiling, furniture, camera angle, perspective and lighting. Photorealistic interior, high detail.';

const normalizedPointSchema = z.object({
  x: z.number().min(-0.05).max(1.05),
  y: z.number().min(-0.05).max(1.05),
});

const surfaceSchema = z.object({
  id: z.string().min(1).max(40),
  nameAr: z.string().max(80).default(''),
  nameEn: z.string().max(80).default(''),
  tileCm: z.coerce.number().min(1).max(2000).default(40),
  noun: z.string().min(1).max(120).default('surface'),
  polygon: z.array(normalizedPointSchema).min(3).max(128),
});

export const visualizerSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  features: z
    .object({
      allowUpload: z.boolean().default(true),
      allowPresetRooms: z.boolean().default(true),
      allowExport: z.boolean().default(true),
      allowCompare: z.boolean().default(true),
      allowManualAreaEdit: z.boolean().default(true),
    })
    .default({}),
  analysis: z
    .object({
      enabled: z.boolean().default(false),
      apiKey: z.string().max(200).default(''),
      model: z.string().max(200).default(''),
      baseUrl: z.string().max(300).default('https://detect.roboflow.com'),
      confidence: z.coerce.number().int().min(1).max(100).default(25),
      timeoutMs: z.coerce.number().int().min(1000).max(120000).default(20000),
      autoApply: z.boolean().default(true),
      classMap: z.record(z.string(), z.string()).default({}),
    })
    .default({}),
  edit: z
    .object({
      enabled: z.boolean().default(true),
      workerUrl: z.string().max(300).default(''),
      workerSecret: z.string().max(300).default(''),
      guidance: z.coerce.number().min(0).max(20).default(5),
      targetLongEdge: z.coerce.number().int().min(128).max(2048).default(1024),
      minEdge: z.coerce.number().int().min(64).max(1024).default(256),
      sizeMultiple: z.coerce.number().int().min(1).max(128).default(16),
      maxInputDim: z.coerce.number().int().min(128).max(2048).default(500),
      quality: z.coerce.number().min(0.1).max(1).default(0.85),
      timeoutMs: z.coerce.number().int().min(1000).max(180000).default(60000),
      promptTemplate: z.string().min(1).max(1000).default(DEFAULT_PROMPT_TEMPLATE),
    })
    .default({}),
  behavior: z
    .object({
      displayAspect: z.coerce.number().min(0.2).max(5).default(1.6),
      simplifyTolerance: z.coerce.number().min(0).max(0.5).default(0.02),
      simplifyMinPoints: z.coerce.number().int().min(4).max(500).default(30),
      surfaces: z.array(surfaceSchema).max(12).default([]),
    })
    .default({}),
});

export type VisualizerSettings = z.infer<typeof visualizerSettingsSchema>;
export type VisualizerSurface = z.infer<typeof surfaceSchema>;

export interface PublicVisualizerConfig {
  enabled: boolean;
  features: VisualizerSettings['features'];
  analysis: { enabled: boolean; autoApply: boolean };
  edit: { enabled: boolean; maxInputDim: number; quality: number; promptTemplate: string };
  behavior: VisualizerSettings['behavior'];
}

const DEFAULT_SURFACES: VisualizerSurface[] = [
  {
    id: 'floor',
    nameAr: 'الأرضية',
    nameEn: 'Floor',
    tileCm: 40,
    noun: 'floor',
    polygon: [
      { x: 0, y: 0.55 },
      { x: 1, y: 0.55 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  },
  {
    id: 'wall',
    nameAr: 'الجدار',
    nameEn: 'Wall',
    tileCm: 40,
    noun: 'wall',
    polygon: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0.55 },
      { x: 0, y: 0.55 },
    ],
  },
  {
    id: 'countertop',
    nameAr: 'سطح العمل',
    nameEn: 'Countertop',
    tileCm: 60,
    noun: 'countertop and cabinetry',
    polygon: [
      { x: 0, y: 0.4 },
      { x: 1, y: 0.4 },
      { x: 1, y: 0.6 },
      { x: 0, y: 0.6 },
    ],
  },
];

/** Defaults seeded from the environment so a fresh deploy behaves exactly as
 *  the env-only configuration did before this settings layer existed. */
function buildDefaults(): VisualizerSettings {
  return {
    enabled: true,
    features: {
      allowUpload: true,
      allowPresetRooms: true,
      allowExport: true,
      allowCompare: true,
      allowManualAreaEdit: true,
    },
    analysis: {
      enabled: config.roboflow.enabled,
      apiKey: config.roboflow.apiKey,
      model: config.roboflow.model,
      baseUrl: config.roboflow.baseUrl,
      confidence: config.roboflow.confidence,
      timeoutMs: config.roboflow.timeoutMs,
      autoApply: true,
      classMap: {},
    },
    edit: {
      enabled: true,
      workerUrl: config.cloudflareAi.workerUrl,
      workerSecret: config.cloudflareAi.workerSecret,
      guidance: config.cloudflareAi.guidance,
      targetLongEdge: 1024,
      minEdge: 256,
      sizeMultiple: 16,
      maxInputDim: 500,
      quality: 0.85,
      timeoutMs: 60000,
      promptTemplate: DEFAULT_PROMPT_TEMPLATE,
    },
    behavior: {
      displayAspect: 1.6,
      simplifyTolerance: 0.02,
      simplifyMinPoints: 30,
      surfaces: DEFAULT_SURFACES.map((s) => ({ ...s, polygon: s.polygon.map((p) => ({ ...p })) })),
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Deep-merge override onto base; arrays and primitives replace wholesale. */
function deepMerge(base: unknown, override: unknown): unknown {
  if (override === undefined) return base;
  if (Array.isArray(override)) return override;
  if (isPlainObject(override) && isPlainObject(base)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      out[key] = deepMerge(base[key], value);
    }
    return out;
  }
  return override;
}

function withEnvFallback(value: VisualizerSettings): VisualizerSettings {
  if (!value.analysis.apiKey) value.analysis.apiKey = config.roboflow.apiKey;
  if (!value.analysis.model) value.analysis.model = config.roboflow.model;
  if (!value.edit.workerUrl) value.edit.workerUrl = config.cloudflareAi.workerUrl;
  if (!value.edit.workerSecret) value.edit.workerSecret = config.cloudflareAi.workerSecret;
  return value;
}

function normalize(raw: unknown): VisualizerSettings {
  const merged = deepMerge(buildDefaults(), raw ?? {});
  const parsed = visualizerSettingsSchema.safeParse(merged);
  const value = (parsed.success ? parsed.data : buildDefaults()) as VisualizerSettings;
  if (value.behavior.surfaces.length === 0) {
    value.behavior.surfaces = DEFAULT_SURFACES.map((s) => ({ ...s, polygon: s.polygon.map((p) => ({ ...p })) }));
  }
  return withEnvFallback(value);
}

// Small TTL cache — the public config is read on every visitor page load, and
// the AI routes read it per request. Bust on write.
let cache: { value: VisualizerSettings; at: number } | null = null;
const CACHE_MS = 5000;

export async function getVisualizerSettings(): Promise<VisualizerSettings> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;
  const row = await prisma.siteSetting.findUnique({ where: { key: VISUALIZER_SETTINGS_KEY } });
  const value = normalize(row?.value);
  cache = { value, at: now };
  return value;
}

async function persist(value: VisualizerSettings, updatedById: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: VISUALIZER_SETTINGS_KEY },
    create: { key: VISUALIZER_SETTINGS_KEY, value: value as unknown as Prisma.InputJsonValue, updatedById },
    update: { value: value as unknown as Prisma.InputJsonValue, updatedById },
  });
  cache = null;
}

/** Full settings with secrets replaced by a mask, for the admin UI. */
export function maskForAdmin(value: VisualizerSettings) {
  return {
    ...value,
    analysis: { ...value.analysis, apiKey: value.analysis.apiKey ? SECRET_MASK : '' },
    edit: { ...value.edit, workerSecret: value.edit.workerSecret ? SECRET_MASK : '' },
  };
}

/**
 * Applies an admin payload (whose secret fields may carry the mask) on top of
 * the current settings and persists the validated result.
 */
export async function updateVisualizerSettings(payload: unknown, updatedById: string): Promise<VisualizerSettings> {
  const current = await getVisualizerSettings();
  const merged = deepMerge(current, payload ?? {}) as VisualizerSettings;
  if (merged.analysis.apiKey === SECRET_MASK) merged.analysis.apiKey = current.analysis.apiKey;
  if (merged.edit.workerSecret === SECRET_MASK) merged.edit.workerSecret = current.edit.workerSecret;
  const parsed = visualizerSettingsSchema.parse(merged) as VisualizerSettings;
  await persist(parsed, updatedById);
  return parsed;
}

export async function getPublicVisualizerConfig(): Promise<PublicVisualizerConfig> {
  const s = await getVisualizerSettings();
  return {
    enabled: s.enabled,
    features: s.features,
    analysis: {
      enabled: s.analysis.enabled && Boolean(s.analysis.apiKey && s.analysis.model),
      autoApply: s.analysis.autoApply,
    },
    edit: {
      enabled: s.edit.enabled && Boolean(s.edit.workerUrl && s.edit.workerSecret),
      maxInputDim: s.edit.maxInputDim,
      quality: s.edit.quality,
      promptTemplate: s.edit.promptTemplate,
    },
    behavior: s.behavior,
  };
}
