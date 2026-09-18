import { Router } from 'express';
import { prisma } from '../../db.js';
import { asyncHandler } from '../../http/errors.js';
import { paginationSchema, parsePagination } from '../../lib/validate.js';
import { requirePermission } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import type { Prisma } from '@prisma/client';

export const auditRouter = Router();

auditRouter.use(requirePermission(PERM.auditView));

auditRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const where: Prisma.AuditLogWhereInput = {};

    const action = req.query.action;
    if (typeof action === 'string' && action) where.action = action;

    const success = req.query.success;
    if (success === 'true') where.success = true;
    if (success === 'false') where.success = false;

    const adminUserId = req.query.adminUserId;
    if (typeof adminUserId === 'string' && adminUserId) where.adminUserId = adminUserId;

    const from = req.query.from;
    const to = req.query.to;
    if (typeof from === 'string' && from && !Number.isNaN(Date.parse(from))) {
      where.timestamp = { gte: new Date(from) };
    }
    if (typeof to === 'string' && to && !Number.isNaN(Date.parse(to))) {
      where.timestamp = { ...(where.timestamp as Prisma.DateTimeFilter | undefined), lte: new Date(to) };
    }

    const search = req.query.search;
    if (typeof search === 'string' && search.trim()) {
      const needle = search.trim();
      where.OR = [
        { resourceId: { contains: needle, mode: 'insensitive' } },
        { resourceType: { contains: needle, mode: 'insensitive' } },
        { action: { contains: needle, mode: 'insensitive' } },
      ];
    }

    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: { adminUser: { select: { id: true, name: true, email: true } } },
        orderBy: { timestamp: 'desc' },
        skip,
        take,
      }),
    ]);
    res.json({ items: rows, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

auditRouter.get(
  '/actions',
  asyncHandler(async (_req, res) => {
    const grouped = await prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true }, orderBy: { _count: { action: 'desc' } } });
    res.json({ items: grouped.map((g) => ({ action: g.action, count: g._count._all })) });
  }),
);