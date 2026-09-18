import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { asyncHandler, notFound } from '../http/errors.js';
import { validateBody } from '../lib/validate.js';
import { publicSubmitLimiter } from '../http/rateLimit.js';
import { Prisma } from '@prisma/client';

export const publicRouter = Router();

// Serialization for the public site ------------------------------------------

const materialInclude = {
  translations: true,
  images: true,
  sizes: { include: { size: true } },
  applications: { include: { application: true } },
  collections: { include: { collection: { include: { translations: true } } } },
  materialType: true,
  category: true,
  color: true,
  finish: true,
} satisfies Prisma.MaterialInclude;

const wherePublished: Prisma.MaterialWhereInput = { status: 'PUBLISHED', deletedAt: null };

function pubMaterial(m: Prisma.MaterialGetPayload<{ include: typeof materialInclude }>) {
  return {
    id: m.id,
    slug: m.slug,
    sku: m.sku,
    origin: m.origin,
    thickness: m.thickness,
    availability: m.availability,
    featured: m.featured,
    newArrival: m.newArrival,
    popular: m.popular,
    bookmatch: m.bookmatch,
    technicalSpecs: m.technicalSpecs,
    materialType: m.materialType,
    category: m.category,
    color: m.color,
    finish: m.finish,
    sizes: m.sizes.map((s) => s.size),
    applications: m.applications.map((a) => a.application),
    collections: m.collections.map((c) => ({
      id: c.collection.id,
      slug: c.collection.slug,
      translations: c.collection.translations,
    })),
    images: m.images.sort((a, b) => a.sortOrder - b.sortOrder),
    translations: m.translations,
    updatedAt: m.updatedAt,
  };
}

// Public product/catalog data ------------------------------------------------

publicRouter.get(
  '/materials',
  asyncHandler(async (req, res) => {
    const { search, materialType, color, finish, featured, fresh, popular } = req.query;
    const where: Prisma.MaterialWhereInput = { ...wherePublished };

    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { sku: { contains: search.trim(), mode: 'insensitive' } },
        { translations: { some: { name: { contains: search.trim(), mode: 'insensitive' } } } },
      ];
    }
    if (typeof materialType === 'string' && materialType) {
      where.materialType = { code: materialType };
    }
    if (typeof color === 'string' && color) {
      where.color = { code: color };
    }
    if (typeof finish === 'string' && finish) {
      where.finish = { code: finish };
    }
    if (featured === 'true') where.featured = true;
    if (fresh === 'true') where.newArrival = true;
    if (popular === 'true') where.popular = true;

    const rows = await prisma.material.findMany({
      where,
      include: materialInclude,
      orderBy: [{ newArrival: 'desc' }, { featured: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ materials: rows.map(pubMaterial) });
  }),
);

publicRouter.get(
  '/materials/:slug',
  asyncHandler(async (req, res) => {
    const m = await prisma.material.findFirst({
      where: { ...wherePublished, slug: req.params.slug },
      include: materialInclude,
    });
    if (!m) throw notFound('Material not found');
    res.json({ material: pubMaterial(m) });
  }),
);

publicRouter.get(
  '/collections',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.collection.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      include: { translations: true, items: true, _count: { select: { items: true } } },
      orderBy: { displayOrder: 'asc' },
    });
    res.json({
      collections: rows.map((c) => ({
        id: c.id,
        slug: c.slug,
        coverImage: c.coverImage,
        featured: c.featured,
        displayOrder: c.displayOrder,
        translations: c.translations,
        materialCount: c._count.items,
      })),
    });
  }),
);

publicRouter.get(
  '/projects',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.project.findMany({
      where: { status: 'PUBLISHED', deletedAt: null },
      include: {
        translations: true,
        images: true,
        projectType: true,
        materials: { include: { material: { include: { translations: true } } } },
      },
      orderBy: { featured: 'desc' },
    });
    res.json({
      projects: rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        location: p.location,
        coverImage: p.coverImage,
        completionDate: p.completionDate,
        featured: p.featured,
        projectType: p.projectType,
        translations: p.translations,
        images: p.images.sort((a, b) => a.sortOrder - b.sortOrder),
        materials: p.materials.map((pm) => ({
          slug: pm.material.slug,
          translations: pm.material.translations,
        })),
      })),
    });
  }),
);

publicRouter.get(
  '/projects/:slug',
  asyncHandler(async (req, res) => {
    const p = await prisma.project.findFirst({
      where: { status: 'PUBLISHED', deletedAt: null, slug: req.params.slug },
      include: { translations: true, images: true, projectType: true, materials: { include: { material: true } } },
    });
    if (!p) throw notFound('Project not found');
    res.json({
      project: {
        id: p.id,
        slug: p.slug,
        location: p.location,
        coverImage: p.coverImage,
        completionDate: p.completionDate,
        featured: p.featured,
        projectType: p.projectType,
        translations: p.translations,
        images: p.images.sort((a, b) => a.sortOrder - b.sortOrder),
        materials: p.materials.map((pm) => pm.material.slug),
      },
    });
  }),
);

// Room Visualizer data -------------------------------------------------------

publicRouter.get(
  '/visualizer',
  asyncHandler(async (_req, res) => {
    const rooms = await prisma.visualizerRoom.findMany({
      where: { enabled: true },
      include: {
        surfaces: {
          where: { enabled: true },
          include: { defaultMaterial: { select: { slug: true, translations: true } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const enabledConfigs = await prisma.visualizerMaterialConfig.findMany({
      where: { enabled: true },
      include: {
        material: {
          include: {
            translations: true,
            images: { where: { kind: 'TEXTURE' } },
          },
        },
      },
    });

    res.json({
      rooms: rooms.map((r) => ({
        id: r.id,
        slug: r.slug,
        roomType: r.roomType,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        previewImage: r.previewImage,
        fullImage: r.fullImage,
        surfaces: r.surfaces.map((s) => ({
          id: s.id,
          surfaceType: s.surfaceType,
          nameAr: s.nameAr,
          nameEn: s.nameEn,
          clipPath: s.clipPath,
          defaultMaterialSlug: s.defaultMaterial?.slug ?? null,
        })),
      })),
      materials: enabledConfigs.map((c) => ({
        id: c.material.id,
        slug: c.material.slug,
        translations: c.material.translations,
        textureUrl: c.textureUrl ?? c.material.images[0]?.url ?? null,
        physicalScale: c.physicalScale,
        patternScale: c.patternScale,
        tileWidth: c.tileWidth,
        tileHeight: c.tileHeight,
        groutWidth: c.groutWidth,
        groutColor: c.groutColor,
        rotation: c.rotation,
        defaultZoom: c.defaultZoom,
        bookmatch: c.bookmatch,
      })),
    });
  }),
);

// Site settings / homepage content -------------------------------------------

publicRouter.get(
  '/site',
  asyncHandler(async (_req, res) => {
    const keys = ['company', 'showroom', 'contact', 'social', 'languages', 'homepage', 'seo'];
    const rows = await prisma.siteSetting.findMany({ where: { key: { in: keys } } });
    const settings: Record<string, unknown> = {};
    for (const k of keys) {
      const row = rows.find((r) => r.key === k);
      settings[k] = row ? (row.value as Record<string, unknown>) : {};
    }
    res.json({ settings });
  }),
);

// Public submissions (contact forms) -----------------------------------------

const quoteItemSchema = z.object({
  slug: z.string().optional(),
  name: z.string().max(200).optional(),
  size: z.string().max(100).optional(),
  quantity: z.coerce.number().int().min(1).max(1000).default(1),
});
const quoteSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  projectType: z.string().max(120).optional(),
  message: z.string().max(5000).optional(),
  visualizerImage: z.string().max(2048).optional(),
  items: z.array(quoteItemSchema).max(100).default([]),
  source: z.string().max(60).default('website'),
});

publicRouter.post(
  '/quotes',
  publicSubmitLimiter,
  validateBody(quoteSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof quoteSchema>;
    const quote = await prisma.quoteRequest.create({
      data: {
        customerName: body.name,
        phone: body.phone,
        email: body.email,
        projectType: body.projectType,
        message: body.message,
        visualizerImage: body.visualizerImage,
        source: body.source,
      },
    });

    for (const item of body.items) {
      const materialId = item.slug
        ? await prisma.material.findFirst({ where: { slug: item.slug }, select: { id: true } })
        : null;
      await prisma.quoteItem.create({
        data: {
          quoteId: quote.id,
          materialId: materialId?.id ?? null,
          name: item.name ?? item.slug ?? null,
          size: item.size,
          quantity: item.quantity || 1,
        },
      });
    }
    res.status(201).json({ ok: true, id: quote.id });
  }),
);

const messageSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  projectType: z.string().max(120).optional(),
  message: z.string().min(1).max(5000),
});

publicRouter.post(
  '/messages',
  publicSubmitLimiter,
  validateBody(messageSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof messageSchema>;
    const row = await prisma.contactMessage.create({
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email,
        projectType: body.projectType,
        message: body.message,
      },
    });
    res.status(201).json({ ok: true, id: row.id });
  }),
);

const bookingSchema = z.object({
  name: z.string().min(2).max(200),
  phone: z.string().max(50).optional(),
  email: z.string().email().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  materialsOfInterest: z.string().max(1000).optional(),
});

publicRouter.post(
  '/bookings',
  publicSubmitLimiter,
  validateBody(bookingSchema),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof bookingSchema>;
    const row = await prisma.showroomBooking.create({
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email,
        requestDate: body.date ? new Date(`${body.date}T00:00:00.000Z`) : null,
        requestedTime: body.time,
        materialsOfInterest: body.materialsOfInterest,
      },
    });
    res.status(201).json({ ok: true, id: row.id });
  }),
);

export {};