import { useEffect, useState } from 'react';
import { Save, Sparkles, Wand2, SlidersHorizontal, ShieldCheck, Plus, Trash2, Cpu, PlugZap } from 'lucide-react';
import { visualizerApi } from '@/admin/server';
import { useAsync } from '@/admin/lib';
import { Button, Input, Field, Toggle, Textarea, Select, Card, Loading, useToast, cx } from '@/admin/ui';
import type { VisualizerSettings, VisualizerSurfaceSetting, VisualizerSurfacePoint, VisionProvider, VisionProviderMeta, VisionProviderType } from '@/admin/types';

function num(v: string, fallback = 0): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Textarea that edits a JSON value, reporting parsed changes only when valid. */
function JsonArea({ value, onChange, rows = 4, placeholder }: { value: unknown; onChange: (v: unknown) => void; rows?: number; placeholder?: string }) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  useEffect(() => {
    setText(JSON.stringify(value, null, 2));
    setBad(false);
  }, [value]);
  return (
    <div>
      <Textarea
        rows={rows}
        className={cx('font-mono text-xs', bad && 'border-red-400')}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }}
      />
      {bad && <span className="mt-1 block text-xs text-red-700">Invalid JSON — changes not applied.</span>}
    </div>
  );
}

export function VisualizerSettingsPanel() {
  const { toast } = useToast();
  const { data, loading, error } = useAsync<VisualizerSettings>(() => visualizerApi.getSettings(), []);
  const { data: meta } = useAsync<VisionProviderMeta[]>(() => visualizerApi.visionMeta(), []);
  const [s, setS] = useState<VisualizerSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  useEffect(() => {
    if (data && !s) setS(data);
  }, [data, s]);

  if (loading) return <Loading label="Loading visualizer settings…" />;
  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!s) return null;

  const update = (patch: Partial<VisualizerSettings>) => setS({ ...s, ...patch });
  const setAnalysis = (patch: Partial<VisualizerSettings['analysis']>) => setS({ ...s, analysis: { ...s.analysis, ...patch } });
  const setEdit = (patch: Partial<VisualizerSettings['edit']>) => setS({ ...s, edit: { ...s.edit, ...patch } });
  const setFeatures = (patch: Partial<VisualizerSettings['features']>) => setS({ ...s, features: { ...s.features, ...patch } });
  const setBehavior = (patch: Partial<VisualizerSettings['behavior']>) => setS({ ...s, behavior: { ...s.behavior, ...patch } });
  const setSurfaces = (surfaces: VisualizerSurfaceSetting[]) => setBehavior({ surfaces });
  const setVision = (patch: Partial<VisualizerSettings['vision']>) => setS({ ...s, vision: { ...s.vision, ...patch } });
  const pm = (t: VisionProviderType) => (meta ?? []).find((m) => m.type === t);
  const setProviders = (providers: VisionProvider[]) => setVision({ providers });
  const updateProvider = (idx: number, patch: Partial<VisionProvider>) =>
    setProviders(s.vision.providers.map((p, i) => (i === idx ? { ...p, ...patch } : p)));

  async function testProvider(idx: number) {
    const provider = s?.vision.providers[idx];
    if (!provider) return;
    setTestingId(provider.id);
    try {
      const result = await visualizerApi.testVisionProvider(provider);
      toast(result.message, result.ok ? 'success' : 'error');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Connection test failed.', 'error');
    } finally {
      setTestingId(null);
    }
  }

  async function save() {
    if (!s) return;
    setSaving(true);
    try {
      const saved = await visualizerApi.saveSettings(s);
      setS(saved);
      toast('Visualizer settings saved.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Save failed.', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => void save()} loading={saving}><Save className="h-4 w-4" /> Save settings</Button>
      </div>

      {/* Feature access */}
      <Card
        title={<span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-stone-500" /> Feature access</span>}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Toggle checked={s.enabled} onChange={(v) => update({ enabled: v })} label="Visualizer enabled (master switch)" />
          </div>
          <Toggle checked={s.features.allowUpload} onChange={(v) => setFeatures({ allowUpload: v })} label="Allow room photo upload" />
          <Toggle checked={s.features.allowPresetRooms} onChange={(v) => setFeatures({ allowPresetRooms: v })} label="Allow preset rooms" />
          <Toggle checked={s.features.allowExport} onChange={(v) => setFeatures({ allowExport: v })} label="Allow download / share" />
          <Toggle checked={s.features.allowCompare} onChange={(v) => setFeatures({ allowCompare: v })} label="Allow A / B compare" />
          <Toggle checked={s.features.allowManualAreaEdit} onChange={(v) => setFeatures({ allowManualAreaEdit: v })} label="Allow manual area editing" />
        </div>
      </Card>

      {/* AI analysis */}
      <Card
        title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-stone-500" /> AI analysis (surface segmentation)</span>}
        actions={<Toggle checked={s.analysis.enabled} onChange={(v) => setAnalysis({ enabled: v })} label="Enabled" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Roboflow API key" hint="Shown masked. Leave as-is to keep the stored key. Empty = use server env fallback.">
            <Input value={s.analysis.apiKey} onChange={(e) => setAnalysis({ apiKey: e.target.value })} placeholder="••••••••" />
          </Field>
          <Field label="Model" hint="e.g. floor-wall-segmentation/3 (no workspace prefix)">
            <Input value={s.analysis.model} onChange={(e) => setAnalysis({ model: e.target.value })} />
          </Field>
          <Field label="Inference base URL">
            <Input value={s.analysis.baseUrl} onChange={(e) => setAnalysis({ baseUrl: e.target.value })} />
          </Field>
          <Field label="Confidence threshold (%)">
            <Input type="number" value={String(s.analysis.confidence)} onChange={(e) => setAnalysis({ confidence: num(e.target.value) })} />
          </Field>
          <Field label="Timeout (ms)">
            <Input type="number" value={String(s.analysis.timeoutMs)} onChange={(e) => setAnalysis({ timeoutMs: num(e.target.value) })} />
          </Field>
          <div className="flex items-end pb-1">
            <Toggle checked={s.analysis.autoApply} onChange={(v) => setAnalysis({ autoApply: v })} label="Auto-apply detected areas" />
          </div>
          <div className="sm:col-span-2">
            <Field label="Class → surface map" hint='JSON: { "detected-class": "FLOOR" }. Unmapped classes are upper-cased as-is.'>
              <JsonArea value={s.analysis.classMap} onChange={(v) => setAnalysis({ classMap: (v as Record<string, string>) ?? {} })} placeholder='{ "floor": "FLOOR", "wall": "WALL" }' />
            </Field>
          </div>
        </div>
      </Card>

      {/* Vision LLM providers */}
      <Card
        title={<span className="flex items-center gap-2"><Cpu className="h-4 w-4 text-stone-500" /> Vision LLM providers (image understanding)</span>}
        actions={<Toggle checked={s.vision.enabled} onChange={(v) => setVision({ enabled: v })} label="Use vision LLM" />}
      >
        <p className="mb-4 text-xs text-stone-500">
          Add your own vision model (OpenAI, Anthropic, Google Gemini, or any OpenAI-compatible endpoint) with its own API key
          and route surface analysis through it. Roboflow above acts as the fallback. Keys are stored server-side and only ever
          shown masked. Leave a key field as-is to keep the stored value; clear it to enter a new one.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Default vision model" hint="Used for surface analysis when enabled.">
            <Select value={s.vision.defaultProviderId} onChange={(e) => setVision({ defaultProviderId: e.target.value })}>
              <option value="">— none —</option>
              {s.vision.providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.modelId ? ` — ${p.modelId}` : ''}</option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end pb-1">
            <Toggle checked={s.vision.fallbackToRoboflow} onChange={(v) => setVision({ fallbackToRoboflow: v })} label="Fall back to Roboflow on error" />
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-800">Providers</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setProviders([
                  ...s.vision.providers,
                  {
                    id: `vp_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
                    name: 'New provider',
                    providerType: 'openai',
                    modelId: '',
                    baseUrl: '',
                    apiKey: '',
                    supportsVision: true,
                    enabled: true,
                    timeoutMs: 60000,
                    maxImageDim: 1024,
                  },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add provider
            </Button>
          </div>

          {s.vision.providers.length === 0 && (
            <p className="text-sm text-stone-400">No vision providers yet. Add one to enable image understanding.</p>
          )}

          <div className="space-y-3">
            {s.vision.providers.map((provider, idx) => (
              <div key={provider.id} className="rounded border border-stone-200 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Display name">
                    <Input value={provider.name} onChange={(e) => updateProvider(idx, { name: e.target.value })} />
                  </Field>
                  <Field label="Provider type">
                    <Select
                      value={provider.providerType}
                      onChange={(e) => {
                        const type = e.target.value as VisionProviderType;
                        const hint = pm(type)?.defaultBaseUrl ?? '';
                        updateProvider(idx, { providerType: type, baseUrl: provider.baseUrl || hint });
                      }}
                    >
                      {(meta ?? []).map((m) => (
                        <option key={m.type} value={m.type}>{m.label}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Model ID" hint={pm(provider.providerType)?.modelHint}>
                    <Input value={provider.modelId} onChange={(e) => updateProvider(idx, { modelId: e.target.value })} placeholder={pm(provider.providerType)?.modelHint} />
                  </Field>
                  <Field label="API base URL" hint={pm(provider.providerType)?.defaultBaseUrl || 'Required for custom endpoints'}>
                    <Input value={provider.baseUrl} onChange={(e) => updateProvider(idx, { baseUrl: e.target.value })} placeholder={pm(provider.providerType)?.defaultBaseUrl} />
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="API key" hint={`Shown masked. Leave as-is to keep the stored key.${pm(provider.providerType)?.keyHint ? ` Looks like: ${pm(provider.providerType)?.keyHint}` : ''}`}>
                      <Input value={provider.apiKey} onChange={(e) => updateProvider(idx, { apiKey: e.target.value })} placeholder="••••••••" autoComplete="off" />
                    </Field>
                  </div>
                  <Field label="Timeout (ms)">
                    <Input type="number" value={String(provider.timeoutMs)} onChange={(e) => updateProvider(idx, { timeoutMs: num(e.target.value, 60000) })} />
                  </Field>
                  <Field label="Max image size (px)" hint="Long edge sent to the provider.">
                    <Input type="number" value={String(provider.maxImageDim)} onChange={(e) => updateProvider(idx, { maxImageDim: num(e.target.value, 1024) })} />
                  </Field>
                  <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
                    <Toggle checked={provider.supportsVision} onChange={(v) => updateProvider(idx, { supportsVision: v })} label="Vision-capable" />
                    <Toggle checked={provider.enabled} onChange={(v) => updateProvider(idx, { enabled: v })} label="Enabled" />
                    <div className="ml-auto flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={testingId === provider.id}
                        onClick={() => void testProvider(idx)}
                      >
                        <PlugZap className="h-3.5 w-3.5" /> Test connection
                      </Button>
                      <button
                        type="button"
                        onClick={() => setProviders(s.vision.providers.filter((_, i) => i !== idx))}
                        className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700"
                        title="Remove provider"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* AI edit */}
      <Card
        title={<span className="flex items-center gap-2"><Wand2 className="h-4 w-4 text-stone-500" /> AI edit (FLUX image generation)</span>}
        actions={<Toggle checked={s.edit.enabled} onChange={(v) => setEdit({ enabled: v })} label="Enabled" />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Worker URL">
            <Input value={s.edit.workerUrl} onChange={(e) => setEdit({ workerUrl: e.target.value })} />
          </Field>
          <Field label="Worker secret" hint="Shown masked. Leave as-is to keep the stored secret. Empty = env fallback.">
            <Input value={s.edit.workerSecret} onChange={(e) => setEdit({ workerSecret: e.target.value })} placeholder="••••••••" />
          </Field>
          <Field label="Prompt guidance" hint="How strongly the model follows the prompt.">
            <Input type="number" value={String(s.edit.guidance)} onChange={(e) => setEdit({ guidance: num(e.target.value) })} />
          </Field>
          <Field label="Timeout (ms)">
            <Input type="number" value={String(s.edit.timeoutMs)} onChange={(e) => setEdit({ timeoutMs: num(e.target.value) })} />
          </Field>
          <Field label="Target long edge (px)">
            <Input type="number" value={String(s.edit.targetLongEdge)} onChange={(e) => setEdit({ targetLongEdge: num(e.target.value) })} />
          </Field>
          <Field label="Minimum edge (px)">
            <Input type="number" value={String(s.edit.minEdge)} onChange={(e) => setEdit({ minEdge: num(e.target.value) })} />
          </Field>
          <Field label="Size multiple" hint="Output sizes snap to a multiple of this.">
            <Input type="number" value={String(s.edit.sizeMultiple)} onChange={(e) => setEdit({ sizeMultiple: num(e.target.value) })} />
          </Field>
          <Field label="Client max input size (px)">
            <Input type="number" value={String(s.edit.maxInputDim)} onChange={(e) => setEdit({ maxInputDim: num(e.target.value) })} />
          </Field>
          <Field label="Client JPEG quality" hint="0.1 – 1">
            <Input type="number" step="0.05" value={String(s.edit.quality)} onChange={(e) => setEdit({ quality: num(e.target.value) })} />
          </Field>
          <div className="hidden sm:block" />
          <div className="sm:col-span-2">
            <Field label="Prompt template" hint="Placeholders: {material} = material name, {noun} = surface noun.">
              <Textarea rows={3} value={s.edit.promptTemplate} onChange={(e) => setEdit({ promptTemplate: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      {/* Behavior */}
      <Card
        title={<span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-stone-500" /> Behavior &amp; appearance</span>}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Display aspect ratio" hint="e.g. 1.6 = 16:10">
            <Input type="number" step="0.01" value={String(s.behavior.displayAspect)} onChange={(e) => setBehavior({ displayAspect: num(e.target.value, 1.6) })} />
          </Field>
          <Field label="Polygon simplify tolerance">
            <Input type="number" step="0.005" value={String(s.behavior.simplifyTolerance)} onChange={(e) => setBehavior({ simplifyTolerance: num(e.target.value) })} />
          </Field>
          <Field label="Polygon simplify min points">
            <Input type="number" value={String(s.behavior.simplifyMinPoints)} onChange={(e) => setBehavior({ simplifyMinPoints: num(e.target.value) })} />
          </Field>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-stone-800">Upload surfaces</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSurfaces([
                  ...s.behavior.surfaces,
                  { id: `surface${s.behavior.surfaces.length + 1}`, nameAr: '', nameEn: '', tileCm: 40, noun: 'surface', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add surface
            </Button>
          </div>
          <div className="space-y-3">
            {s.behavior.surfaces.map((surface, idx) => (
              <div key={idx} className="rounded border border-stone-200 p-3">
                <div className="grid gap-3 sm:grid-cols-5">
                  <Field label="ID">
                    <Input value={surface.id} onChange={(e) => setSurfaces(s.behavior.surfaces.map((r, i) => (i === idx ? { ...r, id: e.target.value } : r)))} />
                  </Field>
                  <Field label="Name AR">
                    <Input value={surface.nameAr} onChange={(e) => setSurfaces(s.behavior.surfaces.map((r, i) => (i === idx ? { ...r, nameAr: e.target.value } : r)))} />
                  </Field>
                  <Field label="Name EN">
                    <Input value={surface.nameEn} onChange={(e) => setSurfaces(s.behavior.surfaces.map((r, i) => (i === idx ? { ...r, nameEn: e.target.value } : r)))} />
                  </Field>
                  <Field label="Tile (cm)">
                    <Input type="number" value={String(surface.tileCm)} onChange={(e) => setSurfaces(s.behavior.surfaces.map((r, i) => (i === idx ? { ...r, tileCm: num(e.target.value) } : r)))} />
                  </Field>
                  <Field label="AI noun">
                    <Input value={surface.noun} onChange={(e) => setSurfaces(s.behavior.surfaces.map((r, i) => (i === idx ? { ...r, noun: e.target.value } : r)))} />
                  </Field>
                  <div className="sm:col-span-4">
                    <Field label="Default polygon" hint="Normalized points 0–1, JSON array of {x,y}.">
                      <JsonArea
                        rows={4}
                        value={surface.polygon}
                        onChange={(v) => setSurfaces(s.behavior.surfaces.map((r, i) => (i === idx ? { ...r, polygon: (v as VisualizerSurfacePoint[]) ?? r.polygon } : r)))}
                      />
                    </Field>
                  </div>
                  <div className="flex items-start justify-end pb-1">
                    <button
                      type="button"
                      onClick={() => setSurfaces(s.behavior.surfaces.filter((_, i) => i !== idx))}
                      className="rounded p-1.5 text-stone-400 hover:bg-red-50 hover:text-red-700"
                      title="Remove surface"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
