import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Pencil, Trash2, ArrowLeft, Search } from 'lucide-react';
import { useRoute } from '@/context/RouteContext';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { projectsApi, materialsApi, taxonomyApi } from '@/admin/server';
import { usePaged, useAsync, localizedName, slugify } from '@/admin/lib';
import {
  Button, Input, Select, Textarea, Field, Badge, statusTone, PageHeader, Card, Loading, EmptyState, Paginator, ConfirmDialog, Toggle, useToast, cx, fmtDateTime,
} from '@/admin/ui';
import { can, PERM } from '@/admin/permissions';
import type { AdminProject, ProjectPayload, Lang, ProjectStatus } from '@/admin/types';

const STATUSES: ProjectStatus[] = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

export function ProjectsListPage() {
  const { navigate } = useRoute();
  const { user } = useAdminAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [trash, setTrash] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canCreate = !!user && can(user.role, PERM.projectsCreate);

  const { data, loading, error, page, setPage, reload } = usePaged<AdminProject>(
    (p, ps, extra) => projectsApi.list({ search: String(extra.search ?? ''), trash: Boolean(extra.trash) || undefined, page: p, pageSize: ps }),
    { pageSize: 10 },
  );

  async function remove() {
    if (!deleteId) return;
    try {
      await projectsApi.trash(deleteId);
      toast('Project moved to trash.', 'success');
      setDeleteId(null);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete.', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="Projects" subtitle="Completed works shown on the site">
        {canCreate && <Button onClick={() => navigate('/admin/projects/new')}><Plus className="h-4 w-4" /> New project</Button>}
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="relative" onSubmit={(e) => { e.preventDefault(); reload({ search, trash }); }}>
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search projects…" className="pl-8" />
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
              <EmptyState title={trash ? 'Trash is empty' : 'No projects found'} />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                    <th className="px-5 py-3 font-medium">Project</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Location</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Featured</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((p) => (
                    <tr key={p.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {p.coverImage ? <img src={p.coverImage} alt="" className="h-10 w-10 shrink-0 rounded object-cover" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-400">—</span>}
                          <div>
                            <div className="font-medium text-stone-900">{localizedName(p.translations, 'title', 'AR')}</div>
                            <div className="text-xs text-stone-500">{p.slug}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-stone-600">{p.projectType.labelAr}</td>
                      <td className="px-3 py-3 text-stone-600">{p.location ?? '—'}</td>
                      <td className="px-3 py-3"><Badge tone={statusTone(p.status)}>{p.status}</Badge></td>
                      <td className="px-3 py-3">{p.featured ? <Badge tone="amber">Featured</Badge> : <span className="text-xs text-stone-400">—</span>}</td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <button title="Edit" onClick={() => navigate(`/admin/projects/${p.id}`)} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"><Pencil className="h-4 w-4" /></button>
                          <button title="Trash" onClick={() => setDeleteId(p.id)} className="rounded p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
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
        message="The project will no longer appear on the public site."
        confirmLabel="Move to trash"
        onConfirm={() => void remove()}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

interface ProjectForm {
  slug: string;
  projectTypeId: string;
  location: string;
  coverImage: string;
  completionDate: string;
  featured: boolean;
  status: ProjectStatus;
  translations: ProjectPayload['translations'];
}

interface ImageRow {
  url: string;
  altAr: string;
  altEn: string;
  sortOrder: number;
}

export function ProjectsEditorPage({ id }: { id: string }) {
  const { navigate } = useRoute();
  const { toast } = useToast();
  const isNew = id === 'new';

  const existing = useAsync<AdminProject | null>(async () => (isNew ? null : projectsApi.get(id)), [id]);
  const projectTypes = useAsync(async () => (await taxonomyApi.getAll()).projectTypes, []);
  const materials = useAsync(async () => (await materialsApi.list({ page: 1, pageSize: 200 })).items, []);

  const [form, setForm] = useState<ProjectForm | null>(null);
  const [images, setImages] = useState<ImageRow[]>([]);
  const [materialIds, setMaterialIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isNew && !form && projectTypes.data) {
      setForm({
        slug: '', projectTypeId: projectTypes.data[0]?.id ?? '', location: '', coverImage: '', completionDate: '', featured: false, status: 'DRAFT',
        translations: [
          { lang: 'AR', title: '', shortDescription: '', seoTitle: '', seoDescription: '', noIndex: false },
          { lang: 'EN', title: '', shortDescription: '', seoTitle: '', seoDescription: '', noIndex: false },
        ],
      });
    }
    if (existing.data && !form) {
      const p = existing.data;
      setForm({
        slug: p.slug,
        projectTypeId: p.projectType.id,
        location: p.location ?? '',
        coverImage: p.coverImage ?? '',
        completionDate: p.completionDate ? String(p.completionDate).slice(0, 10) : '',
        featured: p.featured,
        status: p.status,
        translations: p.translations.map((t) => ({ lang: t.lang, title: t.title, shortDescription: t.shortDescription, seoTitle: t.seoTitle, seoDescription: t.seoDescription, noIndex: t.noIndex })),
      });
      setImages(p.images.map((img) => ({ url: img.url, altAr: img.altAr ?? '', altEn: img.altEn ?? '', sortOrder: img.sortOrder })));
      setMaterialIds(p.materials.map((m) => m.id));
    }
  }, [isNew, form, existing.data, projectTypes.data]);

  if ((!isNew && (existing.loading || !existing.data)) || !projectTypes.data || !form || (!materials.data && !isNew)) return <Loading label={isNew ? 'Preparing…' : 'Loading project…'} />;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const payload: ProjectPayload = {
        slug: form.slug || slugify(form.translations.find((t) => t.lang === 'EN')?.title ?? 'project'),
        projectTypeId: form.projectTypeId,
        location: form.location.trim() || null,
        coverImage: form.coverImage.trim() || null,
        completionDate: form.completionDate ? new Date(form.completionDate + 'T00:00:00Z').toISOString() : null,
        featured: form.featured,
        status: form.status,
        translations: form.translations.map((t) => ({
          lang: t.lang, title: t.title, shortDescription: t.shortDescription?.trim() || null, seoTitle: t.seoTitle?.trim() || null, seoDescription: t.seoDescription?.trim() || null, noIndex: t.noIndex,
        })),
        materialIds,
        images: images.filter((i) => i.url.trim()).map((i) => ({ url: i.url.trim(), altAr: i.altAr || null, altEn: i.altEn || null, sortOrder: Number(i.sortOrder) || 0 })),
      };
      if (isNew) await projectsApi.create(payload);
      else await projectsApi.update(id, payload);
      toast(isNew ? 'Project created.' : 'Project saved.', 'success');
      navigate('/admin/projects');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title={isNew ? 'New project' : 'Edit project'} subtitle={existing.data?.slug ?? ''}>
        <Button variant="outline" onClick={() => navigate('/admin/projects')}><ArrowLeft className="h-4 w-4" /> Back</Button>
      </PageHeader>

      <form onSubmit={save}>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card title="Identity">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Slug">
                  <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="e.g. burj-living" />
                </Field>
                <Field label="Project type">
                  <Select value={form.projectTypeId} onChange={(e) => setForm({ ...form, projectTypeId: e.target.value })}>
                    {projectTypes.data.map((t) => <option key={t.id} value={t.id}>{t.labelAr} — {t.labelEn}</option>)}
                  </Select>
                </Field>
                <Field label="Location">
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Riyadh, KSA" />
                </Field>
                <Field label="Cover image URL">
                  <Input value={form.coverImage} onChange={(e) => setForm({ ...form, coverImage: e.target.value })} placeholder="/uploads/… or https://…" />
                </Field>
                <Field label="Completion date">
                  <Input type="date" value={form.completionDate} onChange={(e) => setForm({ ...form, completionDate: e.target.value })} />
                </Field>
                <Field label="Status">
                  <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ProjectStatus })}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                </Field>
              </div>
              <div className="mt-4">
                <Toggle checked={form.featured} onChange={(v) => setForm({ ...form, featured: v })} label="Featured on homepage" />
              </div>
            </Card>

            <Card title="Translations">
              {(['AR', 'EN'] as Lang[]).map((lang) => {
                const tr = form.translations.find((t) => t.lang === lang);
                return (
                  <div key={lang} className="mb-6 last:mb-0">
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-stone-500">{lang === 'AR' ? 'العربية' : 'English'}</span>
                    <div className="grid gap-4">
                      <Field label="Title">
                        <Input value={tr?.title ?? ''} onChange={(e) => setForm({ ...form, translations: form.translations.map((t) => (t.lang === lang ? { ...t, title: e.target.value } : t)) })} />
                      </Field>
                      <Field label="Short description">
                        <Textarea rows={3} value={tr?.shortDescription ?? ''} onChange={(e) => setForm({ ...form, translations: form.translations.map((t) => (t.lang === lang ? { ...t, shortDescription: e.target.value } : t)) })} />
                      </Field>
                    </div>
                  </div>
                );
              })}
            </Card>

            <Card title="Images">
              {images.length === 0 && <p className="mb-3 text-sm text-stone-500">No gallery images yet.</p>}
              <div className="space-y-3">
                {images.map((row, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-2 rounded border border-stone-200 p-2">
                    {row.url ? <img src={row.url} alt="" className="h-12 w-12 shrink-0 rounded object-cover" /> : <span className="flex h-12 w-12 shrink-0 items-center justify-center bg-stone-100 text-[10px] text-stone-400">No preview</span>}
                    <Input className="min-w-40 flex-1" placeholder="Image URL" value={row.url} onChange={(e) => setImages((rows) => rows.map((r, i) => (i === idx ? { ...r, url: e.target.value } : r)))} />
                    <Input className="w-28" placeholder="Alt AR" value={row.altAr} onChange={(e) => setImages((rows) => rows.map((r, i) => (i === idx ? { ...r, altAr: e.target.value } : r)))} />
                    <Input className="w-28" placeholder="Alt EN" value={row.altEn} onChange={(e) => setImages((rows) => rows.map((r, i) => (i === idx ? { ...r, altEn: e.target.value } : r)))} />
                    <button type="button" onClick={() => setImages((rows) => rows.filter((_, i) => i !== idx))} className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setImages((rows) => [...rows, { url: '', altAr: '', altEn: '', sortOrder: rows.length }])}>
                <Plus className="h-3.5 w-3.5" /> Add image
              </Button>
            </Card>
          </div>

          <Card title={`Materials (${materialIds.length})`}>
            <div className="max-h-[32rem] space-y-1 overflow-y-auto">
              {(materials.data ?? []).map((m) => {
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
          <Button type="button" variant="outline" onClick={() => navigate('/admin/projects')}>Cancel</Button>
          <Button type="submit" loading={saving}>{isNew ? 'Create project' : 'Save changes'}</Button>
        </div>
      </form>
    </div>
  );
}