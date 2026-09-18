import { Router } from 'express';
import { asyncHandler } from '../http/errors.js';
import { requireAuth, noStorePrivate, requirePermission } from '../http/auth.js';
import { adminApiLimiter, apiLimiter } from '../http/rateLimit.js';
import { prisma } from '../db.js';
import { PERM } from '../authz/permissions.js';
import { materialsRouter } from './admin/materials.js';
import { collectionsRouter } from './admin/collections.js';
import { projectsRouter } from './admin/projects.js';
import {
  materialTypeRouter,
  categoryRouter,
  colorRouter,
  finishRouter,
  sizeRouter,
  applicationRouter,
  projectTypeRouter,
} from './admin/taxonomy.js';
import { visualizerRouter } from './admin/visualizer.js';
import { contentRouter } from './admin/content.js';
import { mediaRouter } from './admin/media.js';
import { customersRouter } from './admin/customers.js';
import { usersRouter } from './admin/users.js';
import { auditRouter } from './admin/audit.js';
import { overviewRouter } from './admin/overview.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);
adminRouter.use(noStorePrivate);
adminRouter.use(apiLimiter);
adminRouter.use(adminApiLimiter);

adminRouter.use('/overview', overviewRouter);
adminRouter.use('/materials', materialsRouter);
adminRouter.use('/collections', collectionsRouter);
adminRouter.use('/projects', projectsRouter);
adminRouter.use('/visualizer', visualizerRouter);
adminRouter.use('/content', contentRouter);
adminRouter.use('/media', mediaRouter);
adminRouter.use('/customers', customersRouter);
adminRouter.use('/users', usersRouter);
adminRouter.use('/audit-log', auditRouter);

// Per-resource taxonomy CRUD (unambiguous subpaths).
adminRouter.use('/taxonomy/material-types', materialTypeRouter);
adminRouter.use('/taxonomy/categories', categoryRouter);
adminRouter.use('/taxonomy/colors', colorRouter);
adminRouter.use('/taxonomy/finishes', finishRouter);
adminRouter.use('/taxonomy/sizes', sizeRouter);
adminRouter.use('/taxonomy/applications', applicationRouter);
adminRouter.use('/taxonomy/project-types', projectTypeRouter);

// Aggregate for the dashboard's single "open taxonomy" view.
adminRouter.get(
  '/taxonomy',
  requirePermission(PERM.taxonomyManage),
  asyncHandler(async (_req, res) => {
    const usageCounts = {
      materialType: (id: string) => prisma.material.count({ where: { materialTypeId: id } }),
      category: (id: string) => prisma.material.count({ where: { categoryId: id } }),
      color: (id: string) => prisma.material.count({ where: { colorId: id } }),
      finish: (id: string) => prisma.material.count({ where: { finishId: id } }),
      size: (id: string) => prisma.materialSize.count({ where: { sizeId: id } }),
      application: (id: string) => prisma.materialApplication.count({ where: { applicationId: id } }),
      projectType: (id: string) => prisma.project.count({ where: { projectTypeId: id } }),
    } as const;

    const [materialTypes, categories, colors, finishes, sizes, applications, projectTypes] = await Promise.all([
      prisma.materialType.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.category.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.color.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.finish.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.size.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.application.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.projectType.findMany({ orderBy: { sortOrder: 'asc' } }),
    ]);
    const withUsage = async (key: keyof typeof usageCounts, rows: Array<{ id: string }>) =>
      Promise.all(rows.map(async (r) => ({ ...r, usageCount: await usageCounts[key](r.id) })));

    res.json({
      taxonomy: {
        materialTypes: await withUsage('materialType', materialTypes),
        categories: await withUsage('category', categories),
        colors: await withUsage('color', colors),
        finishes: await withUsage('finish', finishes),
        sizes: await withUsage('size', sizes),
        applications: await withUsage('application', applications),
        projectTypes: await withUsage('projectType', projectTypes),
      },
    });
  }),
);