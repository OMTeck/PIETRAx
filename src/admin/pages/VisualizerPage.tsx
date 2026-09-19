import { useState } from 'react';
import { Pencil, Plus, Trash2, ArrowLeft, Save } from 'lucide-react';
import { visualizerApi } from '@/admin/server';
import { useAsync, slugify } from '@/admin/lib';
import {
  Button, Input, Select, Field, PageHeader, Card, Loading, EmptyState, ConfirmDialog, Toggle, useToast, cx,
} from '@/admin/ui';
import type { RoomRow, RoomPayload, SurfaceType, RoomType, VisualizerMaterialRow } from '@/admin/types';

const ROOM_TYPES: RoomType[] = ['KITCHEN', 'BATHROOM', 'LIVING_ROOM', 'BEDROOM', 'OFFICE', 'HOTEL_LOBBY', 'OUTDOOR'];
const SURFACE_TYPES: SurfaceType[] = ['FLOOR', 'WALL', 'FEATURE_WALL', 'COUNTERTOP', 'ISLAND', 'BACKSPLASH'];

export function VisualizerPage() {
  const { toast } = useToast();
  const { data: rooms, loading, error, reload } = useAsync<RoomRow[]>(() => visualizerApi.rooms(), []);
  const { data: materials, reload: reloadMaterials } = useAsync<VisualizerMaterialRow[]>(() => visualizerApi.materials(), []);

  const [editing, setEditing] = useState<RoomRow | 'new' | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [configMaterial, setConfigMaterial] = useState<string>('');

  if (loading) return <Loading label="Loading rooms…" />;
  if (error) {
    return <PageHeader title="Visualizer"><p className="text-sm text-red-700">{error}</p></PageHeader>;
  }

  return (
    <div>
      <PageHeader title="Visualizer" subtitle="Room templates for the try-in-your-room tool">
        <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> New room</Button>
      </PageHeader>

      <Card className="overflow-hidden">
        {!rooms || rooms.length === 0 ? (
          <EmptyState title="No rooms yet" message="Create your first room template." />
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-[11px] uppercase tracking-wider text-stone-500">
                <th className="px-5 py-3 font-medium">Room</th>
                <th className="px-3 py-3 font-medium">Type</th>
                <th className="px-3 py-3 font-medium">Surfaces</th>
                <th className="px-3 py-3 font-medium">Enabled</th>
                <th className="px-3 py-3 font-medium">Order</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr key={room.id} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      {room.previewImage ? (
                        <img src={room.previewImage} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-stone-100 text-[10px] text-stone-400">—</span>
                      )}
                      <div>
                        <div className="font-medium text-stone-900">{room.nameAr} — {room.nameEn}</div>
                        <div className="text-xs text-stone-500">{room.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-stone-600">{room.roomType}</td>
                  <td className="px-3 py-3 text-stone-600">{room.surfaces.length}</td>
                  <td className="px-3 py-3">{room.enabled ? <span className="text-sm text-emerald-600">●</span> : <span className="text-sm text-stone-300">○</span>}</td>
                  <td className="px-3 py-3 text-stone-600">{room.sortOrder}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <button title="Edit" onClick={() => setEditing(room)} className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"><Pencil className="h-4 w-4" /></button>
                      <button title="Delete" onClick={() => setDeletingId(room.id)} className="rounded p-1.5 text-stone-500 hover:bg-red-50 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-6">
        <Card
          title="Material visualizer config"
          actions={
            materials && materials.length > 0 && (
              <Select value={configMaterial} onChange={(e) => setConfigMaterial(e.target.value)} className="w-72">
                <option value="">Pick a material…</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.translations.find((t) => t.lang === 'AR')?.name ?? m.slug}
                  </option>
                ))}
              </Select>
            )
          }
        >
          {materials && materials.length === 0 && <p className="text-sm text-stone-500">Create materials first—each one gets its own visualizer config.</p>}
          {materials && materials.length > 0 && configMaterial && (
            <MaterialConfig
              key={configMaterial}
              materialId={configMaterial}
              initial={materials.find((m) => m.id === configMaterial)?.config ?? null}
              onSaved={() => { toast('Config saved.', 'success'); reloadMaterials(); }}
            />
          )}
          {(!configMaterial || (materials && materials.length === 0)) && <p className="text-sm text-stone-400">Select a material to edit its texture, scale, and grout settings used by the in-browser visualizer.</p>}
        </Card>
      </div>

      {editing && <RoomEditor room={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); reload(); }} materials={materials ?? []} />}

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete room"
        message="This will permanently remove the room template and its surfaces."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deletingId) return;
          try {
            await visualizerApi.deleteRoom(deletingId);
            toast('Room deleted.', 'success');
            reload();
          } catch (err) {
            toast(err instanceof Error ? err.message : 'Failed to delete.', 'error');
          } finally {
            setDeletingId(null);
          }
        }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
}

// ---- Room editor ------------------------------------------------------------

interface SurfaceForm {
  surfaceType: SurfaceType;
  nameAr: string;
  nameEn: string;
  clipPath: string;
  enabled: boolean;
  sortOrder: number;
  defaultMaterialId: string;
}

function RoomEditor({
  room,
  onClose,
  onSaved,
  materials,
}: {
  room: RoomRow | null;
  onClose: () => void;
  onSaved: () => void;
  materials: VisualizerMaterialRow[];
}) {
  const { toast } = useToast();
  const [slug, setSlug] = useState(room?.slug ?? '');
  const [roomType, setRoomType] = useState<RoomType>(room?.roomType ?? 'LIVING_ROOM');
  const [nameAr, setNameAr] = useState(room?.nameAr ?? '');
  const [nameEn, setNameEn] = useState(room?.nameEn ?? '');
  const [previewImage, setPreviewImage] = useState(room?.previewImage ?? '');
  const [fullImage, setFullImage] = useState(room?.fullImage ?? '');
  const [enabled, setEnabled] = useState(room?.enabled ?? true);
  const [sortOrder, setSortOrder] = useState(room?.sortOrder ?? 0);
  const [surfaces, setSurfaces] = useState<SurfaceForm[]>(
    room?.surfaces.map((s) => ({
      surfaceType: s.surfaceType,
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      clipPath: s.clipPath,
      enabled: s.enabled,
      sortOrder: s.sortOrder,
      defaultMaterialId: s.defaultMaterialId ?? '',
    })) ?? [{ surfaceType: 'FLOOR', nameAr: 'أرضية', nameEn: 'Floor', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', enabled: true, sortOrder: 0, defaultMaterialId: '' }],
  );
  const [saving, setSaving] = useState(false);

  const materialName = (id: string) => materials.find((m) => m.id === id)?.translations.find((t) => t.lang === 'AR')?.name ?? '';

  async function save() {
    setSaving(true);
    try {
      const payload: RoomPayload = {
        slug: slug || slugify(nameEn),
        roomType,
        nameAr,
        nameEn,
        previewImage: previewImage || null,
        fullImage: fullImage || null,
        enabled,
        sortOrder: Number(sortOrder) || 0,
        surfaces: surfaces.map((s) => ({
          surfaceType: s.surfaceType,
          nameAr: s.nameAr,
          nameEn: s.nameEn,
          clipPath: (s.clipPath ?? '').trim() || 'polygon(0 0, 100% 0, 100% 100%, 0 100%)',
          enabled: s.enabled,
          sortOrder: s.sortOrder,
          defaultMaterialId: s.defaultMaterialId || null,
        })),
      };
      if (room) await visualizerApi.updateRoom(room.id, payload);
      else await visualizerApi.createRoom(payload);
      toast(room ? 'Room saved.' : 'Room created.', 'success');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-stone-900/50 p-4 pt-[5vh]" onMouseDown={onClose}>
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <h2 className="text-sm font-semibold text-stone-900">{room ? 'Edit room' : 'New room'}</h2>
          <button onClick={onClose} className="rounded p-1 text-stone-500 hover:bg-stone-100"><ArrowLeft className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug">
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} />
            </Field>
            <Field label="Room type">
              <Select value={roomType} onChange={(e) => setRoomType(e.target.value as RoomType)}>
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Name AR">
              <Input value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
            </Field>
            <Field label="Name EN">
              <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
            </Field>
            <Field label="Preview image URL">
              <Input value={previewImage} onChange={(e) => setPreviewImage(e.target.value)} />
            </Field>
            <Field label="Full image URL">
              <Input value={fullImage} onChange={(e) => setFullImage(e.target.value)} />
            </Field>
            <Field label="Sort order">
              <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} />
            </Field>
            <div className="flex items-end pb-1">
              <Toggle checked={enabled} onChange={setEnabled} label="Enabled" />
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-stone-800">Surfaces</h3>
              <Button type="button" variant="outline" size="sm" onClick={() => setSurfaces((s) => [...s, { surfaceType: 'FLOOR', nameAr: '', nameEn: '', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', enabled: true, sortOrder: surfaces.length, defaultMaterialId: '' }])}>
                <Plus className="h-3.5 w-3.5" /> Add surface
              </Button>
            </div>
            <div className="space-y-3">
              {surfaces.map((s, idx) => (
                <div key={idx} className={cx('rounded border p-3', s.enabled ? 'border-stone-200' : 'border-stone-100 bg-stone-50')}>
                  <div className="grid gap-3 sm:grid-cols-4">
                    <Field label="Type">
                      <Select value={s.surfaceType} onChange={(e) => setSurfaces((rows) => rows.map((r, i) => (i === idx ? { ...r, surfaceType: e.target.value as SurfaceType } : r)))}>
                        {SURFACE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </Select>
                    </Field>
                    <Field label="Name AR">
                      <Input value={s.nameAr} onChange={(e) => setSurfaces((rows) => rows.map((r, i) => (i === idx ? { ...r, nameAr: e.target.value } : r)))} />
                    </Field>
                    <Field label="Name EN">
                      <Input value={s.nameEn} onChange={(e) => setSurfaces((rows) => rows.map((r, i) => (i === idx ? { ...r, nameEn: e.target.value } : r)))} />
                    </Field>
                    <Field label="Default material">
                      <Select value={s.defaultMaterialId} onChange={(e) => setSurfaces((rows) => rows.map((r, i) => (i === idx ? { ...r, defaultMaterialId: e.target.value } : r)))}>
                        <option value="">None</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{materialName(m.id)}</option>)}
                      </Select>
                    </Field>
                    <Field label="Clip path (SVG) — col span">
                      <Input value={s.clipPath} onChange={(e) => setSurfaces((rows) => rows.map((r, i) => (i === idx ? { ...r, clipPath: e.target.value } : r)))} placeholder="polygon(0 0, 100% 0, 100% 40%, 0 40%)" />
                    </Field>
                    <div className="flex items-end gap-3 pb-1">
                      <Toggle checked={s.enabled} onChange={(v) => setSurfaces((rows) => rows.map((r, i) => (i === idx ? { ...r, enabled: v } : r)))} label="Enabled" />
                      <button type="button" onClick={() => setSurfaces((rows) => rows.filter((_, i) => i !== idx))} className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700" title="Remove surface">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-stone-200 px-6 py-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} loading={saving}>{room ? 'Save changes' : 'Create room'}</Button>
        </div>
      </div>
    </div>
  );
}

// ---- Material config ----------------------------------------------------------

function MaterialConfig({ materialId, initial, onSaved }: { materialId: string; initial: Record<string, unknown> | null; onSaved: () => void }) {
  const { toast } = useToast();
  const [fields, setFields] = useState(() => {
    const c = initial ?? {};
    return {
      enabled: c.enabled !== false,
      textureUrl: String(c.textureUrl ?? ''),
      physicalScale: String(c.physicalScale ?? ''),
      patternScale: String(c.patternScale ?? ''),
      tileWidth: String(c.tileWidth ?? ''),
      tileHeight: String(c.tileHeight ?? ''),
      groutWidth: String(c.groutWidth ?? ''),
      groutColor: String(c.groutColor ?? ''),
      rotation: String(c.rotation ?? ''),
      defaultZoom: String(c.defaultZoom ?? ''),
      bookmatch: c.bookmatch === true,
    };
  });
  const cfg = fields;

  function num(v: string): number | null {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  async function save() {
    try {
      await visualizerApi.saveConfig(materialId, {
        enabled: cfg.enabled,
        textureUrl: cfg.textureUrl.trim() || null,
        physicalScale: num(cfg.physicalScale),
        patternScale: num(cfg.patternScale),
        tileWidth: num(cfg.tileWidth),
        tileHeight: num(cfg.tileHeight),
        groutWidth: num(cfg.groutWidth),
        groutColor: cfg.groutColor.trim() || null,
        rotation: num(cfg.rotation),
        defaultZoom: num(cfg.defaultZoom),
        bookmatch: cfg.bookmatch,
      });
      toast('Config saved.', 'success');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    }
  }

  return (
    <div>
      <div className="mb-3">
        <Toggle checked={cfg.enabled} onChange={(v) => setFields({ ...fields, enabled: v })} label="Material usable in visualizer" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Texture URL">
          <Input value={cfg.textureUrl} onChange={(e) => setFields({ ...fields, textureUrl: e.target.value })} placeholder="/uploads/…" />
        </Field>
        <Field label="Physical scale">
          <Input value={cfg.physicalScale} onChange={(e) => setFields({ ...fields, physicalScale: e.target.value })} />
        </Field>
        <Field label="Pattern scale">
          <Input value={cfg.patternScale} onChange={(e) => setFields({ ...fields, patternScale: e.target.value })} />
        </Field>
        <Field label="Tile width">
          <Input value={cfg.tileWidth} onChange={(e) => setFields({ ...fields, tileWidth: e.target.value })} />
        </Field>
        <Field label="Tile height">
          <Input value={cfg.tileHeight} onChange={(e) => setFields({ ...fields, tileHeight: e.target.value })} />
        </Field>
        <Field label="Grout width">
          <Input value={cfg.groutWidth} onChange={(e) => setFields({ ...fields, groutWidth: e.target.value })} />
        </Field>
        <Field label="Grout color">
          <Input value={cfg.groutColor} onChange={(e) => setFields({ ...fields, groutColor: e.target.value })} placeholder="#cccccc" />
        </Field>
        <Field label="Rotation (deg)">
          <Input value={cfg.rotation} onChange={(e) => setFields({ ...fields, rotation: e.target.value })} />
        </Field>
        <Field label="Default zoom">
          <Input value={cfg.defaultZoom} onChange={(e) => setFields({ ...fields, defaultZoom: e.target.value })} />
        </Field>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <Toggle checked={cfg.bookmatch} onChange={(v) => setFields({ ...fields, bookmatch: v })} label="Bookmatch tiles" />
        <Button onClick={() => void save()}><Save className="h-4 w-4" /> Save config</Button>
      </div>
    </div>
  );
}