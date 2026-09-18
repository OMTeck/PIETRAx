import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, notFound } from '../../http/errors.js';
import { validateBody } from '../../lib/validate.js';
import { requirePermission } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';
import type { Prisma, RoomType, SurfaceType } from '@prisma/client';

const roomTypes: RoomType[] = ['KITCHEN', 'BATHROOM', 'LIVING_ROOM', 'BEDROOM', 'OFFICE', 'HOTEL_LOBBY', 'OUTDOOR'];
const surfaceTypes: SurfaceType[] = ['FLOOR', 'WALL', 'FEATURE_WALL', 'COUNTERTOP', 'ISLAND', 'BACKSPLASH'];

const surfacePayload = z.object({
  surfaceType: z.enum(surfaceTypes as [SurfaceType, ...SurfaceType[]]),
  nameAr: z.string().min(1).max(120),
  nameEn: z.string().min(1).max(120),
  clipPath: z.string().min(1).max(500),
  enabled: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  defaultMaterialId: z.string().nullable().optional(),
});

const roomPayload = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  roomType: z.enum(roomTypes as [RoomType, ...RoomType[]]),
  nameAr: z.string().min(1).max(120),
  nameEn: z.string().min(1).max(120),
  previewImage: z.string().max(2048).nullable().optional(),
  fullImage: z.string().max(2048).nullable().optional(),
  enabled: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  surfaces: z.array(surfacePayload).max(20).default([]),
});

const materialConfigPayload = z.object({
  enabled: z.boolean().default(true),
  textureUrl: z.string().max(2048).nullable().optional(),
  physicalScale: z.coerce.number().min(0.01).max(1000).nullable().optional(),
  patternScale: z.coerce.number().min(0.01).max(1000).nullable().optional(),
  tileWidth: z.coerce.number().min(0.01).max(10000).nullable().optional(),
  tileHeight: z.coerce.number().min(0.01).max(10000).nullable().optional(),
  groutWidth: z.coerce.number().min(0).max(100).nullable().optional(),
  groutColor: z.string().max(40).nullable().optional(),
  rotation: z.coerce.number().min(-360).max(360).nullable().optional(),
  defaultZoom: z.coerce.number().min(0.01).max(100).nullable().optional(),
  bookmatch: z.boolean().optional(),
});

type RoomInput = z.infer<typeof roomPayload>;

const roomInclude = {
  surfaces: {
    include: { defaultMaterial: { select: { id: true, slug: true } } },
    orderBy: { sortOrder: 'asc' },
  },
} satisfies Prisma.VisualizerRoomInclude;

function serializeRoom(r: Prisma.VisualizerRoomGetPayload<{ include: typeof roomInclude }>) {
  return {
    id: r.id,
    slug: r.slug,
    roomType: r.roomType,
    nameAr: r.nameAr,
    nameEn: r.nameEn,
    previewImage: r.previewImage,
    fullImage: r.fullImage,
    enabled: r.enabled,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    surfaces: r.surfaces.map((s) => ({
      id: s.id,
      surfaceType: s.surfaceType,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      clipPath: s.clipPath,
      enabled: s.enabled,
      sortOrder: s.sortOrder,
      defaultMaterialId: s.defaultMaterialId,
      defaultMaterialSlug: s.defaultMaterial?.slug ?? null,
    })),
  };
}

export const visualizerRouter = Router();

visualizerRouter.use(requirePermission(PERM.visualizerManage));

// --- Rooms ---------------------------------------------------------------

visualizerRouter.get(
  '/rooms',
  asyncHandler(async (_req, res) => {
    const rooms = await prisma.visualizerRoom.findMany({ include: roomInclude, orderBy: { sortOrder: 'asc' } });
    res.json({ items: rooms.map(serializeRoom) });
  }),
);

visualizerRouter.get(
  '/rooms/:id',
  asyncHandler(async (req, res) => {
    const r = await prisma.visualizerRoom.findUnique({ where: { id: req.params.id }, include: roomInclude });
    if (!r) throw notFound('Room not found');
    res.json({ item: serializeRoom(r) });
  }),
);

visualizerRouter.post(
  '/rooms',
  validateBody(roomPayload),
  asyncHandler(async (req, res) => {
    const body = req.body as RoomInput;
    const row = await prisma.visualizerRoom.create({
      data: {
        slug: body.slug,
        roomType: body.roomType,
        nameAr: body.nameAr,
        nameEn: body.nameEn,
        previewImage: body.previewImage ?? null,
        fullImage: body.fullImage ?? null,
        enabled: body.enabled,
        sortOrder: body.sortOrder,
        surfaces: { createMany: { data: body.surfaces.map((s) => ({ ...s })) } },
      },
      include: roomInclude,
    });
    await recordAudit(req, { action: AUDIT.VISUALIZER_UPDATED, resourceType: 'VisualizerRoom', resourceId: row.id, metadata: { action: 'create' } });
    res.status(201).json({ item: serializeRoom(row) });
  }),
);

visualizerRouter.patch(
  '/rooms/:id',
  validateBody(roomPayload),
  asyncHandler(async (req, res) => {
    const body = req.body as RoomInput;
    const existing = await prisma.visualizerRoom.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Room not found');

    await prisma.$transaction([
      prisma.visualizerRoom.update({
        where: { id: existing.id },
        data: {
          slug: body.slug,
          roomType: body.roomType,
          nameAr: body.nameAr,
          nameEn: body.nameEn,
          previewImage: body.previewImage ?? null,
          fullImage: body.fullImage ?? null,
          enabled: body.enabled,
          sortOrder: body.sortOrder,
        },
      }),
      prisma.visualizerSurface.deleteMany({ where: { roomId: existing.id } }),
      prisma.visualizerSurface.createMany({ data: body.surfaces.map((s) => ({ roomId: existing.id, ...s })) }),
    ]);
    const updated = await prisma.visualizerRoom.findUnique({ where: { id: existing.id }, include: roomInclude });
    await recordAudit(req, { action: AUDIT.VISUALIZER_UPDATED, resourceType: 'VisualizerRoom', resourceId: existing.id, metadata: { action: 'update' } });
    res.json({ item: serializeRoom(updated!) });
  }),
);

visualizerRouter.delete(
  '/rooms/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.visualizerRoom.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Room not found');
    await prisma.visualizerRoom.delete({ where: { id: existing.id } });
    await recordAudit(req, { action: AUDIT.VISUALIZER_UPDATED, resourceType: 'VisualizerRoom', resourceId: existing.id, metadata: { action: 'delete' } });
    res.status(204).end();
  }),
);

// --- Material configs (makes a material available in the visualizer) ------

const materialWithConfig = {
  translations: true,
  images: { orderBy: { sortOrder: 'asc' } },
  visualizerConfigs: true,
} satisfies Prisma.MaterialInclude;

visualizerRouter.get(
  '/materials',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.material.findMany({
      where: { deletedAt: null },
      include: materialWithConfig,
      orderBy: { slug: 'asc' },
    });
    res.json({
      items: rows.map((m) => ({
        id: m.id,
        slug: m.slug,
        translations: m.translations,
        coverImage: m.images[0]?.url ?? null,
        config: m.visualizerConfigs[0] ?? null,
      })),
    });
  }),
);

visualizerRouter.patch(
  '/materials/:materialId',
  validateBody(materialConfigPayload),
  asyncHandler(async (req, res) => {
    const material = await prisma.material.findUnique({ where: { id: req.params.materialId } });
    if (!material) throw notFound('Material not found');
    const body = req.body as z.infer<typeof materialConfigPayload>;

    const config = await prisma.visualizerMaterialConfig.upsert({
      where: { materialId: material.id },
      create: { materialId: material.id, ...body },
      update: { ...body },
    });
    await recordAudit(req, { action: AUDIT.VISUALIZER_UPDATED, resourceType: 'VisualizerMaterialConfig', resourceId: config.id, metadata: { materialId: material.id } });
    res.json({ config });
  }),
);

visualizerRouter.delete(
  '/materials/:materialId',
  asyncHandler(async (req, res) => {
    const material = await prisma.material.findUnique({ where: { id: req.params.materialId } });
    if (!material) throw notFound('Material not found');
    await prisma.visualizerMaterialConfig.deleteMany({ where: { materialId: material.id } });
    await recordAudit(req, { action: AUDIT.VISUALIZER_UPDATED, resourceType: 'VisualizerMaterialConfig', resourceId: material.id, metadata: { action: 'remove' } });
    res.status(204).end();
  }),
);