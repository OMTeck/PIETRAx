import { Router } from 'express';
import { prisma } from '../../db.js';
import { asyncHandler } from '../../http/errors.js';
import { requirePermission } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';

export const overviewRouter = Router();

overviewRouter.use(requirePermission(PERM.dashboardView));

function nowMinus(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

overviewRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const dayAgo = nowMinus(1);
    const weekAgo = nowMinus(7);
    const [publishedMaterials, draftedMaterials, archivedMaterials, collections, projects, activeUsers, newQuotes7d, openQuotes, newMessages7d, pendingBookings, uploads7d, audit7d] =
      await Promise.all([
        prisma.material.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
        prisma.material.count({ where: { status: 'DRAFT', deletedAt: null } }),
        prisma.material.count({ where: { status: 'ARCHIVED', deletedAt: null } }),
        prisma.collection.count({ where: { deletedAt: null } }),
        prisma.project.count({ where: { deletedAt: null } }),
        prisma.adminUser.count({ where: { status: 'ACTIVE' } }),
        prisma.quoteRequest.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.quoteRequest.count({ where: { status: { in: ['NEW', 'CONTACTED', 'IN_PROGRESS'] } } }),
        prisma.contactMessage.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.showroomBooking.count({ where: { status: 'PENDING' } }),
        prisma.mediaAsset.count({ where: { createdAt: { gte: weekAgo } } }),
        prisma.auditLog.count({ where: { timestamp: { gte: weekAgo } } }),
      ]);

    const [quoteTrend, messageTrend, bookingTrend, visitorSessions24h] = await Promise.all([
      prisma.quoteRequest.findMany({
        where: { createdAt: { gte: weekAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.contactMessage.findMany({
        where: { createdAt: { gte: weekAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.showroomBooking.findMany({
        where: { createdAt: { gte: weekAgo } },
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.session.count({ where: { lastActiveAt: { gte: dayAgo }, revokedAt: null } }),
    ]);

    const bucketize = (rows: Array<{ createdAt: Date }>) => {
      const out: Record<string, number> = {};
      for (let i = 6; i >= 0; i--) {
        const d = nowMinus(i);
        out[d.toISOString().slice(0, 10)] = 0;
      }
      for (const row of rows) {
        const key = row.createdAt.toISOString().slice(0, 10);
        if (key in out) out[key] = (out[key] ?? 0) + 1;
      }
      return Object.entries(out).map(([date, count]) => ({ date, count }));
    };

    res.json({
      summary: {
        publishedMaterials,
        draftedMaterials,
        archivedMaterials,
        collections,
        projects,
        activeUsers,
        newQuotes7d,
        openQuotes,
        newMessages7d,
        pendingBookings,
        uploads7d,
        auditEvents7d: audit7d,
        activeSessions24h: visitorSessions24h,
      },
      trends: {
        quotes: bucketize(quoteTrend),
        messages: bucketize(messageTrend),
        bookings: bucketize(bookingTrend),
      },
    });
  }),
);