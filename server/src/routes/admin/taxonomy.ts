import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, badRequest, notFound } from '../../http/errors.js';
import { validateBody } from '../../lib/validate.js';
import { requirePermission } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';

type DelegateName =
  | 'materialType'
  | 'category'
  | 'color'
  | 'finish'
  | 'size'
  | 'application'
  | 'projectType';

interface RowLike {
  id: string;
  system?: boolean;
}

function delegate(name: DelegateName): any {
  return prisma[name];
}

interface TaxonomyConfig {
  label: string;
  usageCount: (id: string) => Promise<number>;
  createPayload: z.ZodTypeAny;
  updatePayload: z.ZodTypeAny;
}

const common = {
  code: z.string().min(1).max(60),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  labelAr: z.string().min(1).max(120),
  labelEn: z.string().min(1).max(120),
  sortOrder: z.coerce.number().int().min(-1000).max(1000).default(0),
};

function localizedOpts() {
  return {
    labelAr: z.string().min(1).max(120).optional(),
    labelEn: z.string().min(1).max(120).optional(),
    sortOrder: z.coerce.number().int().min(-1000).max(1000).optional(),
  };
}

function configFor(name: DelegateName): TaxonomyConfig {
  switch (name) {
    case 'materialType': {
      return {
        label: 'Material type',
        usageCount: (id) => prisma.material.count({ where: { materialTypeId: id } }),
        createPayload: z.object({ code: common.code, slug: common.slug, labelAr: common.labelAr, labelEn: common.labelEn, sortOrder: common.sortOrder }),
        updatePayload: z.object({ slug: common.slug.optional(), ...localizedOpts() }),
      };
    }
    case 'category': {
      return {
        label: 'Category',
        usageCount: (id) => prisma.material.count({ where: { categoryId: id } }),
        createPayload: z.object({
          code: common.code,
          slug: common.slug,
          labelAr: common.labelAr,
          labelEn: common.labelEn,
          descriptionAr: z.string().max(2000).optional(),
          descriptionEn: z.string().max(2000).optional(),
          coverImage: z.string().max(2048).optional(),
          sortOrder: common.sortOrder,
        }),
        updatePayload: z.object({
          slug: common.slug.optional(),
          ...localizedOpts(),
          descriptionAr: z.string().max(2000).optional(),
          descriptionEn: z.string().max(2000).optional(),
          coverImage: z.string().max(2048).optional(),
        }),
      };
    }
    case 'color': {
      return {
        label: 'Color',
        usageCount: (id) => prisma.material.count({ where: { colorId: id } }),
        createPayload: z.object({ code: common.code, labelAr: common.labelAr, labelEn: common.labelEn, swatchImage: z.string().max(2048).optional(), sortOrder: common.sortOrder }),
        updatePayload: z.object({ ...localizedOpts(), swatchImage: z.string().max(2048).optional() }),
      };
    }
    case 'finish': {
      return {
        label: 'Finish',
        usageCount: (id) => prisma.material.count({ where: { finishId: id } }),
        createPayload: z.object({ code: common.code, labelAr: common.labelAr, labelEn: common.labelEn, sortOrder: common.sortOrder }),
        updatePayload: z.object({ ...localizedOpts() }),
      };
    }
    case 'size': {
      return {
        label: 'Size',
        usageCount: (id) => prisma.materialSize.count({ where: { sizeId: id } }),
        createPayload: z.object({ code: common.code, label: z.string().min(1).max(120), sortOrder: common.sortOrder }),
        updatePayload: z.object({ label: z.string().min(1).max(120).optional(), sortOrder: z.coerce.number().optional() }),
      };
    }
    case 'application': {
      return {
        label: 'Application',
        usageCount: (id) => prisma.materialApplication.count({ where: { applicationId: id } }),
        createPayload: z.object({ code: common.code, labelAr: common.labelAr, labelEn: common.labelEn, sortOrder: common.sortOrder }),
        updatePayload: z.object({ ...localizedOpts() }),
      };
    }
    case 'projectType': {
      return {
        label: 'Project type',
        usageCount: (id) => prisma.project.count({ where: { projectTypeId: id } }),
        createPayload: z.object({ code: common.code, labelAr: common.labelAr, labelEn: common.labelEn, sortOrder: common.sortOrder }),
        updatePayload: z.object({ ...localizedOpts() }),
      };
    }
  }
}

function buildRouter(name: DelegateName): Router {
  const cfg = configFor(name);
  const router = Router();

  router.use(requirePermission(PERM.taxonomyManage));

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const rows = (await delegate(name).findMany({ orderBy: { sortOrder: 'asc' } })) as RowLike[];
      const items = await Promise.all(
        rows.map(async (r) => ({ ...r, usageCount: await cfg.usageCount(r.id) })),
      );
      res.json({ items });
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const row = await delegate(name).findUnique({ where: { id: req.params.id } });
      if (!row) throw notFound(`${cfg.label} not found`);
      const usageCount = await cfg.usageCount(row.id);
      res.json({ item: { ...row, usageCount } });
    }),
  );

  router.post(
    '/',
    validateBody(cfg.createPayload),
    asyncHandler(async (req, res) => {
      const row = await delegate(name).create({ data: req.body });
      await recordAudit(req, { action: AUDIT.TAXONOMY_CREATED, resourceType: name, resourceId: row.id, metadata: { label: cfg.label } });
      res.status(201).json({ item: row });
    }),
  );

  router.patch(
    '/:id',
    validateBody(cfg.updatePayload),
    asyncHandler(async (req, res) => {
      const existing = (await delegate(name).findUnique({ where: { id: req.params.id } })) as RowLike | null;
      if (!existing) throw notFound(`${cfg.label} not found`);
      let data = req.body;
      if (existing.system && 'slug' in data) {
        delete data.slug;
      }
      const row = await delegate(name).update({ where: { id: existing.id }, data });
      await recordAudit(req, { action: AUDIT.TAXONOMY_UPDATED, resourceType: name, resourceId: row.id });
      res.json({ item: row });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const row = (await delegate(name).findUnique({ where: { id: req.params.id } })) as RowLike | null;
      if (!row) throw notFound(`${cfg.label} not found`);
      if (row.system) throw badRequest(`${cfg.label} is a system entry and cannot be deleted.`, 'SYSTEM_ENTRY');
      const usage = await cfg.usageCount(row.id);
      if (usage > 0) {
        throw badRequest(`${cfg.label} is used by ${usage} item(s). Reassign those items first.`, 'IN_USE');
      }
      await delegate(name).delete({ where: { id: row.id } });
      await recordAudit(req, { action: AUDIT.TAXONOMY_DELETED, resourceType: name, resourceId: row.id });
      res.status(204).end();
    }),
  );

  return router;
}

export const materialTypeRouter = buildRouter('materialType');
export const categoryRouter = buildRouter('category');
export const colorRouter = buildRouter('color');
export const finishRouter = buildRouter('finish');
export const sizeRouter = buildRouter('size');
export const applicationRouter = buildRouter('application');
export const projectTypeRouter = buildRouter('projectType');