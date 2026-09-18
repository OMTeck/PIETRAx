import type { Prisma, AuditLog } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../db.js';

interface AuditInput {
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Prisma.InputJsonValue;
  adminUserId?: string | null;
  success?: boolean;
}

/**
 * Append-only audit logging. No update or delete operations are ever exposed
 * for AuditLog records. Sensitive values (passwords, tokens, secrets) must
 * never be passed inside metadata — callers are reviewed for this.
 */
export async function recordAudit(req: Request | null, input: AuditInput): Promise<AuditLog> {
  const userId = input.adminUserId ?? req?.authUser?.id ?? req?.session?.auth?.userId ?? null;
  return prisma.auditLog.create({
    data: {
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      metadata: input.metadata ?? undefined,
      adminUserId: userId,
      ipAddress: req?.ip ?? null,
      success: input.success ?? true,
    },
  });
}

export const AUDIT = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  LOGIN_MFA_REQUIRED: 'LOGIN_MFA_REQUIRED',
  LOGIN_MFA_FAILED: 'LOGIN_MFA_FAILED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET_REQUESTED: 'PASSWORD_RESET_REQUESTED',
  PASSWORD_RESET_COMPLETED: 'PASSWORD_RESET_COMPLETED',
  MFA_ENABLED: 'MFA_ENABLED',
  MFA_DISABLED: 'MFA_DISABLED',
  RECOVERY_CODES_REGENERATED: 'RECOVERY_CODES_REGENERATED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSIONS_REVOKED_ALL: 'SESSIONS_REVOKED_ALL',
  MATERIAL_CREATED: 'MATERIAL_CREATED',
  MATERIAL_UPDATED: 'MATERIAL_UPDATED',
  MATERIAL_DELETED: 'MATERIAL_DELETED',
  MATERIAL_RESTORED: 'MATERIAL_RESTORED',
  COLLECTION_CREATED: 'COLLECTION_CREATED',
  COLLECTION_UPDATED: 'COLLECTION_UPDATED',
  COLLECTION_DELETED: 'COLLECTION_DELETED',
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',
  TAXONOMY_CREATED: 'TAXONOMY_CREATED',
  TAXONOMY_UPDATED: 'TAXONOMY_UPDATED',
  TAXONOMY_DELETED: 'TAXONOMY_DELETED',
  VISUALIZER_UPDATED: 'VISUALIZER_UPDATED',
  HOMEPAGE_UPDATED: 'HOMEPAGE_UPDATED',
  MEDIA_UPLOADED: 'MEDIA_UPLOADED',
  MEDIA_DELETED: 'MEDIA_DELETED',
  QUOTE_STATUS_CHANGED: 'QUOTE_STATUS_CHANGED',
  MESSAGE_STATUS_CHANGED: 'MESSAGE_STATUS_CHANGED',
  BOOKING_STATUS_CHANGED: 'BOOKING_STATUS_CHANGED',
  USER_INVITED: 'USER_INVITED',
  USER_UPDATED: 'USER_UPDATED',
  USER_PASSWORD_RESET_BY_ADMIN: 'USER_PASSWORD_RESET_BY_ADMIN',
  USER_ROLE_CHANGED: 'USER_ROLE_CHANGED',
  USER_DISABLED: 'USER_DISABLED',
  USER_ENABLED: 'USER_ENABLED',
  USER_MFA_REQUIRED: 'USER_MFA_REQUIRED',
  SETTINGS_UPDATED: 'SETTINGS_UPDATED',
  SECURITY_SETTING_CHANGED: 'SECURITY_SETTING_CHANGED',
} as const;