import { useState } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { useLang } from '@/context/LanguageContext';
import { publicApi } from '@/lib/public';
import { compressImage } from '@/lib/visualizer/imagePreprocessor';

interface AIEditControlProps {
  uploadedImage: string; // data URL of the current upload
  disabled?: boolean;
  onResult: (dataUrl: string) => void;
  onBusyChange?: (busy: boolean) => void;
}

export function AIEditControl({ uploadedImage, disabled, onResult, onBusyChange }: AIEditControlProps) {
  const { t } = useLang();
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function run() {
    if (busy || disabled || !prompt.trim()) return;
    setBusy(true);
    setError(false);
    onBusyChange?.(true);
    try {
      // FLUX.2 klein requires input images <= 512x512.
      const compressed = await compressImage(uploadedImage, { maxDim: 512, quality: 0.85 });
      const res = await publicApi.aiEditRoom({ prompt: prompt.trim(), image: compressed.dataUrl, mime: 'image/jpeg' });
      onResult(res.image);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t('aiEditPrompt')}
          disabled={busy || disabled}
          className="flex-1 bg-ivory border border-stone-200 px-3 py-2 text-xs focus:border-stone-900 focus:outline-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy || disabled || !prompt.trim()}
          className="flex items-center gap-2 text-xs tracking-wider uppercase border border-stone-300 px-3 py-2 hover:border-stone-900 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} strokeWidth={1.5} className="animate-spin" /> : <Wand2 size={13} strokeWidth={1.5} />}
          {busy ? t('aiEditing') : t('aiEditButton')}
        </button>
      </div>
      {error && <span className="text-xs text-red-700">{t('aiEditFailed')}</span>}
    </div>
  );
}
