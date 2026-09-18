import { createHash } from 'node:crypto';
import { prisma } from '../db.js';
import type { Prisma } from '@prisma/client';

const NORMALIZE = /https?:\/\/[^/]+/g;

interface UsageRef {
  type: string;
  id: string;
  label: string;
}

export async function findMediaUsage(url: string): Promise<UsageRef[]> {
  const refs: UsageRef[] = [];

  // Normalize so the same stored path reported over http/https matches.
  const lookups = [url, url.replace(NORMALIZE, '')].filter(Boolean);

  const [materialImages, projectImages, projects, collections, rooms, colorSwatches, visConfigs] =
    await Promise.all([
      prisma.materialImage.findMany({ where: { url: { in: lookups } }, include: { material: { include: { translations: true } } } }),
      prisma.projectImage.findMany({ where: { url: { in: lookups } }, include: { project: { include: { translations: true } } } }),
      prisma.project.findMany({ where: { coverImage: { in: lookups } }, include: { translations: true } }),
      prisma.collection.findMany({ where: { coverImage: { in: lookups } }, include: { translations: true } }),
      prisma.visualizerRoom.findMany({ where: { OR: [{ previewImage: { in: lookups } }, { fullImage: { in: lookups } }] } }),
      prisma.color.findMany({ where: { swatchImage: { in: lookups } } }),
      prisma.visualizerMaterialConfig.findMany({ where: { textureUrl: { in: lookups } } }),
    ]);

  for (const img of materialImages) {
    refs.push({ type: 'material-image', id: img.materialId, label: img.material.translations[0]?.name ?? img.materialId });
  }
  for (const img of projectImages) {
    refs.push({ type: 'project-image', id: img.projectId, label: img.project.translations[0]?.title ?? img.projectId });
  }
  for (const p of projects) {
    refs.push({ type: 'project-cover', id: p.id, label: p.translations[0]?.title ?? p.id });
  }
  for (const c of collections) {
    refs.push({ type: 'collection-cover', id: c.id, label: c.translations[0]?.name ?? c.id });
  }
  for (const r of rooms) {
    refs.push({ type: 'visualizer-room', id: r.id, label: r.nameEn ?? r.id });
  }
  for (const c of colorSwatches) {
    refs.push({ type: 'color-swatch', id: c.id, label: c.labelEn ?? c.id });
  }
  for (const vc of visConfigs) {
    refs.push({ type: 'visualizer-texture', id: vc.materialId, label: vc.materialId });
  }

  return refs;
}

export function usageKey(url: string): string {
  // Stable hash for "same file" checks without storing raw URLs in logs.
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

export type { UsageRef };