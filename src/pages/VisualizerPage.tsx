import { useState, useRef, useMemo, useEffect } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubMaterialName, publicApi, type PubVisualizerSurface } from '@/lib/public';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import {
  ArrowLeft, ArrowRight, Upload, X, ZoomIn, RotateCcw, Maximize2,
  Heart, Download, Share2, ChevronLeft, ChevronRight, Check, Loader2,
} from 'lucide-react';

import { analyzeRoomPhoto } from '@/lib/visualizer/imageAnalysis';
import { compressImage } from '@/lib/visualizer/imagePreprocessor';
import { tileCss } from '@/lib/visualizer/textureRenderer';
import { pointsToClipPath, simplifyPolygon } from '@/lib/visualizer/geometry';
import { snapshotElement, downloadBlob, shareBlob } from '@/lib/visualizer/domSnapshot';
import type { RoomLayout, SurfaceKind, Step, VisMaterial, NormalizedPoint } from '@/lib/visualizer/types';
import { AIAnalyzeButton } from '@/components/visualizer/AIAnalyzeButton';
import { PolygonEditor } from '@/components/visualizer/PolygonEditor';

const FALLBACK_PROMPT =
  'Repaint ONLY the {noun} with {material}, keeping the material exact color, tone, pattern, veining, gloss and finish. This is a strict photorealistic MATERIAL REPLACEMENT, not a redesign. STRICT RULES: (1) Do NOT change the shape or geometry of anything: keep the same room, perspective, camera angle, framing and proportions. (2) Do NOT change the color of anything except the {noun}: keep the overall color balance, walls, ceiling, floor, furniture, objects, decor, shadows and lighting exactly as in the original. (3) Do NOT add, remove, move, resize, reshape or restyle any object or surface. (4) Everything outside the {noun} must stay pixel-for-pixel identical. Output one photorealistic image: same scene, same composition, same room colors, material true to reference.';

/** Mirrors the server defaults so the page still works before /config loads. */
const FALLBACK_SURFACES: PubVisualizerSurface[] = [
  { id: 'floor', nameAr: 'الأرضية', nameEn: 'Floor', tileCm: 40, noun: 'floor', polygon: [{ x: 0, y: 0.55 }, { x: 1, y: 0.55 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
  { id: 'wall', nameAr: 'الجدار', nameEn: 'Wall', tileCm: 40, noun: 'wall', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.55 }, { x: 0, y: 0.55 }] },
  { id: 'countertop', nameAr: 'سطح العمل', nameEn: 'Countertop', tileCm: 60, noun: 'countertop and cabinetry', polygon: [{ x: 0, y: 0.4 }, { x: 1, y: 0.4 }, { x: 1, y: 0.6 }, { x: 0, y: 0.6 }] },
];

/** Builds the FLUX instruction from the configured template + material/noun. */
function buildMaterialPrompt(template: string, materialEnName: string, noun: string): string {
  return template.replace(/\{material\}/g, materialEnName).replace(/\{noun\}/g, noun);
}

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
  const allowCompare = features?.allowCompare !== false;
  const allowManualAreaEdit = features?.allowManualAreaEdit !== false;
  const behavior = visualizerConfig?.behavior;
  const surfacesConfig = behavior?.surfaces?.length ? behavior.surfaces : FALLBACK_SURFACES;
  const surfaceConfigById = useMemo(() => {
    const map: Record<string, PubVisualizerSurface> = {};
    for (const s of surfacesConfig) map[s.id] = s;
    return map;
  }, [surfacesConfig]);
  const promptTemplate = visualizerConfig?.edit?.promptTemplate || FALLBACK_PROMPT;
  const presetAspect = behavior?.displayAspect ?? 16 / 10;
  const aiAnalysisEnabled = visualizerConfig?.analysis?.enabled !== false;
  const aiEditEnabled = visualizerConfig?.edit?.enabled !== false;
  const editMaxInputDim = visualizerConfig?.edit?.maxInputDim ?? 500;
  const editQuality = visualizerConfig?.edit?.quality ?? 0.85;

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
  const [showCompare, setShowCompare] = useState(false);
  const [compareMaterialId, setCompareMaterialId] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [aiEditedImage, setAiEditedImage] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [uploadSurface, setUploadSurface] = useState<string>('floor');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [sliderPos, setSliderPos] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [showSaved, setShowSaved] = useState(false);
  const [layout, setLayout] = useState<RoomLayout | null>(null);
  const [aiSegments, setAiSegments] = useState<Partial<Record<string, NormalizedPoint[]>>>({});
  const [editingSurfaceId, setEditingSurfaceId] = useState<string | null>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  /* Surface +' perspective mapping kept close to the helpers for maintainability. */
  const surfKind = (id: string): SurfaceKind =>
    id === 'wall' ? 'wall' : id === 'ceiling' ? 'ceiling' : id === 'countertop' ? 'countertop' : 'floor';
  const surfTileCm = (id: string): number =>
    surfaceConfigById[id]?.tileCm ?? (id === 'countertop' ? 60 : id === 'ceiling' ? 30 : 40);

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
  const compareMaterial = visMaterials.find((m) => m.id === compareMaterialId);

  // The base photo for AI (upload) or the preset room's photo (existing rooms).
  const originalImage = uploadedImage ?? selectedRoom?.previewImage ?? null;
  const roomImage = (showOriginal && originalImage)
    ? originalImage
    : (aiEditedImage || originalImage);

  // When an AI edit exists, the canvas shows that image instead of the CSS
  // texture overlay (which stays as the instant preview / fallback).
  const aiResultActive = !!aiEditedImage;
  const resultSrc = roomImage;

  // Preset rooms render at the configured box (their clip-paths were authored
  // for it); uploads keep the photo's own aspect. AI edits match that display box.
  const displayAspect = uploadMode && imageAspect ? imageAspect : presetAspect;

  /** FLUX noun for a surface: configured surfaces by id, presets by their name. */
  const nounForSurface = (surfaceId: string): string => {
    const configured = surfaceConfigById[surfaceId];
    if (configured?.noun) return configured.noun;
    const name = (selectedRoom?.surfaces.find((s) => s.id === surfaceId)?.nameEn || '').toLowerCase();
    if (name.includes('floor')) return 'floor';
    if (name.includes('ceiling')) return 'ceiling';
    if (name.includes('counter') || name.includes('island') || name.includes('cabinet')) return 'countertop and cabinetry';
    if (name.includes('wall')) return 'wall';
    return 'surface';
  };

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
        setAiEditedImage(null);
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
   * Automatic AI edit: when the user picks a material for an uploaded room,
   * FLUX.2 klein repaints the chosen surface with that material. The prompt is
   * derived from the material name + surface type (no manual prompt needed).
   * The CSS texture overlay stays as an instant preview/fallback.
   */
  const runAutoAiEdit = async (material: VisMaterial, surfaceId: string) => {
    const base = uploadedImage ?? selectedRoom?.previewImage ?? null;
    if (!base || !aiEditEnabled) return;
    setAiBusy(true);
    setAiError(false);
    setAiEditedImage(null);
    try {
      const compressed = await compressImage(base, {
        maxDim: editMaxInputDim,
        quality: editQuality,
        cropAspect: uploadMode ? undefined : displayAspect,
      });
      const materialDesc = [material.enName || material.name, material.colourLabel, material.typeLabel]
        .filter(Boolean)
        .join(', ');
      const res = await publicApi.aiEditRoom({
        prompt: buildMaterialPrompt(promptTemplate, materialDesc, nounForSurface(surfaceId)),
        image: compressed.dataUrl,
        mime: 'image/jpeg',
      });
      setAiEditedImage(res.image);
    } catch {
      setAiError(true);
    } finally {
      setAiBusy(false);
    }
  };

  /** Pick a surface and move to the material step (resets any previous AI edit). */
  const selectSurface = (surfaceId: string) => {
    setSelectedSurfaceId(surfaceId);
    setAiEditedImage(null);
    setAiError(false);
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
    if (!resultRef.current || exporting) return;
    setExporting(true);
    try {
      const blob = await snapshotElement(resultRef.current);
      if (mode === 'download') {
        downloadBlob(blob, 'pietrax-visualizer.png');
      } else {
        await shareBlob(blob, selectedMaterial?.name ?? 'PIETRAx', 'pietrax-visualizer.png');
      }
    } catch {
      // Snapshot failures fall back to opening the image.
      if (roomImage) {
        const a = document.createElement('a');
        a.href = roomImage;
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
                    setAiEditedImage(null);
                    setAiError(false);
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
            <button onClick={() => { setStep('surface'); setAiEditedImage(null); setAiError(false); setShowOriginal(false); }} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900">
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
                  if (uploadedImage || selectedRoom?.previewImage) {
                    void runAutoAiEdit(m, selectedSurfaceId || surfaces[0]?.id || 'floor');
                  }
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
              <button onClick={() => { setStep('room'); setUploadedImage(null); setUploadMode(false); setSelectedMaterialId(null); setAiEditedImage(null); setAiError(false); setShowOriginal(false); }} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                <RotateCcw size={13} strokeWidth={1.5} /> {t('reset')}
              </button>
              {aiResultActive ? (
                <button onClick={() => setShowOriginal((v) => !v)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                  {showOriginal ? t('aiEditResult') : t('originalImage')}
                </button>
              ) : allowCompare && (
                <button onClick={() => setShowCompare(!showCompare)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                  {t('compare')}
                </button>
              )}
            </div>
          </div>

          {/* Visualizer Canvas */}
          <div
            ref={resultRef}
            className="relative aspect-[16/10] overflow-hidden bg-stone-200"
            style={uploadMode && imageAspect ? { transform: `scale(${zoom})`, transformOrigin: 'center', aspectRatio: `${imageAspect}` } : { transform: `scale(${zoom})`, transformOrigin: 'center' }}
          >
            <img src={resultSrc ?? undefined} alt="Room" className="absolute inset-0 w-full h-full object-cover" />

            {/* Applied Material (CSS preview) — hidden when the AI result is shown */}
            {!aiResultActive && (
            <div
              className="absolute inset-0 transition-all duration-500"
              style={{ clipPath: applySurfaceClip(selectedSurfaceId || 'floor') }}
            >
              {uploadMode && layout ? (
                <div
                  className="absolute inset-0"
                  style={tileCss({
                    textureUrl: selectedMaterial.textureUrl,
                    tileCm: surfTileCm(selectedSurfaceId || 'floor'),
                    pxPerMeter: layout.pxPerMeter,
                    kind: surfKind(selectedSurfaceId || 'floor'),
                    horizonY: layout.horizonY,
                  })}
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: `url(${selectedMaterial.textureUrl})`,
                    backgroundSize: showCompare && sliderPos < 50 ? '0% 0%' : 'cover',
                    backgroundPosition: 'center',
                    mixBlendMode: 'multiply',
                    opacity: 0.85,
                  }}
                />
              )}
            </div>
            )}
            {!aiResultActive && showCompare && (
              <>
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: `polygon(0 0, ${sliderPos}% 0, ${sliderPos}% 100%, 0 100%)`,
                    backgroundImage: `url(${compareMaterial?.textureUrl || selectedMaterial.textureUrl})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    mixBlendMode: 'multiply',
                    opacity: 0.85,
                  }}
                />
                <div
                  className="absolute top-0 bottom-0 w-px bg-white shadow-lg cursor-ew-resize"
                  style={{ left: `${sliderPos}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center">
                    <ChevronLeft size={14} strokeWidth={2} className="text-stone-900" />
                    <ChevronRight size={14} strokeWidth={2} className="text-stone-900" />
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPos}
                  onChange={(e) => setSliderPos(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
                />
                <span className="absolute top-4 left-4 text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">{t('before')}</span>
                <span className="absolute top-4 right-4 text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">{t('after')}</span>
              </>
            )}

            {/* AI processing overlay */}
            {aiBusy && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-stone-950/40">
                <div className="flex items-center gap-3 bg-white px-5 py-3 shadow-lg">
                  <Loader2 size={16} strokeWidth={1.5} className="animate-spin text-stone-900" />
                  <span className="text-xs tracking-wider uppercase text-stone-700">{t('aiEditing')}</span>
                </div>
              </div>
            )}

            {/* Labels */}
            {!showCompare && (
              <div className="absolute bottom-4 left-4 flex gap-2">
                <span className="text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">
                  {lang === 'ar' ? selectedSurface?.nameAr || selectedSurfaceId : selectedSurface?.nameEn || selectedSurfaceId}
                </span>
                {aiResultActive && !showOriginal && (
                  <span className="text-xs tracking-wider uppercase text-white bg-stone-900 px-3 py-1.5">{t('aiEditResult')}</span>
                )}
                {aiResultActive && showOriginal && (
                  <span className="text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">{t('originalImage')}</span>
                )}
              </div>
            )}
          </div>

          {aiError && (
            <p className="mt-3 text-xs text-red-700">{t('aiEditFailed')}</p>
          )}

          {/* Compare Material Selector */}
          {allowCompare && showCompare && (
            <div className="mt-4">
              <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-3">{t('compare')} A / B</p>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide">
                {visMaterials.slice(0, 10).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setCompareMaterialId(m.id)}
                    className={`shrink-0 w-16 h-16 overflow-hidden border-2 ${compareMaterialId === m.id ? 'border-stone-900' : 'border-transparent'}`}
                  >
                    <img src={m.textureUrl} alt={m.name} className="w-full h-full object-cover" />
                  </button>
                ))}
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
