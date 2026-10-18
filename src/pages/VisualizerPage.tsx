import { useState, useRef, useMemo, useEffect } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubMaterialName, publicApi, type PubVisualizerSurface } from '@/lib/public';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import {
  ArrowLeft, Upload, ZoomIn, RotateCcw,
  Heart, Download, Share2, Check, Camera, X, Sparkles,
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
  type InstallPattern,
  type SourceRegion,
} from '@/lib/visualizer/textureMapper';
import { pointsToClipPath, simplifyPolygon } from '@/lib/visualizer/geometry';
import { requestRoomSegments } from '@/lib/visualizer/segmentClient';
import { compressImage } from '@/lib/visualizer/imagePreprocessor';
import { downloadBlob, shareBlob } from '@/lib/visualizer/domSnapshot';
import type { RoomLayout, Step, VisMaterial, NormalizedPoint, SurfaceKind } from '@/lib/visualizer/types';
import { AIAnalyzeButton } from '@/components/visualizer/AIAnalyzeButton';
import { PolygonEditor } from '@/components/visualizer/PolygonEditor';

/** Mirrors the server defaults so the page still works before /config loads. */
const FALLBACK_SURFACES: PubVisualizerSurface[] = [
  { id: 'floor', nameAr: 'الأرضية', nameEn: 'Floor', tileCm: 40, noun: 'floor', polygon: [{ x: 0, y: 0.55 }, { x: 1, y: 0.55 }, { x: 1, y: 1 }, { x: 0, y: 1 }] },
  { id: 'wall', nameAr: 'الجدار', nameEn: 'Wall', tileCm: 40, noun: 'wall', polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 0.55 }, { x: 0, y: 0.55 }] },
  { id: 'countertop', nameAr: 'سطح العمل', nameEn: 'Countertop', tileCm: 60, noun: 'countertop and cabinetry', polygon: [{ x: 0, y: 0.4 }, { x: 1, y: 0.4 }, { x: 1, y: 0.6 }, { x: 0, y: 0.6 }] },
];

/** Builds the edit-model prompt: names which image is the room and which is the
 *  material reference, then folds in the admin template with {noun}/{material}. */
function buildAiPrompt(template: string, noun: string, materialName: string, sizeHint: string): string {
  const base = (template || 'Repaint only the {noun} with {material}.')
    .replace(/\{noun\}/g, noun)
    .replace(/\{material\}/g, materialName);
  const size = sizeHint ? ` Use ${sizeHint} panels/tiles.` : '';
  return `Image 1 is the room photo. Image 2 is the exact material to install (${materialName}). ${base}${size} Take the material's real veining, colour, tone and finish from image 2. Keep everything except the ${noun} identical to image 1.`;
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
  const aiAutoApply = visualizerConfig?.analysis?.autoApply !== false;
  const renderSettings = visualizerConfig?.render;
  const installMode: 'realistic' | 'strict' = renderSettings?.mode === 'strict' ? 'strict' : 'realistic';
  const serverShadow = typeof renderSettings?.shadowStrength === 'number' ? renderSettings.shadowStrength : 0.4;
  const defaultSampling: 'nearest' | 'bilinear' = renderSettings?.defaultSampling === 'nearest' ? 'nearest' : 'bilinear';
  const editEnabled = visualizerConfig?.edit?.enabled === true;
  const editMaxDim = visualizerConfig?.edit?.maxInputDim ?? 500;
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('All');
  const [zoom, setZoom] = useState(1);
  const [showSaved, setShowSaved] = useState(false);
  const [layout, setLayout] = useState<RoomLayout | null>(null);
  const [aiSegments, setAiSegments] = useState<Partial<Record<string, NormalizedPoint[]>>>({});
  const [editingSurfaceId, setEditingSurfaceId] = useState<string | null>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [aiError, setAiError] = useState(false);
  const analyzedRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Camera capture.
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);

  // Deterministic texture-mapping state (Strict Texture Fidelity by default).
  const [textureParams, setTextureParams] = useState<TextureMapParams>({ ...DEFAULT_TEXTURE_PARAMS });
  const [compositeUrl, setCompositeUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState(false);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // LLM-applied result: FLUX takes the room photo + the exact material as a
  // reference image and paints the real stone onto the selected surface.
  const [aiResultUrl, setAiResultUrl] = useState<string | null>(null);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiApplyError, setAiApplyError] = useState(false);
  const aiAppliedRef = useRef<string | null>(null);

  // Room-scale calibration: a user-drawn reference of known real length.
  const [calibOpen, setCalibOpen] = useState(false);
  const [calibPoints, setCalibPoints] = useState<NormalizedPoint[]>([]);
  const [calibLengthCm, setCalibLengthCm] = useState<string>('100');
  const [calibPxPerMeter, setCalibPxPerMeter] = useState<number | null>(null);
  const [calibImgAspect, setCalibImgAspect] = useState(1);

  // Realistic installation extras: slab cutting region (source selection) and
  // comparison controls.
  const [sourceRegion, setSourceRegion] = useState<SourceRegion | null>(null);
  const [showCompare, setShowCompare] = useState(false);
  const [compareSplit, setCompareSplit] = useState(0.5);

  /** Run on-device room analysis once per upload: yields horizon + px-per-meter. */
  useEffect(() => {
    if (!uploadedImage || !uploadMode) return;
    const img = new Image();
    img.onload = () => {
      setLayout(analyzeRoomPhoto(img));
      setImageAspect(img.naturalWidth > 0 ? img.naturalWidth / img.naturalHeight : 16 / 10);
    };
    img.src = uploadedImage;
    return () => { setLayout(null); setAiSegments({}); setEditingSurfaceId(null); setImageAspect(null); analyzedRef.current = null; };
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

  /** Applies a room photo (from file or camera) and advances to surface selection. */
  const applyRoomImage = (dataUrl: string) => {
    analyzedRef.current = null;
    setUploadedImage(dataUrl);
    setShowOriginal(false);
    setUploadMode(true);
    setSelectedRoomId(null);
    setSelectedSurfaceId(null);
    setStep('surface');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => applyRoomImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const stopCameraStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const closeCamera = () => {
    stopCameraStream();
    setCameraOpen(false);
    setCameraBusy(false);
    setCameraError(false);
  };

  const openCamera = async () => {
    setCameraError(false);
    setCameraBusy(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('unsupported');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setCameraError(true);
      setCameraOpen(true);
    } finally {
      setCameraBusy(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    closeCamera();
    applyRoomImage(dataUrl);
  };

  // Attach the live stream once the preview element is mounted.
  useEffect(() => {
    if (!cameraOpen || !videoRef.current) return;
    if (streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => undefined);
    }
    return () => undefined;
  }, [cameraOpen]);

  /** Maps a click on the calibration image to normalized image coordinates. */
  const handleCalibClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const imgAspect = calibImgAspect || rect.width / rect.height;
    const cAspect = rect.width / rect.height;
    let dispW = rect.width;
    let dispH = rect.height;
    let offX = 0;
    let offY = 0;
    if (imgAspect > cAspect) {
      dispH = rect.width / imgAspect;
      offY = (rect.height - dispH) / 2;
    } else {
      dispW = rect.height * imgAspect;
      offX = (rect.width - dispW) / 2;
    }
    const nx = (cx - offX) / dispW;
    const ny = (cy - offY) / dispH;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;
    setCalibPoints((prev) => (prev.length >= 2 ? [{ x: nx, y: ny }] : [...prev, { x: nx, y: ny }]));
  };

  /** Computes px-per-metre from the two reference points and the real length. */
  const applyCalibration = async () => {
    const base = uploadedImage ?? selectedRoom?.previewImage ?? null;
    const lenM = Number(calibLengthCm) / 100;
    if (!base || calibPoints.length !== 2 || !(lenM > 0)) return;
    try {
      const img = await loadImage(base);
      const dx = (calibPoints[1].x - calibPoints[0].x) * img.naturalWidth;
      const dy = (calibPoints[1].y - calibPoints[0].y) * img.naturalHeight;
      const px = Math.hypot(dx, dy);
      if (px < 4) return;
      setCalibPxPerMeter(px / lenM);
      setCalibOpen(false);
    } catch {
      setRenderError(true);
    }
  };

  const defaultUploadPolygon: Record<string, NormalizedPoint[]> = Object.fromEntries(
    surfacesConfig.map((s) => [s.id, s.polygon]),
  );

  const polygonFor = (surfaceId: string): NormalizedPoint[] =>
    aiSegments[surfaceId] ?? defaultUploadPolygon[surfaceId] ?? [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
    ];

  /** Resolves the physical kind of a surface (drives the installation model). */
  const surfaceKindFor = (surfaceId: string): SurfaceKind => {
    const raw = uploadMode
      ? (surfaceConfigById[surfaceId]?.noun || surfaceConfigById[surfaceId]?.id || surfaceId)
      : (selectedRoom?.surfaces.find((s) => s.id === surfaceId)?.nameEn || surfaceId);
    const k = raw.toLowerCase();
    if (k.includes('counter') || k.includes('island') || k.includes('cabinet') || k.includes('sink')) return 'countertop';
    if (k.includes('ceiling')) return 'ceiling';
    if (k.includes('wall') || k.includes('back')) return 'wall';
    return 'floor';
  };

  /** Maps a cloud result (surfaceType -> points in 0..1) into per-surface clips. */
  const handleAISegments = (result: { segments: { surfaceType: string; points: { x: number; y: number }[] }[]; width: number; height: number }) => {
    const mapped: Partial<Record<string, NormalizedPoint[]>> = {};
    for (const seg of result.segments) {
      const surfaceId = surfaceIdForType(seg.surfaceType);
      if (surfaceId && seg.points.length >= 3) {
        const pts = seg.points.map((p) => ({
          x: Math.max(0, Math.min(1, p.x / result.width)),
          y: Math.max(0, Math.min(1, p.y / result.height)),
        }));
        // Keep the mask precise: only a very fine simplification so the
        // material hugs the surfacedetected by the model.
        const eps = Math.min(behavior?.simplifyTolerance ?? 0.02, 0.004);
        const maxPts = Math.max(behavior?.simplifyMinPoints ?? 30, 120);
        mapped[surfaceId] = simplifyPolygon(pts, eps, maxPts);
      }
    }
    setAiSegments((prev) => ({ ...prev, ...mapped }));
  };
  const handleAISegmentsRef = useRef(handleAISegments);
  handleAISegmentsRef.current = handleAISegments;

  /**
   * Auto-segment the room photo as soon as the surface step opens, so the
   * material is placed on the model-detected surface mask instead of a crude
   * default region. Runs once per distinct photo; the manual button re-runs it.
   */
  useEffect(() => {
    if (step !== 'surface' || !roomImage || !aiAnalysisEnabled || !aiAutoApply) return;
    if (analyzedRef.current === roomImage) return;
    analyzedRef.current = roomImage;
    let cancelled = false;
    setAutoAnalyzing(true);
    setAiError(false);
    (async () => {
      try {
        const res = await requestRoomSegments(roomImage, uploadMode ? undefined : displayAspect);
        if (!cancelled) handleAISegmentsRef.current(res);
      } catch {
        if (!cancelled) setAiError(true);
      } finally {
        if (!cancelled) setAutoAnalyzing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, roomImage, aiAnalysisEnabled, aiAutoApply, uploadMode, displayAspect]);

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
    const aiPoly = aiSegments[surfaceId];
    const polygon = aiPoly && aiPoly.length >= 3
      ? aiPoly
      : uploadMode
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
      const ppmBase = calibPxPerMeter
        ?? (uploadMode && layout ? layout.pxPerMeter : Math.max(80, Math.round(imageW / 4)));
      const canvas = renderSurfaceTexture({
        roomImage: box,
        polygon,
        texture,
        params: { ...textureParams, sourceRegion },
        pxPerMeter: ppmBase * (box.width / imageW),
        surfaceKind: surfaceKindFor(surfaceId),
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
      const strict = installMode === 'strict';
      const base = paramsFromMaterial(material, strict ? 'neutral' : 'realistic');
      setTextureParams({
        ...base,
        sampling: strict ? 'nearest' : defaultSampling,
        lightingMode: strict ? 'neutral' : 'realistic',
        shadowStrength: strict ? 0 : serverShadow,
      });
    }
  }, [selectedMaterialId, installMode, defaultSampling, serverShadow]);

  // Re-render the composite whenever the inputs change.
  useEffect(() => {
    if (step !== 'result') return;
    void renderCompositeRef.current(1100);
  }, [step, uploadedImage, selectedRoomId, selectedSurfaceId, selectedMaterialId, textureParams, uploadMode, layout, aiSegments, visMaterials, calibPxPerMeter, sourceRegion]);

  /**
   * Applies the chosen material with the edit LLM: sends the room photo plus the
   * exact material texture as a reference image, and shows the generated result.
   * The deterministic engine composite stays as the fallback while it runs and if
   * AI editing is unavailable or fails.
   */
  const applyWithAi = async () => {
    const material = visMaterials.find((m) => m.id === selectedMaterialId);
    const surfaceId = selectedSurfaceId || (uploadMode ? 'floor' : selectedRoom?.surfaces[0]?.id);
    if (!roomImage || !material || !surfaceId) return;
    setAiApplying(true);
    setAiApplyError(false);
    try {
      const noun = surfaceConfigById[surfaceId]?.noun || surfaceId;
      const sizeHint =
        material.sizeLabel ||
        (material.tileWidth && material.tileHeight ? `${material.tileWidth}×${material.tileHeight} cm` : '');
      const prompt = buildAiPrompt(visualizerConfig?.edit?.promptTemplate ?? '', noun, material.enName || material.name, sizeHint);
      const cropAspect = uploadMode ? undefined : presetAspect;
      const room = await compressImage(roomImage, { maxDim: editMaxDim, quality: editQuality, ...(cropAspect ? { cropAspect } : {}) });
      let reference: string | undefined;
      if (material.textureUrl) {
        try {
          const tex = await compressImage(material.textureUrl, { maxDim: editMaxDim, quality: editQuality, cropAspect: 1 });
          reference = tex.dataUrl;
        } catch {
          /* reference is optional — the model can still work from the prompt */
        }
      }
      const res = await publicApi.aiEditRoom({
        prompt,
        image: room.dataUrl,
        mime: 'image/jpeg',
        ...(reference ? { reference, referenceMime: 'image/jpeg' } : {}),
      });
      setAiResultUrl(res.image);
    } catch {
      setAiApplyError(true);
    } finally {
      setAiApplying(false);
    }
  };
  const applyWithAiRef = useRef(applyWithAi);
  applyWithAiRef.current = applyWithAi;

  // Auto-apply with the LLM once per room/surface/material when the result opens.
  useEffect(() => {
    if (step !== 'result' || !editEnabled) return;
    const key = `${selectedRoomId ?? 'upload'}|${selectedSurfaceId ?? ''}|${selectedMaterialId ?? ''}|${roomImage ?? ''}`;
    if (aiAppliedRef.current === key) return;
    aiAppliedRef.current = key;
    void applyWithAiRef.current();
  }, [step, editEnabled, selectedRoomId, selectedSurfaceId, selectedMaterialId, roomImage]);

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
      // Export what is on screen: the LLM-applied result when shown, otherwise
      // re-render the deterministic engine composite at full resolution.
      if (!showOriginal && aiResultUrl) {
        const blob = await (await fetch(aiResultUrl)).blob();
        if (mode === 'download') {
          downloadBlob(blob, 'pietrax-visualizer.png');
        } else {
          await shareBlob(blob, selectedMaterial?.name ?? 'PIETRAx', 'pietrax-visualizer.png');
        }
        return;
      }
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
            <div className="grid md:grid-cols-2 gap-4 mb-8">
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-stone-300 hover:border-stone-900 transition-colors p-8 md:p-12 flex flex-col items-center gap-3 text-stone-600 hover:text-stone-900"
              >
                <Upload size={28} strokeWidth={1.5} />
                <p className="font-display text-xl font-light">{t('uploadYourRoom')}</p>
                <p className="text-sm text-stone-500">{t('uploadRoomDesc')}</p>
              </button>
              <button
                onClick={openCamera}
                disabled={cameraBusy}
                className="w-full border-2 border-dashed border-stone-300 hover:border-stone-900 transition-colors p-8 md:p-12 flex flex-col items-center gap-3 text-stone-600 hover:text-stone-900 disabled:opacity-60"
              >
                <Camera size={28} strokeWidth={1.5} />
                <p className="font-display text-xl font-light">{t('captureFromCamera')}</p>
                <p className="text-sm text-stone-500">{t('cameraHint')}</p>
              </button>
            </div>
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
                    analyzedRef.current = null;
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
                disabled={autoAnalyzing}
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
          {autoAnalyzing ? (
            <p className="flex items-center gap-2 text-xs text-stone-500 mb-6">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-stone-300 border-t-stone-700 animate-spin" />
              {t('analyzingImg')}
            </p>
          ) : aiError ? (
            <p className="text-xs text-red-700 mb-6">{t('aiFailed')}</p>
          ) : (
            <p className="text-xs text-stone-500 mb-6">{t('aiAutoHint')}</p>
          )}

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
              {editEnabled && (
                <button onClick={() => void applyWithAi()} disabled={aiApplying} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-900 bg-stone-900 text-ivory px-3 py-2 hover:bg-stone-800 transition-colors disabled:opacity-50">
                  <Sparkles size={13} strokeWidth={1.5} /> {aiApplying ? t('aiEditing') : t('aiEditButton')}
                </button>
              )}
              <button onClick={() => setZoom(zoom === 1 ? 1.5 : 1)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                <ZoomIn size={13} strokeWidth={1.5} /> {t('reset')}
              </button>
              <button onClick={() => { setStep('room'); setUploadedImage(null); setUploadMode(false); setSelectedMaterialId(null); setShowOriginal(false);           setCompositeUrl(null);
          setAiResultUrl(null);
          aiAppliedRef.current = null;
          setSourceRegion(null);
          setShowCompare(false);
          setCompareSplit(0.5); }} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                <RotateCcw size={13} strokeWidth={1.5} /> {t('reset')}
              </button>
              <button onClick={() => setShowOriginal((v) => !v)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                {showOriginal ? t('aiEditResult') : t('originalImage')}
              </button>
              <button onClick={() => setShowCompare((v) => !v)} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                {showCompare ? 'Hide Before/After' : 'Before / After'}
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
              src={showOriginal ? (roomImage ?? undefined) : (aiResultUrl ?? compositeUrl ?? roomImage ?? undefined)}
              alt="Room"
              className="absolute inset-0 w-full h-full object-cover"
            />
              {aiApplying && (
                <div className="absolute inset-0 flex items-center justify-center bg-stone-950/40">
                  <span className="flex items-center gap-2 text-xs tracking-wider uppercase text-white">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    {t('aiEditing')}
                  </span>
                </div>
              )}
              {/* Before/After slider overlay (works with AI or deterministic result) */}
              {!showOriginal && showCompare && compositeUrl && (
                <div className="absolute inset-0">
                  <img
                    src={aiResultUrl ?? compositeUrl ?? undefined}
                    alt="After"
                    className="absolute inset-0 w-full h-full object-cover"
                    style={{
                      clipPath: `polygon(${compareSplit * 100}% 0, 100% 0, 100% 100%, ${compareSplit * 100}% 100%)`,
                    }}
                  />
                  <img
                    src={roomImage ?? undefined}
                    alt="Before"
                    className="absolute inset-0 w-full h-full object-cover opacity-80"
                  />
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={compareSplit}
                    onChange={(e) => setCompareSplit(Number(e.target.value))}
                    className="absolute top-1/2 left-0 -translate-y-1/2 w-full h-0.5 bg-white/60 accent-stone-900"
                    style={{ touchAction: 'pan-x' }}
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-px h-10 bg-white"
                    style={{ left: `${compareSplit * 100}%` }}
                  />
                  <span className="absolute top-3 left-3 text-[11px] uppercase tracking-wider text-white bg-stone-950/60 px-2 py-1">Before</span>
                  <span className="absolute top-3 right-3 text-[11px] uppercase tracking-wider text-white bg-stone-950/60 px-2 py-1">After</span>
                </div>
              )}
              {/* Labels */}
            <div className="absolute bottom-4 left-4 flex gap-2">
              <span className="text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">
                {lang === 'ar' ? selectedSurface?.nameAr || selectedSurfaceId : selectedSurface?.nameEn || selectedSurfaceId}
              </span>
              {!showOriginal && aiResultUrl && (
                <span className="text-xs tracking-wider uppercase text-white bg-stone-900 px-3 py-1.5">AI</span>
              )}
              {!showOriginal && !aiResultUrl && compositeUrl && (
                    <span className="text-xs tracking-wider uppercase text-white bg-stone-900 px-3 py-1.5">
                      {textureParams.lightingMode === 'realistic' ? 'Realistic' : 'Neutral'}
                    </span>
                  )}
                  {sourceRegion && !showOriginal && compositeUrl && (
                    <span className="text-xs tracking-wider uppercase text-white bg-stone-900/80 px-3 py-1.5">Slab cut</span>
                  )}
              {showOriginal && (
                <span className="text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">{t('originalImage')}</span>
              )}
            </div>
          </div>

          {renderError && <p className="mt-3 text-xs text-red-700">Could not render the texture.</p>}
          {aiApplyError && <p className="mt-3 text-xs text-red-700">{editEnabled ? t('aiEditFailed') : t('aiEditUnavailable')}</p>}

              {/* Slab cutting planner (select a region of the source material) */}
              {!aiResultUrl && selectedMaterial && (
                <div className="mt-6 border border-stone-200 bg-ivory p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-800">Slab Cutting Planner</h3>
                    <span className="text-[11px] uppercase tracking-wider text-stone-500">Use only a cut from the slab</span>
                  </div>
                  <p className="text-xs text-stone-600 mb-3">
                    Drag to set the normalized region of the material texture to use for the entire surface. Leave clear to use the full slab.
                  </p>
                  <div className="grid gap-4 md:grid-cols-[240px,1fr]">
                    <div className="relative w-full aspect-square border border-stone-300 bg-stone-100 overflow-hidden">
                      <img
                        src={selectedMaterial.textureUrl}
                        alt="Material slab"
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      {sourceRegion && (
                        <div
                          className="absolute border-2 border-amber-600 bg-amber-600/20 pointer-events-none"
                          style={{
                            left: `${(sourceRegion.x) * 100}%`,
                            top: `${(sourceRegion.y) * 100}%`,
                            width: `${sourceRegion.w * 100}%`,
                            height: `${sourceRegion.h * 100}%`,
                          }}
                        />
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs text-stone-600">
                        <span className="mb-1 block">Region X · Y · W · H (0..1)</span>
                        <div className="grid grid-cols-4 gap-2">
                          <input type="number" step={0.01} min={0} max={1} className="border border-stone-300 px-2 py-1.5 text-sm" value={sourceRegion?.x ?? 0} onChange={(e) => {
                            const v = Math.max(0, Math.min(1, Number(e.target.value)));
                            setSourceRegion({ x: v, y: sourceRegion?.y ?? 0, w: sourceRegion?.w ?? 0.5, h: sourceRegion?.h ?? 0.5 });
                          }} />
                          <input type="number" step={0.01} min={0} max={1} className="border border-stone-300 px-2 py-1.5 text-sm" value={sourceRegion?.y ?? 0} onChange={(e) => {
                            const v = Math.max(0, Math.min(1, Number(e.target.value)));
                            setSourceRegion({ x: sourceRegion?.x ?? 0, y: v, w: sourceRegion?.w ?? 0.5, h: sourceRegion?.h ?? 0.5 });
                          }} />
                          <input type="number" step={0.01} min={0} max={1} className="border border-stone-300 px-2 py-1.5 text-sm" value={sourceRegion?.w ?? 0.5} onChange={(e) => {
                            const v = Math.max(0.01, Math.min(1, Number(e.target.value)));
                            setSourceRegion({ x: sourceRegion?.x ?? 0, y: sourceRegion?.y ?? 0, w: v, h: sourceRegion?.h ?? 0.5 });
                          }} />
                          <input type="number" step={0.01} min={0} max={1} className="border border-stone-300 px-2 py-1.5 text-sm" value={sourceRegion?.h ?? 0.5} onChange={(e) => {
                            const v = Math.max(0.01, Math.min(1, Number(e.target.value)));
                            setSourceRegion({ x: sourceRegion?.x ?? 0, y: sourceRegion?.y ?? 0, w: sourceRegion?.w ?? 0.5, h: v });
                          }} />
                        </div>
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setSourceRegion(null)} className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900">Clear cut</button>
                        <button onClick={() => setSourceRegion({ x: 0, y: 0, w: 0.5, h: 0.5 })} className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900">Half slab</button>
                        <button onClick={() => setSourceRegion({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })} className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900">Center 50%</button>
                      </div>
                      <div className="text-xs text-stone-600">
                        <span className="uppercase tracking-wider mr-1">Mode</span>
                        {sourceRegion ? 'Cut region only' : 'Full slab'}
                      </div>
                    </div>
                  </div>
                </div>
              )}
          {selectedMaterial && !aiResultUrl && (
            <div className="mt-6 border border-stone-200 bg-ivory p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-800">
                  {lang === 'ar' ? 'التركيب الحقيقي' : 'Realistic installation'}
                </h3>
                <span className="text-[11px] uppercase tracking-wider text-stone-500">
                  {textureParams.lightingMode === 'realistic' ? 'Realistic lighting' : 'Neutral lighting'}
                </span>
              </div>

              {/* Material dimensions (default from the product) */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Piece width (cm)</span>
                  <input
                    type="number" min={1}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.tileWidthCm}
                    onChange={(e) => setTextureParams({ ...textureParams, tileWidthCm: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Piece height (cm)</span>
                  <input
                    type="number" min={1}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.tileHeightCm}
                    onChange={(e) => setTextureParams({ ...textureParams, tileHeightCm: Number(e.target.value) })}
                  />
                </label>
                <div className="flex items-end">
                  <button
                    onClick={() => setTextureParams({
                      ...textureParams,
                      tileWidthCm: textureParams.tileHeightCm,
                      tileHeightCm: textureParams.tileWidthCm,
                      rotationDeg: (textureParams.rotationDeg + 90) % 360,
                    })}
                    className="w-full border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900"
                  >
                    Orientation · 90°
                  </button>
                </div>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Rotation (deg)</span>
                  <input
                    type="number"
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.rotationDeg}
                    onChange={(e) => setTextureParams({ ...textureParams, rotationDeg: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mt-4">
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Installation pattern</span>
                    <select
                     className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                     value={textureParams.pattern}
                     onChange={(e) => setTextureParams({ ...textureParams, pattern: e.target.value as InstallPattern })}
                   >
                     <option value="stack">Straight lay</option>
                     <option value="running-bond">Running bond (½)</option>
                     <option value="third-bond">Third bond (⅓)</option>
                     <option value="bookmatch">Bookmatch (2-panel)</option>
                     <option value="bookmatch-4">Bookmatch (4-panel)</option>
                   </select>
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Joint width (mm)</span>
                  <input
                    type="number" min={0} step={0.5}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={Math.round(textureParams.groutWidthCm * 100) / 10}
                    onChange={(e) => setTextureParams({ ...textureParams, groutWidthCm: Number(e.target.value) / 10 })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Joint color</span>
                  <input
                    type="color"
                    className="h-9 w-full border border-stone-300"
                    value={textureParams.groutColor}
                    onChange={(e) => setTextureParams({ ...textureParams, groutColor: e.target.value })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Pattern scale</span>
                  <input
                    type="number" min={0.1} step={0.1}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.patternScale}
                    onChange={(e) => setTextureParams({ ...textureParams, patternScale: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-4 mt-4">
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Offset X (pieces)</span>
                  <input
                    type="number" step={0.1}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.offsetX}
                    onChange={(e) => setTextureParams({ ...textureParams, offsetX: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Offset Y (pieces)</span>
                  <input
                    type="number" step={0.1}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.offsetY}
                    onChange={(e) => setTextureParams({ ...textureParams, offsetY: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">Lighting strength</span>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    className="w-full"
                    value={textureParams.lightingStrength}
                    onChange={(e) => setTextureParams({ ...textureParams, lightingStrength: Number(e.target.value) })}
                  />
                </label>
                {surfaceKindFor(selectedSurfaceId || '') === 'countertop' && (
                  <label className="block text-xs text-stone-600">
                    <span className="mb-1 block">Edge thickness (cm)</span>
                    <input
                      type="number" min={0} step={0.5}
                      className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                      value={textureParams.edgeThicknessCm}
                      onChange={(e) => setTextureParams({ ...textureParams, edgeThicknessCm: Number(e.target.value) })}
                    />
                  </label>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-4 text-xs text-stone-700">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={textureParams.lightingMode === 'realistic'}
                    onChange={(e) => setTextureParams({ ...textureParams, lightingMode: e.target.checked ? 'realistic' : 'neutral' })}
                  />
                  Realistic lighting
                </label>
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
                    <option value="bilinear">Bilinear</option>
                    <option value="nearest">Nearest (exact)</option>
                  </select>
                </label>
              </div>

              {/* Room scale / calibration */}
              <div className="mt-5 border-t border-stone-200 pt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-stone-600">
                  <span className="uppercase tracking-wider mr-2">Room scale</span>
                  {calibPxPerMeter
                    ? <span className="text-stone-900">Calibrated · {calibPxPerMeter.toFixed(0)} px/m</span>
                    : <span className="text-stone-500">Estimated — calibrate for exact size</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCalibPoints([]); setCalibOpen(true); }}
                    className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900"
                  >
                    Calibrate scale
                  </button>
                  {calibPxPerMeter && (
                    <button
                      onClick={() => setCalibPxPerMeter(null)}
                      className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900"
                    >
                      Clear
                    </button>
                  )}
                </div>
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

      {cameraOpen && (
        <div className="fixed inset-0 z-[100] bg-stone-950/90 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white">
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
              <span className="text-xs tracking-[0.2em] uppercase text-stone-600">{t('captureFromCamera')}</span>
              <button onClick={closeCamera} className="text-stone-500 hover:text-stone-900" aria-label={t('cancel')}>
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="relative bg-stone-950 aspect-[4/3] flex items-center justify-center overflow-hidden">
              {cameraError ? (
                <p className="text-stone-300 text-sm px-6 text-center">{t('cameraError')}</p>
              ) : (
                <video ref={videoRef} playsInline muted autoPlay className="w-full h-full object-contain" />
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4">
              <button onClick={closeCamera} className="px-5 py-2 text-xs tracking-wider uppercase text-stone-600 hover:text-stone-900">
                {cameraError ? t('close') : t('cancel')}
              </button>
              {!cameraError && (
                <button onClick={capturePhoto} className="px-6 py-2 bg-stone-900 text-ivory text-xs tracking-wider uppercase hover:bg-stone-700 flex items-center gap-2">
                  <Camera size={14} strokeWidth={1.5} />
                  {t('capturePhoto')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {calibOpen && roomImage && (
        <div className="fixed inset-0 z-[100] bg-stone-950/90 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl bg-white max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between px-5 py-3 border-b border-stone-200">
              <span className="text-xs tracking-[0.2em] uppercase text-stone-600">
                {lang === 'ar' ? 'معايرة مقياس الغرفة' : 'Calibrate room scale'}
              </span>
              <button onClick={() => setCalibOpen(false)} className="text-stone-500 hover:text-stone-900" aria-label={t('cancel')}>
                <X size={20} strokeWidth={1.5} />
              </button>
            </div>
            <div className="p-5">
              <p className="text-xs text-stone-500 mb-3">
                {lang === 'ar'
                  ? 'انقر على نقطتين في الصورة وأدخل المسافة الحقيقية بينهما لضبط المقياس الفعلي للتركيب.'
                  : 'Click two points on the photo, then enter the real distance between them so the stone is installed at true size.'}
              </p>
              <div
                className="relative w-full bg-stone-900 select-none cursor-crosshair"
                style={{ aspectRatio: `${calibImgAspect}` }}
                onClick={handleCalibClick}
              >
                <img
                  src={roomImage}
                  alt="calibrate"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  onLoad={(e) => setCalibImgAspect(e.currentTarget.naturalWidth / Math.max(1, e.currentTarget.naturalHeight))}
                />
                {calibPoints.length === 2 && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    <line
                      x1={`${calibPoints[0].x * 100}%`}
                      y1={`${calibPoints[0].y * 100}%`}
                      x2={`${calibPoints[1].x * 100}%`}
                      y2={`${calibPoints[1].y * 100}%`}
                      stroke="#b8860b"
                      strokeWidth={2}
                    />
                  </svg>
                )}
                {calibPoints.map((p, i) => (
                  <span
                    key={i}
                    className="absolute w-3 h-3 rounded-full bg-amber-600 border border-white"
                    style={{ left: `calc(${p.x * 100}% - 6px)`, top: `calc(${p.y * 100}% - 6px)` }}
                  />
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-stone-600">
                  {lang === 'ar' ? 'المسافة الحقيقية' : 'Real distance'}
                  <input
                    type="number" min={1}
                    className="w-24 border border-stone-300 px-2 py-1.5 text-sm"
                    value={calibLengthCm}
                    onChange={(e) => setCalibLengthCm(e.target.value)}
                  />
                  cm
                </label>
                <span className="text-xs text-stone-400">{calibPoints.length}/2 {lang === 'ar' ? 'نقاط' : 'points'}</span>
                <div className="flex-1" />
                <button
                  onClick={() => setCalibPoints([])}
                  className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900"
                >
                  {lang === 'ar' ? 'إعادة' : 'Reset'}
                </button>
                <button
                  disabled={calibPoints.length !== 2}
                  onClick={applyCalibration}
                  className="bg-stone-900 text-ivory px-4 py-1.5 text-xs uppercase tracking-wider disabled:opacity-40"
                >
                  {lang === 'ar' ? 'تطبيق' : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
