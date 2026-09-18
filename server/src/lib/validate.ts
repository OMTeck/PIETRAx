import { z, type ZodType } from 'zod';
import type { RequestHandler } from 'express';

export function validateBody<T extends ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery<T extends ZodType>(schema: T): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.query = result.data as never;
    next();
  };
}

// Shared scalars ------------------------------------------------------------

export const idSchema = z.string().min(1).max(64);
export const slugSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must use lowercase letters, numbers and hyphens.');
export const localeText = z.string().min(1).max(4000);
export const urlSchema = z.string().url().max(2048);
export const langSchema = z.enum(['ar', 'en']);

/**
 * Accepts lowercase 'ar' / 'en' from the client and normalizes to the DB Lang
 * enum ('AR' / 'EN'). The front end may send either case; the API always
 * returns the canonical uppercase value.
 */
export const langEnumSchema = z
  .enum(['ar', 'en'])
  .transform((v) => v.toUpperCase() as 'AR' | 'EN');
export const boolish = z.boolean().default(false);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
});

export const seoFields = z.object({
  seoTitle: z.string().max(200).nullable().optional(),
  seoDescription: z.string().max(400).nullable().optional(),
  noIndex: z.boolean().optional(),
});

export type PaginationResult = { page: number; pageSize: number; skip: number; take: number };

export function parsePagination(page: number, pageSize: number): PaginationResult {
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}