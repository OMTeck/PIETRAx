import { useMemo, useState } from 'react';
import { Plus, Pencil, Lock } from 'lucide-react';
import { taxonomyApi } from '@/admin/server';
import { useAsync, slugify } from '@/admin/lib';
import { Button, Input, Select, Field, PageHeader, Card, Loading, EmptyState, Modal, Badge, useToast, cx } from '@/admin/ui';
import type { TaxonomyNode } from '@/admin/types';

const GROUP_LABELS: Record<string, string> = {
  materialTypes: 'Material types',
  categories: 'Categories',
  colors: 'Colours',
  finishes: 'Finishes',
  sizes: 'Sizes',
  applications: 'Applications',
  projectTypes: 'Project types',
};

const GROUP_ORDER = ['materialTypes', 'categories', 'colors', 'finishes', 'sizes', 'applications', 'projectTypes'];

type Row = TaxonomyNode & { usageCount?: number };

export function TaxonomyPage() {
  const { toast } = useToast();
  const { data, loading, error, reload } = useAsync<Record<string, Row[]>>(() => taxonomyApi.getAll(), []);
  const [group, setGroup] = useState<string>('materialTypes');
  const [editing, setEditing] = useState<{ group: string; row: Row | null } | null>(null);
  const [query, setQuery] = useState('');

  const rows = useMemo(() => (data ? (data[group] ?? []) : []), [data, group]);
  const filtered = useMemo(
    () => rows.filter((r) => !query || r.labelAr.toLowerCase().includes(query.toLowerCase()) || r.labelEn.toLowerCase().includes(query.toLowerCase()) || r.code.toLowerCase().includes(query.toLowerCase())),
    [rows, query],
  );

  if (loading) return <Loading label="Loading taxonomy…" />;
  if (error) {
    return <PageHeader title="Taxonomy"><p className="text-sm text-red-700">{error}</p></PageHeader>;
  }

  return (
    <div>
      <PageHeader title="Taxonomy" subtitle="Curated label lists used across the catalog">
        <Button onClick={() => setEditing({ group, row: null })}><Plus className="h-4 w-4" /> New entry</Button>
      </PageHeader>

      <div className="grid gap-6 md:grid-cols-[220px_1fr]">
        <Card className="p-2">
          <nav className="space-y-0.5">
            {GROUP_ORDER.map((g) => (
              <button
                key={g}
                onClick={() => { setGroup(g); setQuery(''); }}
                className={cx(
                  'flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors',
                  group === g ? 'bg-stone-900 text-ivory' : 'text-stone-600 hover:bg-stone-100',
                )}
              >
                <span>{GROUP_LABELS[g]}</span>
                <span className={cx('text-[10px] font-medium', group === g ? 'text-stone-300' : 'text-stone-400')}>
                  {data?.[g]?.length ?? 0}
                </span>
              </button>
            ))}
          </nav>
        </Card>

        <div>
          <div className="mb-3">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${GROUP_LABELS[group]}…`} />
          </div>
          <Card className="overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState title={`No ${GROUP_LABELS[group].toLowerCase()} yet`} />
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                    <th className="px-4 py-2.5 font-medium">Label</th>
                    <th className="px-3 py-2.5 font-medium">AR</th>
                    <th className="px-3 py-2.5 font-medium">EN</th>
                    <th className="px-3 py-2.5 font-medium">Code</th>
                    <th className="px-3 py-2.5 font-medium">Used</th>
                    <th className="px-3 py-2.5 font-medium">Order</th>
                    <th className="px-4 py-2.5 text-right font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <tr key={row.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 font-medium text-stone-900">
                          {row.labelAr}
                          {row.system && <span title="System entry"><Lock className="h-3 w-3 text-stone-400" /></span>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-stone-600">{row.labelAr}</td>
                      <td className="px-3 py-2.5 text-stone-600">{row.labelEn}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-stone-500">{row.code}</td>
                      <td className="px-3 py-2.5">{row.usageCount != null && <Badge tone={row.usageCount > 0 ? 'green' : 'gray'}>{row.usageCount}</Badge>}</td>
                      <td className="px-3 py-2.5 text-stone-500">{row.sortOrder}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => setEditing({ group, row })} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {editing && (
        <TaxonomyEditor
          group={editing.group}
          row={editing.row}
          onClose={() => setEditing(null)}
          onSaved={() => { toast('Saved.', 'success'); setEditing(null); reload(); }}
        />
      )}
    </div>
  );
}

function TaxonomyEditor({ group, row, onClose, onSaved }: { group: string; row: Row | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const isSize = group === 'sizes';
  const [code, setCode] = useState(row?.code ?? '');
  const [slug, setSlug] = useState((row as Row & { slug?: string })?.slug ?? '');
  const [labelAr, setLabelAr] = useState(row?.labelAr ?? '');
  const [labelEn, setLabelEn] = useState(row?.labelEn ?? '');
  const [sortOrder, setSortOrder] = useState(row?.sortOrder ?? 0);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      if (row) {
        const body: Record<string, unknown> = { sortOrder: Number(sortOrder) || 0 };
        if (isSize) {
          body.label = labelEn;
        } else {
          body.labelAr = labelAr;
          body.labelEn = labelEn;
          if (!row.system) body.slug = slug || slugify(labelEn);
        }
        await taxonomyApi.update(group, row.id, body);
      } else {
        const body: Record<string, unknown> = { sortOrder: Number(sortOrder) || 0 };
        if (isSize) {
          body.code = code || slugify(labelEn.replace(/^[x*]/i, ''));
          body.label = labelEn;
        } else {
          body.code = code || slugify(labelEn);
          body.labelAr = labelAr;
          body.labelEn = labelEn;
        }
        await taxonomyApi.create(group, body);
      }
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={row ? 'Edit entry' : 'New entry'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving}>{row ? 'Save changes' : 'Create'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label AR">
            <Input value={labelAr} onChange={(e) => setLabelAr(e.target.value)} />
          </Field>
          <Field label="Label EN">
            <Input value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
          </Field>
          {isSize && !row && (
            <Field label="Code (e.g. 60x120)" hint="Falls back to an EN-slug when empty">
              <Input value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
          )}
          <Field label="Sort order">
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
          </Field>
          {(!isSize || row) && (
            <Field label="Slug" hint={row?.system ? 'Locked for system entries.' : undefined}>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={Boolean(row?.system)} />
            </Field>
          )}
        </div>
      </div>
    </Modal>
  );
}