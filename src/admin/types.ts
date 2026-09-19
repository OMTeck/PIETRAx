import type { Pagination } from '@/lib/api';

export type Role = 'OWNER' | 'ADMIN' | 'CONTENT_EDITOR' | 'SALES' | 'VIEWER';
export type UserStatus = 'ACTIVE' | 'DISABLED' | 'PENDING';
export type MaterialStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ProjectStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ImageKind = 'MAIN' | 'TEXTURE' | 'SLAB' | 'GALLERY' | 'ROOM';
export type RoomType = 'KITCHEN' | 'BATHROOM' | 'LIVING_ROOM' | 'BEDROOM' | 'OFFICE' | 'HOTEL_LOBBY' | 'OUTDOOR';
export type SurfaceType = 'FLOOR' | 'WALL' | 'FEATURE_WALL' | 'COUNTERTOP' | 'ISLAND' | 'BACKSPLASH';
export type MediaKind = 'IMAGE' | 'TEXTURE' | 'SLAB' | 'PROJECT' | 'ROOM' | 'OTHER';
export type QuoteStatus = 'NEW' | 'CONTACTED' | 'IN_PROGRESS' | 'QUOTED' | 'WON' | 'LOST' | 'ARCHIVED';
export type MessageStatus = 'NEW' | 'READ' | 'REPLIED' | 'ARCHIVED';
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
export type Lang = 'AR' | 'EN';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { sessions?: number };
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  avatarUrl: string | null;
}

export interface TaxonomyNode {
  id: string;
  code: string;
  slug?: string;
  labelAr: string;
  labelEn: string;
  descriptionAr?: string | null;
  descriptionEn?: string | null;
  coverImage?: string | null;
  swatchImage?: string | null;
  sortOrder: number;
  system: boolean;
  usageCount?: number;
}

// ---- Materials -----------------------------------------------------------

export interface MaterialTranslation {
  id: string;
  materialId?: string;
  lang: Lang;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
}

export interface MaterialImage {
  id: string;
  kind: ImageKind;
  url: string;
  altAr: string | null;
  altEn: string | null;
  sortOrder: number;
}

export interface MaterialCollectionRef {
  id: string;
  slug: string;
  translations: Pick<CollectionTranslation, 'id' | 'lang' | 'name'>[];
}

export interface AdminMaterial {
  id: string;
  slug: string;
  sku: string | null;
  status: MaterialStatus;
  availability: boolean;
  featured: boolean;
  newArrival: boolean;
  popular: boolean;
  bookmatch: boolean;
  origin: string | null;
  thickness: string | null;
  technicalSpecs: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  materialType: TaxonomyNode;
  category: TaxonomyNode | null;
  color: TaxonomyNode | null;
  finish: TaxonomyNode | null;
  translations: MaterialTranslation[];
  images: MaterialImage[];
  sizes: TaxonomyNode[];
  applications: TaxonomyNode[];
  collections: MaterialCollectionRef[];
  visualizerConfig: { id: string; textureUrl: string | null; enabled: boolean } | null;
}

export interface MaterialPayload {
  slug: string;
  sku?: string | null;
  materialTypeId: string;
  categoryId?: string | null;
  colorId?: string | null;
  finishId?: string | null;
  origin?: string | null;
  thickness?: string | null;
  availability: boolean;
  featured: boolean;
  newArrival: boolean;
  popular: boolean;
  bookmatch: boolean;
  technicalSpecs?: Record<string, unknown> | null;
  status: MaterialStatus;
  translations: {
    lang: Lang;
    name: string;
    shortDescription?: string | null;
    longDescription?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    noIndex?: boolean;
  }[];
  sizeIds: string[];
  applicationIds: string[];
  collectionIds: string[];
  images: {
    kind: ImageKind;
    url: string;
    altAr?: string | null;
    altEn?: string | null;
    sortOrder?: number;
  }[];
}

// ---- Collections ---------------------------------------------------------

export interface CollectionTranslation {
  id: string;
  collectionId?: string;
  lang: Lang;
  name: string;
  description: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
}

export interface AdminCollection {
  id: string;
  slug: string;
  coverImage: string | null;
  featured: boolean;
  displayOrder: number;
  status: MaterialStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  translations: CollectionTranslation[];
  materialCount: number;
  materials: MaterialCollectionRef[];
}

export interface CollectionPayload {
  slug: string;
  coverImage?: string | null;
  featured: boolean;
  displayOrder: number;
  status: MaterialStatus;
  translations: {
    lang: Lang;
    name: string;
    description?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    noIndex?: boolean;
  }[];
  materialIds: string[];
}

// ---- Projects ------------------------------------------------------------

export interface ProjectTranslation {
  id: string;
  projectId?: string;
  lang: Lang;
  title: string;
  shortDescription: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
}

export interface ProjectImage {
  id: string;
  url: string;
  altAr: string | null;
  altEn: string | null;
  sortOrder: number;
}

export interface AdminProject {
  id: string;
  slug: string;
  location: string | null;
  coverImage: string | null;
  completionDate: string | null;
  featured: boolean;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  projectType: TaxonomyNode;
  translations: ProjectTranslation[];
  images: ProjectImage[];
  materials: MaterialCollectionRef[];
}

export interface ProjectPayload {
  slug: string;
  projectTypeId: string;
  location?: string | null;
  coverImage?: string | null;
  completionDate?: string | null;
  featured: boolean;
  status: ProjectStatus;
  translations: {
    lang: Lang;
    title: string;
    shortDescription?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    noIndex?: boolean;
  }[];
  materialIds: string[];
  images: {
    url: string;
    altAr?: string | null;
    altEn?: string | null;
    sortOrder?: number;
  }[];
}

// ---- Visualizer ----------------------------------------------------------

export interface RoomSurfaceRow {
  id: string;
  surfaceType: SurfaceType;
  nameAr: string;
  nameEn: string;
  clipPath: string;
  enabled: boolean;
  sortOrder: number;
  defaultMaterialId: string | null;
  defaultMaterialSlug: string | null;
}

export interface RoomRow {
  id: string;
  slug: string;
  roomType: RoomType;
  nameAr: string;
  nameEn: string;
  previewImage: string | null;
  fullImage: string | null;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  surfaces: RoomSurfaceRow[];
}

export interface RoomPayload {
  slug: string;
  roomType: RoomType;
  nameAr: string;
  nameEn: string;
  previewImage?: string | null;
  fullImage?: string | null;
  enabled: boolean;
  sortOrder: number;
  surfaces: {
    surfaceType: SurfaceType;
    nameAr: string;
    nameEn: string;
    clipPath: string;
    enabled?: boolean;
    sortOrder?: number;
    defaultMaterialId?: string | null;
  }[];
}

export interface VisualizerMaterialRow {
  id: string;
  slug: string;
  translations: MaterialTranslation[];
  coverImage: string | null;
  config: Record<string, unknown> | null;
}

// ---- Customers -----------------------------------------------------------

export interface QuoteRequestRow {
  id: string;
  customerName: string;
  phone: string | null;
  email: string | null;
  projectType: string | null;
  message: string | null;
  visualizerImage: string | null;
  source: string;
  status: QuoteStatus;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
  items?: { id: string; name: string | null; size: string | null; quantity: number }[];
}

export interface ContactMessageRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  projectType: string | null;
  message: string;
  status: MessageStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShowroomBookingRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  requestDate: string | null;
  requestedTime: string | null;
  materialsOfInterest: string | null;
  status: BookingStatus;
  internalNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---- Media ---------------------------------------------------------------

export interface MediaAssetRow {
  id: string;
  url: string;
  filename: string;
  kind: MediaKind;
  mimeType: string | null;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  altAr: string | null;
  altEn: string | null;
  createdAt: string;
}

// ---- Audit ---------------------------------------------------------------

export interface AuditEntryRow {
  id: string;
  timestamp: string;
  adminUserId: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  success: boolean;
  adminUser?: { id: string; email: string } | null;
}

// ---- Overview / dashboard -------------------------------------------------

export interface OverviewData {
  summary: {
    publishedMaterials: number;
    draftedMaterials: number;
    archivedMaterials: number;
    collections: number;
    projects: number;
    activeUsers: number;
    newQuotes7d: number;
    openQuotes: number;
    newMessages7d: number;
    pendingBookings: number;
    uploads7d: number;
    auditEvents7d: number;
    activeSessions24h: number;
  };
  trends: {
    quotes: { date: string; count: number }[];
    messages: { date: string; count: number }[];
    bookings: { date: string; count: number }[];
  };
}

// ---- Auth ----------------------------------------------------------------

export interface MfaCheck {
  mfaEnabled: boolean;
  setupRequired: boolean;
}

export interface SessionRow {
  sid: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string;
  current: boolean;
}

export interface AdminSettings {
  [section: string]: Record<string, unknown>;
}

export interface Paged<T> extends Pagination {
  items: T[];
}

export { Pagination };