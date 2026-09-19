import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, ArrowLeft, Search } from 'lucide-react';
import { useRoute } from '@/context/RouteContext';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { collectionsApi, materialsApi } from '@/admin/server';
import { usePaged, useAsync, localizedName, slugify } from '@/admin/lib';
import {
  Button, Input, Select, Textarea, Field, Badge, statusTone, PageHeader, Card, Loading, EmptyState, Paginator, ConfirmDialog, Toggle, useToast, cx, fmtDateTime,
} from '@/admin/ui';
import { can, PERM } from '@/admin/permissions';
import type { AdminCollection, CollectionPayload, Lang, MaterialStatus } from '@/admin/types';

const STATUSES: MaterialStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export function CollectionsListPage() {
  const { navigate } = useRoute();
  const { user } = useAdminAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [trash, setTrash] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = !!user && can(user.role, PERM.collectionsCreate);

  const { data, loading, error, page, setPage, reload } = usePaged<AdminCollection>(
    (p, ps, extra) => collectionsApi.list({ search: String(extra.search ?? ''), trash: Boolean(extra.trash) || undefined, page: p, pageSize: ps }),
    { pageSize: 10 },
  );

  async function remove() {
    if (!deleteId) return;
    try {
      await collectionsApi.trash(deleteId);
      toast('Collection moved to trash.', 'success');
      setDeleteId(null);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete.', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="Collections" subtitle="Curated groupings of materials">
        {canCreate && <Button onClick={() => navigate('/admin/collections/new')}><Plus className="h-4 w-4" /> New collection</Button>}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); reload({ search, trash }); }}>
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search collections…" className="pl-8" />
        </form>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-600">
          <input type="checkbox" checked={trash} onChange={(e) => { setTrash(e.target.checked); reload({ search, trash: e.target.checked }); }} className="rounded border-stone-300" />
          Trash
        </label>
      </div>

      <Card className="overflow-hidden">
        {loading && <Loading />}
        {error && <p className="px-5 py-6 text-sm text-red-700">{error}</p>}
        {!loading && !error && data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState title={trash ? 'Trash is empty' : 'No collections found'} />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                    <th className="px-5 py-3 font-medium">Collection</th>
                    <th className="px-3 py-3 font-medium">Slug</th>
                    <th className="px-3 py-3 font-medium">Materials</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Order</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((c) => (
                    <tr key={c.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {c.coverImage ? <img src={c.coverImage} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-400">—</span>}
                          <div>
                            <div className="font-medium text-stone-900">{localizedName(c.translations, 'name', 'AR')}</div>
                            {c.featured && <div className="text-[10px] uppercase tracking-wider text-amber-600">featured</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-stone-600">{c.slug}</td>
                      <td className="px-3 py-3 text-stone-600">{c.materialCount}</td>
                      <td className="px-3 py-3"><Badge tone={statusTone(c.status)}>{c.status}</Badge></td>
                      <td className="px-3 py-3 text-stone-600">{c.displayOrder}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button title="Edit" onClick={() => navigate(`/admin/collections/${c.id}`)} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"><Pencil className="h-4 w-4" /></button>
                          {trash && (
                            <button title="Restore" onClick={async () => { await collectionsApi.trash(c.id); toast('Restored', 'success'); reload(); }} className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"><Trash2 className="h-4 w-4" /></button>
                          )}
                          {!trash && (
                            <button title="Trash" onClick={() => setDeleteId(c.id)} className="rounded p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
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
        message="The collection will no longer appear on the public site."
        confirmLabel="Move to trash"
        onConfirm={() => void remove()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

interface CollectionForm {
  slug: string;
  coverImage: string;
  featured: boolean;
  displayOrder: number;
  status: MaterialStatus;
  translations: CollectionPayload['translations'];
  materialIds: string[];
}

export function CollectionsEditorPage({ id }: { id: string }) {
  const { navigate } = useRoute();
  const { toast } = useToast();
  const isNew = id === 'new';

  const existing = useAsync<AdminCollection | null>(async () => (isNew ? null : collectionsApi.get(id)), [id]);
  const materials = useAsync(async () => {
    const current = await materialsApi.list({ page: 1, pageSize: 200 });
    return current.items;
  }, []);

  const [form, setForm] = useState<CollectionForm | null>(null);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew && !form && materials.data) {
      setForm({
        slug: '', coverImage: '', featured: false, displayOrder: 0, status: 'DRAFT',
        translations: [
          { lang: 'AR', name: '', description: '', seoTitle: '', seoDescription: '', noIndex: false },
          { lang: 'EN', name: '', description: '', seoTitle: '', seoDescription: '', noIndex: false },
        ],
        materialIds: [],
      });
    }
    if (existing.data && !form) {
      const c = existing.data;
      setForm({
        slug: c.slug,
        coverImage: c.coverImage ?? '',
        featured: c.featured,
        displayOrder: c.displayOrder,
        status: c.status,
        translations: c.translations.map((t) => ({ lang: t.lang, name: t.name, description: t.description, seoTitle: t.seoTitle, seoDescription: t.seoDescription, noIndex: t.noIndex })),
        materialIds: c.materials.map((m) => m.id),
      });
      setMaterialIds(c.materials.map((m) => m.id));
    }
  }, [isNew, form, existing.data, materials.data]);

  if ((!isNew && (existing.loading || !existing.data)) || !materials.data || !form) return <Loading label={isNew ? 'Preparing…' : 'Loading collection…'} />;

  function setTranslation(lang: Lang, field: 'name' | 'description' | 'seoTitle' | 'seoDescription' | 'noIndex', value: string | boolean) {
    setForm((prev) => prev && { ...prev, translations: prev.translations.map((t) => (t.lang === lang ? { ...t, [field]: value } : t)) });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const payload: CollectionPayload = {
        slug: form.slug || slugify(form.translations.find((t) => t.lang === 'EN')?.name ?? 'collection'),
        coverImage: form.coverImage?.trim() || null,
        featured: form.featured,
        displayOrder: Number(form.displayOrder) || 0,
        status: form.status,
        translations: form.translations.map((t) => ({
          lang: t.lang, name: t.name, description: t.description?.trim() || null, seoTitle: t.seoTitle?.trim() || null, seoDescription: t.seoDescription?.trim() || null, noIndex: t.noIndex,
        })),
        materialIds,
      };
      if (isNew) await collectionsApi.create(payload);
      else await collectionsApi.update(id, payload);
      toast(isNew ? 'Collection created.' : 'Collection saved.', 'success');
      navigate('/admin/collections');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  const materialOptions = materials.data ?? [];

  return (
    <div>
      <PageHeader title={isNew ? 'New collection' : 'Edit collection'} subtitle={existing.data?.slug ?? ''}>
        <Button variant="outline" onClick={() => navigate('/admin/collections')}><ArrowLeft className="h-4 w-4" /> Back</Button>
      </PageHeader>
      <form onSubmit={save}>
        <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Identity">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Slug">
                <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="e.g. classic-marbles" />
              </Field>
              <Field label="Cover image URL">
                <Input value={form.coverImage} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} placeholder="/uploads/… or https://…" />
              </Field>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MaterialStatus })}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Display order">
                <Input type="number" value={form.displayOrder} onChange={(e) => setForm({ ...form, displayOrder: Number(e.target.value) || 0 })} />
              </Field>
            </div>
            <div className="mt-4">
              <Toggle checked={form.featured} onChange={(v) => setForm({ ...form, featured: v })} label="Featured on homepage" />
            </div>
            {form.coverImage && (
              <div className="mt-4">
                <img src={form.coverImage} alt="" className="h-32 w-56 rounded object-cover" />
              </div>
            )}
          </Card>

          <Card title="Translations">
            {(['AR', 'EN'] as Lang[]).map((lang) => (
              <div key={lang} className="mb-6 last:mb-0">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-stone-500">{lang === 'AR' ? 'العربية' : 'English'}</span>
                <div className="grid gap-4">
                  <Field label="Name">
                    <Input value={form.translations.find((t) => t.lang === lang)?.name ?? ''} onChange={(e) => setForm({ ...form, translations: form.translations.map((t) => (t.lang === lang ? { ...t, name: e.target.value } : t)) })} />
                  </Field>
                  <Field label="Description">
                    <Textarea rows={3} value={form.translations.find((t) => t.lang === lang)?.description ?? ''} onChange={(e) => setForm({ ...form, translations: form.translations.map((t) => (t.lang === lang ? { ...t, description: e.target.value } : t)) })} />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="SEO title">
                      <Input value={form.translations.find((t) => t.lang === lang)?.seoTitle ?? ''} onChange={(e) => setForm({ ...form, translations: form.translations.map((t) => (t.lang === lang ? { ...t, seoTitle: e.target.value } : t)) })} />
                    </Field>
                    <Field label="SEO description">
                      <Input value={form.translations.find((t) => t.lang === lang)?.seoDescription ?? ''} onChange={(e) => setForm({ ...form, translations: form.translations.map((t) => (t.lang === lang ? { ...t, seoDescription: e.target.value } : t)) })} />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>

        <Card title={`Materials (${materialIds.length})`}>
          <div className="max-h-[32rem] space-y-1 overflow-y-auto">
            {materialOptions.map((m) => {
              const label = `${localizedName(m.translations, 'name', 'AR')} — ${localizedName(m.translations, 'name', 'EN')}`;
              const checked = materialIds.includes(m.id);
              return (
                <label key={m.id} className={cx('flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer', checked ? 'bg-stone-100' : 'hover:bg-stone-50')}>
                  <input type="checkbox" className="rounded border-stone-300" checked={checked} onChange={() => setMaterialIds((ids) => (checked ? ids.filter((x) => x !== m.id) : [...ids, m.id]))} />
                  <span className="truncate">{label}</span>
                </label>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="sticky bottom-4 mt-6 flex justify-end gap-2 rounded-lg border border-stone-200 bg-white/95 p-4 shadow">
        <Button type="button" variant="outline" onClick={() => navigate('/admin/collections')}>Cancel</Button>
        <Button type="submit" loading={saving}>{isNew ? 'Create collection' : 'Save changes'}</Button>
      </div>
      </form>
    </div>
  );
}