import { useState } from 'react';
import { useLang } from '@/context/LanguageContext';
import { publicApi } from '@/lib/public';
import { Reveal } from '@/components/ui/Reveal';
import { MapPin, Phone, Mail, MessageCircle, Clock, Check, Loader2 } from 'lucide-react';

export function ContactPage() {
  const { t } = useLang();
  const [formType, setFormType] = useState<'message' | 'booking'>('message');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get('name') ?? '');
    const phone = String(data.get('phone') ?? '');
    const email = String(data.get('email') ?? '');
    setError(null);
    setSubmitting(true);
    try {
      if (formType === 'message') {
        await publicApi.submitMessage({
          name,
          phone: phone || undefined,
          email: email || undefined,
          projectType: (String(data.get('projectType') ?? '')) || undefined,
          message: String(data.get('message') ?? ''),
        });
      } else {
        await publicApi.submitBooking({
          name,
          phone: phone || undefined,
          email: email || undefined,
          date: String(data.get('date') ?? '') || undefined,
          time: String(data.get('time') ?? '') || undefined,
          materialsOfInterest: (String(data.get('materials') ?? '')) || undefined,
        });
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pt-20 md:pt-24 pb-20">
      <div className="container-lux mb-12">
        <Reveal>
          <h1 className="font-display text-display font-light text-stone-900 mb-2">{t('contactTitle')}</h1>
        </Reveal>
      </div>

      {/* Contact Info */}
      <div className="container-lux mb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: MapPin, label: t('address'), value: 'King Fahd Road, Al Olaya, Riyadh' },
            { icon: Phone, label: t('phone'), value: '+966 11 234 5678' },
            { icon: Mail, label: t('email'), value: 'info@pietra-gallery.com' },
            { icon: Clock, label: t('workingHours'), value: 'Sat–Thu: 9AM–8PM' },
          ].map((item, i) => (
            <Reveal key={item.label} delay={i * 80}>
              <div className="border-l-2 border-stone-200 pl-5 py-2">
                <div className="flex items-center gap-2 mb-2">
                  <item.icon size={16} strokeWidth={1.5} className="text-stone-500" />
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500">{item.label}</p>
                </div>
                <p className="text-stone-900 text-sm">{item.value}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Map */}
      <div className="container-lux mb-16">
        <Reveal>
          <div className="aspect-[21/9] bg-stone-200 overflow-hidden">
            <iframe
              src="https://www.openstreetmap.org/export/embed.html?bbox=46.6%2C24.68%2C46.75%2C24.75&layer=mapnik"
              className="w-full h-full border-0"
              loading="lazy"
              title="Showroom location"
            />
          </div>
        </Reveal>
      </div>

      {/* Form */}
      <div className="container-lux">
        <div className="max-w-2xl mx-auto">
          {/* Toggle */}
          <div className="flex gap-2 mb-8 justify-center">
            <button
              onClick={() => { setFormType('message'); setError(null); }}
              className={`filter-chip ${formType === 'message' ? 'filter-chip-active' : ''}`}
            >
              {t('contact')}
            </button>
            <button
              onClick={() => { setFormType('booking'); setError(null); }}
              className={`filter-chip ${formType === 'booking' ? 'filter-chip-active' : ''}`}
            >
              {t('bookShowroomVisit')}
            </button>
          </div>

          {submitted ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 mx-auto mb-4 border-2 border-stone-900 rounded-full flex items-center justify-center">
                <Check size={28} strokeWidth={1.5} className="text-stone-900" />
              </div>
              <p className="font-display text-2xl font-light text-stone-900">
                {formType === 'message' ? t('messageSent') : t('visitBooked')}
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="label-lux">{t('formName')}</label>
                  <input required type="text" name="name" className="input-lux" />
                </div>
                <div>
                  <label className="label-lux">{t('phone')}</label>
                  <input required type="tel" name="phone" className="input-lux" />
                </div>
              </div>
              <div>
                <label className="label-lux">{t('email')}</label>
                <input required type="email" name="email" className="input-lux" />
              </div>

              {formType === 'message' ? (
                <>
                  <div>
                    <label className="label-lux">{t('projectType')}</label>
                    <select name="projectType" className="input-lux cursor-pointer">
                      <option value="">—</option>
                      <option>Residential</option>
                      <option>Commercial</option>
                      <option>Hospitality</option>
                      <option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="label-lux">{t('message')}</label>
                    <textarea required name="message" rows={4} className="input-lux resize-none" />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="label-lux">{t('date')}</label>
                      <input required type="date" name="date" className="input-lux" />
                    </div>
                    <div>
                      <label className="label-lux">{t('time')}</label>
                      <input required type="time" name="time" className="input-lux" />
                    </div>
                  </div>
                  <div>
                    <label className="label-lux">{t('materialsOfInterest')}</label>
                    <input type="text" name="materials" placeholder="Marble, Porcelain, ..." className="input-lux" />
                  </div>
                </>
              )}

              {error && <p className="text-sm text-red-700">{error}</p>}

              <button type="submit" disabled={submitting} className="btn-primary w-full flex items-center justify-center gap-2">
                {submitting && <Loader2 size={15} strokeWidth={1.5} className="animate-spin" />}
                {formType === 'message' ? t('send') : t('bookShowroomVisit')}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* WhatsApp float */}
      <a
        href="https://wa.me/966112345678"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-40 w-12 h-12 bg-stone-900 text-ivory flex items-center justify-center hover:bg-stone-700 transition-colors"
      >
        <MessageCircle size={22} strokeWidth={1.5} />
      </a>
    </div>
  );
}