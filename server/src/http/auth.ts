import type { AdminUser, Role } from '@prisma/client';
import type { Request, RequestHandler, Response } from 'express';
import type { Session, SessionData } from 'express-session';
import { prisma } from '../db.js';
import { forbidden, unauthorized } from './errors.js';
import { roleHasPermission, type Permission } from '../authz/permissions.js';
import { config } from '../config.js';
import { sessionStore } from './session.js';
import { recordAudit, AUDIT } from '../lib/audit.js';

export interface AuthUser extends AdminUser {}

declare module 'express-session' {
  interface SessionData {
    pendingAuth?: { userId: string; expiresAt: Date };
    auth?: { userId: string; mfaVerified: boolean };
    user?: { id: string };
    _createdAt?: Date;
  }
}

declare global {
  namespace Express {
    interface Request {
      authUser: AuthUser;
    }
  }
}

export const SESSION_ABS_MS = config.sessionAbsoluteHours * 60 * 60 * 1000;

export function rotateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

/** Kill every live session across the given user (privilege changes, resets). */
export async function revokeAllSessions(userId: string, reason: string, req?: Request): Promise<void> {
  await sessionStore.clearUserSessions(userId);
  if (req) {
    await recordAudit(req, {
      action: reason === 'reset' ? AUDIT.SESSIONS_REVOKED_ALL : AUDIT.USER_UPDATED,
      resourceType: 'AdminUser',
      resourceId: userId,
      metadata: { revokeReason: reason },
    });
  }
}

function isValidSession(sessionData: SessionData | null): boolean {
  if (!sessionData || sessionData.cookie && sessionData.cookie.expires && sessionData.cookie.expires.getTime() < Date.now()) {
    return false;
  }
  // Absolute lifetime check. _createdAt is JSON round-tripped as a string by
  // the Prisma store, so normalize rather than requiring a Date instance.
  if (sessionData._createdAt) {
    const created = new Date(sessionData._createdAt).getTime();
    if (!Number.isNaN(created) && Date.now() - created > SESSION_ABS_MS) {
      return false;
    }
  }
  return true;
}

// Roles that are forced to use MFA, sourced from site security settings.
// Cached briefly to avoid a settings query per request.
let mfaRolesCache: { value: string[]; fetchedAt: number } | null = null;

export async function enforcedMfaRoles(): Promise<string[]> {
  const now = Date.now();
  if (mfaRolesCache && now - mfaRolesCache.fetchedAt < 60_000) {
    return mfaRolesCache.value;
  }
  const row = await prisma.siteSetting.findUnique({ where: { key: 'security' } });
  const raw = row?.value;
  const roles: string[] =
    raw && typeof raw === 'object' && 'requireMfaRoles' in raw
      ? (raw.requireMfaRoles as string[])
      : [];
  mfaRolesCache = { value: roles, fetchedAt: now };
  return roles;
}

/**
 * Returns an MFA status code / message when the account must complete a step.
 * - 'MFA_REQUIRED'     account has MFA enabled but this session has not verified
 * - 'MFA_SETUP_REQUIRED' account's role requires MFA but none is configured
 * Returns null when the account is safe to proceed.
 */
export async function mfaStatusFor(user: AuthUser, req: Request): Promise<null | { code: 'MFA_REQUIRED' | 'MFA_SETUP_REQUIRED' }> {
  if (user.mfaEnabled && !req.session.auth?.mfaVerified) {
    return { code: 'MFA_REQUIRED' };
  }
  if (!user.mfaEnabled) {
    const enforced = await enforcedMfaRoles();
    if (enforced.includes(user.role)) {
      return { code: 'MFA_SETUP_REQUIRED' };
    }
  }
  return null;
}

/**
 * Middleware placed after `sessionMiddleware`. Loads a fresh AdminUser from the
 * database on EVERY authenticated request so that disabled accounts lose access
 * immediately and privilege changes take effect immediately.
 */
export function loadSessionAuth(req: Request, res: Response, next: (err?: unknown) => void): void {
  res.locals.sessionAuthChecked = true;
  const auth = req.session?.auth;
  if (!auth) {
    res.locals.authReason = 'no-session';
    next();
    return;
  }
  if (!auth.userId || !isValidSession(req.session)) {
    req.session?.destroy?.((err) => void err);
    next();
    return;
  }
  void prisma.adminUser
    .findUnique({ where: { id: auth.userId } })
    .then((user) => {
      if (!user || user.status !== 'ACTIVE') {
        req.session.auth = undefined;
        next();
        return;
      }
      res.locals.authUser = user;
      next();
    })
    .catch((err) => next(err));
}

export function attachAuthUser(): RequestHandler {
  return (req, res, next) => {
    const user: AuthUser | undefined = res.locals.authUser;
    if (user) req.authUser = user;
    next();
  };
}

export function requireAuth(req: Request, res: Response, next: (err?: unknown) => void): void {
  const user: AuthUser | undefined = res.locals.authUser;
  if (!user) {
    next(unauthorized('Please sign in to access the admin dashboard.', 'UNAUTHENTICATED'));
    return;
  }
  void mfaStatusFor(user, req)
    .then((mfa) => {
      if (mfa) {
        next(forbidden(messageForMfa(mfa.code), mfa.code));
        return;
      }
      req.authUser = user;
      next();
    })
    .catch(next);
}

/**
 * Sign-in check WITHOUT the MFA gate. Used by the MFA enrollment endpoints:
 * a role-enforced account that has not configured MFA yet must still be able to
 * reach setup, otherwise enforcement would deadlock the onboarding flow.
 */
export function requireAuthenticated(req: Request, res: Response, next: (err?: unknown) => void): void {
  const user: AuthUser | undefined = res.locals.authUser;
  if (!user) {
    next(unauthorized('Please sign in to access the admin dashboard.', 'UNAUTHENTICATED'));
    return;
  }
  req.authUser = user;
  next();
}

function messageForMfa(code: 'MFA_REQUIRED' | 'MFA_SETUP_REQUIRED'): string {
  return code === 'MFA_REQUIRED'
    ? 'Multi-factor verification is required to continue. Please enter a code from your authenticator app.'
    : 'This account is required to use multi-factor authentication. Please complete the MFA setup.';
}

export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    const user: AuthUser | undefined = req.authUser;
    if (!user) {
      next(unauthorized('Please sign in to access the admin dashboard.', 'UNAUTHENTICATED'));
      return;
    }
    if (!roleHasPermission(user.role, permission)) {
      next(forbidden());
      return;
    }
    next();
  };
}

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, res, next) => {
    if (!req.authUser) {
      next(unauthorized());
      return;
    }
    if (!roles.includes(req.authUser.role)) {
      next(forbidden());
      return;
    }
    next();
  };
}

/**
 * Middleware that marks admin responses as non-cacheable and noindex.
 */
export function noStorePrivate(req: Request, res: Response, next: () => void): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  next();
}