import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { materials } from '@/data/materials';
import { collections, projects, colourSwatches, showroomImage, heroImage } from '@/data/content';
import { Reveal, LazyImage, SectionTitle } from '@/components/ui/Reveal';
import { ArrowRight, MapPin, Clock, Phone, Heart } from 'lucide-react';

export function HomePage() {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const { has, toggle } = useWishlist();

  const newArrivals = materials.filter((m) => m.newArrival).slice(0, 6);
  const featuredProjects = projects.slice(0, 5);
  const colours = Object.entries(colourSwatches);

  return (
    <div>
      {/* Hero */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroImage}
            alt="Luxury marble interior"
            className="w-full h-full object-cover animate-slow-zoom"
          />
          <div className="absolute inset-0 bg-stone-950/40" />
        </div>
        <div className="relative z-10 text-center px-6">
          <Reveal>
            <p className="text-xs tracking-[0.3em] uppercase text-white/70 mb-6">PIETRA GALLERY</p>
          </Reveal>
          <Reveal delay={200}>
            <h1 className="font-display text-display font-light text-white mb-4 max-w-4xl mx-auto leading-[1.05]">
              {t('heroTitle')}
            </h1>
          </Reveal>
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
          <div className="flex flex-col items-center gap-2 text-white/50">
            <span className="text-[10px] tracking-[0.3em] uppercase">{t('scrollDown')}</span>
            <div className="w-px h-12 bg-white/30 animate-pulse" />
          </div>
        </div>
      </section>

      {/* Featured Collections */}
      <section className="py-20 md:py-32 bg-ivory">
        <div className="container-lux">
          <SectionTitle title={t('featuredCollections')} />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {collections.map((col, i) => (
              <Reveal key={col.id} delay={i * 100}>
                <button
                  onClick={() => navigate(`/collections?category=${col.name}`)}
                  className="group relative w-full block overflow-hidden"
                >
                  <LazyImage
                    src={col.image}
                    alt={col.name}
                    aspectClass="aspect-[4/5]"
                    className="transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/60 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-8 text-start">
                    <h3 className="font-display text-3xl font-light text-white mb-1">
                      {lang === 'ar' ? col.nameAr : col.name}
                    </h3>
                    <p className="text-sm text-white/70 mb-4">{col.description}</p>
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
      <section className="py-20 md:py-32 bg-stone-100">
        <div className="container-lux">
          <SectionTitle title={t('newArrivals')} subtitle={t('newArrivalsSubtitle')} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {newArrivals.map((m, i) => {
              const isLarge = i === 0 || i === 3;
              return (
                <Reveal key={m.id} delay={i * 80} className={isLarge ? 'lg:row-span-2' : ''}>
                  <button
                    onClick={() => navigate(`/material/${m.slug}`)}
                    className="group relative w-full block overflow-hidden"
                  >
                    <LazyImage
                      src={m.textureImage}
                      alt={m.name}
                      aspectClass={isLarge ? 'aspect-[3/4] lg:aspect-[3/5]' : 'aspect-square'}
                      className="transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-stone-950/0 group-hover:bg-stone-950/20 transition-colors duration-500" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5 text-start">
                      <p className="font-display text-lg md:text-xl font-light text-white">{m.name}</p>
                      <p className="text-xs text-white/60 mt-0.5">{m.category} · {m.colour} · {m.sizes[1] || m.sizes[0]}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
                      className="absolute top-3 right-3 w-8 h-8 bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                    >
                      <Heart size={14} strokeWidth={1.5} fill={has(m.id) ? 'currentColor' : 'none'} className={has(m.id) ? 'text-accent' : ''} />
                    </button>
                  </button>
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

      {/* Browse by Colour */}
      <section className="py-20 md:py-32 bg-ivory">
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
      <section className="relative h-[80vh] md:h-screen flex items-center overflow-hidden">
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
      <section className="py-20 md:py-32 bg-stone-100">
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
                    src={p.image}
                    alt={p.title}
                    aspectClass="aspect-[16/9] md:aspect-[21/9]"
                    className="transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-stone-950/10 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 flex items-end justify-between">
                    <div className="text-start">
                      <p className="text-xs tracking-[0.2em] uppercase text-white/60 mb-2">{p.category}</p>
                      <h3 className="font-display text-2xl md:text-4xl font-light text-white">{p.title}</h3>
                      <p className="text-sm text-white/60 mt-1">{p.location}</p>
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
      <section className="py-20 md:py-32 bg-ivory">
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
