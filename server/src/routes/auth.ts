import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { badRequest, forbidden, unauthorized } from '../http/errors.js';
import { requireAuth, requireAuthenticated, rotateSession, destroySession } from '../http/auth.js';
import { verifyPassword, hashPassword } from '../lib/passwords.js';
import { randomToken, hashToken, generateRecoveryCodes, normalizeRecoveryCode } from '../lib/tokens.js';
import { verifyTOTP, generateTOTPSecret, qrDataUrlFor } from '../lib/mfa.js';
import { recordAudit, AUDIT } from '../lib/audit.js';
import { validateBody } from '../lib/validate.js';
import { accountThrottle } from '../lib/authThrottle.js';
import { authLimiter, mfaStepLimiter, resetTokenLimiter, createLimiter } from '../http/rateLimit.js';
import { csrfToken } from '../http/csrf.js';
import { sessionStore } from '../http/session.js';
import { logger } from '../logger.js';

const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{12,}$/;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(512),
  remember: z.boolean().optional().default(false),
});

const verifySchema = z.object({ token: z.string().min(1).max(64), remember: z.boolean().optional().default(false) });
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().regex(PASSWORD_PATTERN, 'Password must be at least 12 characters and include lowercase, uppercase and a number.'),
});
const forgotSchema = z.object({ email: z.string().email() });
const resetSchema = z.object({ token: z.string().min(1), newPassword: z.string().regex(PASSWORD_PATTERN, 'Password must be at least 12 characters and include lowercase, uppercase and a number.') });
const mfaSetupSchema = z.object({ currentPassword: z.string().min(1) });
const mfaConfirmSchema = z.object({ token: z.string().min(6).max(64) });
const mfaDisableSchema = z.object({ currentPassword: z.string().min(1), token: z.string().min(6).max(64).optional() });

const REMEMBER_MS = { idle: 7 * 24 * 60 * 60 * 1000, abs: 30 * 24 * 60 * 60 * 1000 };

function safeUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  mfaEnabled: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  avatarUrl: string | null;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    status: user.status,
    mfaEnabled: user.mfaEnabled,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    avatarUrl: user.avatarUrl,
  };
}

// A fixed Argon2 hash for unknown-email logins so response timing stays flat.
const dummyHashPromise = hashPassword(randomToken(24));

export const authRouter = Router();

authRouter.get('/csrf', (req, res) => csrfToken(req, res));

authRouter.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  async (req: Request, res: Response, next) => {
    try {
      const { email, password, remember } = req.body as z.infer<typeof loginSchema>;
      const ip = req.ip ?? '';
      const normalizedEmail = email.trim().toLowerCase();

      if (accountThrottle.isBlocked(email, ip)) {
        await recordAudit(null, { action: AUDIT.LOGIN_FAILED, success: false });
        throw unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
      }

      const user = await prisma.adminUser.findUnique({ where: { email: normalizedEmail } });

      const userExists =
        user != null && user.passwordHash !== null && user.status === 'ACTIVE';

      if (!userExists) {
        await verifyPassword(await dummyHashPromise, password);
        accountThrottle.recordFailure(email, ip);
        await recordAudit(null, { action: AUDIT.LOGIN_FAILED, success: false });
        throw unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
      }

      const authenticatedUser = user!;
      const ok = await verifyPassword(authenticatedUser.passwordHash!, password);
      if (!ok) {
        accountThrottle.recordFailure(email, ip);
        await recordAudit(null, {
          action: AUDIT.LOGIN_FAILED,
          resourceType: 'AdminUser',
          resourceId: authenticatedUser.id,
          adminUserId: authenticatedUser.id,
          success: false,
        });
        throw unauthorized('Invalid email or password.', 'INVALID_CREDENTIALS');
      }

      accountThrottle.reset(email, ip);
      await recordAudit(null, {
        action: authenticatedUser.mfaEnabled ? AUDIT.LOGIN_MFA_REQUIRED : AUDIT.LOGIN_SUCCESS,
        resourceType: 'AdminUser',
        resourceId: authenticatedUser.id,
        adminUserId: authenticatedUser.id,
        metadata: { mfa: authenticatedUser.mfaEnabled },
      });
      await prisma.adminUser.update({ where: { id: authenticatedUser.id }, data: { lastLoginAt: new Date() } });

      await rotateSession(req);
      if (remember) req.session.cookie.maxAge = REMEMBER_MS.idle;

      if (authenticatedUser.mfaEnabled) {
        req.session.pendingAuth = { userId: authenticatedUser.id, expiresAt: new Date(Date.now() + 10 * 60 * 1000) };
        res.json({ mfaRequired: true });
        return;
      }

      req.session.auth = { userId: authenticatedUser.id, mfaVerified: false };
      req.session._createdAt = new Date();
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
      res.json({ user: safeUser(authenticatedUser) });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.post(
  '/mfa/verify',
  mfaStepLimiter,
  validateBody(verifySchema),
  async (req: Request, res: Response, next) => {
    try {
      const pending = req.session.pendingAuth;
      if (!pending || new Date(pending.expiresAt).getTime() < Date.now()) {
        throw unauthorized('Your sign-in session has expired. Please sign in again.', 'MFA_EXPIRED');
      }
      const user = await prisma.adminUser.findUnique({ where: { id: pending.userId } });
      if (!user || user.status !== 'ACTIVE' || !user.mfaEnabled || !user.mfaSecret) {
        throw unauthorized('Unable to complete sign-in. Please try again.', 'INVALID_CREDENTIALS');
      }

      const tokenIsTOTP = !req.body.token.includes('-');
      let ok = tokenIsTOTP && verifyTOTP(req.body.token, user.mfaSecret);
      let recoveryUsed = false;

      if (!ok) {
        const normalized = normalizeRecoveryCode(req.body.token);
        const targetHash = hashToken(normalized);
        const match = await prisma.recoveryCode.findFirst({
          where: { adminUserId: user.id, usedAt: null, codeHash: targetHash },
        });
        if (match) {
          await prisma.recoveryCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
          ok = true;
          recoveryUsed = true;
        }
      }

      if (!ok) {
        await recordAudit(req, { action: AUDIT.LOGIN_MFA_FAILED, resourceType: 'AdminUser', resourceId: user.id, adminUserId: user.id, success: false });
        throw unauthorized('Invalid verification code.', 'INVALID_MFA_TOKEN');
      }

      await recordAudit(req, {
        action: AUDIT.LOGIN_SUCCESS,
        resourceType: 'AdminUser',
        resourceId: user.id,
        adminUserId: user.id,
        metadata: { recovery: recoveryUsed },
      });
      await prisma.adminUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      await rotateSession(req);
      if (req.body.remember) req.session.cookie.maxAge = REMEMBER_MS.idle;
      req.session.pendingAuth = undefined;
      req.session.auth = { userId: user.id, mfaVerified: true };
      req.session._createdAt = new Date();
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
      res.json({ user: safeUser(user) });
    } catch (err) {
      next(err);
    }
  },
);

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: safeUser(req.authUser) });
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await recordAudit(req, { action: AUDIT.LOGOUT, resourceType: 'AdminUser', resourceId: req.authUser.id });
    await sessionStore.revokeSession(req.sessionID, req.authUser.id);
    await destroySession(req);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

authRouter.post('/change-password', requireAuth, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    const user = req.authUser;
    if (user.passwordHash) {
      const ok = await verifyPassword(user.passwordHash, req.body.currentPassword);
      if (!ok) throw forbidden('Current password is incorrect.', 'INVALID_CREDENTIALS');
    }
    const hash = await hashPassword(req.body.newPassword);
    await prisma.adminUser.update({ where: { id: user.id }, data: { passwordHash: hash, passwordChangedAt: new Date() } });

    await recordAudit(req, { action: AUDIT.PASSWORD_CHANGED, resourceType: 'AdminUser', resourceId: user.id });
    await sessionStore.clearUserSessions(user.id);
    await rotateSession(req);
    req.session.auth = { userId: user.id, mfaVerified: user.mfaEnabled };
    req.session._createdAt = new Date();
    await new Promise<void>((resolve) => req.session.save(() => resolve()));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/forgot-password', resetTokenLimiter, validateBody(forgotSchema), async (req, res, next) => {
  try {
    const email = req.body.email.trim().toLowerCase();
    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (user && user.status === 'ACTIVE') {
      const token = randomToken(32);
      await prisma.passwordResetToken.create({
        data: { adminUserId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      });
      // Delivery is via the configured email provider. Without a configured
      // SMTP/transactional provider this token cannot reach the user — the
      // admin UI reports this as "requires configuration" rather than silently
      // pretending an email was sent. See SECURITY.md "Password reset".
      logger.info({ userId: user.id }, 'Password reset requested: token generated (email delivery requires a configured provider)');
      await recordAudit(null, { action: AUDIT.PASSWORD_RESET_REQUESTED, resourceType: 'AdminUser', resourceId: user.id, adminUserId: user.id });
    } else {
      logger.info('Password reset requested for unknown or inactive account (no-op).');
      await recordAudit(null, { action: AUDIT.PASSWORD_RESET_REQUESTED, success: false });
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reset-password', resetTokenLimiter, validateBody(resetSchema), async (req, res, next) => {
  try {
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(req.body.token) },
      include: { user: true },
    });
    if (!record || record.usedAt !== null || record.expiresAt.getTime() < Date.now() || record.user.status !== 'ACTIVE') {
      throw badRequest('This reset link is invalid or has expired.', 'INVALID_TOKEN');
    }
    const hash = await hashPassword(req.body.newPassword);
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: record.user.id }, data: { passwordHash: hash, passwordChangedAt: new Date() } }),
      prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.session.deleteMany({ where: { userId: record.user.id } }),
    ]);
    await recordAudit(null, { action: AUDIT.PASSWORD_RESET_COMPLETED, resourceType: 'AdminUser', resourceId: record.user.id, adminUserId: record.user.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- MFA self-service (the logged-in admin manages their own MFA) ------------

const mfaSetupRateLimiter = createLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many attempts.' });

async function requireReauth(user: { passwordHash: string | null }, currentPassword: string): Promise<void> {
  if (user.passwordHash) {
    const ok = await verifyPassword(user.passwordHash, currentPassword);
    if (!ok) throw forbidden('Current password is incorrect.', 'INVALID_CREDENTIALS');
  }
}

authRouter.post('/mfa/setup/start', requireAuthenticated, mfaSetupRateLimiter, validateBody(mfaSetupSchema), async (req, res, next) => {
  try {
    if (req.authUser.mfaEnabled) throw badRequest('MFA is already enabled.', 'MFA_ALREADY_ENABLED');
    await requireReauth(req.authUser, req.body.currentPassword);
    const secret = generateTOTPSecret();
    await prisma.adminUser.update({ where: { id: req.authUser.id }, data: { mfaSecret: secret } });
    const qrCode = await qrDataUrlFor(secret, req.authUser.email);
    res.json({ qrCode });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/mfa/setup/confirm', requireAuthenticated, mfaSetupRateLimiter, validateBody(mfaConfirmSchema), async (req, res, next) => {
  try {
    const user = await prisma.adminUser.findUnique({ where: { id: req.authUser.id } });
    if (!user || user.mfaEnabled || !user.mfaSecret) throw badRequest('MFA setup was not started.', 'MFA_NOT_STARTED');
    if (!verifyTOTP(req.body.token, user.mfaSecret)) {
      throw forbidden('The code did not match. Please try again.', 'INVALID_MFA_TOKEN');
    }
    const { codes, hashed } = generateRecoveryCodes(10);
    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: user.id }, data: { mfaEnabled: true, mfaVerifiedAt: new Date() } }),
      prisma.recoveryCode.deleteMany({ where: { adminUserId: user.id } }),
      prisma.recoveryCode.createMany({ data: hashed.map((codeHash) => ({ adminUserId: user.id, codeHash })) }),
    ]);
    await recordAudit(req, { action: AUDIT.MFA_ENABLED, resourceType: 'AdminUser', resourceId: user.id });
    await rotateSession(req);
    req.session.auth = { userId: user.id, mfaVerified: true };
    req.session._createdAt = new Date();
    await new Promise<void>((resolve) => req.session.save(() => resolve()));
    res.json({ recoveryCodes: codes });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/mfa/recovery-codes', requireAuth, mfaSetupRateLimiter, validateBody(mfaSetupSchema), async (req, res, next) => {
  try {
    if (!req.authUser.mfaEnabled) throw badRequest('Enable MFA first.', 'MFA_NOT_ENABLED');
    await requireReauth(req.authUser, req.body.currentPassword);
    const { codes, hashed } = generateRecoveryCodes(10);
    await prisma.$transaction([
      prisma.recoveryCode.deleteMany({ where: { adminUserId: req.authUser.id } }),
      prisma.recoveryCode.createMany({ data: hashed.map((codeHash) => ({ adminUserId: req.authUser.id, codeHash })) }),
    ]);
    await recordAudit(req, { action: AUDIT.RECOVERY_CODES_REGENERATED, resourceType: 'AdminUser', resourceId: req.authUser.id });
    res.json({ recoveryCodes: codes });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/mfa/disable', requireAuth, mfaSetupRateLimiter, validateBody(mfaDisableSchema), async (req, res, next) => {
  try {
    const user = await prisma.adminUser.findUnique({ where: { id: req.authUser.id } });
    if (!user || !user.mfaEnabled || !user.mfaSecret) throw badRequest('MFA is not enabled.', 'MFA_NOT_ENABLED');
    await requireReauth(user, req.body.currentPassword);

    let verified = false;
    if (req.body.token && !req.body.token.includes('-')) {
      verified = verifyTOTP(req.body.token, user.mfaSecret);
    }
    if (!verified && req.body.token) {
      const normalized = normalizeRecoveryCode(req.body.token);
      const match = await prisma.recoveryCode.findFirst({
        where: { adminUserId: user.id, usedAt: null, codeHash: hashToken(normalized) },
      });
      if (match) {
        await prisma.recoveryCode.update({ where: { id: match.id }, data: { usedAt: new Date() } });
        verified = true;
      }
    }
    if (!verified) throw forbidden('A valid TOTP code or recovery code is required to disable MFA.', 'MFA_REQUIRED');

    await prisma.$transaction([
      prisma.adminUser.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null, mfaVerifiedAt: null } }),
      prisma.recoveryCode.deleteMany({ where: { adminUserId: user.id } }),
    ]);
    await recordAudit(req, { action: AUDIT.MFA_DISABLED, resourceType: 'AdminUser', resourceId: user.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// --- Session management (own sessions) ----------------------------------------

authRouter.get('/sessions', requireAuth, async (req, res, next) => {
  try {
    const sessions = await sessionStore.listUserSessions(req.authUser.id);
    res.json({
      sessions: sessions.map((s) => ({
        id: s.sid,
        ipAddress: s.ipAddress,
        userAgent: s.userAgent,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        expiresAt: s.expiresAt,
        current: s.sid === req.sessionID,
      })),
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/sessions/revoke-all', requireAuth, async (req, res, next) => {
  try {
    await sessionStore.clearUserSessions(req.authUser.id);
    await rotateSession(req);
    req.session.auth = { userId: req.authUser.id, mfaVerified: req.authUser.mfaEnabled };
    req.session._createdAt = new Date();
    await new Promise<void>((resolve) => req.session.save(() => resolve()));
    await recordAudit(req, { action: AUDIT.SESSIONS_REVOKED_ALL, resourceType: 'AdminUser', resourceId: req.authUser.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/sessions/:sid/revoke', requireAuth, async (req, res, next) => {
  try {
    const sid = req.params.sid as string;
    if (sid === req.sessionID) {
      throw badRequest('Use "logout" to end the current session.', 'CURRENT_SESSION');
    }
    await sessionStore.revokeSession(sid, req.authUser.id);
    await recordAudit(req, { action: AUDIT.SESSION_REVOKED, resourceType: 'AdminUser', resourceId: req.authUser.id });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});