import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../../http/errors.js';
import { validateBody, paginationSchema, parsePagination } from '../../lib/validate.js';
import { requirePermission, revokeAllSessions } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import { ROLES } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';
import { makeSignupToken, hashToken } from '../../lib/tokens.js';
import type { Prisma, Role, UserStatus } from '@prisma/client';

const statuses: UserStatus[] = ['ACTIVE', 'DISABLED', 'PENDING'];

const RESET_TTL_MS = 30 * 60 * 1000;

async function createResetToken(userId: string): Promise<string> {
  const token = makeSignupToken();
  await prisma.passwordResetToken.create({
    data: { adminUserId: userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  return token;
}

const invitePayload = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  role: z.enum(ROLES as [Role, ...Role[]]),
});

const updatePayload = z.object({
  name: z.string().min(1).max(120).optional(),
  role: z.enum(ROLES as [Role, ...Role[]]).optional(),
  status: z.enum(statuses as [UserStatus, ...UserStatus[]]).optional(),
});

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  mfaEnabled: true,
  lastLoginAt: true,
  passwordChangedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { sessions: true } },
} satisfies Prisma.AdminUserSelect;

function requireTargetBelow(actor: { role: Role; id: string }, target: { role: Role; id: string }) {
  if (target.id === actor.id) return;
  const rank = (r: Role) => (ROLES as Role[]).indexOf(r);
  if (rank(target.role) >= rank(actor.role)) {
    throw forbidden('You cannot manage users with a role equal or higher than yours.');
  }
}

export const usersRouter = Router();

usersRouter.use(requirePermission(PERM.usersManage));

usersRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const search = req.query.search;
    const where: Prisma.AdminUserWhereInput = {};
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { name: { contains: search.trim(), mode: 'insensitive' } },
        { email: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.adminUser.count({ where }),
      prisma.adminUser.findMany({ where, select: userSelect, orderBy: { createdAt: 'asc' }, skip, take }),
    ]);
    res.json({ items: rows, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

// Create a PENDING account with a one-time invitation token. The client displays
// the activation link to the operator; nothing containing a secret is persisted
// for the wrong environment (tokens are stored hashed).
usersRouter.post(
  '/invite',
  validateBody(invitePayload),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof invitePayload>;

    const existing = await prisma.adminUser.findUnique({ where: { email: body.email.toLowerCase() } });
    if (existing) throw badRequest('A user with this email already exists.', 'EMAIL_TAKEN');

    const user = await prisma.adminUser.create({
      data: { email: body.email.toLowerCase(), name: body.name, role: body.role, status: 'PENDING' },
    });
    const token = await createResetToken(user.id);

    await recordAudit(req, { action: AUDIT.USER_INVITED, resourceType: 'AdminUser', resourceId: user.id, metadata: { email: user.email, role: body.role } });

    res.status(201).json({ item: user, activationToken: token });
  }),
);

usersRouter.patch(
  '/:id',
  validateBody(updatePayload),
  asyncHandler(async (req, res) => {
    const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found');
    requireTargetBelow(req.authUser, target);

    const body = req.body as z.infer<typeof updatePayload>;
    if (body.role && target.id === req.authUser.id) {
      throw forbidden('You cannot change your own role.');
    }
    // Prevent self-disable (locked-out admin).
    if (body.status && body.status !== 'ACTIVE' && target.id === req.authUser.id) {
      throw forbidden('You cannot disable your own account.');
    }

    const updated = await prisma.adminUser.update({
      where: { id: target.id },
      data: { ...body },
      select: userSelect,
    });

    const meta: Record<string, unknown> = {};
    if (body.role) meta.role = body.role;
    if (body.status) meta.status = body.status;
    if (Object.keys(meta).length > 0) {
      await recordAudit(req, { action: AUDIT.USER_UPDATED, resourceType: 'AdminUser', resourceId: target.id, metadata: meta as Prisma.InputJsonValue });
    }

    // Role demotion or disable: kill all of the target's sessions so the new
    // permissions apply immediately (fresh user reload happens per request).
    const privilegesChanged = body.role !== undefined || body.status !== undefined;
    if (privilegesChanged && target.id !== req.authUser.id) {
      await revokeAllSessions(target.id, target.id === req.authUser.id ? 'revoke-self' : 'admin');
    }

    res.json({ item: updated });
  }),
);

// Re-issue a password reset token (force reset after admin actions).
usersRouter.post(
  '/:id/require-password-reset',
  asyncHandler(async (req, res) => {
    const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found');
    requireTargetBelow(req.authUser, target);

    const token = await createResetToken(target.id);
    await revokeAllSessions(target.id, 'reset');
    await recordAudit(req, { action: AUDIT.USER_UPDATED, resourceType: 'AdminUser', resourceId: target.id, metadata: { requirePasswordReset: true } });

    res.json({ activationToken: token });
  }),
);

usersRouter.post(
  '/:id/revoke-sessions',
  asyncHandler(async (req, res) => {
    const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found');
    requireTargetBelow(req.authUser, target);
    await revokeAllSessions(target.id, 'admin');
    await recordAudit(req, { action: AUDIT.USER_UPDATED, resourceType: 'AdminUser', resourceId: target.id, metadata: { revokedSessions: true } });
    res.json({ ok: true });
  }),
);

// Mark account so MFA must be set up; also permanently clears the current
// authenticator binding so no stale device keeps access.
usersRouter.post(
  '/:id/require-mfa',
  requirePermission(PERM.settingsSecurity),
  asyncHandler(async (req, res) => {
    const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found');
    requireTargetBelow(req.authUser, target);

    await prisma.adminUser.update({ where: { id: target.id }, data: { mfaEnabled: false, mfaSecret: null } });
    await revokeAllSessions(target.id, 'mfa');
    await recordAudit(req, { action: AUDIT.SECURITY_SETTING_CHANGED, resourceType: 'AdminUser', resourceId: target.id, metadata: { requireMfa: true } });
    res.json({ ok: true });
  }),
);

// Delete a user. Since OWNER is the top rank and ADMIN is below it, this can
// only ever target accounts below OWNER (and never yourself).
usersRouter.delete(
  '/:id',
  requirePermission(PERM.systemDelete),
  asyncHandler(async (req, res) => {
    const target = await prisma.adminUser.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound('User not found');
    if (target.id === req.authUser.id) throw forbidden('You cannot delete your own account.');
    if (target.role === 'OWNER') throw forbidden('Owner accounts cannot be deleted.');

    await prisma.adminUser.delete({ where: { id: target.id } });
    await revokeAllSessions(target.id, 'deleted');
    await recordAudit(req, { action: AUDIT.USER_UPDATED, resourceType: 'AdminUser', resourceId: target.id, metadata: { deleted: true } });
    res.status(204).end();
  }),
);