import { useState } from 'react';
import { Upload, Trash2, Copy, Check } from 'lucide-react';
import { mediaApi } from '@/admin/server';
import { usePaged } from '@/admin/lib';
import { Button, Input, Select, Field, PageHeader, Card, Loading, EmptyState, Paginator, ConfirmDialog, Modal, Badge, useToast, cx, fmtDate, Spinner } from '@/admin/ui';
import type { MediaAssetRow, MediaKind } from '@/admin/types';

const KINDS: MediaKind[] = ['IMAGE', 'TEXTURE', 'SLAB', 'PROJECT', 'ROOM', 'OTHER'];

export function MediaPage() {
  const { toast } = useToast();
  const [kind, setKind] = useState<MediaKind | ''>('');
  const [search, setSearch] = useState('');
  const [uploadKind, setUploadKind] = useState<MediaKind>('IMAGE');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; fileName: string; inUse: boolean } | null>(null);
  const [force, setForce] = useState(false);
  const [copied, setCopied] = useState('');

  const { data, loading, error, page, setPage, reload } = usePaged<MediaAssetRow>(
    (p, ps, extra) =>
      mediaApi.list({ kind: (extra.kind as MediaKind) || undefined, search: String(extra.search ?? '') || undefined, page: p, pageSize: ps }),
    { pageSize: 24 },
  );

  async function doUpload() {
    if (files.length === 0) {
      toast('Choose at least one file.', 'error');
      return;
    }
    setUploading(true);
    try {
      const assets = await mediaApi.upload(uploadKind, files);
      toast(`${assets.length} file${assets.length === 1 ? '' : 's'} uploaded.`, 'success');
      setFiles([]);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Upload failed.', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function doDelete() {
    if (!confirmDelete) return;
    setConfirming(true);
    try {
      await mediaApi.remove(confirmDelete.id, force);
      toast('Asset deleted.', 'success');
      setConfirmDelete(null);
      setForce(false);
      reload();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed.', 'error');
    } finally {
      setConfirming(false);
    }
  }

  async function requestDelete(id: string, fileName: string) {
    try {
      await mediaApi.remove(id, false);
      toast('Asset deleted.', 'success');
      reload();
    } catch (err) {
      const inUse = err instanceof Error && err.message.includes('used by');
      setConfirmDelete({ id, fileName, inUse });
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(''), 1500);
    } catch {
      toast('Copy not supported.', 'error');
    }
  }

  return (
    <div>
      <PageHeader title="Media Library" subtitle="Upload once, reference anywhere by URL" />

      <Card title="Upload">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Category">
            <Select value={uploadKind} onChange={(e) => setUploadKind(e.target.value as MediaKind)}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Files (PNG/JPG/WebP)">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
                className="block w-full text-sm text-stone-500 file:mr-3 file:rounded file:border-0 file:bg-stone-900 file:px-3 file:py-2 file:text-xs file:text-ivory hover:file:bg-stone-700"
              />
            </Field>
            {files.length > 0 && <p className="mt-1 text-xs text-stone-500">{files.length} file{files.length === 1 ? '' : 's'} selected.</p>}
          </div>
          <div className="flex items-end">
            <Button onClick={() => void doUpload()} loading={uploading}><Upload className="h-4 w-4" /> Upload</Button>
          </div>
        </div>
      </Card>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Select value={kind} onChange={(e) => { setKind(e.target.value as MediaKind); reload({ kind: e.target.value, search }); }} className="w-40">
          <option value="">All categories</option>
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </Select>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') reload({ kind, search }); }}
          placeholder="Search by filename or URL…"
          className="w-64"
        />
        <Button variant="outline" size="sm" onClick={() => reload({ kind, search })}>Search</Button>
      </div>

      <div className="mt-4">
        {loading && <Loading />}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!loading && !error && data && (
          <>
            {data.items.length === 0 ? (
              <EmptyState title="No media found" />
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {data.items.map((asset) => (
                    <div key={asset.id} className="group overflow-hidden rounded-lg border border-stone-200 bg-white">
                      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
                        <img src={asset.url} alt={asset.filename} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                        <span className="absolute left-2 top-2"><Badge tone="gray">{asset.kind}</Badge></span>
                      </div>
                      <div className="p-3">
                        <div className="truncate text-xs font-medium text-stone-800" title={asset.filename}>{asset.filename}</div>
                        <div className="mt-0.5 text-[11px] text-stone-500">
                          {asset.width && asset.height ? `${asset.width}×${asset.height}` : ''} · {fmtDate(asset.createdAt)}
                        </div>
                        <div className="mt-2 flex items-center gap-1">
                          <button title="Copy URL" onClick={() => void copyUrl(asset.url)} className="rounded p-1 text-stone-500 hover:bg-stone-100">
                            {copied === asset.url ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                          <button title="Delete" onClick={() => void requestDelete(asset.id, asset.filename)} className="rounded p-1 text-stone-500 hover:bg-red-50 hover:text-red-700">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <span className="ml-auto truncate text-[10px] text-stone-400">{asset.url}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Paginator page={page} pages={data.pagination.pages} total={data.pagination.total} onPage={setPage} />
                </div>
              </>
            )}
          </>
        )}
      </div>

      <Modal
        open={confirmDelete !== null}
        onClose={() => !confirming && setConfirmDelete(null)}
        title="Delete asset"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={confirming}>Cancel</Button>
            <Button variant="danger" onClick={() => void doDelete()} loading={confirming}>Delete</Button>
          </>
        }
      >
        {confirmDelete?.inUse ? (
          <div className="space-y-3">
            <p className="text-sm text-stone-600">
              This image is referenced by catalog content. Deleting it removes the media record (the URL keeps working for existing embeds).
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-700">
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} className="rounded border-stone-300" />
              Force delete (still referenced)
            </label>
          </div>
        ) : (
          <p className="text-sm text-stone-600">Delete “{confirmDelete?.fileName}”? The file is removed from the server.</p>
        )}
      </Modal>
    </div>
  );
}