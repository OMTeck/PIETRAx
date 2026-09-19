// Client-side mirror of server/src/authz/permissions.ts. The SERVER is always
// the authority; this is purely to hide nav entries the user can't use.
import type { Role } from '@/admin/types';

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

const ALL = Object.values(PERM) as Permission[];

const MAP: Record<Role, readonly Permission[]> = {
  OWNER: ALL,
  ADMIN: [
    PERM.dashboardView, PERM.materialsView, PERM.materialsCreate, PERM.materialsUpdate, PERM.materialsDelete, PERM.materialsPublish,
    PERM.collectionsView, PERM.collectionsCreate, PERM.collectionsUpdate, PERM.collectionsDelete, PERM.collectionsPublish,
    PERM.projectsView, PERM.projectsCreate, PERM.projectsUpdate, PERM.projectsDelete, PERM.projectsPublish,
    PERM.taxonomyManage, PERM.visualizerManage, PERM.contentManage, PERM.mediaUpload, PERM.mediaDelete,
    PERM.customersView, PERM.customersUpdate, PERM.quotesManage, PERM.usersManage, PERM.settingsGeneral, PERM.auditView,
  ],
  CONTENT_EDITOR: [
    PERM.dashboardView, PERM.materialsView, PERM.materialsCreate, PERM.materialsUpdate, PERM.materialsPublish,
    PERM.collectionsView, PERM.collectionsCreate, PERM.collectionsUpdate, PERM.collectionsPublish,
    PERM.projectsView, PERM.projectsCreate, PERM.projectsUpdate, PERM.projectsPublish,
    PERM.taxonomyManage, PERM.visualizerManage, PERM.contentManage, PERM.mediaUpload,
  ],
  SALES: [PERM.dashboardView, PERM.materialsView, PERM.collectionsView, PERM.projectsView, PERM.customersView, PERM.customersUpdate, PERM.quotesManage],
  VIEWER: [PERM.dashboardView, PERM.materialsView, PERM.collectionsView, PERM.projectsView, PERM.customersView],
};

export function can(role: Role, perm: Permission): boolean {
  return MAP[role].includes(perm);
}

export const ROLES: Role[] = ['OWNER', 'ADMIN', 'CONTENT_EDITOR', 'SALES', 'VIEWER'];

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Administrator',
  CONTENT_EDITOR: 'Content Editor',
  SALES: 'Sales',
  VIEWER: 'Viewer',
};

export const ROLE_RANK: Record<Role, number> = {
  OWNER: 0,
  ADMIN: 1,
  CONTENT_EDITOR: 2,
  SALES: 3,
  VIEWER: 4,
};