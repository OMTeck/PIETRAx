import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, badRequest, notFound } from '../../http/errors.js';
import { validateBody, paginationSchema, parsePagination, langEnumSchema } from '../../lib/validate.js';
import { requirePermission, requireRole } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';
import type { Prisma, MaterialStatus } from '@prisma/client';

const statuses: MaterialStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

const translationPayload = z.object({
  lang: langEnumSchema,
  name: z.string().min(1).max(200),
  description: z.string().max(5000).nullable().optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  noIndex: z.boolean().optional(),
});

const collectionPayload = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  coverImage: z.string().max(2048).nullable().optional(),
  featured: z.boolean().default(false),
  displayOrder: z.coerce.number().int().min(0).max(1000).default(0),
  status: z.enum(statuses as [MaterialStatus, ...MaterialStatus[]]).default('DRAFT'),
  translations: z.array(translationPayload).min(2).max(2),
  materialIds: z.array(z.string()).default([]),
});

type CollectionInput = z.infer<typeof collectionPayload>;

const include = {
  translations: true,
  items: { include: { material: { include: { translations: true } } } },
  _count: { select: { items: true } },
} satisfies Prisma.CollectionInclude;

function serialize(c: Prisma.CollectionGetPayload<{ include: typeof include }>) {
  return {
    id: c.id,
    slug: c.slug,
    coverImage: c.coverImage,
    featured: c.featured,
    displayOrder: c.displayOrder,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deletedAt: c.deletedAt,
    translations: c.translations,
    materialCount: c._count.items,
    materials: c.items.map((i) => ({
      id: i.material.id,
      slug: i.material.slug,
      translations: i.material.translations,
    })),
  };
}

function scalars(body: CollectionInput) {
  return {
    slug: body.slug,
    coverImage: body.coverImage ?? null,
    featured: body.featured,
    displayOrder: body.displayOrder,
    status: body.status,
  };
}

export const collectionsRouter = Router();

collectionsRouter.use(requirePermission(PERM.collectionsView));

collectionsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const search = req.query.search;
    const trash = req.query.trash === 'true';
    const where: Prisma.CollectionWhereInput = trash ? { deletedAt: { not: null } } : { deletedAt: null };
    if (typeof search === 'string' && search.trim()) {
      where.OR = [{ translations: { some: { name: { contains: search.trim(), mode: 'insensitive' } } } }];
    }
    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.collection.count({ where }),
      prisma.collection.findMany({ where, include, orderBy: { displayOrder: 'asc' }, skip, take }),
    ]);
    res.json({ items: rows.map(serialize), pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

collectionsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const c = await prisma.collection.findUnique({ where: { id: req.params.id }, include });
    if (!c) throw notFound('Collection not found');
    res.json({ item: serialize(c) });
  }),
);

collectionsRouter.post(
  '/',
  requirePermission(PERM.collectionsCreate),
  validateBody(collectionPayload),
  asyncHandler(async (req, res) => {
    const body = req.body as CollectionInput;
    const row = await prisma.collection.create({
      data: {
        ...scalars(body),
        translations: { createMany: { data: body.translations.map((t) => ({ ...t })) } },
        items: { createMany: { data: body.materialIds.map((materialId) => ({ materialId })) } },
      },
      include,
    });
    await recordAudit(req, { action: AUDIT.COLLECTION_CREATED, resourceType: 'Collection', resourceId: row.id, metadata: { slug: row.slug } });
    res.status(201).json({ item: serialize(row) });
  }),
);

collectionsRouter.patch(
  '/:id',
  requirePermission(PERM.collectionsUpdate),
  validateBody(collectionPayload),
  asyncHandler(async (req, res) => {
    const body = req.body as CollectionInput;
    const existing = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Collection not found');

    await prisma.$transaction([
      prisma.collection.update({ where: { id: existing.id }, data: scalars(body) }),
      prisma.collectionTranslation.deleteMany({ where: { collectionId: existing.id } }),
      prisma.collectionTranslation.createMany({ data: body.translations.map((t) => ({ collectionId: existing.id, ...t })) }),
      prisma.collectionItem.deleteMany({ where: { collectionId: existing.id } }),
      prisma.collectionItem.createMany({ data: body.materialIds.map((materialId) => ({ collectionId: existing.id, materialId })) }),
    ]);
    const updated = await prisma.collection.findUnique({ where: { id: existing.id }, include });
    await recordAudit(req, { action: AUDIT.COLLECTION_UPDATED, resourceType: 'Collection', resourceId: existing.id, metadata: { slug: body.slug } });
    res.json({ item: serialize(updated!) });
  }),
);

collectionsRouter.delete(
  '/:id',
  requirePermission(PERM.collectionsDelete),
  asyncHandler(async (req, res) => {
    const existing = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Collection not found');
    await prisma.collection.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: AUDIT.COLLECTION_DELETED, resourceType: 'Collection', resourceId: existing.id });
    res.status(204).end();
  }),
);

collectionsRouter.post(
  '/:id/restore',
  requirePermission(PERM.collectionsUpdate),
  asyncHandler(async (req, res) => {
    const existing = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Collection not found');
    await prisma.collection.update({ where: { id: existing.id }, data: { deletedAt: null } });
    await recordAudit(req, { action: AUDIT.COLLECTION_UPDATED, resourceType: 'Collection', resourceId: existing.id, metadata: { restored: true } });
    res.json({ ok: true });
  }),
);

// Permanent delete is guarded: no content editor, and collections with items
// must be emptied first.
collectionsRouter.delete(
  '/:id/permanent',
  requireRole('OWNER', 'ADMIN'),
  requirePermission(PERM.systemDelete),
  asyncHandler(async (req, res) => {
    const existing = await prisma.collection.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Collection not found');
    const itemCount = await prisma.collectionItem.count({ where: { collectionId: existing.id } });
    if (itemCount > 0) {
      throw badRequest('Remove all materials from this collection before deleting it permanently.', 'IN_USE');
    }
    await prisma.collection.delete({ where: { id: existing.id } });
    await recordAudit(req, { action: AUDIT.COLLECTION_DELETED, resourceType: 'Collection', resourceId: existing.id, metadata: { permanent: true } });
    res.status(204).end();
  }),
);