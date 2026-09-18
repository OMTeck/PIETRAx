import session, { Store, type SessionData } from 'express-session';
import { prisma } from '../db.js';
import type { Prisma } from '@prisma/client';
import { config } from '../config.js';

function computeExpiry(sessionData: SessionData, lastActive: Date): Date {
  const cookieExpires = sessionData.cookie?.expires;
  if (cookieExpires instanceof Date && !Number.isNaN(cookieExpires.getTime())) {
    return cookieExpires;
  }
  return new Date(lastActive.getTime() + config.sessionIdleMinutes * 60 * 1000);
}

function extractUserId(data: Record<string, unknown>): string | null {
  const user = data.user;
  if (user && typeof user === 'object' && 'id' in user && typeof (user as { id?: unknown }).id === 'string') {
    return (user as { id: string }).id;
  }
  return null;
}

function toJsonObject(data: SessionData): Prisma.InputJsonValue {
  return data as unknown as Prisma.InputJsonValue;
}

export class PrismaSessionStore extends Store {
  async get(sid: string, callback: (err: unknown, session?: SessionData | null) => void): Promise<void> {
    try {
      const row = await prisma.session.findUnique({ where: { sid } });
      if (!row) {
        callback(null, null);
        return;
      }
      if (row.revokedAt !== null || row.expiresAt.getTime() < Date.now()) {
        await prisma.session.deleteMany({ where: { sid } }).catch(() => undefined);
        callback(null, null);
        return;
      }
      callback(null, row.data as unknown as SessionData);
    } catch (err) {
      callback(err);
    }
  }

  async set(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): Promise<void> {
    try {
      const now = new Date();
      const data = toJsonObject(sessionData);
      const userId = extractUserId(sessionData as unknown as Record<string, unknown>);
      await prisma.session.upsert({
        where: { sid },
        create: {
          sid,
          data,
          userId,
          createdAt: now,
          lastActiveAt: now,
          expiresAt: computeExpiry(sessionData, now),
        },
        update: { data, userId, expiresAt: computeExpiry(sessionData, now), lastActiveAt: now },
      });
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async destroy(sid: string, callback?: (err?: unknown) => void): Promise<void> {
    try {
      await prisma.session.deleteMany({ where: { sid } });
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }

  async touch(sid: string, sessionData: SessionData, callback?: (err?: unknown) => void): Promise<void> {
    try {
      const now = new Date();
      await prisma.session.update({
        where: { sid },
        data: {
          lastActiveAt: now,
          expiresAt: computeExpiry(sessionData, now),
          userId: extractUserId(sessionData as unknown as Record<string, unknown>),
        },
      });
      callback?.();
    } catch {
      callback?.(); // Missing session on touch is not fatal.
    }
  }

  async clearUserSessions(userId: string): Promise<void> {
    await prisma.session.deleteMany({ where: { userId, revokedAt: null } });
  }

  async listUserSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: 'desc' },
      select: { sid: true, ipAddress: true, userAgent: true, createdAt: true, lastActiveAt: true, expiresAt: true },
    });
  }

  async revokeSession(sid: string, userId: string): Promise<void> {
    await prisma.session.updateMany({
      where: { sid, userId },
      data: { revokedAt: new Date() },
    });
  }
}

export const sessionStore = new PrismaSessionStore();

export const sessionMiddleware = session({
  name: 'pietrax.sid',
  store: sessionStore,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  proxy: config.isProduction,
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    path: '/',
    domain: config.cookieDomain || undefined,
    maxAge: config.sessionIdleMinutes * 60 * 1000,
  },
});