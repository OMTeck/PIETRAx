import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { useLang } from '@/context/LanguageContext';
import { publicApi, type PubAISegment } from '@/lib/public';
import { compressImage } from '@/lib/visualizer/imagePreprocessor';

interface AIAnalyzeButtonProps {
  uploadedImage: string; // data URL (upload) or remote URL (preset room)
  disabled?: boolean;
  cropAspect?: number; // center-crop before analysis so coords match the display box
  onSegments: (result: { segments: PubAISegment[]; width: number; height: number }) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function AIAnalyzeButton({ uploadedImage, disabled, cropAspect, onSegments, onBusyChange }: AIAnalyzeButtonProps) {
  const { t } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run() {
    if (busy || disabled) return;
    setBusy(true);
    setError(false);
    onBusyChange?.(true);
    try {
      const compressed = await compressImage(uploadedImage, cropAspect ? { cropAspect } : undefined);
      const res = await publicApi.segmentRoom({ image: compressed.dataUrl, mime: 'image/jpeg' });
      onSegments({ segments: res.segments, width: res.width, height: res.height });
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={run}
        disabled={busy || disabled}
        className="flex items-center gap-2 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors disabled:opacity-50"
      >
        {busy ? (
          <>
            <Loader2 size={13} strokeWidth={1.5} className="animate-spin" /> {t('analyzingImg')}
          </>
        ) : (
          <>
            <Sparkles size={13} strokeWidth={1.5} /> {t('analyzeWithAi')}
          </>
        )}
      </button>
      {error && <span className="text-xs text-red-700">{t('aiFailed')}</span>}
    </div>
  );
}