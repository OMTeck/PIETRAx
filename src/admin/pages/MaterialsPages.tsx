import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Plus, Pencil, Copy, Trash2, RotateCcw, Search, Star, ArrowLeft } from 'lucide-react';
import { useRoute } from '@/context/RouteContext';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { materialsApi, taxonomyApi, collectionsApi } from '@/admin/server';
import { usePaged, useAsync, localizedName, slugify } from '@/admin/lib';
import {
  Button, Input, Select, Textarea, Field, Badge, statusTone, PageHeader, Card, Loading, EmptyState, Paginator, Modal, ConfirmDialog, Toggle, useToast, cx, fmtDateTime, Spinner,
} from '@/admin/ui';
import { can, PERM } from '@/admin/permissions';
import { toTaxNode } from '@/admin/shared';
import type { AdminMaterial, MaterialPayload, TaxonomyNode, Lang, ImageKind, AdminCollection, MaterialStatus } from '@/admin/types';

const IMAGE_KINDS: ImageKind[] = ['MAIN', 'TEXTURE', 'SLAB', 'GALLERY', 'ROOM'];
const STATUSES: MaterialStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export function MaterialsListPage() {
  const { navigate } = useRoute();
  const { user } = useAdminAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [status, setStatus] = useState('');
  const [trash, setTrash] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const canCreate = !!user && can(user.role, PERM.materialsCreate);
  const canDelete = !!user && can(user.role, PERM.materialsDelete);

  const { data, loading, error, page, setPage, reload } = usePaged<AdminMaterial>(
    (p, ps, extra) => materialsApi.list({ search: String(extra.search ?? ''), status: String(extra.status ?? '') || undefined, trash: Boolean(extra.trash) || undefined, page: p, pageSize: ps }),
    { pageSize: 10 },
  );

  function applyFilters() {
    reload({ search: submittedSearch, status, trash });
  }

  async function remove() {
    if (!deleteId) return;
    setConfirming(true);
    try {
      await materialsApi.trash(deleteId);
      toast(trash ? 'Material deleted permanently soon.' : 'Material moved to trash.', 'success');
      setDeleteId(null);
      applyFilters();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete.', 'error');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div>
      <PageHeader title="Materials" subtitle="Products in the catalog">
        {canCreate && <Button onClick={() => navigate('/admin/materials/new')}><Plus className="h-4 w-4" /> New material</Button>}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters();
          }}
        >
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or SKU…" className="pl-8 pr-24" />
        </form>
        <div className="w-36">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={trash} onChange={(e) => setTrash(e.target.checked)} className="rounded border-stone-300" />
          Trash
        </label>
        <Button variant="outline" size="sm" onClick={applyFilters}>Apply</Button>
      </div>

      <Card className="overflow-hidden">
        {loading && <Loading />}
        {error && <p className="px-5 py-6 text-sm text-red-700">{error}</p>}
        {!loading && !error && data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState title={trash ? 'Trash is empty' : 'No materials found'} message="Try a different search or create a new material." />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                    <th className="px-5 py-3 font-medium">Material</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Flags</th>
                    <th className="px-3 py-3 font-medium">Updated</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((m) => (
                    <tr key={m.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {m.images.find((i) => i.kind === 'MAIN')?.url ? (
                            <img src={m.images.find((i) => i.kind === 'MAIN')!.url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                          ) : (
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-400">—</span>
                          )}
                          <div>
                            <div className="font-medium text-stone-900">{localizedName(m.translations, 'name', 'AR')}</div>
                            <div className="text-xs text-stone-500">{m.slug} {m.sku ? `· ${m.sku}` : ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-stone-600">{localizedName([{ lang: 'AR', ...m.materialType }], 'labelAr', 'AR')}</td>
                      <td className="px-3 py-3"><Badge tone={statusTone(m.status)}>{m.status}</Badge></td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1">
                          {m.featured && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
                          {!m.availability && <span className="text-[10px] uppercase text-red-700">out</span>}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-stone-500">{fmtDateTime(m.updatedAt)}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button title="Edit" onClick={() => navigate(`/admin/materials/${m.id}`)} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900">
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            title="Duplicate"
                            onClick={async () => {
                              try {
                                const dup = await materialsApi.duplicate(m.id);
                                toast(`Duplicated as "${dup.slug}".`, 'success');
                                navigate(`/admin/materials/${dup.id}`);
                              } catch (err) {
                                toast(err instanceof Error ? err.message : 'Failed to duplicate.', 'error');
                              }
                            }}
                            className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                          {trash ? (
                            <button
                              title="Restore"
                              onClick={async () => {
                                try {
                                  await materialsApi.restore(m.id);
                                  toast('Material restored.', 'success');
                                  applyFilters();
                                } catch (err) {
                                  toast(err instanceof Error ? err.message : 'Failed to restore.', 'error');
                                }
                              }}
                              className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              title="Trash"
                              disabled={!canDelete}
                              onClick={() => setDeleteId(m.id)}
                              className="rounded p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <Paginator page={page} pages={data.pagination.pages} total={data.pagination.total} onPage={setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={deleteId !== null}
        title="Move to trash"
        message="The material will no longer appear on the public site. You can restore it later."
        confirmLabel="Move to trash"
        onConfirm={() => void remove()}
        onCancel={() => setDeleteId(null)}
        loading={confirming}
      />
    </div>
  );
}

// ---- Editor -----------------------------------------------------------------

interface MaterialForm extends Omit<MaterialPayload, 'translations'> {
  translations: MaterialPayload['translations'];
}

interface SpecRow {
  key: string;
  value: string;
}

interface ImageRow {
  kind: ImageKind;
  url: string;
  altAr: string;
  altEn: string;
  sortOrder: number;
}

function CheckGroup<T extends { id: string }>({
  label,
  options,
  selected,
  onChange,
  nameOf,
}: {
  label: string;
  options: T[];
  selected: string[];
  onChange: (ids: string[]) => void;
  nameOf: (o: T) => string;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-stone-500">{label}</span>
      <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded border border-stone-200 p-2">
        {options.map((o) => {
          const checked = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(checked ? selected.filter((id) => id !== o.id) : [...selected, o.id])}
              className={cx(
                'rounded-full border px-2.5 py-1 text-xs transition-colors',
                checked ? 'border-stone-900 bg-stone-900 text-ivory' : 'border-stone-200 text-stone-600 hover:border-stone-500',
              )}
            >
              {nameOf(o)}
            </button>
          );
        })}
        {options.length === 0 && <span className="text-xs text-stone-400">No options.</span>}
      </div>
    </div>
  );
}

export function MaterialsEditorPage({ id }: { id: string }) {
  const { navigate } = useRoute();
  const { user } = useAdminAuth();
  const { toast } = useToast();
  const isNew = id === 'new';

  const taxonomy = useAsync(async () => {
    const [tax, cols] = await Promise.all([taxonomyApi.getAll(), collectionsApi.list({ page: 1, pageSize: 100 })]);
    return { tax, cols: cols.items };
  }, []);

  const existing = useAsync<AdminMaterial | null>(
    async () => (isNew ? null : materialsApi.get(id)),
    [id],
  );

  const [form, setForm] = useState<MaterialForm | null>(null);
  const [specs, setSpecs] = useState<SpecRow[]>([]);
  const [imageRows, setImageRows] = useState<ImageRow[]>([]);
  const [sizeIds, setSizeIds] = useState<string[]>([]);
  const [applicationIds, setApplicationIds] = useState<string[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew && !form && taxonomy.data) {
      const materialTypeId = taxonomy.data.tax.materialTypes[0]?.id ?? '';
      setForm({
        slug: '',
        sku: null,
        materialTypeId,
        categoryId: null,
        colorId: null,
        finishId: null,
        origin: null,
        thickness: null,
        availability: true,
        featured: false,
        newArrival: false,
        popular: false,
        bookmatch: false,
        technicalSpecs: null,
        status: 'DRAFT',
        translations: [
          { lang: 'AR', name: '', shortDescription: '', longDescription: '', seoTitle: '', seoDescription: '', noIndex: false },
          { lang: 'EN', name: '', shortDescription: '', longDescription: '', seoTitle: '', seoDescription: '', noIndex: false },
        ],
        sizeIds: [],
        applicationIds: [],
        collectionIds: [],
        images: [],
      });
      setSpecs([]);
      setImageRows([]);
    }
    if (existing.data && !form) {
      const m = existing.data;
      setForm({
        slug: m.slug,
        sku: m.sku,
        materialTypeId: m.materialType.id,
        categoryId: m.category?.id ?? null,
        colorId: m.color?.id ?? null,
        finishId: m.finish?.id ?? null,
        origin: m.origin,
        thickness: m.thickness,
        availability: m.availability,
        featured: m.featured,
        newArrival: m.newArrival,
        popular: m.popular,
        bookmatch: m.bookmatch,
        technicalSpecs: m.technicalSpecs,
        status: m.status,
        translations: m.translations.map((t) => ({
          lang: t.lang,
          name: t.name,
          shortDescription: t.shortDescription,
          longDescription: t.longDescription,
          seoTitle: t.seoTitle,
          seoDescription: t.seoDescription,
          noIndex: t.noIndex,
        })),
        sizeIds: m.sizes.map((s) => s.id),
        applicationIds: m.applications.map((a) => a.id),
        collectionIds: m.collections.map((c) => c.id),
        images: m.images.map((img) => ({ kind: img.kind, url: img.url, altAr: img.altAr ?? '', altEn: img.altEn ?? '', sortOrder: img.sortOrder })),
      });
      setSizeIds(m.sizes.map((s) => s.id));
      setApplicationIds(m.applications.map((a) => a.id));
      setCollectionIds(m.collections.map((c) => c.id));
      setImageRows(m.images.map((img) => ({ kind: img.kind, url: img.url, altAr: img.altAr ?? '', altEn: img.altEn ?? '', sortOrder: img.sortOrder })));
      setSpecs(Object.entries(m.technicalSpecs ?? {}).map(([key, value]) => ({ key, value: String(value) })));
    }
  }, [isNew, form, taxonomy.data, existing.data]);

  const loading = (!isNew && (existing.loading || !existing.data)) || !taxonomy.data || !form;

  function setTranslation(lang: Lang, field: 'name' | 'shortDescription' | 'longDescription' | 'seoTitle' | 'seoDescription' | 'noIndex', value: string | boolean) {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        translations: prev.translations.map((t) => (t.lang === lang ? { ...t, [field]: value } : t)),
      };
    });
  }

  function setScalar<K extends keyof MaterialForm>(key: K, value: MaterialForm[K]) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.slug) {
      toast('Slug is required.', 'error');
      return;
    }
    const translations = form.translations.map((t) => ({
      lang: t.lang,
      name: t.name.trim() || slugify(form.slug + (t.lang === 'AR' ? '-ar' : '')),
      shortDescription: t.shortDescription?.trim() || null,
      longDescription: t.longDescription?.trim() || null,
      seoTitle: t.seoTitle?.trim() || null,
      seoDescription: t.seoDescription?.trim() || null,
      noIndex: t.noIndex,
    }));

    const payload: MaterialPayload = {
      slug: form.slug,
      sku: form.sku?.trim() || null,
      materialTypeId: form.materialTypeId,
      categoryId: form.categoryId || null,
      colorId: form.colorId || null,
      finishId: form.finishId || null,
      origin: form.origin?.trim() || null,
      thickness: form.thickness?.trim() || null,
      availability: form.availability,
      featured: form.featured,
      newArrival: form.newArrival,
      popular: form.popular,
      bookmatch: form.bookmatch,
      technicalSpecs: specs.filter((s) => s.key.trim() && s.value.trim()).length
        ? Object.fromEntries(specs.filter((s) => s.key.trim() && s.value.trim()).map((s) => [s.key.trim(), s.value.trim()]))
        : null,
      status: form.status,
      translations,
      sizeIds,
      applicationIds,
      collectionIds,
      images: imageRows.filter((row) => row.url.trim()).map((row) => ({
        kind: row.kind,
        url: row.url.trim(),
        altAr: row.altAr || null,
        altEn: row.altEn || null,
        sortOrder: Number(row.sortOrder) || 0,
      })),
    };

    setSaving(true);
    try {
      if (isNew) {
        await materialsApi.create(payload);
        toast('Material created.', 'success');
      } else {
        await materialsApi.update(id, payload);
        toast('Material saved.', 'success');
      }
      navigate('/admin/materials');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Loading label={isNew ? 'Preparing…' : 'Loading material…'} />;
  if (!form) return null;

  const tax = taxonomy.data!.tax;
  const collections = taxonomy.data!.cols;

  const nameOf = (o: TaxonomyNode, ar?: string, en?: string) => (o?.labelAr ? `${o.labelAr} / ${o.labelEn ?? ''}`.trim() : (ar ?? en ?? '—'));

  return (
    <div>
      <PageHeader title={isNew ? 'New material' : 'Edit material'} subtitle={existing.data?.slug ?? ''}>
        <Button variant="outline" onClick={() => navigate('/admin/materials')}><ArrowLeft className="h-4 w-4" /> Back</Button>
      </PageHeader>

      <form onSubmit={save}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Identity">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Slug">
                  <Input value={form.slug} onChange={(e) => setScalar('slug', e.target.value)} placeholder="e.g. calacatta-oro" />
                </Field>
                <Field label="SKU">
                  <Input value={form.sku ?? ''} onChange={(e) => setScalar('sku', e.target.value)} placeholder="(optional)" />
                </Field>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Material type *">
                  <Select value={form.materialTypeId} onChange={(e) => setScalar('materialTypeId', e.target.value)}>
                    {tax.materialTypes.map((o) => (
                      <option key={o.id} value={o.id}>{o.labelAr} — {o.labelEn}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Category">
                  <Select value={form.categoryId ?? ''} onChange={(e) => setScalar('categoryId', e.target.value || null)}>
                    <option value="">None</option>
                    {tax.categories.map((o) => (
                      <option key={o.id} value={o.id}>{o.labelAr} — {o.labelEn}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Colour">
                  <Select value={form.colorId ?? ''} onChange={(e) => setScalar('colorId', e.target.value || null)}>
                    <option value="">None</option>
                    {tax.colors.map((o) => (
                      <option key={o.id} value={o.id}>{o.labelAr} — {o.labelEn}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Finish">
                  <Select value={form.finishId ?? ''} onChange={(e) => setScalar('finishId', e.target.value || null)}>
                    <option value="">None</option>
                    {tax.finishes.map((o) => (
                      <option key={o.id} value={o.id}>{o.labelAr} — {o.labelEn}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Origin">
                  <Input value={form.origin ?? ''} onChange={(e) => setScalar('origin', e.target.value)} placeholder="Italy" />
                </Field>
                <Field label="Thickness">
                  <Input value={form.thickness ?? ''} onChange={(e) => setScalar('thickness', e.target.value)} placeholder="e.g. 20mm" />
                </Field>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Status">
                  <Select value={form.status} onChange={(e) => setScalar('status', e.target.value as MaterialStatus)}>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Toggle checked={form.availability} onChange={(v) => setScalar('availability', v)} label="Available for order" />
                <Toggle checked={form.featured} onChange={(v) => setScalar('featured', v)} label="Featured" />
                <Toggle checked={form.newArrival} onChange={(v) => setScalar('newArrival', v)} label="New arrival" />
                <Toggle checked={form.popular} onChange={(v) => setScalar('popular', v)} label="Popular" />
                <Toggle checked={form.bookmatch} onChange={(v) => setScalar('bookmatch', v)} label="Bookmatch" />
              </div>
            </Card>

            <Card title="Translations">
              {(['AR', 'EN'] as Lang[]).map((lang) => (
                <div key={lang} className="mb-6 last:mb-0">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone-500">{lang === 'AR' ? 'العربية' : 'English'}</span>
                    <Toggle checked={form.translations.find((t) => t.lang === lang)?.noIndex ?? false} onChange={(v) => setTranslation(lang, 'noIndex', v)} label="No index" />
                  </div>
                  <div className="grid gap-4">
                    <Field label="Name">
                      <Input value={form.translations.find((t) => t.lang === lang)?.name ?? ''} onChange={(e) => setTranslation(lang, 'name', e.target.value)} />
                    </Field>
                    <Field label="Short description">
                      <Textarea rows={2} value={form.translations.find((t) => t.lang === lang)?.shortDescription ?? ''} onChange={(e) => setTranslation(lang, 'shortDescription', e.target.value)} />
                    </Field>
                    <Field label="Long description">
                      <Textarea rows={4} value={form.translations.find((t) => t.lang === lang)?.longDescription ?? ''} onChange={(e) => setTranslation(lang, 'longDescription', e.target.value)} />
                    </Field>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="SEO title">
                        <Input value={form.translations.find((t) => t.lang === lang)?.seoTitle ?? ''} onChange={(e) => setTranslation(lang, 'seoTitle', e.target.value)} />
                      </Field>
                      <Field label="SEO description">
                        <Input value={form.translations.find((t) => t.lang === lang)?.seoDescription ?? ''} onChange={(e) => setTranslation(lang, 'seoDescription', e.target.value)} />
                      </Field>
                    </div>
                  </div>
                </div>
              ))}
            </Card>

            <Card title="Images">
              {imageRows.length === 0 && <p className="mb-3 text-sm text-stone-500">No images. Add the first below.</p>}
              <div className="space-y-3">
                {imageRows.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded border border-stone-200 p-2">
                    {row.url ? (
                      <img src={row.url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-stone-100 text-[10px] text-stone-400">No preview</span>
                    )}
                    <div className="w-28">
                      <Select value={row.kind} onChange={(e) => setImageRows((rows) => rows.map((r, i) => (i === idx ? { ...r, kind: e.target.value as ImageKind } : r)))}>
                        {IMAGE_KINDS.map((k) => (
                          <option key={k} value={k}>{k}</option>
                        ))}
                      </Select>
                    </div>
                    <Input
                      className="min-w-40 flex-1"
                      placeholder="Image URL (/uploads/… or https://…)"
                      value={row.url}
                      onChange={(e) => setImageRows((rows) => rows.map((r, i) => (i === idx ? { ...r, url: e.target.value } : r)))}
                    />
                    <Input
                      className="w-32"
                      placeholder="Alt AR"
                      value={row.altAr}
                      onChange={(e) => setImageRows((rows) => rows.map((r, i) => (i === idx ? { ...r, altAr: e.target.value } : r)))}
                    />
                    <Input
                      className="w-32"
                      placeholder="Alt EN"
                      value={row.altEn}
                      onChange={(e) => setImageRows((rows) => rows.map((r, i) => (i === idx ? { ...r, altEn: e.target.value } : r)))}
                    />
                    <Input
                      className="w-20"
                      type="number"
                      placeholder="Sort"
                      value={row.sortOrder}
                      onChange={(e) => setImageRows((rows) => rows.map((r, i) => (i === idx ? { ...r, sortOrder: Number(e.target.value) || 0 } : r)))}
                    />
                    <button
                      type="button"
                      onClick={() => setImageRows((rows) => rows.filter((_, i) => i !== idx))}
                      className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700"
                      aria-label="Remove image"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setImageRows((rows) => [...rows, { kind: 'GALLERY', url: '', altAr: '', altEn: '', sortOrder: imageRows.length }])}>
                <Plus className="h-3.5 w-3.5" /> Add image
              </Button>
            </Card>

            <Card title="Technical specifications">
              {specs.length === 0 && <p className="mb-3 text-sm text-stone-500">Optional key-value attributes, e.g. Water absorption: 0.05%.</p>}
              <div className="space-y-2">
                {specs.map((row, idx) => (
                  <div key={idx} className="flex gap-2">
                    <Input className="flex-1" placeholder="Key" value={row.key} onChange={(e) => setSpecs((rows) => rows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))} />
                    <Input className="flex-1" placeholder="Value" value={row.value} onChange={(e) => setSpecs((rows) => rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)))} />
                    <button type="button" onClick={() => setSpecs((rows) => rows.filter((_, i) => i !== idx))} className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setSpecs((rows) => [...rows, { key: '', value: '' }])}>
                <Plus className="h-3.5 w-3.5" /> Add attribute
              </Button>
            </Card>
          </div>

          <div className="space-y-6">
            <Card title="Matchings">
              <div className="space-y-5">
                <CheckGroup
                  label={`Sizes (${sizeIds.length})`}
                  options={tax.sizes as Array<{ id: string; label?: string }>}
                  selected={sizeIds}
                  onChange={setSizeIds}
                  nameOf={(o) => o.label ?? ''}
                />
                <CheckGroup label={`Applications (${applicationIds.length})`} options={tax.applications} selected={applicationIds} onChange={setApplicationIds} nameOf={(o) => `${o.labelAr} / ${o.labelEn}`} />
                <CheckGroup label={`Collections (${collectionIds.length})`} options={collections.map(toTaxNode)} selected={collectionIds} onChange={setCollectionIds} nameOf={(o) => String(o.labelAr)} />
              </div>
            </Card>
          </div>
        </div>

        <div className="sticky bottom-4 mt-6 flex justify-end gap-2 rounded-lg border border-stone-200 bg-white/95 p-4 shadow">
          <Button type="button" variant="outline" onClick={() => navigate('/admin/materials')}>Cancel</Button>
          <Button type="submit" loading={saving}>{isNew ? 'Create material' : 'Save changes'}</Button>
        </div>
      </form>
    </div>
  );
}