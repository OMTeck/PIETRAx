import type { Role } from '@prisma/client';

export const PERM = {
  dashboardView: 'dashboard.view',
  materialsView: 'materials.view',
  materialsCreate: 'materials.create',
  materialsUpdate: 'materials.update',
  materialsDelete: 'materials.delete',
  materialsPublish: 'materials.publish',
  collectionsView: 'collections.view',
  collectionsCreate: 'collections.create',
  collectionsUpdate: 'collections.update',
  collectionsDelete: 'collections.delete',
  collectionsPublish: 'collections.publish',
  projectsView: 'projects.view',
  projectsCreate: 'projects.create',
  projectsUpdate: 'projects.update',
  projectsDelete: 'projects.delete',
  projectsPublish: 'projects.publish',
  taxonomyManage: 'taxonomy.manage',
  visualizerManage: 'visualizer.manage',
  contentManage: 'content.manage',
  mediaUpload: 'media.upload',
  mediaDelete: 'media.delete',
  customersView: 'customers.view',
  customersUpdate: 'customers.update',
  quotesManage: 'quotes.manage',
  usersManage: 'users.manage',
  settingsGeneral: 'settings.general',
  settingsSecurity: 'settings.security',
  auditView: 'audit.view',
  systemDelete: 'system.delete',
} as const;

export type Permission = (typeof PERM)[keyof typeof PERM];

const ALL_PERMS = new Set<Permission>(Object.values(PERM));

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: ALL_PERMS,
  ADMIN: new Set<Permission>([
    PERM.dashboardView,
    PERM.materialsView,
    PERM.materialsCreate,
    PERM.materialsUpdate,
    PERM.materialsDelete,
    PERM.materialsPublish,
    PERM.collectionsView,
    PERM.collectionsCreate,
    PERM.collectionsUpdate,
    PERM.collectionsDelete,
    PERM.collectionsPublish,
    PERM.projectsView,
    PERM.projectsCreate,
    PERM.projectsUpdate,
    PERM.projectsDelete,
    PERM.projectsPublish,
    PERM.taxonomyManage,
    PERM.visualizerManage,
    PERM.contentManage,
    PERM.mediaUpload,
    PERM.mediaDelete,
    PERM.customersView,
    PERM.customersUpdate,
    PERM.quotesManage,
    PERM.usersManage,
    PERM.settingsGeneral,
    PERM.auditView,
  ]),
  CONTENT_EDITOR: new Set<Permission>([
    PERM.dashboardView,
    PERM.materialsView,
    PERM.materialsCreate,
    PERM.materialsUpdate,
    PERM.materialsPublish,
    PERM.collectionsView,
    PERM.collectionsCreate,
    PERM.collectionsUpdate,
    PERM.collectionsPublish,
    PERM.projectsView,
    PERM.projectsCreate,
    PERM.projectsUpdate,
    PERM.projectsPublish,
    PERM.taxonomyManage,
    PERM.visualizerManage,
    PERM.contentManage,
    PERM.mediaUpload,
  ]),
  SALES: new Set<Permission>([
    PERM.dashboardView,
    PERM.materialsView,
    PERM.collectionsView,
    PERM.projectsView,
    PERM.customersView,
    PERM.customersUpdate,
    PERM.quotesManage,
  ]),
  VIEWER: new Set<Permission>([
    PERM.dashboardView,
    PERM.materialsView,
    PERM.collectionsView,
    PERM.projectsView,
    PERM.customersView,
  ]),
};

// Default-deny: a permission is granted ONLY if explicitly listed above.
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export const ROLES: Role[] = ['OWNER', 'ADMIN', 'CONTENT_EDITOR', 'SALES', 'VIEWER'];

export const ROLE_LABELS: Record<Role, { ar: string; en: string }> = {
  OWNER: { ar: 'المالك', en: 'Owner' },
  ADMIN: { ar: 'مدير', en: 'Administrator' },
  CONTENT_EDITOR: { ar: 'محرر محتوى', en: 'Content Editor' },
  SALES: { ar: 'مبيعات', en: 'Sales' },
  VIEWER: { ar: 'مشاهد', en: 'Viewer' },
};