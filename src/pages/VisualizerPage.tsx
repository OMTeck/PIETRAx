import { useState, useRef, useMemo, useEffect } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubMaterialName, type PubVisualizerSurface } from '@/lib/public';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import {
  ArrowLeft, Upload, ZoomIn, RotateCcw,
  Heart, Download, Share2, Check,
} from 'lucide-react';

import { analyzeRoomPhoto } from '@/lib/visualizer/imageAnalysis';
import {
  renderSurfaceTexture,
  loadImage,
  parseClipPath,
  paramsFromMaterial,
  coverCanvas,
  DEFAULT_TEXTURE_PARAMS,
  type TextureMapParams,
} from '@/lib/visualizer/textureMapper';
import { pointsToClipPath, simplifyPolygon } from '@/lib/visualizer/geometry';
import { downloadBlob, shareBlob } from '@/lib/visualizer/domSnapshot';
import type { RoomLayout, Step, VisMaterial, NormalizedPoint } from '@/lib/visualizer/types';
import { AIAnalyzeButton } from '@/components/visualizer/AIAnalyzeButton';
import { PolygonEditor } from '@/components/visualizer/PolygonEditor';

/** Mirrors the server defaults so the page still works before /config loads. */
const FALLBACK_SURFACES: PubVisualizerSurface[] = [
  { id: 'floor', nameAr: 'الأرضية', nameEn: 'Floor', tileCm: 40, noun: 'floor', polygon: [{ x: 0, y: 0.55 }, { x: 1, y: 0.55 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
  { id: 'wall', nameAr: 'الجدار', nameEn: 'Wall', tileCm: 40, noun: 'wall', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.55 }, { x: 0, y: 0.55 }] },
  { id: 'countertop', nameAr: 'سطح العمل', nameEn: 'Countertop', tileCm: 60, noun: 'countertop and cabinetry', polygon: [{ x: 0, y: 0.4 }, { x: 1, y: 0.4 }, { x: 1, y: 0.6 }, { x: 0, y: 0.6 }] },
];

export function VisualizerPage() {
  const { t, lang } = useLang();
  const { navigate, path } = useRoute();
  const { toggle, has } = useWishlist();
  const { visualizer, visualizerConfig, materialBySlug, loading } = useCatalog();

  const params = new URLSearchParams(path.split('?')[1] || '');
  const presetMaterialSlug = params.get('material');

  const rooms = visualizer?.rooms ?? [];

  const features = visualizerConfig?.features;
  const allowUpload = features?.allowUpload !== false;
  const allowPresetRooms = features?.allowPresetRooms !== false;
  const allowExport = features?.allowExport !== false;
  const allowManualAreaEdit = features?.allowManualAreaEdit !== false;
  const behavior = visualizerConfig?.behavior;
  const surfacesConfig = behavior?.surfaces?.length ? behavior.surfaces : FALLBACK_SURFACES;
  const surfaceConfigById = useMemo(() => {
    const map: Record<string, PubVisualizerSurface> = {};
    for (const s of surfacesConfig) map[s.id] = s;
    return map;
  }, [surfacesConfig]);
  const presetAspect = behavior?.displayAspect ?? 16 / 10;
  const aiAnalysisEnabled = visualizerConfig?.analysis?.enabled !== false;
  const renderSettings = visualizerConfig?.render;
  const strictFidelity = renderSettings?.strictFidelity !== false;
  const allowLighting = renderSettings?.allowLighting === true;
  const defaultSampling = renderSettings?.defaultSampling === 'bilinear' ? 'bilinear' : 'nearest';

  const visMaterials: VisMaterial[] = useMemo(() => {
    return (visualizer?.materials ?? []).map((vm) => {
      const meta = materialBySlug(vm.slug);
      return {
        id: vm.id,
        slug: vm.slug,
        name: pubMaterialName(vm.translations, lang),
        enName: pubMaterialName(vm.translations, 'en'),
        textureUrl: vm.textureUrl ?? '',
        typeCode: meta?.materialType.code ?? '',
        typeLabel: meta ? (lang === 'ar' ? meta.materialType.labelAr : meta.materialType.labelEn) : '',
        colourLabel: meta?.color ? (lang === 'ar' ? meta.color.labelAr : meta.color.labelEn) : '',
        finishLabel: meta?.finish ? (lang === 'ar' ? meta.finish.labelAr : meta.finish.labelEn) : '',
        sizeLabel: meta?.sizes[0]?.label ?? '',
        tileWidth: vm.tileWidth,
        tileHeight: vm.tileHeight,
        patternScale: vm.patternScale,
        rotation: vm.rotation,
        groutWidth: vm.groutWidth,
        groutColor: vm.groutColor,
        bookmatch: vm.bookmatch,
      };
    });
  }, [visualizer, materialBySlug, lang]);

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of visMaterials) {
      if (m.typeCode && !seen.has(m.typeCode)) seen.set(m.typeCode, m.typeLabel);
    }
    return [...seen.entries()].map(([code, label]) => ({ code, label }));
  }, [visMaterials]);

  const [step, setStep] = useState<Step>('room');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [uploadSurface, setUploadSurface] = useState<string>('floor');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [zoom, setZoom] = useState(1);
  const [showSaved, setShowSaved] = useState(false);
  const [layout, setLayout] = useState<RoomLayout | null>(null);
  const [aiSegments, setAiSegments] = useState<Partial<Record<string, NormalizedPoint[]>>>({});
  const [editingSurfaceId, setEditingSurfaceId] = useState<string | null>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Deterministic texture-mapping state (Strict Texture Fidelity by default).
  const [textureParams, setTextureParams] = useState<TextureMapParams>({ ...DEFAULT_TEXTURE_PARAMS });
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState(false);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  /** Run on-device room analysis once per upload: yields horizon + px-per-meter. */
  useEffect(() => {
    if (!uploadedImage || !uploadMode) return;
    const img = new Image();
    img.onload = () => {
      setLayout(analyzeRoomPhoto(img));
      setImageAspect(img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 16 / 10);
    };
    img.src = uploadedImage;
    return () => { setLayout(null); setAiSegments({}); setEditingSurfaceId(null); setImageAspect(null); };
  }, [uploadedImage, uploadMode]);

  useEffect(() => {
    if (presetMaterialSlug && !selectedMaterialId) {
      const match = visMaterials.find((m) => m.slug === presetMaterialSlug);
      if (match) setSelectedMaterialId(match.id);
    }
  }, [presetMaterialSlug, visMaterials, selectedMaterialId]);

  useEffect(() => {
    if (!presetMaterialSlug || selectedRoomId) return;
    const material = visMaterials.find((m) => m.slug === presetMaterialSlug);
    const room = rooms.find((r) => r.surfaces.some((s) => s.defaultMaterialSlug === presetMaterialSlug)) ?? rooms[0];
    if (!room || !material) return;
    const surface = room.surfaces.find((s) => s.defaultMaterialSlug === presetMaterialSlug) ?? room.surfaces[0];
    if (!surface) return;
    setSelectedMaterialId(material.id);
    setSelectedRoomId(room.id);
    setSelectedSurfaceId(surface.id);
    setStep('result');
    setUploadMode(false);
    setUploadedImage(null);
  }, [presetMaterialSlug, rooms, visMaterials, selectedRoomId]);

  const filteredMaterials = useMemo(() => {
    return visMaterials.filter((m) => {
      if (searchQuery && !m.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      if (filterCategory !== 'All' && m.typeCode !== filterCategory) return false;
      return true;
    });
  }, [searchQuery, filterCategory, visMaterials]);

  if (loading && rooms.length === 0) {
    return (
      <div className="pt-32 pb-20 min-h-screen bg-stone-100 text-center">
        <p className="text-stone-500">{t('loading')}</p>
      </div>
    );
  }

  if (visualizerConfig && !visualizerConfig.enabled) {
    return (
      <div className="pt-32 pb-20 min-h-screen bg-stone-100 text-center">
        <p className="text-stone-500">
          {lang === 'ar' ? 'أداة المحاكاة غير متاحة حاليًا.' : 'The room visualizer is currently unavailable.'}
        </p>
      </div>
    );
  }

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const selectedSurface = selectedRoom?.surfaces.find((s) => s.id === selectedSurfaceId);
  const selectedMaterial = visMaterials.find((m) => m.id === selectedMaterialId);

  // The base photo (upload) or the preset room's photo (existing rooms).
  const originalImage = uploadedImage ?? selectedRoom?.previewImage ?? null;
  const roomImage = originalImage;

  // Preset rooms render at the configured box (their clip-paths were authored
  // for it); uploads keep the photo's own aspect.
  const displayAspect = uploadMode && imageAspect ? imageAspect : presetAspect;

  /** Maps a detected surfaceType to the active surface id (upload id or preset id). */
  const surfaceIdForType = (type: string): string | null => {
    const k = type.toLowerCase();
    if (uploadMode) {
      if (surfaceConfigById[k]) return k;
      const byNoun = surfacesConfig.find((s) => s.noun.toLowerCase().includes(k));
      return byNoun?.id ?? null;
    }
    const match = selectedRoom?.surfaces.find((s) => {
      const n = (s.nameEn || '').toLowerCase();
      if (k === 'floor') return n.includes('floor');
      if (k === 'wall') return n.includes('wall');
      if (k === 'ceiling') return n.includes('ceiling');
      if (k === 'countertop') return n.includes('counter') || n.includes('island') || n.includes('cabinet');
      return false;
    });
    return match?.id ?? null;
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedImage(ev.target?.result as string);
        setShowOriginal(false);
        setUploadMode(true);
        setSelectedRoomId(null);
        setSelectedSurfaceId(null);
        setStep('surface');
      };
      reader.readAsDataURL(file);
    }
  };

  const defaultUploadPolygon: Record<string, NormalizedPoint[]> = Object.fromEntries(
    surfacesConfig.map((s) => [s.id, s.polygon]),
  );

  const polygonFor = (surfaceId: string): NormalizedPoint[] =>
    aiSegments[surfaceId] ?? defaultUploadPolygon[surfaceId] ?? [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ];

  /** Maps a cloud result (surfaceType -> points in 0..1) into per-surface clips. */
  const handleAISegments = (result: { segments: { surfaceType: string; points: { x: number; y: number }[] }[]; width: number; height: number }) => {
    const mapped: Partial<Record<string, NormalizedPoint[]>> = {};
    for (const seg of result.segments) {
      const surfaceId = surfaceIdForType(seg.surfaceType);
      if (surfaceId && seg.points.length >= 3) {
        const pts = seg.points.map((p) => ({
          x: p.x / result.width,
          y: p.y / result.height,
        }));
        mapped[surfaceId] = simplifyPolygon(pts, behavior?.simplifyTolerance ?? 0.02, behavior?.simplifyMinPoints ?? 30);
      }
    }
    setAiSegments((prev) => ({ ...prev, ...mapped }));
    // Auto-select the largest detected region so the user lands on a usable default.
    const bestId = (Object.keys(mapped) as string[]).sort(
      (a, b) => (mapped[b]?.length ?? 0) - (mapped[a]?.length ?? 0),
    )[0];
    if (bestId) setUploadSurface(bestId);
  };

  /**
   * Deterministic texture mapping: composites the selected material's original
   * texture onto the selected surface using projective geometry + tiling.
   * No generative model is involved — source pixels are copied verbatim.
   */
  const renderComposite = async (maxDimension?: number) => {
    const base = uploadedImage ?? selectedRoom?.previewImage ?? null;
    const material = visMaterials.find((m) => m.id === selectedMaterialId);
    const surfaceId = selectedSurfaceId || (uploadMode ? 'floor' : selectedRoom?.surfaces[0]?.id);
    if (!base || !material?.textureUrl || !surfaceId) {
      compositeCanvasRef.current = null;
      setCompositeUrl(null);
      return;
    }
    const polygon = uploadMode
      ? polygonFor(surfaceId)
      : parseClipPath(selectedRoom?.surfaces.find((s) => s.id === surfaceId)?.clipPath || '');
    if (polygon.length < 3) {
      compositeCanvasRef.current = null;
      setCompositeUrl(null);
      return;
    }
    try {
      const [room, texture] = await Promise.all([loadImage(base), loadImage(material.textureUrl)]);
      const aspect = uploadMode && imageAspect ? imageAspect : presetAspect;
      const box = coverCanvas(room, aspect, maxDimension ?? 1600);
      const imageW = room.naturalWidth || box.width;
      const ppmBase = uploadMode && layout
        ? layout.pxPerMeter
        : Math.max(80, Math.round(imageW / 4));
      const canvas = renderSurfaceTexture({
        roomImage: box,
        polygon,
        texture,
        params: textureParams,
        pxPerMeter: ppmBase * (box.width / imageW),
      });
      compositeCanvasRef.current = canvas;
      setCompositeUrl(canvas.toDataURL('image/png'));
      setRenderError(false);
    } catch {
      setRenderError(true);
    }
  };

  const renderCompositeRef = useRef(renderComposite);
  renderCompositeRef.current = renderComposite;

  // Reset mapping defaults whenever a different material is chosen.
  const materialsRef = useRef(visMaterials);
  materialsRef.current = visMaterials;
  useEffect(() => {
    const material = materialsRef.current.find((m) => m.id === selectedMaterialId);
    if (material) {
      setTextureParams({
        ...paramsFromMaterial(material),
        sampling: strictFidelity ? 'nearest' : defaultSampling,
        lighting: false,
      });
    }
  }, [selectedMaterialId, strictFidelity, defaultSampling]);

  // Re-render the composite whenever the inputs change.
  useEffect(() => {
    if (step !== 'result') return;
    void renderCompositeRef.current(1100);
  }, [step, uploadedImage, selectedRoomId, selectedSurfaceId, selectedMaterialId, textureParams, uploadMode, layout, aiSegments, visMaterials]);

  /** Pick a surface and move to the material step. */
  const selectSurface = (surfaceId: string) => {
    setSelectedSurfaceId(surfaceId);
    setShowOriginal(false);
    setStep('material');
  };

  const applySurfaceClip = (surfaceId: string): string => {
    const seg = aiSegments[surfaceId];
    if (seg && seg.length >= 3) return pointsToClipPath(seg);
    if (uploadMode) {
      const pts = polygonFor(surfaceId);
      if (pts.length >= 3) return pointsToClipPath(pts);
    }
    const surface = selectedRoom?.surfaces.find((s) => s.id === surfaceId);
    return surface?.clipPath || 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
  };

  const uploadSurfaces = surfacesConfig.map((s) => ({ id: s.id, name: s.nameEn, nameAr: s.nameAr }));

  const surfaces = uploadMode
    ? uploadSurfaces.map((s) => ({ id: s.id, clipPath: '', nameAr: s.nameAr, nameEn: s.name }))
    : (selectedRoom?.surfaces ?? []).map((s) => ({ id: s.id, clipPath: s.clipPath, nameAr: s.nameAr, nameEn: s.nameEn }));

  const handleExport = async (mode: 'download' | 'share') => {
    if (exporting) return;
    setExporting(true);
    try {
      // Re-render at full resolution and export losslessly as PNG.
      await renderCompositeRef.current(undefined);
      const canvas = compositeCanvasRef.current;
      const blob = canvas
        ? await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed'))), 'image/png'),
          )
        : null;
      if (blob) {
        if (mode === 'download') {
          downloadBlob(blob, 'pietrax-visualizer.png');
        } else {
          await shareBlob(blob, selectedMaterial?.name ?? 'PIETRAx', 'pietrax-visualizer.png');
        }
      } else if (roomImage) {
        const a = document.createElement('a');
        a.href = roomImage;
        a.download = 'pietrax-visualizer.png';
        a.click();
      }
    } catch {
      if (compositeUrl) {
        const a = document.createElement('a');
        a.href = compositeUrl;
        a.download = 'pietrax-visualizer.png';
        a.click();
      }
    } finally {
      setExporting(false);
    }
  };

  const steps: Step[] = ['room', 'surface', 'material', 'result'];
  const currentStepIndex = steps.indexOf(step);

  return (
    <div className="pt-20 md:pt-24 min-h-screen bg-stone-100">
      {/* Header */}
      <div className="container-lux py-8">
        <Reveal>
          <h1 className="font-display text-display font-light text-stone-900 mb-2">{t('visualizer')}</h1>
          <p className="text-sm text-stone-500">{t('visualizerTitle')}</p>
        </Reveal>
      </div>

      {/* Step Indicator */}
      <div className="container-lux mb-8">
        <div className="flex items-center gap-2 md:gap-4">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2 md:gap-4">
              <div className={`flex items-center gap-2 ${i <= currentStepIndex ? 'text-stone-900' : 'text-stone-400'}`}>
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs border transition-all ${
                  i === currentStepIndex ? 'bg-stone-900 text-ivory border-stone-900' :
                  i < currentStepIndex ? 'bg-stone-200 text-stone-900 border-stone-200' :
                  'border-stone-300'
                }`}>
                  {i < currentStepIndex ? <Check size={12} strokeWidth={2} /> : i + 1}
                </span>
                <span className="text-xs tracking-[0.15em] uppercase hidden md:inline">
                  {s === 'room' ? t('chooseRoom') : s === 'surface' ? t('chooseSurface') : s === 'material' ? t('chooseMaterial') : t('applyMaterial')}
                </span>
              </div>
              {i < steps.length - 1 && <div className={`w-8 md:w-16 h-px ${i < currentStepIndex ? 'bg-stone-900' : 'bg-stone-300'}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 1: Choose Room */}
      {step === 'room' && (
        <div className="container-lux pb-20">
          {/* Upload Option */}
          {allowUpload && (
          <Reveal>
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full mb-8 border-2 border-dashed border-stone-300 hover:border-stone-900 transition-colors p-8 md:p-12 flex flex-col items-center gap-3 text-stone-600 hover:text-stone-900"
            >
              <Upload size={28} strokeWidth={1.5} />
              <p className="font-display text-xl font-light">{t('uploadYourRoom')}</p>
              <p className="text-sm text-stone-500">{t('uploadRoomDesc')}</p>
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
          </Reveal>
          )}

          {allowPresetRooms && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {rooms.map((room, i) => (
              <Reveal key={room.id} delay={i * 60}>
                <button
                  onClick={() => {
                    setSelectedRoomId(room.id);
                    setUploadMode(false);
                    setUploadedImage(null);
                    setShowOriginal(false);
                    setAiSegments({});
                    setEditingSurfaceId(null);
                    setStep('surface');
                  }}
                  className="group relative block w-full overflow-hidden"
                >
                  <LazyImage
                    src={room.previewImage ?? ''}
                    alt={lang === 'ar' ? room.nameAr : room.nameEn}
                    aspectClass="aspect-[4/3]"
                    className="transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-stone-950/20 group-hover:bg-stone-950/40 transition-colors" />
                  <p className="absolute bottom-3 left-0 right-0 text-center text-sm tracking-[0.15em] uppercase text-white font-light">
                    {lang === 'ar' ? room.nameAr : room.nameEn}
                  </p>
                </button>
              </Reveal>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Step 2: Choose Surface */}
      {step === 'surface' && roomImage && (
        <div className="container-lux pb-20">
          <div className="flex items-center gap-4 mb-6">
            <button onClick={() => { setStep('room'); setUploadMode(false); setUploadedImage(null); }} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900">
              <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
              {t('changeRoom')}
            </button>
            {uploadMode && (
              <span className="text-xs tracking-[0.15em] uppercase text-stone-400">
                {t('selectArea')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            {aiAnalysisEnabled && (
              <AIAnalyzeButton
                uploadedImage={roomImage}
                cropAspect={uploadMode ? undefined : displayAspect}
                onSegments={handleAISegments}
              />
            )}
            {uploadMode && allowManualAreaEdit && editingSurfaceId && (
              <button
                onClick={() => setEditingSurfaceId(null)}
                className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-900 px-3 py-2 text-stone-900 hover:bg-stone-900 hover:text-ivory transition-colors"
              >
                <Check size={13} strokeWidth={1.5} /> {t('editArea')}
              </button>
            )}
          </div>
          <p className="text-xs text-stone-500 mb-6">{t('aiAutoHint')}</p>

          {editingSurfaceId && uploadMode ? (
            <div className="mb-6 border border-stone-300 bg-stone-100 p-3">
              <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-3">{t('adjustAreaHint')}</p>
              <PolygonEditor
                imageUrl={roomImage}
                points={aiSegments[editingSurfaceId] ?? defaultUploadPolygon[editingSurfaceId] ?? []}
                onChange={(pts) => setAiSegments((prev) => ({ ...prev, [editingSurfaceId]: pts }))}
              />
            </div>
          ) : (
            <div
              className="relative aspect-[16/10] overflow-hidden bg-stone-200 mb-6"
              style={uploadMode && imageAspect ? { aspectRatio: `${imageAspect}` } : undefined}
            >
              <img src={roomImage} alt="Room" className="w-full h-full object-cover" />
              {surfaces.map((surface) => {
                const clip = applySurfaceClip(surface.id);
                return (
                  <button
                    key={surface.id}
                    onClick={() => selectSurface(surface.id)}
                    className="absolute inset-0 group transition-all"
                    style={{ clipPath: clip }}
                  >
                    <div className="w-full h-full bg-accent/0 group-hover:bg-accent/30 transition-colors duration-300 flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-sm tracking-[0.15em] uppercase bg-stone-900/80 px-4 py-2">
                        {lang === 'ar' ? (surface.nameAr || t(surface.id === 'floor' ? 'floor' : surface.id === 'wall' ? 'wall' : 'countertop')) : surface.nameEn}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-3 justify-center">
            {surfaces.map((surface) => (
              <button
                key={surface.id}
                onClick={() => selectSurface(surface.id)}
                className="filter-chip"
              >
                {lang === 'ar' ? (surface.nameAr || t(surface.id === 'floor' ? 'floor' : surface.id === 'wall' ? 'wall' : 'countertop')) : surface.nameEn}
              </button>
            ))}
            {uploadMode && !editingSurfaceId && allowManualAreaEdit && (
              <button
                onClick={() => setEditingSurfaceId(surfaces[0]?.id ?? 'floor')}
                className="filter-chip"
              >
                {t('editArea')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Choose Material */}
      {step === 'material' && (
        <div className="container-lux pb-20">
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => { setStep('surface'); setShowOriginal(false); }} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900">
              <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
              {t('changeSurface')}
            </button>
          </div>

          {/* Search + Filter */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('searchMaterials')}
              className="flex-1 bg-ivory border border-stone-200 px-4 py-3 text-sm focus:border-stone-900 focus:outline-none"
            />
            {categories.length > 0 && (
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setFilterCategory('All')}
                  className={`filter-chip shrink-0 ${filterCategory === 'All' ? 'filter-chip-active' : ''}`}
                >
                  {t('all')}
                </button>
                {categories.map((c) => (
                  <button
                    key={c.code}
                    onClick={() => setFilterCategory(c.code)}
                    className={`filter-chip shrink-0 ${filterCategory === c.code ? 'filter-chip-active' : ''}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Material Grid */}
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3 md:gap-4 max-h-[500px] overflow-y-auto">
            {filteredMaterials.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedMaterialId(m.id);
                  setStep('result');
                }}
                className={`group relative overflow-hidden border-2 transition-all ${
                  selectedMaterialId === m.id ? 'border-stone-900' : 'border-transparent hover:border-stone-300'
                }`}
              >
                <LazyImage src={m.textureUrl} alt={m.name} aspectClass="aspect-square" className="transition-transform duration-300 group-hover:scale-110" />
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-stone-950/60">
                  <p className="text-white text-xs font-light truncate">{m.name}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 'result' && roomImage && selectedMaterial && (
        <div className="container-lux pb-20">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <button onClick={() => setStep('material')} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900">
              <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
              {t('changeMaterial')}
            </button>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setZoom(zoom === 1 ? 1.5 : 1)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                <ZoomIn size={13} strokeWidth={1.5} /> {t('reset')}
              </button>
              <button onClick={() => { setStep('room'); setUploadedImage(null); setUploadMode(false); setSelectedMaterialId(null); setShowOriginal(false); setCompositeUrl(null); }} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                <RotateCcw size={13} strokeWidth={1.5} /> {t('reset')}
              </button>
              <button onClick={() => setShowOriginal((v) => !v)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                {showOriginal ? t('aiEditResult') : t('originalImage')}
              </button>
            </div>
          </div>

          {/* Visualizer Canvas */}
          <div
            ref={resultRef}
            className="relative aspect-[16/10] overflow-hidden bg-stone-200"
            style={uploadMode && imageAspect ? { transform: `scale(${zoom})`, transformOrigin: 'center', aspectRatio: `${imageAspect}` } : { transform: `scale(${zoom})`, transformOrigin: 'center' }}
          >
            <img
              src={showOriginal ? (roomImage ?? undefined) : (compositeUrl ?? roomImage ?? undefined)}
              alt="Room"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Labels */}
            <div className="absolute bottom-4 left-4 flex gap-2">
              <span className="text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">
                {lang === 'ar' ? selectedSurface?.nameAr || selectedSurfaceId : selectedSurface?.nameEn || selectedSurfaceId}
              </span>
              {!showOriginal && compositeUrl && (
                <span className="text-xs tracking-wider uppercase text-white bg-stone-900 px-3 py-1.5">Strict</span>
              )}
              {showOriginal && (
                <span className="text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">{t('originalImage')}</span>
              )}
            </div>
          </div>

          {renderError && <p className="mt-3 text-xs text-red-700">Could not render the texture.</p>}

          {/* Deterministic texture-mapping controls */}
          {selectedMaterial && (
            <div className="mt-6 border border-stone-200 bg-ivory p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-800">Texture mapping</h3>
                <span className="text-[11px] uppercase tracking-wider text-stone-500">
                  {strictFidelity ? 'Strict fidelity' : 'Standard'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {([
                  ['tileWidthCm', 'Tile width (cm)'],
                  ['tileHeightCm', 'Tile height (cm)'],
                  ['patternScale', 'Pattern scale'],
                  ['rotationDeg', 'Rotation (deg)'],
                  ['repeatX', 'Repeat X (0=auto)'],
                  ['repeatY', 'Repeat Y (0=auto)'],
                  ['groutWidthCm', 'Grout width (cm)'],
                  ['offsetX', 'Offset X (tiles)'],
                  ['offsetY', 'Offset Y (tiles)'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="block text-xs text-stone-600">
                    <span className="mb-1 block">{label}</span>
                    <input
                      type="number"
                      className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                      value={String(textureParams[key])}
                      onChange={(e) => setTextureParams({ ...textureParams, [key]: Number(e.target.value) } as TextureMapParams)}
                    />
                  </label>
                ))}
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Grout color</span>
                  <input
                    type="color"
                    className="h-9 w-full border border-stone-300"
                    value={textureParams.groutColor}
                    onChange={(e) => setTextureParams({ ...textureParams, groutColor: e.target.value })}
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-stone-700">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={textureParams.flipX} onChange={(e) => setTextureParams({ ...textureParams, flipX: e.target.checked })} />
                  Flip horizontal
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={textureParams.flipY} onChange={(e) => setTextureParams({ ...textureParams, flipY: e.target.checked })} />
                  Flip vertical
                </label>
                <label className="flex items-center gap-2">
                  Sampling
                  <select
                    className="border border-stone-300 px-2 py-1"
                    value={textureParams.sampling}
                    onChange={(e) => setTextureParams({ ...textureParams, sampling: e.target.value as 'nearest' | 'bilinear' })}
                  >
                    <option value="nearest">Nearest (exact)</option>
                    <option value="bilinear">Bilinear</option>
                  </select>
                </label>
                {allowLighting && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={textureParams.lighting} onChange={(e) => setTextureParams({ ...textureParams, lighting: e.target.checked })} />
                    Environmental lighting
                  </label>
                )}
              </div>
            </div>
          )}

          {/* Selected Material Panel */}
          <div className="mt-8 bg-ivory p-6 md:p-8 border border-stone-200">
            <div className="flex flex-col md:flex-row gap-6 items-start">
              <LazyImage src={selectedMaterial.textureUrl} alt={selectedMaterial.name} aspectClass="w-24 h-24 shrink-0" />
              <div className="flex-1">
                <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-1">{t('selectedMaterial')}</p>
                <h3 className="font-display text-2xl font-light text-stone-900 mb-2">{selectedMaterial.name}</h3>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-stone-600">
                  {selectedMaterial.typeLabel && <span>{selectedMaterial.typeLabel}</span>}
                  {selectedMaterial.colourLabel && <span>{selectedMaterial.colourLabel}</span>}
                  {selectedMaterial.finishLabel && <span>{selectedMaterial.finishLabel}</span>}
                  {selectedMaterial.sizeLabel && <span>{selectedMaterial.sizeLabel}</span>}
                </div>
              </div>
              <div className="flex flex-col gap-2 w-full md:w-auto">
                <button onClick={() => navigate(`/material/${selectedMaterial.slug}`)} className="btn-outline text-xs">
                  {t('viewDetails')}
                </button>
                <button onClick={() => navigate(`/material/${selectedMaterial.slug}`)} className="btn-primary text-xs">
                  {t('requestQuote')}
                </button>
              </div>
            </div>

            {/* Save / Share Actions */}
            <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-stone-200">
              <button
                onClick={() => {
                  toggle(selectedMaterial.id);
                  setShowSaved(true);
                  setTimeout(() => setShowSaved(false), 2000);
                }}
                className="flex items-center gap-2 text-xs tracking-wider uppercase text-stone-600 hover:text-stone-900 transition-colors"
              >
                <Heart size={14} strokeWidth={1.5} fill={has(selectedMaterial.id) ? 'currentColor' : 'none'} className={has(selectedMaterial.id) ? 'text-accent' : ''} />
                {t('saveDesign')}
              </button>
              {allowExport && (
              <>
              <button onClick={() => handleExport('download')} disabled={exporting} className="flex items-center gap-2 text-xs tracking-wider uppercase text-stone-600 hover:text-stone-900 transition-colors disabled:opacity-50">
                <Download size={14} strokeWidth={1.5} />
                {t('downloadImage')}
              </button>
              <button onClick={() => handleExport('share')} disabled={exporting} className="flex items-center gap-2 text-xs tracking-wider uppercase text-stone-600 hover:text-stone-900 transition-colors disabled:opacity-50">
                <Share2 size={14} strokeWidth={1.5} />
                {t('share')}
              </button>
              </>
              )}
            </div>
          </div>

          {showSaved && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-stone-900 text-ivory px-6 py-3 text-sm tracking-wider z-50">
              {t('saveDesign')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
