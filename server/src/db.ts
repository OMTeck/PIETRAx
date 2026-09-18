import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.APP_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === 'P2002'
  );
}