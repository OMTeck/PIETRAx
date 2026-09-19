import type { AdminCollection, TaxonomyNode } from '@/admin/types';

export function toTaxNode(col: AdminCollection): TaxonomyNode {
  const ar = col.translations.find((t) => t.lang === 'AR')?.name ?? col.slug;
  const en = col.translations.find((t) => t.lang === 'EN')?.name ?? col.slug;
  return { id: col.id, code: col.slug, slug: col.slug, labelAr: ar, labelEn: en, sortOrder: col.displayOrder, system: false };
}