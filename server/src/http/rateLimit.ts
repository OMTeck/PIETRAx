import rateLimit, { type RateLimitRequestHandler } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';
import { config } from '../config.js';

export function createLimiter(opts: {
  windowMs?: number;
  max?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
}): RateLimitRequestHandler {
  // Rate limiting targets shared-IP abuse in production. Skip it while developing
  // locally (loopback + dev browser), where it only gets in the way.
  return rateLimit({ ...opts, skip: () => !config.isProduction });
}

// General API traffic (all /api). High-level abuse protection.
export const apiLimiter: RequestHandler = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 600,
  message: 'Too many requests.',
});

// Admin API is intentionally stricter.
export const adminApiLimiter: RequestHandler = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 240,
  message: 'Too many requests. Please slow down.',
});

// Login + MFA attempts. Combined with account-specific throttling in the route.
export const authLimiter: RequestHandler = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many authentication attempts. Please try again later.',
  keyGenerator: (req) => req.ip ?? 'unknown',
});

// Public submission endpoints (quote / message / booking).
export const publicSubmitLimiter: RequestHandler = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Too many submissions from this device. Please try again later.',
});

// Uploads are a common attack surface.
export const uploadLimiter: RequestHandler = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: 'Too many uploads. Please try again later.',
});

export const mfaStepLimiter: RequestHandler = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 25,
  message: 'Too many attempts. Please try again later.',
});

export const resetTokenLimiter: RequestHandler = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many attempts. Please try again later.',
});