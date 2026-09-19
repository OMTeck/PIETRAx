// Typed client for the PIETRAx admin API. Every function maps 1:1 to a server
// route (server/src/routes/*). Responses are documented in src/admin/types.ts.
import { get, post, put, patch, del, upload, qs, type Pagination } from '@/lib/api';
import type {
  SessionUser,
  MaterialPayload,
  AdminMaterial,
  AdminCollection,
  CollectionPayload,
  AdminProject,
  ProjectPayload,
  RoomRow,
  RoomPayload,
  QuoteRequestRow,
  ContactMessageRow,
  ShowroomBookingRow,
  MediaAssetRow,
  MediaKind,
  AuditEntryRow,
  OverviewData,
  TaxonomyNode,
  SessionRow,
  AdminSettings,
  AdminUser,
  VisualizerMaterialRow,
} from '@/admin/types';

type Params = {
  [key: string]: string | number | boolean | undefined | null;
  page?: number;
  pageSize?: number;
  search?: string;
  trash?: boolean;
  status?: string;
};
export type PageList<T> = { items: T[]; pagination: Pagination };

// ---- Auth -----------------------------------------------------------------

export interface AuthUser extends SessionUser {}

export const authApi = {
  me: () => get<{ user: AuthUser }>('/api/auth/me').then((r) => r.user),
  login: (email: string, password: string, remember: boolean) =>
    post<{ user?: AuthUser; mfaRequired?: boolean }>('/api/auth/login', { email, password, remember }),
  mfaVerify: (token: string, remember: boolean) =>
    post<{ user: AuthUser }>('/api/auth/mfa/verify', { token, remember }).then((r) => r.user),
  logout: () => post<undefined>('/api/auth/logout'),
};

// ---- Account / security ----------------------------------------------------

export const accountApi = {
  changePassword: (currentPassword: string, newPassword: string) =>
    post<{ ok: boolean }>('/api/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email: string) => post<{ ok: boolean }>('/api/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) => post<{ ok: boolean }>('/api/auth/reset-password', { token, newPassword }),
  mfaStart: (currentPassword: string) => post<{ qrCode: string }>('/api/auth/mfa/setup/start', { currentPassword }),
  mfaConfirm: (token: string) => post<{ recoveryCodes: string[] }>('/api/auth/mfa/setup/confirm', { token }),
  mfaRecoveryCodes: (currentPassword: string) => post<{ recoveryCodes: string[] }>('/api/auth/mfa/recovery-codes', { currentPassword }),
  mfaDisable: (currentPassword: string, token?: string) => post<{ ok: boolean }>('/api/auth/mfa/disable', { currentPassword, token }),
  sessions: () => get<{ sessions: SessionRow[] }>('/api/auth/sessions').then((r) => r.sessions),
  revokeAllSessions: () => post<{ ok: boolean }>('/api/auth/sessions/revoke-all'),
  revokeSession: (sid: string) => post<{ ok: boolean }>(`/api/auth/sessions/${encodeURIComponent(sid)}/revoke`),
};

// ---- Dashboard -------------------------------------------------------------

export const overviewApi = {
  get: () => get<OverviewData>('/api/admin/overview'),
};

const TAXONOMY_PATH: Record<string, string> = {
  materialType: 'material-types',
  category: 'categories',
  color: 'colors',
  finish: 'finishes',
  size: 'sizes',
  application: 'applications',
  projectType: 'project-types',
};

// ---- Taxonomy --------------------------------------------------------------

export const taxonomyApi = {
  getAll: () =>
    get<{ taxonomy: Record<string, (TaxonomyNode & { usageCount?: number; hex?: string })[]> }>('/api/admin/taxonomy').then(
      (r) => r.taxonomy,
    ),
  list: (group: string, params?: Params) =>
    get<PageList<TaxonomyNode & { usageCount?: number }>>(`/api/admin/taxonomy/${TAXONOMY_PATH[group] ?? group}${qs(params ?? {})}`).then((r) => ({
      items: r.items,
      pagination: r.pagination ?? { page: 1, pageSize: r.items.length, total: r.items.length, pages: 1 },
    })),
  create: (group: string, body: Record<string, unknown>) =>
    post<{ item: TaxonomyNode }>(`/api/admin/taxonomy/${TAXONOMY_PATH[group] ?? group}`, body),
  update: (group: string, id: string, body: Record<string, unknown>) =>
    patch<{ item: TaxonomyNode }>(`/api/admin/taxonomy/${TAXONOMY_PATH[group] ?? group}/${id}`, body),
};

// ---- Materials -------------------------------------------------------------

export const materialsApi = {
  list: (params?: Params) => get<PageList<AdminMaterial>>(`/api/admin/materials${qs(params ?? {})}`),
  get: (id: string) => get<{ item: AdminMaterial }>(`/api/admin/materials/${id}`).then((r) => r.item),
  create: (body: MaterialPayload) => post<{ item: AdminMaterial }>('/api/admin/materials', body).then((r) => r.item),
  update: (id: string, body: MaterialPayload) => patch<{ item: AdminMaterial }>(`/api/admin/materials/${id}`, body).then((r) => r.item),
  updateStatus: (id: string, status: string) =>
    patch<{ ok: boolean; status: string }>(`/api/admin/materials/${id}/status`, { status }),
  duplicate: (id: string) => post<{ item: AdminMaterial }>(`/api/admin/materials/${id}/duplicate`).then((r) => r.item),
  trash: (id: string) => del<{ ok: boolean }>(`/api/admin/materials/${id}`),
  restore: (id: string, opts?: { restoreImages?: boolean }) =>
    post<{ item: AdminMaterial }>(`/api/admin/materials/${id}/restore`, opts).then((r) => r.item),
  deletePermanent: (id: string, force?: boolean) =>
    del<{ ok: boolean }>(`/api/admin/materials/${id}/permanent${force ? '?force=1' : ''}`),
};

// ---- Collections -----------------------------------------------------------

export const collectionsApi = {
  list: (params?: Params) => get<PageList<AdminCollection>>(`/api/admin/collections${qs(params ?? {})}`),
  get: (id: string) => get<{ item: AdminCollection }>(`/api/admin/collections/${id}`).then((r) => r.item),
  create: (body: CollectionPayload) => post<{ item: AdminCollection }>('/api/admin/collections', body).then((r) => r.item),
  update: (id: string, body: CollectionPayload) =>
    patch<{ item: AdminCollection }>(`/api/admin/collections/${id}`, body).then((r) => r.item),
  trash: (id: string) => del<{ ok: boolean }>(`/api/admin/collections/${id}`),
};

// ---- Projects --------------------------------------------------------------

export const projectsApi = {
  list: (params?: Params) => get<PageList<AdminProject>>(`/api/admin/projects${qs(params ?? {})}`),
  get: (id: string) => get<{ item: AdminProject }>(`/api/admin/projects/${id}`).then((r) => r.item),
  create: (body: ProjectPayload) => post<{ item: AdminProject }>('/api/admin/projects', body).then((r) => r.item),
  update: (id: string, body: ProjectPayload) =>
    patch<{ item: AdminProject }>(`/api/admin/projects/${id}`, body).then((r) => r.item),
  trash: (id: string) => del<{ ok: boolean }>(`/api/admin/projects/${id}`),
  status: (id: string, status: string) =>
    patch<{ ok: boolean; status: string }>(`/api/admin/projects/${id}/status`, { status }),
};

// ---- Visualizer ------------------------------------------------------------

export const visualizerApi = {
  rooms: () => get<{ items: RoomRow[] }>('/api/admin/visualizer/rooms').then((r) => r.items),
  getRoom: (id: string) => get<{ item: RoomRow }>(`/api/admin/visualizer/rooms/${id}`).then((r) => r.item),
  createRoom: (body: RoomPayload) => post<{ item: RoomRow }>('/api/admin/visualizer/rooms', body).then((r) => r.item),
  updateRoom: (id: string, body: RoomPayload) =>
    patch<{ item: RoomRow }>(`/api/admin/visualizer/rooms/${id}`, body).then((r) => r.item),
  deleteRoom: (id: string) => del<{ ok: boolean }>(`/api/admin/visualizer/rooms/${id}`),
  materials: () => get<{ items: VisualizerMaterialRow[] }>('/api/admin/visualizer/materials').then((r) => r.items),
  saveConfig: (materialId: string, body: Record<string, unknown>) =>
    patch<{ config: Record<string, unknown> }>(`/api/admin/visualizer/materials/${materialId}`, body).then((r) => r.config),
  removeConfig: (materialId: string) => del<{ ok: boolean }>(`/api/admin/visualizer/materials/${materialId}`),
};

// ---- Customers -------------------------------------------------------------

export const customersApi = {
  quotes: (params?: Params & { status?: string }) => get<PageList<QuoteRequestRow>>(`/api/admin/customers/quotes${qs(params ?? {})}`),
  getQuote: (id: string) => get<{ item: QuoteRequestRow }>(`/api/admin/customers/quotes/${id}`).then((r) => r.item),
  updateQuote: (id: string, body: { status?: string; internalNotes?: string }) =>
    patch<{ item: QuoteRequestRow }>(`/api/admin/customers/quotes/${id}`, body).then((r) => r.item),
  messages: (params?: Params & { status?: string }) => get<PageList<ContactMessageRow>>(`/api/admin/customers/messages${qs(params ?? {})}`),
  updateMessage: (id: string, body: { status?: string }) =>
    patch<{ item: ContactMessageRow }>(`/api/admin/customers/messages/${id}`, body).then((r) => r.item),
  bookings: (params?: Params & { status?: string }) => get<PageList<ShowroomBookingRow>>(`/api/admin/customers/bookings${qs(params ?? {})}`),
  updateBooking: (id: string, body: { status?: string; internalNotes?: string }) =>
    patch<{ item: ShowroomBookingRow }>(`/api/admin/customers/bookings/${id}`, body).then((r) => r.item),
};

// ---- Media ----------------------------------------------------------------

export const mediaApi = {
  list: (params?: Params & { kind?: MediaKind }) => get<PageList<MediaAssetRow>>(`/api/admin/media${qs(params ?? {})}`),
  get: (id: string) => get<{ item: MediaAssetRow }>(`/api/admin/media/${id}`).then((r) => r.item),
  upload: (kind: MediaKind, files: File[]) => {
    const form = new FormData();
    form.append('kind', kind);
    for (const f of files) form.append('files', f);
    return upload<{ assets: MediaAssetRow[] }>('/api/admin/media', form).then((r) => r.assets);
  },
  updateMeta: (id: string, body: { altAr?: string; altEn?: string }) =>
    patch<{ item: MediaAssetRow }>(`/api/admin/media/${id}`, body).then((r) => r.item),
  remove: (id: string, force = false) =>
    del<{ ok: boolean }>(`/api/admin/media/${id}${force ? '?force=1' : ''}`),
};

// ---- Users ----------------------------------------------------------------

export const usersApi = {
  list: (params?: Params) => get<PageList<AdminUser>>(`/api/admin/users${qs(params ?? {})}`),
  invite: (body: { name: string; email: string; role: string }) =>
    post<{ item: AdminUser; activationToken: string }>('/api/admin/users/invite', body),
  update: (id: string, body: { name?: string; role?: string; status?: string }) =>
    patch<{ item: AdminUser }>(`/api/admin/users/${id}`, body).then((r) => r.item),
  resetPassword: (id: string) => post<{ activationToken: string }>(`/api/admin/users/${id}/require-password-reset`).then((r) => r.activationToken),
  revokeSessions: (id: string) => post<{ ok: boolean }>(`/api/admin/users/${id}/revoke-sessions`),
  requireMfa: (id: string) => post<{ ok: boolean }>(`/api/admin/users/${id}/require-mfa`),
  remove: (id: string) => del<{ ok: boolean }>(`/api/admin/users/${id}`),
};

// ---- Audit ----------------------------------------------------------------

export const auditApi = {
  list: (params?: Params & { action?: string }) => get<PageList<AuditEntryRow>>(`/api/admin/audit-log${qs(params ?? {})}`),
  group: () => get<{ items: { action: string; count: number }[] }>('/api/admin/audit-log/actions').then((r) => r.items),
  actions: () => get<{ actions: string[] }>('/api/admin/audit-log/actions').then((r) => r.actions),
};

// ---- Settings / content ----------------------------------------------------

export const settingsApi = {
  get: () => get<{ settings: AdminSettings }>('/api/admin/content/settings').then((r) => r.settings),
  saveSection: (section: string, data: Record<string, unknown>) =>
    put<{ ok: boolean }>(`/api/admin/content/settings/${encodeURIComponent(section)}`, data),
  saveSecurity: (data: Record<string, unknown>) => put<{ ok: boolean }>('/api/admin/content/settings/security', data),
};

export type { Params as AdminParams, PageList as PagedResponse };