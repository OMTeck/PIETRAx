import { useCallback, useEffect, useRef, useState } from 'react';
import { X, Camera, Download, Hand } from 'lucide-react';
import type { NormalizedPoint, VisMaterial } from '@/lib/visualizer/types';
import { loadImage } from '@/lib/visualizer/textureMapper';
import { maskToPolygon } from '@/lib/visualizer/magicWand';
import { LiveRenderer, drawCover, type LiveSurfaceKind } from '@/lib/visualizer/liveRenderer';
import { LiveTracker } from '@/lib/visualizer/liveTracker';
import { downloadBlob } from '@/lib/visualizer/domSnapshot';
import { thumbUrl } from '@/lib/visualizer/thumb';
import type { TranslationKey } from '@/data/i18n';

/** Width of the analysis frame the tracker runs on (height follows the view). */
const ANALYSIS_W = 160;
/** Minimum time between two tracking passes. */
const ANALYSIS_INTERVAL_MS = 70;
/** Long edge of a captured frame handed to the normal flow. */
const CAPTURE_MAX = 1600;

export interface LiveCapture {
  image: string;
  aspect: number;
  polygon: NormalizedPoint[];
  kind: LiveSurfaceKind;
  materialId: string | null;
}

interface Props {
  materials: VisMaterial[];
  initialMaterialId: string | null;
  t: (key: TranslationKey) => string;
  onClose: () => void;
  onCapture: (capture: LiveCapture) => void;
}

/**
 * Live camera mode: the visitor taps a floor or wall in the camera view and
 * sees the material on it in real time while moving the phone.
 */
export function LiveCamera({ materials, initialMaterialId, t, onClose, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LiveRenderer | null>(null);
  const trackerRef = useRef<LiveTracker | null>(null);
  const analysisRef = useRef<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const seedRef = useRef<{ x: number; y: number } | null>(null);
  const lastBinaryRef = useRef<{ mask: Uint8Array; w: number; h: number } | null>(null);
  const stateRef = useRef({ horizon: 0.35, lumaMean: 0.5, lastAnalysis: 0 });

  const [status, setStatus] = useState<'starting' | 'live' | 'error' | 'unsupported'>('starting');
  const [materialId, setMaterialId] = useState<string | null>(initialMaterialId ?? materials[0]?.id ?? null);
  const [kind, setKind] = useState<LiveSurfaceKind>('floor');
  const [tileScale, setTileScale] = useState(1);
  const [tolerance, setTolerance] = useState(14);
  const [hasSeed, setHasSeed] = useState(false);
  const [lost, setLost] = useState(false);

  // Values the render loop reads without restarting.
  const liveParams = useRef({ kind, tileScale, tolerance });
  liveParams.current = { kind, tileScale, tolerance };

  const stopAll = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamRef.current = null;
    rendererRef.current?.dispose();
    rendererRef.current = null;
  }, []);

  /** Sizes the WebGL canvas to its box (capped DPR) and the analysis frame to match. */
  const fitCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(2, Math.round(rect.width * dpr));
    const h = Math.max(2, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const aw = ANALYSIS_W;
    const ah = Math.max(2, Math.round(ANALYSIS_W * (rect.height / Math.max(1, rect.width))));
    if (!analysisRef.current || analysisRef.current.canvas.width !== aw || analysisRef.current.canvas.height !== ah) {
      const c = document.createElement('canvas');
      c.width = aw;
      c.height = ah;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (ctx) analysisRef.current = { canvas: c, ctx };
      trackerRef.current = new LiveTracker(aw, ah);
      rendererRef.current?.setMask(null, aw, ah);
    }
  }, []);

  // Camera + renderer lifecycle.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('unsupported');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((tr) => tr.stop()); return; }
        streamRef.current = stream;
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        try {
          rendererRef.current = new LiveRenderer(canvas);
        } catch {
          setStatus('unsupported');
          return;
        }
        fitCanvas();
        setStatus('live');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();
    const onResize = () => fitCanvas();
    window.addEventListener('resize', onResize);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      stopAll();
    };
  }, [fitCanvas, stopAll]);

  // Load the selected material into the renderer.
  useEffect(() => {
    if (status !== 'live') return;
    const m = materials.find((x) => x.id === materialId);
    if (!m?.textureUrl) return;
    let cancelled = false;
    loadImage(m.textureUrl)
      .then((img) => { if (!cancelled) rendererRef.current?.setMaterial(img); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [status, materialId, materials]);

  // Render loop: draw every frame, track the surface every ANALYSIS_INTERVAL_MS.
  useEffect(() => {
    if (status !== 'live') return;
    const tick = (now: number) => {
      const video = videoRef.current;
      const renderer = rendererRef.current;
      if (video && renderer && video.readyState >= 2) {
        const st = stateRef.current;
        const seed = seedRef.current;
        const a = analysisRef.current;
        const tracker = trackerRef.current;
        if (seed && a && tracker && now - st.lastAnalysis >= ANALYSIS_INTERVAL_MS) {
          st.lastAnalysis = now;
          drawCover(a.ctx, video, a.canvas.width, a.canvas.height);
          const rgba = a.ctx.getImageData(0, 0, a.canvas.width, a.canvas.height).data;
          const res = tracker.track(rgba, seed, liveParams.current.tolerance);
          if (res) {
            renderer.setMask(res.soft, tracker.w, tracker.h);
            if (res.coverage > 0) {
              lastBinaryRef.current = { mask: res.binary, w: tracker.w, h: tracker.h };
              st.lumaMean = st.lumaMean * 0.7 + res.lumaMean * 0.3;
              // The visible top of a floor is where it meets the wall; the
              // horizon sits above it. Smoothed so tiles do not jump.
              const target = Math.max(-0.6, Math.min(res.top - 0.04, res.top - 0.35 * (1 - res.top)));
              st.horizon = st.horizon * 0.85 + target * 0.15;
            }
            setLost((was) => (was !== (res.coverage === 0) ? res.coverage === 0 : was));
          }
        }
        const p = liveParams.current;
        renderer.draw(video, { kind: p.kind, horizon: st.horizon, tileScale: p.tileScale, lumaMean: st.lumaMean, lightStrength: 0.85 });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [status]);

  const onTap = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    seedRef.current = {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
    trackerRef.current?.reset();
    stateRef.current.lastAnalysis = 0;
    setHasSeed(true);
    setLost(false);
  };

  const saveSnapshot = () => {
    canvasRef.current?.toBlob((b) => {
      if (b) downloadBlob(b, `pietrax-live-${materials.find((m) => m.id === materialId)?.slug ?? 'design'}.png`);
    }, 'image/png');
  };

  /** Freezes the current camera frame and hands it (with the tracked area) to the precise flow. */
  const captureAndRefine = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    const aspect = canvas.width / canvas.height;
    const cw = aspect >= 1 ? CAPTURE_MAX : Math.round(CAPTURE_MAX * aspect);
    const ch = aspect >= 1 ? Math.round(CAPTURE_MAX / aspect) : CAPTURE_MAX;
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    drawCover(ctx, video, cw, ch);
    const lb = lastBinaryRef.current;
    const polygon = lb && hasSeed ? maskToPolygon(lb.mask, lb.w, lb.h) : [];
    const image = c.toDataURL('image/jpeg', 0.92);
    stopAll();
    onCapture({ image, aspect, polygon, kind, materialId });
  };

  const close = () => { stopAll(); onClose(); };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-stone-950 text-white" role="dialog" aria-modal="true" aria-label={t('vzLive')}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs tracking-[0.2em] uppercase text-stone-300">{t('vzLive')}</span>
        <button onClick={close} className="text-stone-300 hover:text-white" aria-label={t('close')}>
          <X size={22} strokeWidth={1.5} />
        </button>
      </div>

      <div className="relative flex-1 min-h-0">
        <video ref={videoRef} playsInline muted autoPlay className="hidden" />
        <canvas
          ref={canvasRef}
          onPointerDown={onTap}
          className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
        />
        {status === 'starting' && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="inline-block h-8 w-8 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          </div>
        )}
        {(status === 'error' || status === 'unsupported') && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-stone-300">
            {status === 'error' ? t('cameraError') : t('vzLiveUnsupported')}
          </div>
        )}
        {status === 'live' && (!hasSeed || lost) && (
          <div className="pointer-events-none absolute inset-x-0 top-6 flex justify-center px-4">
            <span className="flex items-center gap-2 rounded-full bg-stone-950/70 px-4 py-2 text-sm">
              <Hand size={16} strokeWidth={1.5} /> {lost ? t('vzLiveLost') : t('vzLiveTap')}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3 bg-stone-950 px-4 pb-4 pt-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] tracking-[0.15em] uppercase text-stone-400">
          <div className="flex overflow-hidden border border-stone-600" role="group">
            {(['floor', 'wall'] as LiveSurfaceKind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`px-3 py-1.5 text-xs ${kind === k ? 'bg-white text-stone-900' : 'text-stone-300'}`}
              >
                {t(k)}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2">
            {t('vzLiveTileSize')}
            <input type="range" min={0.4} max={2.5} step={0.05} value={tileScale} onChange={(e) => setTileScale(Number(e.target.value))} className="w-24 accent-white" />
          </label>
          <label className="flex items-center gap-2">
            {t('wandTolerance')}
            <input type="range" min={4} max={40} step={1} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="w-24 accent-white" />
          </label>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide" role="listbox" aria-label={t('vzQuickSwitch')}>
          {materials.map((m) => (
            <button
              key={m.id}
              role="option"
              aria-selected={m.id === materialId}
              title={m.name}
              onClick={() => setMaterialId(m.id)}
              className={`h-14 w-14 shrink-0 overflow-hidden border-2 ${m.id === materialId ? 'border-white' : 'border-transparent opacity-70'}`}
            >
              <img src={thumbUrl(m.textureUrl, 80)} alt={m.name} className="h-full w-full object-cover" draggable={false} />
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={saveSnapshot}
            disabled={status !== 'live'}
            className="flex items-center gap-2 border border-stone-500 px-4 py-2.5 text-xs tracking-wider uppercase disabled:opacity-40"
          >
            <Download size={14} strokeWidth={1.5} /> {t('vzLiveSnapshot')}
          </button>
          <button
            onClick={captureAndRefine}
            disabled={status !== 'live'}
            className="flex flex-1 items-center justify-center gap-2 bg-white px-4 py-2.5 text-xs tracking-wider uppercase text-stone-900 disabled:opacity-40"
          >
            <Camera size={14} strokeWidth={1.5} /> {t('vzLiveCapture')}
          </button>
        </div>
      </div>
    </div>
  );
}
