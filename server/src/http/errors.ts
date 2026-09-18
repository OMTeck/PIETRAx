import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { config } from '../config.js';
import { logger } from '../logger.js';

export class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function badRequest(message = 'Invalid request', code = 'BAD_REQUEST') {
  return new AppError(400, message, code);
}

export function unauthorized(message = 'Authentication required', code = 'UNAUTHENTICATED') {
  return new AppError(401, message, code);
}

export function forbidden(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
  return new AppError(403, message, code);
}

export function notFound(message = 'Resource not found', code = 'NOT_FOUND') {
  return new AppError(404, message, code);
}

export function tooMany(message = 'Too many attempts, please try again later', code = 'RATE_LIMITED') {
  return new AppError(429, message, code);
}

export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', issues } });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  // Multer errors (file upload constraints) are safe to expose generically.
  const multerCode = (err as { code?: string })?.code;
  if (multerCode === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'The uploaded file exceeds the size limit.' } });
    return;
  }

  // body-parser / JSON syntax errors expose statusCode 400.
  const httpStatus = (err as { status?: unknown }).status;
  if (typeof httpStatus === 'number' && httpStatus >= 400 && httpStatus < 500) {
    const message = (err as { message?: string }).message ?? 'Bad request';
    res.status(httpStatus).json({ error: { code: 'BAD_REQUEST', message } });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  const internal = {
    error: {
      code: 'INTERNAL_ERROR',
      message: config.isProduction ? 'Something went wrong. Please try again.' : 'Internal server error',
    },
  };
  if (!config.isProduction) {
    internal.error.message = 'Internal server error';
  }
  res.status(500).json(internal);
}