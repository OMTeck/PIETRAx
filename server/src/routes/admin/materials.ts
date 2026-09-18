import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../../http/errors.js';
import { validateBody, paginationSchema, parsePagination, langEnumSchema } from '../../lib/validate.js';
import { requirePermission } from '../../http/auth.js';
import { PERM, roleHasPermission } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';
import { randomToken } from '../../lib/tokens.js';
import type { Prisma, ImageKind, MaterialStatus } from '@prisma/client';

const imageKinds: ImageKind[] = ['MAIN', 'TEXTURE', 'SLAB', 'GALLERY', 'ROOM'];
const materialStatuses: MaterialStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

const materialTranslationPayload = z.object({
  lang: langEnumSchema,
  name: z.string().min(1).max(200),
  shortDescription: z.string().max(2000).nullable().optional(),
  longDescription: z.string().max(20000).nullable().optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  noIndex: z.boolean().optional(),
});

const materialImagePayload = z.object({
  kind: z.enum(imageKinds as [ImageKind, ...ImageKind[]]),
  url: z.string().max(2048),
  altAr: z.string().max(300).nullable().optional(),
  altEn: z.string().max(300).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

const materialStatusPayload = z.object({
  status: z.enum(materialStatuses as [MaterialStatus, ...MaterialStatus[]]),
});

export const materialPayload = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  sku: z.string().max(80).nullable().optional(),
  materialTypeId: z.string().min(1),
  categoryId: z.string().min(1).nullable().optional(),
  colorId: z.string().min(1).nullable().optional(),
  finishId: z.string().min(1).nullable().optional(),
  origin: z.string().max(200).nullable().optional(),
  thickness: z.string().max(80).nullable().optional(),
  availability: z.boolean().default(true),
  featured: z.boolean().default(false),
  newArrival: z.boolean().default(false),
  popular: z.boolean().default(false),
  bookmatch: z.boolean().default(false),
  technicalSpecs: z.record(z.string(), z.any()).nullable().optional(),
  status: z.enum(materialStatuses as [MaterialStatus, ...MaterialStatus[]]).default('DRAFT'),
  translations: z.array(materialTranslationPayload).min(2).max(2),
  sizeIds: z.array(z.string()).default([]),
  applicationIds: z.array(z.string()).default([]),
  collectionIds: z.array(z.string()).default([]),
  images: z.array(materialImagePayload).max(60).default([]),
});

type MaterialInput = z.infer<typeof materialPayload>;

// Accepted type for a nullable JSON column: JSON value or the null sentinel.
type JsonOrNull = Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined;

const materialInclude = {
  translations: true,
  images: { orderBy: { sortOrder: 'asc' } },
  sizes: { include: { size: true } },
  applications: { include: { application: true } },
  collections: { include: { collection: { include: { translations: true } } } },
  materialType: true,
  category: true,
  color: true,
  finish: true,
  visualizerConfigs: true,
} satisfies Prisma.MaterialInclude;

type MaterialRow = Prisma.MaterialGetPayload<{ include: typeof materialInclude }>;

function serialize(m: MaterialRow) {
  return {
    id: m.id,
    slug: m.slug,
    sku: m.sku,
    status: m.status,
    availability: m.availability,
    featured: m.featured,
    newArrival: m.newArrival,
    popular: m.popular,
    bookmatch: m.bookmatch,
    origin: m.origin,
    thickness: m.thickness,
    technicalSpecs: m.technicalSpecs,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    deletedAt: m.deletedAt,
    materialType: m.materialType,
    category: m.category,
    color: m.color,
    finish: m.finish,
    translations: m.translations,
    images: m.images,
    sizes: m.sizes.map((s) => s.size),
    applications: m.applications.map((a) => a.application),
    collections: m.collections.map((c) => ({
      id: c.collection.id,
      slug: c.collection.slug,
      translations: c.collection.translations,
    })),
    visualizerConfig: m.visualizerConfigs[0] ?? null,
  };
}

function buildScalars(body: MaterialInput) {
  return {
    slug: body.slug,
    sku: body.sku ?? null,
    materialTypeId: body.materialTypeId,
    categoryId: body.categoryId ?? null,
    colorId: body.colorId ?? null,
    finishId: body.finishId ?? null,
    origin: body.origin ?? null,
    thickness: body.thickness ?? null,
    availability: body.availability,
    featured: body.featured,
    newArrival: body.newArrival,
    popular: body.popular,
    bookmatch: body.bookmatch,
    technicalSpecs: (body.technicalSpecs ?? null) as unknown as JsonOrNull,
    status: body.status,
  };
}

export const materialsRouter = Router();

materialsRouter.use(requirePermission(PERM.materialsView));

materialsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const filter = req.query as Record<string, unknown>;
    const { search, status, materialTypeId, colorId, finishId, availability, trash } = filter;
    const showTrash = trash === 'true' || trash === '1';

    const where: Prisma.MaterialWhereInput =
      showTrash ? { deletedAt: { not: null } } : { deletedAt: null };

    if (typeof status === 'string' && status) where.status = status as MaterialStatus;
    if (typeof materialTypeId === 'string' && materialTypeId) where.materialTypeId = materialTypeId;
    if (typeof colorId === 'string' && colorId) where.colorId = colorId;
    if (typeof finishId === 'string' && finishId) where.finishId = finishId;
    if (availability === 'true') where.availability = true;
    if (availability === 'false') where.availability = false;
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { sku: { contains: search.trim(), mode: 'insensitive' } },
        { translations: { some: { name: { contains: search.trim(), mode: 'insensitive' } } } },
      ];
    }

    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.material.count({ where }),
      prisma.material.findMany({ where, include: materialInclude, orderBy: { updatedAt: 'desc' }, skip, take }),
    ]);

    res.json({
      items: rows.map(serialize),
      pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) },
    });
  }),
);

materialsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const m = await prisma.material.findUnique({ where: { id: req.params.id }, include: materialInclude });
    if (!m) throw notFound('Material not found');
    res.json({ item: serialize(m) });
  }),
);

materialsRouter.post(
  '/',
  requirePermission(PERM.materialsCreate),
  validateBody(materialPayload),
  asyncHandler(async (req, res) => {
    const body = req.body as MaterialInput;
    const m = await prisma.material.create({
      data: {
        ...buildScalars(body),
        translations: { createMany: { data: body.translations.map((t) => ({ ...t })) } },
        images: { createMany: { data: body.images.map((img) => ({ ...img })) } },
        sizes: { createMany: { data: body.sizeIds.map((sizeId) => ({ sizeId })) } },
        applications: { createMany: { data: body.applicationIds.map((applicationId) => ({ applicationId })) } },
        collections: { createMany: { data: body.collectionIds.map((collectionId) => ({ collectionId })) } },
      },
      include: materialInclude,
    });
    await recordAudit(req, { action: AUDIT.MATERIAL_CREATED, resourceType: 'Material', resourceId: m.id, metadata: { slug: m.slug } });
    res.status(201).json({ item: serialize(m) });
  }),
);

materialsRouter.patch(
  '/:id',
  requirePermission(PERM.materialsUpdate),
  validateBody(materialPayload),
  asyncHandler(async (req, res) => {
    const body = req.body as MaterialInput;
    const existing = await prisma.material.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Material not found');
    if (body.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      const user = req.authUser;
      if (!roleHasPermission(user.role, PERM.materialsPublish)) {
        throw forbidden('You do not have permission to publish materials.');
      }
    }

    await prisma.$transaction([
      prisma.material.update({ where: { id: existing.id }, data: buildScalars(body) }),
      prisma.materialTranslation.deleteMany({ where: { materialId: existing.id } }),
      prisma.materialTranslation.createMany({ data: body.translations.map((t) => ({ materialId: existing.id, ...t })) }),
      prisma.materialImage.deleteMany({ where: { materialId: existing.id } }),
      prisma.materialImage.createMany({ data: body.images.map((img) => ({ materialId: existing.id, ...img })) }),
      prisma.materialSize.deleteMany({ where: { materialId: existing.id } }),
      prisma.materialSize.createMany({ data: body.sizeIds.map((sizeId) => ({ materialId: existing.id, sizeId })) }),
      prisma.materialApplication.deleteMany({ where: { materialId: existing.id } }),
      prisma.materialApplication.createMany({ data: body.applicationIds.map((applicationId) => ({ materialId: existing.id, applicationId })) }),
      prisma.collectionItem.deleteMany({ where: { materialId: existing.id } }),
      prisma.collectionItem.createMany({ data: body.collectionIds.map((collectionId) => ({ materialId: existing.id, collectionId })) }),
    ]);

    const updated = await prisma.material.findUnique({ where: { id: existing.id }, include: materialInclude });
    await recordAudit(req, {
      action: AUDIT.MATERIAL_UPDATED,
      resourceType: 'Material',
      resourceId: existing.id,
      metadata: { slug: body.slug, published: body.status === 'PUBLISHED' },
    });
    res.json({ item: serialize(updated!) });
  }),
);

// Archive / publish / draft transition with explicit permission mapping.
materialsRouter.patch(
  '/:id/status',
  validateBody(materialStatusPayload),
  asyncHandler(async (req, res) => {
    const existing = await prisma.material.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Material not found');
    const status = req.body.status as MaterialStatus;
    const user = req.authUser;

    if (status === 'PUBLISHED' && !roleHasPermission(user.role, PERM.materialsPublish)) {
      throw forbidden('You do not have permission to publish materials.');
    }
    if (status === 'ARCHIVED' && !roleHasPermission(user.role, PERM.materialsDelete)) {
      throw forbidden('You do not have permission to archive materials.');
    }

    await prisma.material.update({ where: { id: existing.id }, data: { status } });
    await recordAudit(req, {
      action: status === 'ARCHIVED' ? AUDIT.MATERIAL_DELETED : AUDIT.MATERIAL_UPDATED,
      resourceType: 'Material',
      resourceId: existing.id,
      metadata: { status },
    });
    res.json({ ok: true, status });
  }),
);

materialsRouter.post(
  '/:id/restore',
  requirePermission(PERM.materialsUpdate),
  asyncHandler(async (req, res) => {
    const existing = await prisma.material.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Material not found');
    await prisma.material.update({ where: { id: existing.id }, data: { deletedAt: null } });
    await recordAudit(req, { action: AUDIT.MATERIAL_RESTORED, resourceType: 'Material', resourceId: existing.id });
    res.json({ ok: true });
  }),
);

materialsRouter.post(
  '/:id/duplicate',
  requirePermission(PERM.materialsCreate),
  asyncHandler(async (req, res) => {
    const existing = await prisma.material.findUnique({
      where: { id: req.params.id },
      include: { translations: true, images: true, sizes: true, applications: true, collections: true },
    });
    if (!existing) throw notFound('Material not found');

    const m = await prisma.material.create({
      data: {
        slug: `${existing.slug}-copy-${randomToken(4).toLowerCase()}`,
        sku: existing.sku ? `${existing.sku}-COPY` : null,
        materialTypeId: existing.materialTypeId,
        categoryId: existing.categoryId,
        colorId: existing.colorId,
        finishId: existing.finishId,
        origin: existing.origin,
        thickness: existing.thickness,
        availability: existing.availability,
        featured: false,
        newArrival: existing.newArrival,
        popular: existing.popular,
        bookmatch: existing.bookmatch,
        technicalSpecs: (existing.technicalSpecs ?? null) as unknown as JsonOrNull,
        status: 'DRAFT',
        translations: {
          createMany: {
            data: existing.translations.map((t) => ({
              lang: t.lang,
              name: `${t.name} (copy)`,
              shortDescription: t.shortDescription,
              longDescription: t.longDescription,
              seoTitle: t.seoTitle,
              seoDescription: t.seoDescription,
              noIndex: t.noIndex,
            })),
          },
        },
        images: { createMany: { data: existing.images.map((img) => ({ kind: img.kind, url: img.url, altAr: img.altAr, altEn: img.altEn, sortOrder: img.sortOrder })) } },
        sizes: { createMany: { data: existing.sizes.map((s) => ({ sizeId: s.sizeId })) } },
        applications: { createMany: { data: existing.applications.map((a) => ({ applicationId: a.applicationId })) } },
        collections: { createMany: { data: existing.collections.map((c) => ({ collectionId: c.collectionId })) } },
      },
      include: materialInclude,
    });
    await recordAudit(req, {
      action: AUDIT.MATERIAL_CREATED,
      resourceType: 'Material',
      resourceId: m.id,
      metadata: { slug: m.slug, duplicatedFrom: existing.id },
    });
    res.status(201).json({ item: serialize(m) });
  }),
);

// Soft delete -> Trash (restorable).
materialsRouter.delete(
  '/:id',
  requirePermission(PERM.materialsDelete),
  asyncHandler(async (req, res) => {
    const existing = await prisma.material.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Material not found');
    await prisma.material.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: AUDIT.MATERIAL_DELETED, resourceType: 'Material', resourceId: existing.id, metadata: { permanent: false } });
    res.status(204).end();
  }),
);

// Permanent delete requires system-level permission + confirmation.
materialsRouter.delete(
  '/:id/permanent',
  requirePermission(PERM.systemDelete),
  asyncHandler(async (req, res) => {
    const existing = await prisma.material.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Material not found');
    await prisma.material.delete({ where: { id: existing.id } });
    await recordAudit(req, { action: AUDIT.MATERIAL_DELETED, resourceType: 'Material', resourceId: existing.id, metadata: { permanent: true } });
    res.status(204).end();
  }),
);