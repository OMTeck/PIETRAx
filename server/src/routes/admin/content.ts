import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { asyncHandler, notFound } from '../../http/errors.js';
import { requirePermission } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';
import type { Prisma } from '@prisma/client';

export const contentRouter = Router();

// ---------------------------------------------------------------------------
// Defaults aligned with the original showroom website content.
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  general: {
    siteNameAr: 'بيترا',
    siteNameEn: 'PIETRA',
    defaultLang: 'ar',
  },
  company: {
    nameAr: 'بيترا',
    nameEn: 'PIETRA',
    taglineAr: 'الحجر الذي يصنع المساحة',
    taglineEn: 'The stone that shapes the space',
    aboutAr:
      'بيترا معرض متخصص في الخامات المعمارية الفاخرة. نختار كل لوح يدويًا من أرقى المحاجر العالمية.',
    aboutEn:
      'PIETRA is a gallery specializing in luxury architectural materials. Every slab is hand-selected from the finest quarries worldwide.',
    foundedYear: 2004,
  },
  showroom: {
    image: 'https://images.pexels.com/photos/5827062/pexels-photo-5827062.jpeg?auto=compress&cs=tinysrgb&w=1600',
    location: 'King Fahd Road, Al Olaya, Riyadh',
    hoursAr: 'السبت – الخميس: 9 صباحًا – 8 مساءً',
    hoursEn: 'Sat–Thu: 9AM–8PM',
  },
  contact: {
    phone: '+966 11 234 5678',
    whatsapp: '966112345678',
    email: 'info@pietra-gallery.com',
    address: 'King Fahd Road, Al Olaya, Riyadh',
    googleMapsUrl: 'https://www.openstreetmap.org/export/embed.html?bbox=46.6%2C24.68%2C46.75%2C24.75&layer=mapnik',
  },
  social: {
    instagram: '',
    facebook: '',
    pinterest: '',
    linkedin: '',
  },
  languages: {
    defaultLang: 'ar',
    rtlDefault: true,
  },
  seo: {
    titleTemplate: 'PIETRA — Luxury Marble, Ceramic & Porcelain Showroom',
    titleTemplateAr: 'بيترا — معرض الرخام والسيراميك والبورسلان الفاخر',
    ogImage: 'https://images.pexels.com/photos/16199071/pexels-photo-16199071.jpeg?auto=compress&cs=tinysrgb&w=1920',
    siteUrl: '',
  },
  security: {
    requireMfaRoles: ['OWNER', 'ADMIN'],
  },
  homepage: {
    hero: {
      enabled: true,
      titleAr: 'الحجر الذي يصنع المساحة',
      titleEn: 'The stone that shapes the space',
      subtitleAr: 'رخام وسيراميك مختار للمساحات الاستثنائية',
      subtitleEn: 'Marble and ceramic, selected for exceptional spaces',
      image: 'https://images.pexels.com/photos/16199071/pexels-photo-16199071.jpeg?auto=compress&cs=tinysrgb&w=1920',
      primaryCtaAr: 'استكشف المجموعة',
      primaryCtaEn: 'Explore Collection',
      primaryLink: '/collections',
      secondaryCtaAr: 'جرّب في مساحتك',
      secondaryCtaEn: 'Try in Your Room',
      secondaryLink: '/visualizer',
    },
    featuredCollections: {
      enabled: true,
      titleAr: 'المجموعات المميزة',
      titleEn: 'Featured Collections',
      count: 6,
    },
    newArrivals: {
      enabled: true,
      titleAr: 'وصل حديثًا',
      titleEn: 'New Arrivals',
      subtitleAr: 'أحدث الخامات في المعرض',
      subtitleEn: 'The latest materials in our gallery',
      count: 8,
    },
    browseByColor: {
      enabled: true,
      titleAr: 'تصفح حسب اللون',
      titleEn: 'Browse by Colour',
    },
    visualizerPromo: {
      enabled: true,
      titleAr: 'شاهد الخامة قبل اتخاذ القرار',
      titleEn: 'See the material before you decide',
      ctaAr: 'جرّب الآن',
      ctaEn: 'Try Now',
      link: '/visualizer',
      image: 'https://images.pexels.com/photos/16199071/pexels-photo-16199071.jpeg?auto=compress&cs=tinysrgb&w=1920',
    },
    projects: {
      enabled: true,
      titleAr: 'المشاريع',
      titleEn: 'Projects',
      subtitleAr: 'مشاريع منفذة بخاماتنا',
      subtitleEn: 'Projects realized with our materials',
      count: 6,
    },
    showroom: {
      enabled: true,
    },
    featuredMaterials: {
      enabled: true,
      titleAr: 'خامات مميزة',
      titleEn: 'Featured Materials',
      count: 12,
    },
  },
};

const sectionSchema = z.enum(['general', 'company', 'showroom', 'contact', 'social', 'languages', 'seo', 'homepage']);
const securitySchema = z.object({
  requireMfaRoles: z.array(z.string()),
  sessionIdleMinutes: z.coerce.number().int().min(5).max(1440).optional(),
  sessionAbsHours: z.coerce.number().int().min(1).max(720).optional(),
  passwordPolicyEnabled: z.boolean().optional(),
});

async function getSetting(key: string): Promise<unknown> {
  const row = await prisma.siteSetting.findUnique({ where: { key } });
  if (row) return row.value;
  return DEFAULT_SETTINGS[key] ?? {};
}

export async function setSetting(key: string, value: Prisma.InputJsonValue, updatedById: string): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    create: { key, value, updatedById },
    update: { value, updatedById },
  });
}

// GET everything (admin) ------------------------------------------------------

contentRouter.get(
  '/settings',
  requirePermission(PERM.settingsGeneral),
  asyncHandler(async (_req, res) => {
    const keys = Object.keys(DEFAULT_SETTINGS) as Array<keyof typeof DEFAULT_SETTINGS>;
    const out: Record<string, unknown> = {};
    for (const key of keys) {
      out[key] = await getSetting(key);
    }
    res.json({ settings: out });
  }),
);

// GET one section -------------------------------------------------------------

contentRouter.get(
  '/settings/:section',
  requirePermission(PERM.settingsGeneral),
  asyncHandler(async (req, res) => {
    const parsed = sectionSchema.safeParse(req.params.section);
    if (!parsed.success) throw notFound('Unknown settings section');
    res.json({ settings: await getSetting(parsed.data) });
  }),
);

// PUT security section — OWNER only (declared before :section so it wins).
contentRouter.put(
  '/settings/security',
  requirePermission(PERM.settingsSecurity),
  asyncHandler(async (req, res) => {
    const body = securitySchema.safeParse(req.body);
    if (!body.success) throw notFound('Invalid security settings payload');
    const current = (await getSetting('security')) as Record<string, unknown>;
    await setSetting(
      'security',
      {
        ...current,
        ...body.data,
      } as Prisma.InputJsonValue,
      req.authUser.id,
    );
    await recordAudit(req, { action: AUDIT.SECURITY_SETTING_CHANGED, resourceType: 'SiteSetting', resourceId: 'security' });
    res.json({ ok: true });
  }),
);

// PUT a non-security section ----------------------------------------------------

contentRouter.put(
  '/settings/:section',
  requirePermission(PERM.settingsGeneral),
  asyncHandler(async (req, res) => {
    const parsed = sectionSchema.safeParse(req.params.section);
    if (!parsed.success) throw notFound('Unknown settings section');
    if (Array.isArray(req.body) || req.body === null || typeof req.body !== 'object') {
      throw notFound('Invalid settings payload');
    }
    await setSetting(parsed.data, req.body as Prisma.InputJsonValue, req.authUser.id);
    await recordAudit(req, { action: AUDIT.SETTINGS_UPDATED, resourceType: 'SiteSetting', resourceId: parsed.data });
    res.json({ ok: true });
  }),
);