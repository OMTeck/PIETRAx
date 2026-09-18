import { useLang } from '@/context/LanguageContext';
import { Reveal, LazyImage, SectionTitle } from '@/components/ui/Reveal';
import { showroomImage } from '@/data/content';

export function AboutPage() {
  const { t } = useLang();

  const stats = [
    { label: t('aboutExperience'), value: '20+' },
    { label: t('aboutSuppliers'), value: '12' },
    { label: t('aboutShowroom'), value: '500m²' },
    { label: t('aboutQuality'), value: '100%' },
  ];

  const values = [
    { title: t('aboutShowroom'), text: t('aboutShowroomText'), image: 'https://images.pexels.com/photos/5827062/pexels-photo-5827062.jpeg?auto=compress&cs=tinysrgb&w=1200' },
    { title: t('aboutSelection'), text: t('aboutSelectionText'), image: 'https://images.pexels.com/photos/30112371/pexels-photo-30112371.jpeg?auto=compress&cs=tinysrgb&w=1200' },
    { title: t('aboutQuality'), text: t('aboutQualityText'), image: 'https://images.pexels.com/photos/4705843/pexels-photo-4705843.jpeg?auto=compress&cs=tinysrgb&w=1200' },
    { title: t('aboutSuppliers'), text: t('aboutSuppliersText'), image: 'https://images.pexels.com/photos/30273849/pexels-photo-30273849.jpeg?auto=compress&cs=tinysrgb&w=1200' },
  ];

  return (
    <div className="pt-24 md:pt-32 pb-20">
      {/* Intro */}
      <div className="container-lux mb-16 md:mb-24">
        <Reveal>
          <h1 className="font-display text-display font-light text-stone-900 mb-6 max-w-3xl">{t('aboutTitle')}</h1>
          <p className="text-lg text-stone-600 leading-relaxed max-w-2xl font-light">{t('aboutText')}</p>
        </Reveal>
      </div>

      {/* Stats */}
      <div className="bg-stone-100 py-12 md:py-16 mb-16 md:mb-24">
        <div className="container-lux">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 80}>
                <div className="text-center">
                  <p className="font-display text-4xl md:text-5xl font-light text-stone-900 mb-2">{s.value}</p>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500">{s.label}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>

      {/* Values with images */}
      <div className="container-lux space-y-16 md:space-y-24">
        {values.map((v, i) => (
          <Reveal key={v.title}>
            <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16 items-center ${i % 2 === 1 ? 'lg:[direction:rtl]' : ''}`}>
              <LazyImage src={v.image} alt={v.title} aspectClass="aspect-[4/3]" />
              <div className="lg:[direction:ltr]">
                <h3 className="font-display text-3xl font-light text-stone-900 mb-4">{v.title}</h3>
                <p className="text-stone-600 leading-relaxed">{v.text}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      {/* Full-width showroom image */}
      <div className="mt-16 md:mt-24">
        <Reveal>
          <LazyImage src={showroomImage} alt="Showroom" aspectClass="aspect-[21/9]" />
        </Reveal>
      </div>
    </div>
  );
}
