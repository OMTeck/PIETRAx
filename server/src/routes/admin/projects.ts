import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, badRequest, notFound } from '../../http/errors.js';
import { validateBody, paginationSchema, parsePagination, langEnumSchema } from '../../lib/validate.js';
import { requirePermission, requireRole } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';
import type { Prisma, ProjectStatus } from '@prisma/client';

const statuses: ProjectStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

const translationPayload = z.object({
  lang: langEnumSchema,
  title: z.string().min(1).max(200),
  shortDescription: z.string().max(5000).nullable().optional(),
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(500).nullable().optional(),
  noIndex: z.boolean().optional(),
});

const imagePayload = z.object({
  url: z.string().max(2048),
  altAr: z.string().max(300).nullable().optional(),
  altEn: z.string().max(300).nullable().optional(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});

const projectPayload = z.object({
  slug: z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  projectTypeId: z.string().min(1),
  location: z.string().max(300).nullable().optional(),
  coverImage: z.string().max(2048).nullable().optional(),
  completionDate: z.string().datetime().nullable().optional(),
  featured: z.boolean().default(false),
  status: z.enum(statuses as [ProjectStatus, ...ProjectStatus[]]).default('DRAFT'),
  translations: z.array(translationPayload).min(2).max(2),
  materialIds: z.array(z.string()).default([]),
  images: z.array(imagePayload).max(60).default([]),
});

type ProjectInput = z.infer<typeof projectPayload>;

const include = {
  translations: true,
  images: { orderBy: { sortOrder: 'asc' } },
  projectType: true,
  materials: { include: { material: { include: { translations: true } } } },
} satisfies Prisma.ProjectInclude;

function serialize(p: Prisma.ProjectGetPayload<{ include: typeof include }>) {
  return {
    id: p.id,
    slug: p.slug,
    location: p.location,
    coverImage: p.coverImage,
    completionDate: p.completionDate,
    featured: p.featured,
    status: p.status,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    deletedAt: p.deletedAt,
    projectType: p.projectType,
    translations: p.translations,
    images: p.images,
    materials: p.materials.map((m) => ({
      id: m.material.id,
      slug: m.material.slug,
      translations: m.material.translations,
    })),
  };
}

function scalars(body: ProjectInput) {
  return {
    slug: body.slug,
    projectTypeId: body.projectTypeId,
    location: body.location ?? null,
    coverImage: body.coverImage ?? null,
    completionDate: body.completionDate ? new Date(body.completionDate) : null,
    featured: body.featured,
    status: body.status,
  };
}

export const projectsRouter = Router();

projectsRouter.use(requirePermission(PERM.projectsView));

projectsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const search = req.query.search;
    const trash = req.query.trash === 'true';
    const where: Prisma.ProjectWhereInput = trash ? { deletedAt: { not: null } } : { deletedAt: null };
    if (typeof search === 'string' && search.trim()) {
      where.OR = [{ translations: { some: { title: { contains: search.trim(), mode: 'insensitive' } } } }];
    }
    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.findMany({ where, include, orderBy: { updatedAt: 'desc' }, skip, take }),
    ]);
    res.json({ items: rows.map(serialize), pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const p = await prisma.project.findUnique({ where: { id: req.params.id }, include });
    if (!p) throw notFound('Project not found');
    res.json({ item: serialize(p) });
  }),
);

projectsRouter.post(
  '/',
  requirePermission(PERM.projectsCreate),
  validateBody(projectPayload),
  asyncHandler(async (req, res) => {
    const body = req.body as ProjectInput;
    const row = await prisma.project.create({
      data: {
        ...scalars(body),
        translations: { createMany: { data: body.translations.map((t) => ({ ...t })) } },
        images: { createMany: { data: body.images.map((img) => ({ ...img })) } },
        materials: { createMany: { data: body.materialIds.map((materialId) => ({ materialId })) } },
      },
      include,
    });
    await recordAudit(req, { action: AUDIT.PROJECT_CREATED, resourceType: 'Project', resourceId: row.id, metadata: { slug: row.slug } });
    res.status(201).json({ item: serialize(row) });
  }),
);

projectsRouter.patch(
  '/:id',
  requirePermission(PERM.projectsUpdate),
  validateBody(projectPayload),
  asyncHandler(async (req, res) => {
    const body = req.body as ProjectInput;
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Project not found');

    await prisma.$transaction([
      prisma.project.update({ where: { id: existing.id }, data: scalars(body) }),
      prisma.projectTranslation.deleteMany({ where: { projectId: existing.id } }),
      prisma.projectTranslation.createMany({ data: body.translations.map((t) => ({ projectId: existing.id, ...t })) }),
      prisma.projectImage.deleteMany({ where: { projectId: existing.id } }),
      prisma.projectImage.createMany({ data: body.images.map((img) => ({ projectId: existing.id, ...img })) }),
      prisma.projectMaterial.deleteMany({ where: { projectId: existing.id } }),
      prisma.projectMaterial.createMany({ data: body.materialIds.map((materialId) => ({ projectId: existing.id, materialId })) }),
    ]);
    const updated = await prisma.project.findUnique({ where: { id: existing.id }, include });
    await recordAudit(req, { action: AUDIT.PROJECT_UPDATED, resourceType: 'Project', resourceId: existing.id, metadata: { slug: body.slug, published: body.status === 'PUBLISHED' } });
    res.json({ item: serialize(updated!) });
  }),
);

projectsRouter.delete(
  '/:id',
  requirePermission(PERM.projectsDelete),
  asyncHandler(async (req, res) => {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Project not found');
    await prisma.project.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: AUDIT.PROJECT_DELETED, resourceType: 'Project', resourceId: existing.id });
    res.status(204).end();
  }),
);

projectsRouter.post(
  '/:id/restore',
  requirePermission(PERM.projectsUpdate),
  asyncHandler(async (req, res) => {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Project not found');
    await prisma.project.update({ where: { id: existing.id }, data: { deletedAt: null } });
    await recordAudit(req, { action: AUDIT.PROJECT_UPDATED, resourceType: 'Project', resourceId: existing.id, metadata: { restored: true } });
    res.json({ ok: true });
  }),
);

projectsRouter.delete(
  '/:id/permanent',
  requireRole('OWNER', 'ADMIN'),
  requirePermission(PERM.systemDelete),
  asyncHandler(async (req, res) => {
    const existing = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Project not found');
    await prisma.project.delete({ where: { id: existing.id } });
    await recordAudit(req, { action: AUDIT.PROJECT_DELETED, resourceType: 'Project', resourceId: existing.id, metadata: { permanent: true } });
    res.status(204).end();
  }),
);