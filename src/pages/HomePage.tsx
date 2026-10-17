import { useRef, type CSSProperties } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubName, pubCover, pubCollectionName, companySettings, type PubMaterial } from '@/lib/public';
import { colourSwatches, showroomImage, heroImage } from '@/data/content';
import { Reveal, LazyImage, SectionTitle, TextReveal } from '@/components/ui/Reveal';
import { useScrollScene, useStickyStack } from '@/lib/motion';
import { ArrowRight, MapPin, Clock, Phone, Heart } from 'lucide-react';

export function HomePage() {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const { has, toggle } = useWishlist();
  const { materials, collections, projects, settings } = useCatalog();

  const company = companySettings(settings);
  const brand = company.nameEn || 'PIETRA';
  const heroTitle = lang === 'ar' ? company.taglineAr || t('heroTitle') : company.taglineEn || t('heroTitle');

  // Scroll-scrubbed hero: the image zooms out and the copy lifts + fades as the
  // hero exits, all bound to the damped scroll value.
  const heroRef = useRef<HTMLElement | null>(null);
  const heroImgRef = useRef<HTMLImageElement | null>(null);
  const heroCopyRef = useRef<HTMLDivElement | null>(null);
  useScrollScene(heroRef, ({ exit }) => {
    if (heroImgRef.current) {
      heroImgRef.current.style.transform = `scale(${(1.12 - exit * 0.12).toFixed(4)})`;
    }
    if (heroCopyRef.current) {
      heroCopyRef.current.style.opacity = Math.max(0, 1 - exit * 1.3).toFixed(3);
      heroCopyRef.current.style.transform = `translate3d(0, ${(exit * 80).toFixed(2)}px, 0)`;
    }
  });

  // Sticky-stack chaptered cards (the craft story) — recede enhancement.
  const stackRef = useRef<HTMLDivElement | null>(null);
  useStickyStack(stackRef);

  const newArrivals = materials.filter((m) => m.newArrival).slice(0, 6);
  const featuredProjects = projects.slice(0, 5);
  const colours = Object.entries(colourSwatches);

  const craftChapters = [
    {
      image: showroomImage,
      eyebrow: lang === 'ar' ? 'الانتقاء' : 'Sourcing',
      title: lang === 'ar' ? 'كل لوح يُختار يدويًا' : 'Every slab chosen by hand',
      body:
        lang === 'ar'
          ? 'نزور المحاجر ونفحص كل لوح في ضوء اليوم لضمان تناسق العروق واللون قبل أن يصل إلى مجموعتنا.'
          : 'We visit the quarries and inspect every slab in daylight to guarantee the veining and tone match before it joins our collection.',
    },
    {
      image: 'https://images.pexels.com/photos/6283967/pexels-photo-6283967.jpeg?auto=compress&cs=tinysrgb&w=1200',
      eyebrow: lang === 'ar' ? 'التشغيل' : 'Fabrication',
      title: lang === 'ar' ? 'دقة بالملّيمتر' : 'Cut to the millimetre',
      body:
        lang === 'ar'
          ? 'نشكّل الحواف والوصلات في ورشتنا بأدوات دقيقة، مع مطابقة العروق للحصول على تدفّق بصري متصل.'
          : 'Edges and joints are finished in our workshop to the millimetre, matching veins so the surface reads as one seamless flow.',
    },
    {
      image: 'https://images.pexels.com/photos/8146212/pexels-photo-8146212.jpeg?auto=compress&cs=tinysrgb&w=1200',
      eyebrow: lang === 'ar' ? 'التركيب' : 'Installation',
      title: lang === 'ar' ? 'تركيب بمستوى المتاحف' : 'Installed to museum standard',
      body:
        lang === 'ar'
          ? 'فرقنا المدرّبة تتعامل مع كل قطعة كعمل فني، من التثبيت حتى التلميع النهائي وفحص الجودة.'
          : 'Our trained teams treat every piece like artwork, from fixing through final polishing and quality sign-off.',
    },
  ];

  const cover = (m: PubMaterial) => pubCover(m) ?? '';

  const chipFor = (m: PubMaterial) => {
    const typeLabel = lang === 'ar' ? m.materialType.labelAr : m.materialType.labelEn;
    const colourLabel = m.color ? (lang === 'ar' ? m.color.labelAr : m.color.labelEn) : '';
    const sizeLabel = m.sizes[1]?.label ?? m.sizes[0]?.label ?? '';
    return [typeLabel, colourLabel, sizeLabel].filter(Boolean).join(' · ');
  };

  return (
    <div>
      {/* Hero */}
      <section
        ref={heroRef}
        data-theme-section="dark"
        className="relative h-screen flex items-center justify-center overflow-hidden"
      >
        <div className="absolute inset-0">
          <img
            ref={heroImgRef}
            src={heroImage}
            alt="Luxury marble interior"
            className="w-full h-full object-cover will-change-transform"
            style={{ transform: 'scale(1.12)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-stone-950/50 via-stone-950/30 to-stone-950/70" />
        </div>
        <div ref={heroCopyRef} className="relative z-10 text-center px-6 will-change-[opacity,transform]">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase text-white/70 mb-6">{brand} GALLERY</p>
          </Reveal>
          <h1 className="font-display text-display font-light text-white mb-4 max-w-4xl mx-auto leading-[1.05]">
            <TextReveal text={heroTitle} wordDelay={90} startDelay={150} />
          </h1>
          <Reveal delay={400}>
            <p className="text-white/70 text-lg md:text-xl font-light mb-10 max-w-2xl mx-auto">
              {t('heroSubtitle')}
            </p>
          </Reveal>
          <Reveal delay={600}>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button onClick={() => navigate('/collections')} className="btn-primary border-white bg-white text-stone-900 hover:bg-transparent hover:text-white">
                {t('exploreCollection')}
              </button>
              <button onClick={() => navigate('/visualizer')} className="btn-outline border-white/60 text-white hover:bg-white hover:text-stone-900">
                {t('tryInRoom')}
              </button>
            </div>
          </Reveal>
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <div className="flex flex-col items-center gap-2 text-white/50 animate-float">
            <span className="text-[10px] tracking-[0.3em] uppercase">{t('scrollDown')}</span>
            <div className="w-px h-12 bg-white/30" />
          </div>
        </div>
      </section>

      {/* Featured Collections */}
      <section data-theme-section="light" className="py-20 md:py-32 bg-ivory">
        <div className="container-lux">
          <SectionTitle title={t('featuredCollections')} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {collections.slice(0, 6).map((col, i) => (
              <Reveal key={col.id} delay={i * 100}>
                <button
                  onClick={() => navigate(`/collections?collection=${col.slug}`)}
                  className="group relative w-full block overflow-hidden"
                >
                  <LazyImage
                    src={col.coverImage ?? ''}
                    alt={pubCollectionName(col.translations, lang)}
                    aspectClass="aspect-[4/5]"
                    className="transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/60 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-8 text-start">
                    <h3 className="font-display text-3xl font-light text-white mb-1">
                      {pubCollectionName(col.translations, lang)}
                    </h3>
                    <p className="text-sm text-white/70 mb-4">{col.translations.find((t) => t.lang === (lang === 'ar' ? 'AR' : 'EN'))?.description ?? ''}</p>
                    <span className="inline-flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-white/90 group-hover:gap-3 transition-all">
                      {t('explore')}
                      <ArrowRight size={14} strokeWidth={1.5} className="rtl:rotate-180" />
                    </span>
                  </div>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* New Arrivals — Editorial Grid */}
      <section data-theme-section="light" className="py-20 md:py-32 bg-stone-100">
        <div className="container-lux">
          <SectionTitle title={t('newArrivals')} subtitle={t('newArrivalsSubtitle')} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {newArrivals.map((m, i) => {
              const isLarge = i === 0 || i === 3;
              return (
                <Reveal key={m.id} delay={i * 80} className={isLarge ? 'lg:row-span-2' : ''}>
                  <div
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(`/material/${m.slug}`)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/material/${m.slug}`); }}
                    className="group relative w-full block overflow-hidden cursor-pointer"
                  >
                    <LazyImage
                      src={cover(m)}
                      alt={pubName(m, lang)}
                      aspectClass={isLarge ? 'aspect-[3/4] lg:aspect-[3/5]' : 'aspect-square'}
                      className="transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-stone-950/0 group-hover:bg-stone-950/20 transition-colors duration-500" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 text-start">
                      <p className="font-display text-lg md:text-xl font-light text-white">{pubName(m, lang)}</p>
                      <p className="text-xs text-white/60 mt-0.5">{chipFor(m)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
                      className="absolute top-3 right-3 w-8 h-8 bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                    >
                      <Heart size={14} strokeWidth={1.5} fill={has(m.id) ? 'currentColor' : 'none'} className={has(m.id) ? 'text-accent' : ''} />
                    </button>
                  </div>
                </Reveal>
              );
            })}
          </div>
          <div className="text-center mt-12">
            <button onClick={() => navigate('/collections')} className="btn-outline">
              {t('viewAll')}
            </button>
          </div>
        </div>
      </section>

      {/* The Craft — sticky-stacked chaptered cards */}
      <section data-theme-section="light" className="py-20 md:py-32 bg-ivory">
        <div className="container-lux">
          <SectionTitle
            title={lang === 'ar' ? 'حرفة الحجر' : 'The Craft of Stone'}
            subtitle={lang === 'ar' ? 'من المحجر إلى مساحتك' : 'From quarry to your space'}
          />
          <div ref={stackRef} className="card-stack">
            {craftChapters.map((chapter, i) => (
              <article key={i} className="stack-card" style={{ '--i': i } as CSSProperties}>
                <div className="grid md:grid-cols-2">
                  <div className="relative order-2 md:order-1 min-h-[42vh] md:min-h-[70vh]">
                    <img
                      src={chapter.image}
                      alt=""
                      loading="lazy"
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  </div>
                  <div className="order-1 md:order-2 flex flex-col justify-center gap-5 p-8 md:p-14 bg-white">
                    <span className="text-xs tracking-[0.25em] uppercase text-accent">
                      {chapter.eyebrow}
                    </span>
                    <h3 className="font-display text-3xl md:text-4xl font-light text-stone-900 leading-tight">
                      <TextReveal text={chapter.title} />
                    </h3>
                    <p className="text-stone-600 leading-relaxed max-w-md">{chapter.body}</p>
                    <span className="text-xs tracking-[0.2em] uppercase text-stone-400">
                      0{i + 1} / 0{craftChapters.length}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Browse by Colour */}
      <section data-theme-section="light" className="py-20 md:py-32 bg-ivory">
        <div className="container-lux">
          <SectionTitle title={t('browseByColour')} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {colours.map(([name, img], i) => (
              <Reveal key={name} delay={i * 60}>
                <button
                  onClick={() => navigate(`/collections?colour=${name}`)}
                  className="group relative w-full block overflow-hidden"
                >
                  <LazyImage
                    src={img}
                    alt={name}
                    aspectClass="aspect-square"
                    className="transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-stone-950/20 group-hover:bg-stone-950/40 transition-colors" />
                  <p className="absolute bottom-4 left-0 right-0 text-center text-sm tracking-[0.15em] uppercase text-white font-light">
                    {name}
                  </p>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Visualizer Promotion */}
      <section data-theme-section="dark" className="relative h-[80vh] md:h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="https://images.pexels.com/photos/8146212/pexels-photo-8146212.jpeg?auto=compress&cs=tinysrgb&w=1920"
            alt="Kitchen visualizer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-stone-950/50" />
        </div>
        <div className="relative z-10 container-lux">
          <Reveal>
            <div className="max-w-2xl">
              <h2 className="font-display text-heading font-light text-white mb-6">{t('visualizerTitle')}</h2>
              <button onClick={() => navigate('/visualizer')} className="btn-primary border-white bg-white text-stone-900 hover:bg-transparent hover:text-white">
                {t('tryNow')}
              </button>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Projects */}
      <section data-theme-section="light" className="py-20 md:py-32 bg-stone-100">
        <div className="container-lux">
          <SectionTitle title={t('projectsTitle')} subtitle={t('projectsSubtitle')} />
          <div className="space-y-6 md:space-y-10">
            {featuredProjects.map((p, i) => (
              <Reveal key={p.id} delay={i * 100}>
                <button
                  onClick={() => navigate(`/project/${p.slug}`)}
                  className="group relative w-full block overflow-hidden"
                >
                  <LazyImage
                    src={p.coverImage ?? ''}
                    alt={pubName(p, lang)}
                    aspectClass="aspect-[16/9] md:aspect-[21/9]"
                    className="transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-stone-950/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 flex items-end justify-between">
                    <div className="text-start">
                      <p className="text-xs tracking-[0.2em] uppercase text-white/60 mb-2">{lang === 'ar' ? p.projectType.labelAr : p.projectType.labelEn}</p>
                      <h3 className="font-display text-2xl md:text-4xl font-light text-white">{pubName(p, lang)}</h3>
                      <p className="text-sm text-white/60 mt-1">{p.location ?? ''}</p>
                    </div>
                    <span className="hidden md:flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-white/80 group-hover:gap-3 transition-all">
                      {t('viewDetails')}
                      <ArrowRight size={14} strokeWidth={1.5} className="rtl:rotate-180" />
                    </span>
                  </div>
                </button>
              </Reveal>
            ))}
          </div>
          <div className="text-center mt-12">
            <button onClick={() => navigate('/projects')} className="btn-outline">
              {t('viewAll')}
            </button>
          </div>
        </div>
      </section>

      {/* Showroom */}
      <section data-theme-section="light" className="py-20 md:py-32 bg-ivory">
        <div className="container-lux">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <Reveal>
              <LazyImage src={showroomImage} alt="Showroom" aspectClass="aspect-[4/3]" />
            </Reveal>
            <Reveal delay={200}>
              <div>
                <h2 className="font-display text-heading font-light text-stone-900 mb-8">{t('showroom')}</h2>
                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <MapPin size={18} strokeWidth={1.5} className="text-stone-500 mt-1 shrink-0" />
                    <div>
                      <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('location')}</p>
                      <p className="text-stone-800">King Fahd Road, Al Olaya, Riyadh, Saudi Arabia</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <Clock size={18} strokeWidth={1.5} className="text-stone-500 mt-1 shrink-0" />
                    <div>
                      <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('workingHours')}</p>
                      <p className="text-stone-800">Saturday – Thursday: 9:00 AM – 8:00 PM</p>
                      <p className="text-stone-500 text-sm">Friday: 4:00 PM – 8:00 PM</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <Phone size={18} strokeWidth={1.5} className="text-stone-500 mt-1 shrink-0" />
                    <div>
                      <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('phone')}</p>
                      <p className="text-stone-800">+966 11 234 5678</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 mt-8">
                  <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="btn-primary">{t('getDirections')}</a>
                  <button onClick={() => navigate('/contact')} className="btn-outline">{t('bookVisit')}</button>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}
