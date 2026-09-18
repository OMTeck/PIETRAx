import { doubleCsrf } from 'csrf-csrf';
import type { RequestHandler } from 'express';
import type { Request, Response } from 'express';
import { config } from '../config.js';
import { forbidden } from './errors.js';

const { doubleCsrfProtection, generateToken, invalidCsrfTokenError } = doubleCsrf({
  getSecret: () => config.csrfSecret,
  cookieName: 'pietrax.csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    path: '/',
  },
  size: 32,
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
});

/**
 * Issues a fresh CSRF token (stored in an HttpOnly cookie) and returns it to
 * the client so it can send it back in the X-CSRF-Token header on mutations.
 */
export function csrfToken(req: Request, res: Response): void {
  const token = generateToken(req, res);
  res.json({ token });
}

export const csrfProtection: RequestHandler = (req, res, next) => {
  try {
    doubleCsrfProtection(req, res, next);
  } catch (err) {
    if (err === invalidCsrfTokenError) {
      next(forbidden('Missing or invalid CSRF token.', 'CSRF_FAILED'));
      return;
    }
    next(err);
  }
};