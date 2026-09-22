// Typed client for the PIETRAx public API (server/src/routes/public.ts).
// GETs are unauthenticated; mutations send the double-submit CSRF token via api().
import { get, post, qs, type ApiError } from '@/lib/api';

export type PubLang = 'AR' | 'EN';

export interface PubTaxonomy {
  id: string;
  code: string;
  labelAr: string;
  labelEn: string;
  [key: string]: unknown;
}

export interface PubSize {
  id: string;
  code: string;
  label: string;
}

export interface PubTranslation {
  id: string;
  lang: PubLang;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  noIndex: boolean;
}

export interface PubImage {
  id: string;
  kind: string;
  url: string;
  altAr: string | null;
  altEn: string | null;
  sortOrder: number;
}

export interface PubMaterial {
  id: string;
  slug: string;
  sku: string | null;
  origin: string | null;
  thickness: string | null;
  availability: boolean;
  featured: boolean;
  newArrival: boolean;
  popular: boolean;
  bookmatch: boolean;
  technicalSpecs: Record<string, unknown> | null;
  materialType: PubTaxonomy;
  category: PubTaxonomy | null;
  color: PubTaxonomy | null;
  finish: PubTaxonomy | null;
  sizes: PubSize[];
  applications: PubTaxonomy[];
  collections: { id: string; slug: string; translations: { lang: PubLang; name: string }[] }[];
  images: PubImage[];
  translations: PubTranslation[];
  updatedAt: string;
}

export interface PubCollection {
  id: string;
  slug: string;
  coverImage: string | null;
  featured: boolean;
  displayOrder: number;
  translations: { id: string; lang: PubLang; name: string; description: string | null }[];
  materialCount: number;
}

export interface PubProjectImage {
  id: string;
  url: string;
  altAr: string | null;
  altEn: string | null;
  sortOrder: number;
}

export interface PubProject {
  id: string;
  slug: string;
  location: string | null;
  coverImage: string | null;
  completionDate: string | null;
  featured: boolean;
  projectType: PubTaxonomy;
  translations: { id: string; lang: PubLang; title: string; shortDescription: string | null }[];
  images: PubProjectImage[];
  materials: { slug: string; translations: { lang: PubLang; name: string }[] }[];
}

export interface PubVisualizerRoomSurface {
  id: string;
  surfaceType: string;
  nameAr: string;
  nameEn: string;
  clipPath: string;
  defaultMaterialSlug: string | null;
}

export interface PubVisualizerRoom {
  id: string;
  slug: string;
  roomType: string;
  nameAr: string;
  nameEn: string;
  previewImage: string | null;
  fullImage: string | null;
  surfaces: PubVisualizerRoomSurface[];
}

export interface PubVisualizerMaterial {
  id: string;
  slug: string;
  translations: { lang: PubLang; name: string }[];
  textureUrl: string | null;
  physicalScale: number | null;
  patternScale: number | null;
  tileWidth: number | null;
  tileHeight: number | null;
  groutWidth: number | null;
  groutColor: string | null;
  rotation: number | null;
  defaultZoom: number | null;
  bookmatch: boolean;
}

export interface PubVisualizer {
  rooms: PubVisualizerRoom[];
  materials: PubVisualizerMaterial[];
}

export interface SiteSettings {
  [section: string]: Record<string, unknown>;
}

export type CompanySettings = {
  nameAr?: string;
  nameEn?: string;
  taglineAr?: string;
  taglineEn?: string;
  aboutAr?: string;
  aboutEn?: string;
  foundedYear?: number;
};

export type ContactSettings = {
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  googleMapsUrl?: string;
};

export type ShowroomSettings = {
  image?: string;
  location?: string;
  hoursAr?: string;
  hoursEn?: string;
};

export type SocialSettings = {
  instagram?: string;
  facebook?: string;
  pinterest?: string;
  linkedin?: string;
};

export function companySettings(settings: SiteSettings | null): CompanySettings {
  return (settings?.company ?? {}) as CompanySettings;
}

export function contactSettings(settings: SiteSettings | null): ContactSettings {
  return (settings?.contact ?? {}) as ContactSettings;
}

export function showroomSettings(settings: SiteSettings | null): ShowroomSettings {
  return (settings?.showroom ?? {}) as ShowroomSettings;
}

export function socialSettings(settings: SiteSettings | null): SocialSettings {
  return (settings?.social ?? {}) as SocialSettings;
}

export interface QuoteItemInput {
  slug?: string;
  name?: string;
  size?: string;
  quantity?: number;
}

export interface QuoteInput {
  name: string;
  phone?: string;
  email?: string;
  projectType?: string;
  message?: string;
  visualizerImage?: string;
  items?: QuoteItemInput[];
  source?: string;
}

export interface MessageInput {
  name: string;
  phone?: string;
  email?: string;
  projectType?: string;
  message: string;
}

export interface BookingInput {
  name: string;
  phone?: string;
  email?: string;
  date?: string;
  time?: string;
  materialsOfInterest?: string;
}

export function pubName(row: PubMaterial | PubProject, lang: 'ar' | 'en'): string {
  const which: PubLang = lang === 'ar' ? 'AR' : 'EN';
  const first = row.translations[0];
  const isProject = first !== undefined && 'title' in first;
  const picked = row.translations.find((t) => t.lang === which) ?? first;
  if (!picked) return '';
  return isProject ? (picked as { title: string }).title : (picked as { name: string }).name;
}

export function pubMaterialName(
  translations: { lang: PubLang; name: string }[],
  lang: 'ar' | 'en',
): string {
  const which: PubLang = lang === 'ar' ? 'AR' : 'EN';
  return translations.find((t) => t.lang === which)?.name ?? translations[0]?.name ?? '';
}

export function pubCollectionName(
  translations: { lang: PubLang; name: string }[],
  lang: 'ar' | 'en',
): string {
  const which: PubLang = lang === 'ar' ? 'AR' : 'EN';
  return translations.find((t) => t.lang === which)?.name ?? translations[0]?.name ?? '';
}

export function pubCover(material: PubMaterial): string | null {
  return [...material.images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null;
}

export const publicApi = {
  materials: (params?: { search?: string; materialType?: string; color?: string; finish?: string; featured?: boolean; fresh?: boolean; popular?: boolean }) =>
    get<{ materials: PubMaterial[] }>(`/api/materials${qs(params)}`).then((r) => r.materials),
  material: (slug: string) => get<{ material: PubMaterial }>(`/api/materials/${slug}`).then((r) => r.material),
  collections: () => get<{ collections: PubCollection[] }>('/api/collections').then((r) => r.collections),
  projects: () => get<{ projects: PubProject[] }>('/api/projects').then((r) => r.projects),
  project: (slug: string) => get<{ project: PubProject }>(`/api/projects/${slug}`).then((r) => r.project),
  visualizer: () => get<PubVisualizer>('/api/visualizer'),
  site: () => get<{ settings: SiteSettings }>('/api/site').then((r) => r.settings),
  submitQuote: (body: QuoteInput) => post<{ ok: boolean; id: string }>('/api/quotes', body),
  submitMessage: (body: MessageInput) => post<{ ok: boolean; id: string }>('/api/messages', body),
  submitBooking: (body: BookingInput) => post<{ ok: boolean; id: string }>('/api/bookings', body),
};

export { ApiError };