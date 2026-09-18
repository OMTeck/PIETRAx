import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, forbidden, notFound } from '../../http/errors.js';
import { validateBody, paginationSchema, parsePagination } from '../../lib/validate.js';
import { requirePermission } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';
import type { BookingStatus, MessageStatus, Prisma, QuoteStatus } from '@prisma/client';

const quoteStatuses: QuoteStatus[] = ['NEW', 'CONTACTED', 'IN_PROGRESS', 'QUOTED', 'WON', 'LOST', 'ARCHIVED'];
const messageStatuses: MessageStatus[] = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'];
const bookingStatuses: BookingStatus[] = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];

export const customersRouter = Router();

// ---- Quotes ------------------------------------------------------------------

const quoteInclude = {
  items: { include: { material: { select: { id: true, slug: true } } } },
  history: { include: { changedBy: { select: { id: true, name: true, email: true } } }, orderBy: { changedAt: 'desc' } },
} satisfies Prisma.QuoteRequestInclude;

customersRouter.use(requirePermission(PERM.customersView));

customersRouter.get(
  '/quotes',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const search = req.query.search;
    const status = req.query.status;
    const where: Prisma.QuoteRequestWhereInput = {};
    if (typeof status === 'string' && (quoteStatuses as string[]).includes(status)) where.status = status as QuoteStatus;
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { customerName: { contains: search.trim(), mode: 'insensitive' } },
        { email: { contains: search.trim(), mode: 'insensitive' } },
        { phone: { contains: search.trim() } },
      ];
    }
    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.quoteRequest.count({ where }),
      prisma.quoteRequest.findMany({ where, include: { _count: { select: { items: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    res.json({ items: rows, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

customersRouter.get(
  '/quotes/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.quoteRequest.findUnique({ where: { id: req.params.id }, include: quoteInclude });
    if (!row) throw notFound('Quote not found');
    res.json({ item: row });
  }),
);

customersRouter.patch(
  '/quotes/:id/status',
  requirePermission(PERM.quotesManage),
  validateBody(
    z.object({
      status: z.enum(quoteStatuses as [QuoteStatus, ...QuoteStatus[]]),
      note: z.string().max(2000).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const row = await prisma.quoteRequest.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Quote not found');
    const { status, note } = req.body as { status: QuoteStatus; note?: string | null };

    if (row.status === 'ARCHIVED' && status !== 'ARCHIVED') {
      throw forbidden('Archived quotes cannot be reopened.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.quoteStatusHistory.create({
        data: { quoteId: row.id, fromStatus: row.status, toStatus: status, note: note ?? null, changedById: req.authUser.id },
      });
      return tx.quoteRequest.update({ where: { id: row.id }, data: { status } });
    });
    await recordAudit(req, { action: AUDIT.QUOTE_STATUS_CHANGED, resourceType: 'QuoteRequest', resourceId: row.id, metadata: { from: row.status, to: status } });
    res.json({ item: updated });
  }),
);

customersRouter.post(
  '/quotes/:id/note',
  requirePermission(PERM.quotesManage),
  validateBody(z.object({ note: z.string().min(1).max(5000) })),
  asyncHandler(async (req, res) => {
    const row = await prisma.quoteRequest.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Quote not found');
    const note = (req.body as { note: string }).note;
    const updated = await prisma.quoteRequest.update({ where: { id: row.id }, data: { internalNotes: note } });
    await recordAudit(req, { action: AUDIT.QUOTE_STATUS_CHANGED, resourceType: 'QuoteRequest', resourceId: row.id, metadata: { note: true } });
    res.json({ item: updated });
  }),
);

// ---- Messages ----------------------------------------------------------------

customersRouter.get(
  '/messages',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const status = req.query.status;
    const where: Prisma.ContactMessageWhereInput = {};
    if (typeof status === 'string' && (messageStatuses as string[]).includes(status)) where.status = status as MessageStatus;
    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.contactMessage.count({ where }),
      prisma.contactMessage.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    res.json({ items: rows, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

customersRouter.get(
  '/messages/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.contactMessage.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Message not found');
    res.json({ item: row });
  }),
);

customersRouter.patch(
  '/messages/:id/status',
  requirePermission(PERM.customersUpdate),
  validateBody(z.object({ status: z.enum(messageStatuses as [MessageStatus, ...MessageStatus[]]) })),
  asyncHandler(async (req, res) => {
    const row = await prisma.contactMessage.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Message not found');
    const status = (req.body as { status: MessageStatus }).status;
    const updated = await prisma.contactMessage.update({ where: { id: row.id }, data: { status } });
    await recordAudit(req, { action: AUDIT.QUOTE_STATUS_CHANGED, resourceType: 'ContactMessage', resourceId: row.id, metadata: { status } });
    res.json({ item: updated });
  }),
);

// ---- Showroom bookings -------------------------------------------------------

customersRouter.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const status = req.query.status;
    const where: Prisma.ShowroomBookingWhereInput = {};
    if (typeof status === 'string' && (bookingStatuses as string[]).includes(status)) where.status = status as BookingStatus;
    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.showroomBooking.count({ where }),
      prisma.showroomBooking.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    res.json({ items: rows, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

customersRouter.patch(
  '/bookings/:id/status',
  requirePermission(PERM.quotesManage),
  validateBody(
    z.object({
      status: z.enum(bookingStatuses as [BookingStatus, ...BookingStatus[]]),
      note: z.string().max(3000).nullable().optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const row = await prisma.showroomBooking.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Booking not found');
    const { status, note } = req.body as { status: BookingStatus; note?: string | null };
    const updated = await prisma.showroomBooking.update({
      where: { id: row.id },
      data: { status, ...(note !== undefined ? { internalNotes: note } : {}) },
    });
    await recordAudit(req, { action: AUDIT.QUOTE_STATUS_CHANGED, resourceType: 'ShowroomBooking', resourceId: row.id, metadata: { status } });
    res.json({ item: updated });
  }),
);