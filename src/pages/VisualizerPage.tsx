import { useState, useRef, useMemo, useEffect } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubMaterialName, publicApi, type PubVisualizerSurface } from '@/lib/public';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import {
  ArrowLeft, Upload, ZoomIn, RotateCcw,
  Heart, Download, Share2, Check, Camera, X, Sparkles, Wand2,
  ZoomOut, Columns2, ChevronsLeftRight,
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
  measureSurfacePhysical,
  computeInstallStats,
} from '@/lib/visualizer/textureMapper';
import { pointsToClipPath, simplifyPolygon } from '@/lib/visualizer/geometry';
import { requestRoomSegments } from '@/lib/visualizer/segmentClient';
import { compressImage } from '@/lib/visualizer/imagePreprocessor';
import { downloadBlob, shareBlob } from '@/lib/visualizer/domSnapshot';
import type { RoomLayout, Step, VisMaterial, NormalizedPoint, SurfaceKind } from '@/lib/visualizer/types';
import { AIAnalyzeButton } from '@/components/visualizer/AIAnalyzeButton';
import { PolygonEditor } from '@/components/visualizer/PolygonEditor';
import {
  prepareWandImage, floodSelect, combineMasks, finalizeMask, maskToPolygon,
  type WandImage, type WandMode,
} from '@/lib/visualizer/magicWand';

/** Long edge of the working copy of an uploaded photo. */
const UPLOAD_MAX_DIM = 2400;
/** Debounce for re-rendering the composite while controls change. */
const RENDER_DEBOUNCE_MS = 120;

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

  const rooms = useMemo(() => visualizer?.rooms ?? [], [visualizer]);

  const features = visualizerConfig?.features;
  const allowUpload = features?.allowUpload !== false;
  const allowPresetRooms = features?.allowPresetRooms !== false;
  const allowExport = features?.allowExport !== false;
  const allowManualAreaEdit = features?.allowManualAreaEdit !== false;
  const allowCompare = features?.allowCompare !== false;
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
  const [uploadBusy, setUploadBusy] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 });
  const [savedAdded, setSavedAdded] = useState(true);
  const savedTimerRef = useRef<number | null>(null);
  const [uploadError, setUploadError] = useState(false);

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
  const aiRequestRef = useRef(0);

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
  /** Coverage / waste readout for the current surface + piece size. */
  const [installStats, setInstallStats] = useState<ReturnType<typeof computeInstallStats> | null>(null);

  // Smart "magic wand" selection: click any part of the photo to select it.
  const [wandActive, setWandActive] = useState(false);
  const [wandTarget, setWandTarget] = useState<string | null>(null);
  const [wandMode, setWandMode] = useState<WandMode>('replace');
  const [wandTolerance, setWandTolerance] = useState(14);
  const [wandBusy, setWandBusy] = useState(false);
  const [wandEmpty, setWandEmpty] = useState(false);
  const wandImageRef = useRef<{ key: string; img: WandImage } | null>(null);
  const wandMasksRef = useRef<Record<string, Uint8Array>>({});

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

  /**
   * Deep link (`?material=slug`, from collections / wishlist): preselect the
   * material and open it in a matching preset room. Applied once per slug, so
   * it never hijacks the visitor's later choices (e.g. uploading their photo).
   */
  const presetAppliedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!presetMaterialSlug || presetAppliedRef.current === presetMaterialSlug) return;
    const material = visMaterials.find((m) => m.slug === presetMaterialSlug);
    if (!material) return; // catalog not loaded yet
    const room = allowPresetRooms
      ? rooms.find((r) => r.surfaces.some((s) => s.defaultMaterialSlug === presetMaterialSlug)) ?? rooms[0]
      : undefined;
    if (allowPresetRooms && loading && !room) return; // rooms still loading
    presetAppliedRef.current = presetMaterialSlug;
    setSelectedMaterialId(material.id);
    const surface = room?.surfaces.find((s) => s.defaultMaterialSlug === presetMaterialSlug) ?? room?.surfaces[0];
    if (!room || !surface) return; // no preset room: the visitor uploads, material stays selected
    setSelectedRoomId(room.id);
    setSelectedSurfaceId(surface.id);
    setUploadMode(false);
    setUploadedImage(null);
    setStep('result');
  }, [presetMaterialSlug, rooms, visMaterials, allowPresetRooms, loading]);

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

  // A new photo invalidates any magic-wand selection state.
  useEffect(() => {
    wandMasksRef.current = {};
    wandImageRef.current = null;
    setWandActive(false);
    setWandEmpty(false);
  }, [roomImage]);

  /** Maps a detected surfaceType to the active surface id (upload id or preset id). */
  const surfaceIdForType = (type: string): string | null => {
    const k = type.toLowerCase();
    if (uploadMode) {
      if (surfaceConfigById[k]) return k;
      const byNoun = surfacesConfig.find((s) => s.noun.toLowerCase().includes(k));
      return byNoun?.id ?? null;
    }
    const list = selectedRoom?.surfaces ?? [];
    const typed = (...types: string[]) => list.find((s) => types.includes((s.surfaceType || '').toUpperCase()));
    const named = (...words: string[]) => list.find((s) => words.some((w) => (s.nameEn || '').toLowerCase().includes(w)));
    const match =
      k === 'floor' ? typed('FLOOR') ?? named('floor')
      : k === 'wall' ? typed('WALL') ?? typed('BACKSPLASH') ?? named('wall', 'back')
      : k === 'ceiling' ? typed('CEILING') ?? named('ceiling')
      : k === 'countertop' ? typed('COUNTERTOP', 'ISLAND', 'VANITY') ?? named('counter', 'island', 'cabinet', 'vanity')
      : undefined;
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
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = ''; // picking the same photo again must still fire onChange
    if (file) void processRoomFile(file);
  };

  /** Validates, downsizes and applies a room photo from any source (picker, drop, paste). */
  const processRoomFile = async (file: File) => {
    setUploadError(false);
    if (file.type && !file.type.startsWith('image/')) {
      setUploadError(true);
      return;
    }
    setUploadBusy(true);
    try {
      // Phone photos can be 12+ MP: cap the working copy so every canvas step
      // (analysis, smart select, texture render, export) stays fast.
      const { dataUrl } = await compressImage(file, { maxDim: UPLOAD_MAX_DIM, quality: 0.9 });
      applyRoomImage(dataUrl);
    } catch {
      setUploadError(true); // e.g. HEIC the browser cannot decode
    } finally {
      setUploadBusy(false);
    }
  };

  // Paste a photo straight from the clipboard while on the first step.
  const processRoomFileRef = useRef(processRoomFile);
  processRoomFileRef.current = processRoomFile;
  useEffect(() => {
    if (step !== 'room' || !allowUpload) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      void processRoomFileRef.current(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [step, allowUpload]);

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

  // Never leave the camera running after the visitor navigates away.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

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
  const renderSeqRef = useRef(0);
  const renderComposite = async (maxDimension?: number): Promise<HTMLCanvasElement | null> => {
    const seq = ++renderSeqRef.current;
    const isCurrent = () => seq === renderSeqRef.current;
    const base = uploadedImage ?? selectedRoom?.previewImage ?? null;
    const material = visMaterials.find((m) => m.id === selectedMaterialId);
    const surfaceId = selectedSurfaceId || (uploadMode ? 'floor' : selectedRoom?.surfaces[0]?.id);
    if (!base || !material?.textureUrl || !surfaceId) {
      compositeCanvasRef.current = null;
      setCompositeUrl(null);
      return null;
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
      return null;
    }
    try {
      const [room, texture] = await Promise.all([loadImage(base), loadImage(material.textureUrl)]);
      if (!isCurrent()) return null;
      const aspect = uploadMode && imageAspect ? imageAspect : presetAspect;
      const box = coverCanvas(room, aspect, maxDimension ?? 1600);
      const imageW = room.naturalWidth || box.width;
      const imageH = room.naturalHeight || box.height;
      const ppmBase = calibPxPerMeter
        ?? (uploadMode && layout ? layout.pxPerMeter : Math.max(80, Math.round(imageW / 4)));
      // Source px -> box px: the cover scale (not box.width / imageW, which is
      // wrong whenever the cover crop trims the photo's width).
      const coverScale = Math.max(box.width / imageW, box.height / imageH);
      const boxPpm = ppmBase * coverScale;
      const canvas = renderSurfaceTexture({
        roomImage: box,
        polygon,
        texture,
        params: { ...textureParams, sourceRegion },
        pxPerMeter: boxPpm,
        surfaceKind: surfaceKindFor(surfaceId),
      });
      if (!isCurrent()) return canvas;
      compositeCanvasRef.current = canvas;
      setCompositeUrl(canvas.toDataURL('image/png'));
      setRenderError(false);
      // Coverage / waste readout from the same physical measurement the render uses.
      const measured = measureSurfacePhysical({
        polygon,
        pxPerMeter: boxPpm,
        imageWidth: box.width,
        imageHeight: box.height,
      });
      if (measured) {
        const pieceW = (textureParams.repeatX > 0 ? measured.widthM / textureParams.repeatX : (textureParams.tileWidthCm * textureParams.patternScale) / 100);
        const pieceH = (textureParams.repeatY > 0 ? measured.heightM / textureParams.repeatY : (textureParams.tileHeightCm * textureParams.patternScale) / 100);
        setInstallStats(computeInstallStats({
          surfaceWidthM: measured.widthM,
          surfaceHeightM: measured.heightM,
          pieceWidthM: pieceW,
          pieceHeightM: pieceH,
        }));
      } else {
        setInstallStats(null);
      }
      return canvas;
    } catch {
      if (isCurrent()) setRenderError(true);
      return null;
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

  // Re-render the composite whenever the inputs change (debounced so typing in
  // a number field or dragging a slider does not queue a render per keystroke).
  useEffect(() => {
    if (step !== 'result') return;
    const timer = window.setTimeout(() => { void renderCompositeRef.current(1100); }, RENDER_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
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
    const requestId = ++aiRequestRef.current;
    const isCurrent = () => requestId === aiRequestRef.current;
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
      // A newer selection superseded this request: never show a result for
      // the previous material / surface.
      if (!isCurrent()) return;
      if (!res.image) throw new Error('empty result');
      setAiResultUrl(res.image);
    } catch {
      if (isCurrent()) setAiApplyError(true);
    } finally {
      if (isCurrent()) setAiApplying(false);
    }
  };
  const applyWithAiRef = useRef(applyWithAi);
  applyWithAiRef.current = applyWithAi;

  // Auto-apply with the LLM once per room/surface/material when the result opens.
  // A new selection first drops the previous AI image (it shows another material).
  useEffect(() => {
    if (step !== 'result') return;
    const key = `${selectedRoomId ?? 'upload'}|${selectedSurfaceId ?? ''}|${selectedMaterialId ?? ''}|${roomImage ?? ''}`;
    if (aiAppliedRef.current === key) return;
    aiAppliedRef.current = key;
    aiRequestRef.current++; // cancel any request still in flight
    setAiResultUrl(null);
    setAiApplyError(false);
    setAiApplying(false);
    if (editEnabled) void applyWithAiRef.current();
  }, [step, editEnabled, selectedRoomId, selectedSurfaceId, selectedMaterialId, roomImage]);

  /** What the result step shows: the AI image when present, else the engine composite. */
  const resultImageUrl = aiResultUrl ?? compositeUrl;

  /** Back to step 1 with a clean slate (photo, selection, masks, scale, view). */
  const startOver = () => {
    aiRequestRef.current++;
    renderSeqRef.current++;
    aiAppliedRef.current = null;
    wandMasksRef.current = {};
    setStep('room');
    setUploadedImage(null);
    setUploadMode(false);
    setSelectedRoomId(null);
    setSelectedSurfaceId(null);
    setSelectedMaterialId(null);
    setAiSegments({});
    setEditingSurfaceId(null);
    setWandActive(false);
    setShowOriginal(false);
    setCompositeUrl(null);
    compositeCanvasRef.current = null;
    setAiResultUrl(null);
    setAiApplying(false);
    setAiApplyError(false);
    setRenderError(false);
    setExportError(false);
    setSourceRegion(null);
    setShowCompare(false);
    setCompareSplit(0.5);
    setCalibPxPerMeter(null);
    setInstallStats(null);
    setZoom(1);
    analyzedRef.current = null;
  };

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

  /** Magic-wand click: grow a region of similar colour from the clicked point. */
  const handleWandClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const target = wandTarget ?? surfaces[0]?.id;
    if (!roomImage || !target || wandBusy) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return;
    setWandBusy(true);
    try {
      const key = `${roomImage}|${displayAspect}`;
      if (wandImageRef.current?.key !== key) {
        const img = await loadImage(roomImage);
        const prepared = prepareWandImage(img, displayAspect);
        if (!prepared) return;
        wandImageRef.current = { key, img: prepared };
      }
      const wi = wandImageRef.current.img;
      const fresh = finalizeMask(
        floodSelect(wi, nx, ny, { tolerance: wandTolerance, edgeThreshold: wandTolerance * 1.3 }),
        wi.w, wi.h, 'replace',
      );
      const combined = finalizeMask(combineMasks(wandMasksRef.current[target] ?? null, fresh, wandMode), wi.w, wi.h, wandMode);
      const poly = maskToPolygon(combined, wi.w, wi.h);
      if (poly.length < 3) {
        setWandEmpty(true);
        return;
      }
      setWandEmpty(false);
      wandMasksRef.current[target] = combined;
      setAiSegments((prev) => ({ ...prev, [target]: poly }));
    } catch {
      setWandEmpty(true);
    } finally {
      setWandBusy(false);
    }
  };

  const clearWandSelection = () => {
    const target = wandTarget ?? surfaces[0]?.id;
    if (!target) return;
    delete wandMasksRef.current[target];
    setAiSegments((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
  };

  const uploadSurfaces = surfacesConfig.map((s) => ({ id: s.id, name: s.nameEn, nameAr: s.nameAr }));

  const surfaces = uploadMode
    ? uploadSurfaces.map((s) => ({ id: s.id, clipPath: '', nameAr: s.nameAr, nameEn: s.name }))
    : (selectedRoom?.surfaces ?? []).map((s) => ({ id: s.id, clipPath: s.clipPath, nameAr: s.nameAr, nameEn: s.nameEn }));

  const handleExport = async (mode: 'download' | 'share') => {
    setExportError(false);
    if (exporting) return;
    setExporting(true);
    try {
      // Export what is on screen: the LLM-applied result when shown, otherwise
      // re-render the deterministic engine composite at full resolution.
      let blob: Blob | null = null;
      if (!showOriginal && aiResultUrl) {
        blob = await (await fetch(aiResultUrl)).blob();
      } else {
        const canvas = (await renderCompositeRef.current(undefined)) ?? compositeCanvasRef.current;
        blob = canvas
          ? await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
          : null;
      }
      if (!blob) {
        setExportError(true);
        return;
      }
      const ext = blob.type === 'image/jpeg' ? 'jpg' : blob.type === 'image/webp' ? 'webp' : 'png';
      const slug = selectedMaterial?.slug ?? 'design';
      const filename = `pietrax-${slug}.${ext}`;
      if (mode === 'download') downloadBlob(blob, filename);
      else await shareBlob(blob, selectedMaterial?.name ?? 'PIETRAx', filename);
    } catch {
      // Never hand out the untouched photo as if it were the design.
      setExportError(true);
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
                disabled={uploadBusy}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void processRoomFile(file);
                }}
                className={`w-full border-2 border-dashed transition-colors p-8 md:p-12 flex flex-col items-center gap-3 hover:text-stone-900 disabled:opacity-60 ${
                  dragOver ? 'border-stone-900 bg-stone-200/60 text-stone-900' : 'border-stone-300 hover:border-stone-900 text-stone-600'
                }`}
              >
                {uploadBusy
                  ? <span className="inline-block h-7 w-7 rounded-full border-2 border-stone-300 border-t-stone-800 animate-spin" />
                  : <Upload size={28} strokeWidth={1.5} />}
                <p className="font-display text-xl font-light">
                  {uploadBusy ? t('vzUploadBusy') : dragOver ? t('vzDropNow') : t('uploadYourRoom')}
                </p>
                <p className="text-sm text-stone-500">{t('uploadRoomDesc')}</p>
                <p className="hidden md:block text-xs text-stone-400">{t('vzDropHint')}</p>
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
            {uploadError && <p role="alert" className="-mt-4 mb-6 text-sm text-red-700">{t('vzUploadInvalid')}</p>}
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
            {allowManualAreaEdit && (
              <button
                onClick={() => {
                  setWandActive((v) => !v);
                  setEditingSurfaceId(null);
                  setWandTarget((cur) => cur ?? selectedSurfaceId ?? surfaces[0]?.id ?? null);
                }}
                aria-pressed={wandActive}
                className={`flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-900 px-3 py-2 transition-colors ${wandActive ? 'bg-stone-900 text-ivory' : 'text-stone-900 hover:bg-stone-900 hover:text-ivory'}`}
              >
                <Wand2 size={13} strokeWidth={1.5} /> {t('smartSelect')}
              </button>
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

          {wandActive ? (
            <div className="mb-6 border border-stone-300 bg-stone-100 p-3">
              <p className="text-xs text-stone-500 mb-3">{t('smartSelectHint')}</p>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] tracking-[0.15em] uppercase text-stone-500">{t('wandTarget')}</span>
                  {surfaces.map((surface) => {
                    const active = (wandTarget ?? surfaces[0]?.id) === surface.id;
                    return (
                      <button
                        key={surface.id}
                        onClick={() => setWandTarget(surface.id)}
                        aria-pressed={active}
                        className={`text-xs px-3 py-1.5 border transition-colors ${active ? 'border-stone-900 bg-stone-900 text-ivory' : 'border-stone-300 text-stone-700 hover:border-stone-900'}`}
                      >
                        {lang === 'ar' ? (surface.nameAr || t(surface.id === 'floor' ? 'floor' : surface.id === 'wall' ? 'wall' : 'countertop')) : surface.nameEn}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center border border-stone-300" role="group">
                  {(['replace', 'add', 'subtract'] as WandMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => setWandMode(m)}
                      aria-pressed={wandMode === m}
                      className={`text-xs px-3 py-1.5 transition-colors ${wandMode === m ? 'bg-stone-900 text-ivory' : 'text-stone-700 hover:bg-stone-200'}`}
                    >
                      {t(m === 'replace' ? 'wandNew' : m === 'add' ? 'wandAdd' : 'wandSubtract')}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-[11px] tracking-[0.15em] uppercase text-stone-500">
                  {t('wandTolerance')}
                  <input
                    type="range"
                    min={4}
                    max={40}
                    step={1}
                    value={wandTolerance}
                    onChange={(e) => setWandTolerance(Number(e.target.value))}
                    className="w-28 accent-stone-900"
                  />
                </label>
              </div>
              <div
                className={`relative overflow-hidden bg-stone-200 select-none ${wandBusy ? 'cursor-wait' : 'cursor-crosshair'}`}
                style={{ aspectRatio: `${displayAspect}` }}
                onClick={(e) => { void handleWandClick(e); }}
              >
                <img src={roomImage} alt="Room" className="w-full h-full object-cover pointer-events-none" draggable={false} />
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full pointer-events-none">
                  {surfaces.map((surface) => {
                    const pts = aiSegments[surface.id];
                    if (!pts || pts.length < 3) return null;
                    const active = (wandTarget ?? surfaces[0]?.id) === surface.id;
                    return (
                      <polygon
                        key={surface.id}
                        points={pts.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(' ')}
                        fill={active ? 'rgba(194,65,12,0.35)' : 'rgba(255,255,255,0.18)'}
                        stroke={active ? '#c2410c' : 'rgba(255,255,255,0.7)'}
                        strokeWidth={active ? 0.4 : 0.25}
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
                </svg>
                {wandBusy && (
                  <span className="absolute top-3 end-3 inline-block h-4 w-4 rounded-full border-2 border-white/60 border-t-white animate-spin" />
                )}
              </div>
              {wandEmpty && <p className="text-xs text-red-700 mt-2">{t('wandEmpty')}</p>}
              <div className="flex flex-wrap gap-3 mt-3">
                <button
                  onClick={clearWandSelection}
                  className="flex items-center gap-1.5 text-xs tracking-wider uppercase text-stone-600 hover:text-stone-900"
                >
                  <RotateCcw size={13} strokeWidth={1.5} /> {t('wandClear')}
                </button>
                <button
                  onClick={() => {
                    const target = wandTarget ?? surfaces[0]?.id;
                    if (!target) return;
                    setWandActive(false);
                    selectSurface(target);
                  }}
                  disabled={!(aiSegments[wandTarget ?? surfaces[0]?.id ?? '']?.length)}
                  className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-900 px-3 py-2 bg-stone-900 text-ivory hover:bg-stone-800 disabled:opacity-40"
                >
                  <Check size={13} strokeWidth={1.5} /> {t('wandUse')}
                </button>
              </div>
            </div>
          ) : editingSurfaceId && uploadMode ? (
            <div className="mb-6 border border-stone-300 bg-stone-100 p-3">
              <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-3">{t('adjustAreaHint')}</p>
              <PolygonEditor
                imageUrl={roomImage}
                points={aiSegments[editingSurfaceId] ?? defaultUploadPolygon[editingSurfaceId] ?? []}
                onChange={(pts) => {
                  delete wandMasksRef.current[editingSurfaceId];
                  setAiSegments((prev) => ({ ...prev, [editingSurfaceId]: pts }));
                }}
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
              <button
                onClick={() => { setZoom(zoom === 1 ? 2 : 1); setZoomOrigin({ x: 50, y: 50 }); }}
                aria-pressed={zoom > 1}
                className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors"
              >
                {zoom > 1 ? <ZoomOut size={13} strokeWidth={1.5} /> : <ZoomIn size={13} strokeWidth={1.5} />}
                {zoom > 1 ? t('vzZoomOut') : t('vzZoomIn')}
              </button>
              <button onClick={startOver} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors">
                <RotateCcw size={13} strokeWidth={1.5} /> {t('vzStartOver')}
              </button>
              <button
                onClick={() => { setShowOriginal((v) => !v); setShowCompare(false); }}
                aria-pressed={showOriginal}
                className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors"
              >
                {showOriginal ? t('aiEditResult') : t('originalImage')}
              </button>
              {allowCompare && (
                <button
                  onClick={() => { setShowCompare((v) => !v); setShowOriginal(false); }}
                  disabled={!resultImageUrl}
                  aria-pressed={showCompare}
                  className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors disabled:opacity-40"
                >
                  <Columns2 size={13} strokeWidth={1.5} />
                  {showCompare ? t('vzHideCompare') : `${t('before')} / ${t('after')}`}
                </button>
              )}
              {aiResultUrl && (
                <button onClick={() => { setAiResultUrl(null); setShowCompare(false); }} className="flex items-center gap-1.5 text-xs tracking-wider uppercase border border-stone-900 px-3 py-2 hover:bg-stone-900 hover:text-ivory transition-colors">
                  <Check size={13} strokeWidth={1.5} /> {t('vzPreciseRender')}
                </button>
              )}
            </div>
          </div>

          {/* Visualizer Canvas */}
          <div
            ref={resultRef}
            className={`relative overflow-hidden bg-stone-200 ${zoom > 1 ? 'cursor-zoom-out touch-none' : ''}`}
            style={{ aspectRatio: `${displayAspect}` }}
            onPointerMove={(e) => {
              if (zoom <= 1) return;
              const r = e.currentTarget.getBoundingClientRect();
              setZoomOrigin({
                x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
                y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
              });
            }}
          >
            <div
              className="absolute inset-0 transition-transform duration-200 ease-out"
              style={{ transform: `scale(${zoom})`, transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }}
            >
            <img
              src={showOriginal ? (roomImage ?? undefined) : (resultImageUrl ?? roomImage ?? undefined)}
              alt="Room"
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
            />
            {/* Before/After: the result stays underneath; the original photo is
                revealed on the start side of the handle. */}
            {!showOriginal && showCompare && resultImageUrl && roomImage && (
              <img
                src={roomImage}
                alt="Before"
                className="absolute inset-0 w-full h-full object-cover"
                style={{ clipPath: `polygon(0 0, ${compareSplit * 100}% 0, ${compareSplit * 100}% 100%, 0 100%)` }}
                draggable={false}
              />
            )}
            </div>
              {aiApplying && (
                <div className="absolute inset-0 flex items-center justify-center bg-stone-950/40">
                  <span className="flex items-center gap-2 text-xs tracking-wider uppercase text-white">
                    <span className="inline-block h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    {t('aiEditing')}
                  </span>
                </div>
              )}
              {/* Before/After handle. dir="ltr" keeps the range value and the
                  clip in the same direction on the Arabic (RTL) page. */}
              {!showOriginal && showCompare && resultImageUrl && zoom === 1 && (
                <div className="absolute inset-0" dir="ltr">
                  <div
                    className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)] pointer-events-none"
                    style={{ left: `calc(${compareSplit * 100}% - 1px)` }}
                  >
                    <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-stone-900 shadow-md">
                      <ChevronsLeftRight size={16} strokeWidth={1.75} />
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={compareSplit}
                    onChange={(e) => setCompareSplit(Number(e.target.value))}
                    aria-label={`${t('before')} / ${t('after')}`}
                    className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
                    style={{ touchAction: 'pan-y' }}
                  />
                  <span className="pointer-events-none absolute top-3 left-3 text-[11px] uppercase tracking-wider text-white bg-stone-950/60 px-2 py-1">{t('before')}</span>
                  <span className="pointer-events-none absolute top-3 right-3 text-[11px] uppercase tracking-wider text-white bg-stone-950/60 px-2 py-1">{t('after')}</span>
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
                      {textureParams.lightingMode === 'realistic' ? t('vzLightingRealistic') : t('vzLightingNeutral')}
                    </span>
                  )}
                  {sourceRegion && !showOriginal && compositeUrl && (
                    <span className="text-xs tracking-wider uppercase text-white bg-stone-900/80 px-3 py-1.5">{t('vzSlabCut')}</span>
                  )}
              {showOriginal && (
                <span className="text-xs tracking-wider uppercase text-white bg-stone-950/60 px-3 py-1.5">{t('originalImage')}</span>
              )}
            </div>
          </div>

          {renderError && (
            <p className="mt-3 flex items-center gap-3 text-xs text-red-700">
              {t('vzRenderFailed')}
              <button onClick={() => { setRenderError(false); void renderCompositeRef.current(1100); }} className="underline">{t('vzRetry')}</button>
            </p>
          )}
          {aiApplyError && (
            <p className="mt-3 flex items-center gap-3 text-xs text-red-700">
              {editEnabled ? t('aiEditFailed') : t('aiEditUnavailable')}
              {editEnabled && <button onClick={() => void applyWithAi()} className="underline">{t('vzRetry')}</button>}
            </p>
          )}
          {exportError && <p className="mt-3 text-xs text-red-700">{t('vzExportFailed')}</p>}

              {/* Slab cutting planner (select a region of the source material) */}
              {!aiResultUrl && selectedMaterial && (
                <div className="mt-6 border border-stone-200 bg-ivory p-5">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-stone-800">{t('vzSlabPlanner')}</h3>
                    <span className="text-[11px] uppercase tracking-wider text-stone-500">{t('vzSlabPlannerTag')}</span>
                  </div>
                  <p className="text-xs text-stone-600 mb-3">
                    {t('vzSlabPlannerHint')}
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
                        <span className="mb-1 block">{t('vzSlabRegion')}</span>
                        <div className="grid grid-cols-4 gap-2" dir="ltr">
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
                        <button onClick={() => setSourceRegion(null)} className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900">{t('vzClearCut')}</button>
                        <button onClick={() => setSourceRegion({ x: 0, y: 0, w: 0.5, h: 0.5 })} className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900">{t('vzHalfSlab')}</button>
                        <button onClick={() => setSourceRegion({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 })} className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900">{t('vzCenter50')}</button>
                      </div>
                      <div className="text-xs text-stone-600">
                        <span className="uppercase tracking-wider me-1">{t('vzMode')}</span>
                        {sourceRegion ? t('vzCutOnly') : t('vzFullSlab')}
                      </div>
                    </div>
                  </div>
                </div>
              )}
          {selectedMaterial && !aiResultUrl && (
            <div className="mt-6 border border-stone-200 bg-ivory p-5">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-800">
                  {t('vzRealisticInstall')}
                </h3>
                <span className="text-[11px] uppercase tracking-wider text-stone-500">
                  {textureParams.lightingMode === 'realistic' ? t('vzLightingRealistic') : t('vzLightingNeutral')}
                </span>
              </div>

              {/* Material dimensions (default from the product) */}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">{t('vzPieceWidth')}</span>
                  <input
                    type="number" min={1}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.tileWidthCm}
                    onChange={(e) => setTextureParams({ ...textureParams, tileWidthCm: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">{t('vzPieceHeight')}</span>
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
                    {t('vzOrientation')}
                  </button>
                </div>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">{t('vzRotation')}</span>
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
                  <span className="mb-1 block">{t('vzPattern')}</span>
                    <select
                     className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                     value={textureParams.pattern}
                     onChange={(e) => setTextureParams({ ...textureParams, pattern: e.target.value as InstallPattern })}
                   >
                     <option value="stack">{t('vzPatStack')}</option>
                     <option value="running-bond">{t('vzPatRunning')}</option>
                     <option value="third-bond">{t('vzPatThird')}</option>
                     <option value="bookmatch">{t('vzPatBook2')}</option>
                     <option value="bookmatch-4">{t('vzPatBook4')}</option>
                   </select>
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">{t('vzJointWidth')}</span>
                  <input
                    type="number" min={0} step={0.5}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={Math.round(textureParams.groutWidthCm * 100) / 10}
                    onChange={(e) => setTextureParams({ ...textureParams, groutWidthCm: Number(e.target.value) / 10 })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">{t('vzJointColor')}</span>
                  <input
                    type="color"
                    className="h-9 w-full border border-stone-300"
                    value={textureParams.groutColor}
                    onChange={(e) => setTextureParams({ ...textureParams, groutColor: e.target.value })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">{t('vzPatternScale')}</span>
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
                  <span className="mb-1 block">{t('vzOffsetX')}</span>
                  <input
                    type="number" step={0.1}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.offsetX}
                    onChange={(e) => setTextureParams({ ...textureParams, offsetX: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">{t('vzOffsetY')}</span>
                  <input
                    type="number" step={0.1}
                    className="w-full border border-stone-300 px-2 py-1.5 text-sm"
                    value={textureParams.offsetY}
                    onChange={(e) => setTextureParams({ ...textureParams, offsetY: Number(e.target.value) })}
                  />
                </label>
                <label className="block text-xs text-stone-600">
                  <span className="mb-1 block">{t('vzLightingStrength')}</span>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    className="w-full"
                    value={textureParams.lightingStrength}
                    onChange={(e) => setTextureParams({ ...textureParams, lightingStrength: Number(e.target.value) })}
                  />
                </label>
                {surfaceKindFor(selectedSurfaceId || '') === 'countertop' && (
                  <label className="block text-xs text-stone-600">
                    <span className="mb-1 block">{t('vzEdgeThickness')}</span>
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
                  {t('vzLightingRealistic')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={textureParams.flipX} onChange={(e) => setTextureParams({ ...textureParams, flipX: e.target.checked })} />
                  {t('vzFlipH')}
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={textureParams.flipY} onChange={(e) => setTextureParams({ ...textureParams, flipY: e.target.checked })} />
                  {t('vzFlipV')}
                </label>
                <label className="flex items-center gap-2">
                  {t('vzSampling')}
                  <select
                    className="border border-stone-300 px-2 py-1"
                    value={textureParams.sampling}
                    onChange={(e) => setTextureParams({ ...textureParams, sampling: e.target.value as 'nearest' | 'bilinear' })}
                  >
                    <option value="bilinear">{t('vzSamplingBilinear')}</option>
                    <option value="nearest">{t('vzSamplingNearest')}</option>
                  </select>
                </label>
              </div>

              {/* Coverage / waste readout (physical estimate from the measured surface) */}
              {installStats && (
                <div className="mt-5 border-t border-stone-200 pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-stone-700">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-stone-500">{t('vzStatSurface')}</span>
                    <span className="text-stone-900">{installStats.surfaceAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-stone-500">{t('vzStatPieces')}</span>
                    <span className="text-stone-900">{installStats.piecesTotal} ({installStats.piecesX}×{installStats.piecesY})</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-stone-500">{t('vzStatLaid')}</span>
                    <span className="text-stone-900">{installStats.laidAreaM2.toFixed(1)} m²</span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-stone-500">{t('vzStatWaste')}</span>
                    <span className="text-stone-900">{installStats.wastePct.toFixed(1)}%</span>
                  </div>
                </div>
              )}

              {/* Room scale / calibration */}
              <div className="mt-5 border-t border-stone-200 pt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-stone-600">
                  <span className="uppercase tracking-wider me-2">{t('vzRoomScale')}</span>
                  {calibPxPerMeter
                    ? <span className="text-stone-900">{t('vzCalibrated')} · {calibPxPerMeter.toFixed(0)} px/m</span>
                    : <span className="text-stone-500">{t('vzEstimatedScale')}</span>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setCalibPoints([]); setCalibOpen(true); }}
                    className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900"
                  >
                    {t('vzCalibrate')}
                  </button>
                  {calibPxPerMeter && (
                    <button
                      onClick={() => setCalibPxPerMeter(null)}
                      className="border border-stone-300 px-3 py-1.5 text-xs uppercase tracking-wider hover:border-stone-900"
                    >
                      {t('vzClear')}
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
                  setSavedAdded(!has(selectedMaterial.id));
                  toggle(selectedMaterial.id);
                  setShowSaved(true);
                  if (savedTimerRef.current) window.clearTimeout(savedTimerRef.current);
                  savedTimerRef.current = window.setTimeout(() => setShowSaved(false), 2000);
                }}
                aria-pressed={has(selectedMaterial.id)}
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
            <div role="status" className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-stone-900 text-ivory px-6 py-3 text-sm tracking-wider z-50">
              {savedAdded ? t('vzSavedFav') : t('vzRemovedFav')}
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
