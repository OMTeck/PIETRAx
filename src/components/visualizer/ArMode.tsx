import { useEffect, useRef, useState } from 'react';
import { Box, X, Eraser } from 'lucide-react';
import type { VisMaterial } from '@/lib/visualizer/types';
import { paramsFromMaterial } from '@/lib/visualizer/textureMapper';
import { thumbUrl } from '@/lib/visualizer/thumb';
import {
  requestArSession, startAr,
  type ArController, type ArMaterialSpec, type ArStatus, type ArSurfaceKind,
} from '@/lib/visualizer/arSession';
import type { TranslationKey } from '@/data/i18n';

interface Props {
  materials: VisMaterial[];
  initialMaterialId: string | null;
  t: (key: TranslationKey) => string;
  /** Called when the device refuses AR, so the page can offer the 2D live view. */
  onUnavailable: () => void;
}

const GLOSSY = /polish|gloss|مصقول|لامع/i;

function specFor(m: VisMaterial): ArMaterialSpec {
  const p = paramsFromMaterial(m, 'realistic');
  return {
    textureUrl: m.textureUrl,
    tileWcm: p.tileWidthCm,
    tileHcm: p.tileHeightCm,
    groutMm: Math.round(p.groutWidthCm * 10),
    groutColor: p.groutColor,
    glossy: GLOSSY.test(m.finishLabel || '') || !m.finishLabel,
  };
}

/**
 * Launch card + in-session overlay for true AR (WebXR). The overlay element
 * must exist before the session is requested (it becomes the DOM overlay),
 * so it is always mounted and only shown while the session runs.
 */
export function ArMode({ materials, initialMaterialId, t, onUnavailable }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<ArController | null>(null);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<ArStatus>('loading');
  const [kind, setKind] = useState<ArSurfaceKind>('floor');
  const [materialId, setMaterialId] = useState<string | null>(initialMaterialId ?? materials[0]?.id ?? null);
  const [error, setError] = useState(false);

  const material = materials.find((m) => m.id === materialId) ?? materials[0];

  useEffect(() => () => { ctrlRef.current?.end(); }, []);

  // Taps on the overlay's own controls must not also count as AR taps.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const stop = (e: Event) => {
      if ((e.target as Element | null)?.closest('button, input, [role="group"]')) e.preventDefault();
    };
    el.addEventListener('beforexrselect', stop);
    return () => el.removeEventListener('beforexrselect', stop);
  }, []);

  const launch = async () => {
    const overlay = overlayRef.current;
    if (!overlay || !material) return;
    setError(false);
    let session: XRSession;
    try {
      // First await in the tap handler: the browser only grants AR to a gesture.
      session = await requestArSession(overlay);
    } catch {
      onUnavailable();
      return;
    }
    setActive(true);
    try {
      ctrlRef.current = await startAr(session, {
        kind,
        material: specFor(material),
        callbacks: {
          onStatus: setStatus,
          onEnd: () => { ctrlRef.current = null; setActive(false); },
          onError: () => setError(true),
        },
      });
    } catch {
      // Failed while starting (before the session's end handler existed):
      // close the overlay ourselves.
      setError(true);
      setActive(false);
      ctrlRef.current = null;
      session.end().catch(() => undefined);
    }
  };

  const pickMaterial = (m: VisMaterial) => {
    setMaterialId(m.id);
    void ctrlRef.current?.setMaterial(specFor(m)).catch(() => setError(true));
  };
  const pickKind = (k: ArSurfaceKind) => {
    setKind(k);
    ctrlRef.current?.setKind(k);
  };

  const hint =
    status === 'loading' ? t('vzArLoading')
      : status === 'scanning' ? t('vzArScanning')
        : status === 'placing' ? (kind === 'floor' ? t('vzArPlaceFloor') : t('vzArPlaceWall'))
          : kind === 'wall' ? t('vzArWallHint') : t('vzArReady');

  return (
    <>
      <button
        onClick={() => { void launch(); }}
        className="-mt-4 mb-4 flex w-full items-center gap-4 border-2 border-stone-900 bg-stone-900 p-5 text-start text-ivory transition-colors hover:bg-stone-800 md:p-6"
      >
        <Box size={28} strokeWidth={1.5} className="shrink-0" />
        <span className="flex-1">
          <span className="flex items-center gap-2 font-display text-xl font-light">
            {t('vzAr')}
            <span className="rounded-full border border-ivory/40 px-2 py-0.5 text-[10px] tracking-[0.15em] uppercase">AR</span>
          </span>
          <span className="mt-1 block text-sm text-stone-300">{t('vzArDesc')}</span>
        </span>
      </button>
      {error && <p role="alert" className="-mt-2 mb-4 text-sm text-red-700">{t('vzArFailed')}</p>}

      {/* DOM overlay: shown on top of the camera during the AR session. */}
      <div ref={overlayRef} style={{ display: active ? 'block' : 'none' }} className="fixed inset-0 z-[120] pointer-events-none text-white">
        <div className="pointer-events-auto flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
          <span className="rounded-full bg-stone-950/60 px-3 py-1.5 text-xs">{hint}</span>
          <button onClick={() => ctrlRef.current?.end()} aria-label={t('close')} className="rounded-full bg-stone-950/60 p-2">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-stone-950/80 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-8">
          <div className="flex items-center gap-3">
            <div className="flex overflow-hidden rounded-full border border-white/40" role="group">
              {(['floor', 'wall'] as ArSurfaceKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => pickKind(k)}
                  aria-pressed={kind === k}
                  className={`px-4 py-1.5 text-xs ${kind === k ? 'bg-white text-stone-900' : ''}`}
                >
                  {t(k)}
                </button>
              ))}
            </div>
            <button onClick={() => ctrlRef.current?.clear()} className="flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1.5 text-xs">
              <Eraser size={13} strokeWidth={1.5} /> {t('vzClear')}
            </button>
            {material && (
              <span className="ms-auto truncate text-xs text-white/80">{material.name}</span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {materials.map((m) => (
              <button
                key={m.id}
                onClick={() => pickMaterial(m)}
                aria-pressed={m.id === materialId}
                title={m.name}
                className={`h-14 w-14 shrink-0 overflow-hidden rounded border-2 ${m.id === materialId ? 'border-white' : 'border-transparent opacity-75'}`}
              >
                <img src={thumbUrl(m.textureUrl, 80)} alt={m.name} className="h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
