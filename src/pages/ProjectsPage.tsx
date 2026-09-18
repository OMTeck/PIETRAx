import { useState, useMemo } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { projects } from '@/data/content';
import { getMaterialBySlug } from '@/data/materials';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

type Category = 'All' | 'Residential' | 'Commercial' | 'Hospitality' | 'Kitchen' | 'Bathroom' | 'Exterior';

export function ProjectsPage() {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const [category, setCategory] = useState<Category>('All');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (category === 'All') return projects;
    return projects.filter((p) => p.category === category);
  }, [category]);

  const categories: Category[] = ['All', 'Residential', 'Commercial', 'Hospitality', 'Kitchen', 'Bathroom', 'Exterior'];
  const categoryLabels: Record<Category, string> = {
    All: t('allProjects'),
    Residential: t('residential'),
    Commercial: t('commercial'),
    Hospitality: t('hospitality'),
    Kitchen: t('kitchen'),
    Bathroom: t('bathroom'),
    Exterior: t('exterior'),
  };

  const selected = projects.find((p) => p.slug === selectedSlug);

  return (
    <div className="pt-24 md:pt-32 pb-20">
      <div className="container-lux mb-10">
        <Reveal>
          <h1 className="font-display text-display font-light text-stone-900 mb-2">{t('projectsTitle')}</h1>
          <p className="text-sm tracking-[0.15em] uppercase text-stone-500">{t('projectsSubtitle')}</p>
        </Reveal>
      </div>

      {/* Filters */}
      <div className="container-lux mb-10">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`filter-chip ${category === cat ? 'filter-chip-active' : ''}`}
            >
              {categoryLabels[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      <div className="container-lux">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {filtered.map((p, i) => (
            <Reveal key={p.id} delay={(i % 2) * 100}>
              <button
                onClick={() => setSelectedSlug(p.slug)}
                className="group relative block w-full overflow-hidden"
              >
                <LazyImage
                  src={p.image}
                  alt={p.title}
                  aspectClass="aspect-[16/10]"
                  className="transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-stone-950/10 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 text-start">
                  <p className="text-xs tracking-[0.2em] uppercase text-white/60 mb-2">{p.category}</p>
                  <h3 className="font-display text-2xl md:text-3xl font-light text-white mb-1">{p.title}</h3>
                  <p className="text-sm text-white/60">{p.location}</p>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      {/* Project Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-[70] bg-stone-950/80 overflow-y-auto" onClick={() => setSelectedSlug(null)}>
          <div className="min-h-screen flex items-start justify-center p-4 md:p-8">
            <div className="bg-ivory max-w-5xl w-full my-8" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-6 border-b border-stone-200">
                <div>
                  <p className="text-xs tracking-[0.2em] uppercase text-stone-500">{selected.category}</p>
                  <h2 className="font-display text-3xl font-light text-stone-900">{selected.title}</h2>
                  <p className="text-sm text-stone-500 mt-1">{selected.location}</p>
                </div>
                <button onClick={() => setSelectedSlug(null)} className="text-stone-500 hover:text-stone-900">
                  <X size={24} strokeWidth={1.5} />
                </button>
              </div>
              <div className="p-6">
                <LazyImage src={selected.image} alt={selected.title} aspectClass="aspect-[16/9]" />
                <p className="mt-6 text-stone-700 leading-relaxed max-w-2xl">{selected.description}</p>

                {/* Gallery */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
                  {selected.gallery.map((img, i) => (
                    <LazyImage key={i} src={img} alt={`${selected.title} ${i + 1}`} aspectClass="aspect-[4/3]" />
                  ))}
                </div>

                {/* Materials Used */}
                <div className="mt-8 pt-6 border-t border-stone-200">
                  <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-4">{t('materialsUsed')}</p>
                  <div className="flex flex-wrap gap-4">
                    {selected.materials.map((slug) => {
                      const m = getMaterialBySlug(slug);
                      if (!m) return null;
                      return (
                        <button
                          key={slug}
                          onClick={() => {
                            navigate(`/material/${slug}`);
                            setSelectedSlug(null);
                          }}
                          className="flex items-center gap-3 group"
                        >
                          <div className="w-14 h-14 overflow-hidden">
                            <img src={m.textureImage} alt={m.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="text-start">
                            <p className="text-sm text-stone-900 group-hover:text-accent transition-colors">{m.name}</p>
                            <p className="text-xs text-stone-500">{m.category}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
