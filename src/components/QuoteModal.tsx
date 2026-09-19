import { useState } from 'react';
import { useLang } from '@/context/LanguageContext';
import { publicApi } from '@/lib/public';
import { X, Check, Loader2 } from 'lucide-react';

export interface QuoteItem {
  slug: string;
  name: string;
  size?: string;
  quantity?: number;
}

export function QuoteModal({
  open,
  items,
  initialMessage,
  onClose,
}: {
  open: boolean;
  items: QuoteItem[];
  initialMessage?: string;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [projectType, setProjectType] = useState('');
  const [message, setMessage] = useState(initialMessage ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await publicApi.submitQuote({
        name,
        phone: phone || undefined,
        email: email || undefined,
        projectType: projectType || undefined,
        message: message || undefined,
        items: items.map((i) => ({ slug: i.slug, name: i.name, size: i.size, quantity: i.quantity ?? 1 })),
        source: 'website',
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] bg-stone-950/60 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="bg-ivory w-full max-w-lg max-h-[90vh] overflow-y-auto" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <h2 className="font-display text-xl font-light text-stone-900">{t('requestQuote')}</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900">
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {done ? (
          <div className="text-center py-16 px-6">
            <div className="w-16 h-16 mx-auto mb-4 border-2 border-stone-900 rounded-full flex items-center justify-center">
              <Check size={28} strokeWidth={1.5} className="text-stone-900" />
            </div>
            <p className="font-display text-2xl font-light text-stone-900">{t('messageSent')}</p>
            <button onClick={onClose} className="btn-outline mt-8">{t('close')}</button>
          </div>
        ) : (
          <form onSubmit={(e) => void submit(e)} className="p-6 space-y-5">
            {items.length > 0 && (
              <div>
                <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-2">{t('materials')}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map((i) => (
                    <span key={i.slug} className="text-xs px-3 py-1 border border-stone-200 text-stone-700">{i.name}</span>
                  ))}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="label-lux">{t('formName')} *</label>
                <input required type="text" value={name} onChange={(e) => setName(e.target.value)} className="input-lux" />
              </div>
              <div>
                <label className="label-lux">{t('phone')}</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input-lux" />
              </div>
            </div>
            <div>
              <label className="label-lux">{t('email')}</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-lux" />
            </div>
            <div>
              <label className="label-lux">{t('projectType')}</label>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)} className="input-lux cursor-pointer">
                <option value="">{t('all')}</option>
                <option>Residential</option>
                <option>Commercial</option>
                <option>Hospitality</option>
                <option>Kitchen</option>
                <option>Bathroom</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="label-lux">{t('message')}</label>
              <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="input-lux resize-none" />
            </div>

            {error && <p className="text-sm text-red-700">{error}</p>}

            <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
              {submitting && <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />}
              {t('requestQuote')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}