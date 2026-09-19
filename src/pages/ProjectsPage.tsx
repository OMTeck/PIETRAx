import { useState, useMemo } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubName } from '@/lib/public';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import { ArrowLeft, X, MapPin } from 'lucide-react';

export function ProjectsPage() {
  const { t, lang } = useLang();
  const { navigate, path } = useRoute();
  const { projects, materialBySlug, loading } = useCatalog();

  const routePath = path.split('?')[0];
  const detailSlug = routePath.startsWith('/project/') ? routePath.slice('/project/'.length) : null;
  const params = new URLSearchParams(path.split('?')[1] || '');
  const typeParam = params.get('type');

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of projects) {
      if (p.projectType.code && !seen.has(p.projectType.code)) {
        seen.set(p.projectType.code, lang === 'ar' ? p.projectType.labelAr : p.projectType.labelEn);
      }
    }
    return [...seen.entries()].map(([code, label]) => ({ code, label }));
  }, [projects, lang]);

  const [category, setCategory] = useState<string>('All');
  const activeCategory = typeParam && categories.some((c) => c.code === typeParam) ? (typeParam as string) : category;

  const filtered = useMemo(() => {
    if (activeCategory === 'All') return projects;
    return projects.filter((p) => p.projectType.code === activeCategory);
  }, [activeCategory, projects]);

  const selected = detailSlug ? projects.find((p) => p.slug === detailSlug) : null;

  const goToProject = (slug: string) => navigate(`/project/${slug}`);

  if (loading && projects.length === 0 && !selected) {
    return (
      <div className="pt-32 pb-20 min-h-screen text-center">
        <p className="text-stone-500">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="pt-20 md:pt-24 pb-20">
      {selected ? (
        /* ── Project Detail ───────────────────────────────── */
        <ProjectDetail projectSlug={selected.slug} onBack={() => navigate('/projects')} />
      ) : (
        <>
          <div className="container-lux mb-10">
            <Reveal>
              <h1 className="font-display text-display font-light text-stone-900 mb-2">{t('projectsTitle')}</h1>
              <p className="text-sm tracking-[0.15em] uppercase text-stone-500">{t('projectsSubtitle')}</p>
            </Reveal>
          </div>

          {/* Filters */}
          {categories.length > 0 && (
            <div className="container-lux mb-10">
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setCategory('All')} className={`filter-chip ${activeCategory === 'All' ? 'filter-chip-active' : ''}`}>
                  {t('allProjects')}
                </button>
                {categories.map((c) => (
                  <button key={c.code} onClick={() => setCategory(c.code)} className={`filter-chip ${activeCategory === c.code ? 'filter-chip-active' : ''}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Projects Grid */}
          <div className="container-lux">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
              {filtered.map((p, i) => (
                <Reveal key={p.id} delay={(i % 2) * 100}>
                  <button onClick={() => goToProject(p.slug)} className="group relative block w-full overflow-hidden">
                    <LazyImage
                      src={p.coverImage ?? ''}
                      alt={pubName(p, lang)}
                      aspectClass="aspect-[16/10]"
                      className="transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-stone-950/70 via-stone-950/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8 text-start">
                      <p className="text-xs tracking-[0.2em] uppercase text-white/60 mb-2">
                        {lang === 'ar' ? p.projectType.labelAr : p.projectType.labelEn}
                      </p>
                      <h3 className="font-display text-2xl md:text-3xl font-light text-white mb-1">{pubName(p, lang)}</h3>
                      {p.location && <p className="text-sm text-white/60">{p.location}</p>}
                    </div>
                  </button>
                </Reveal>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectDetail({ projectSlug, onBack }: { projectSlug: string; onBack: () => void }) {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const { projectBySlug, materialBySlug } = useCatalog();
  const project = projectBySlug(projectSlug);

  if (!project) {
    return (
      <div className="container-lux text-center pt-16">
        <p className="text-stone-500 text-lg">{t('noSearchResults')}</p>
        <button onClick={onBack} className="btn-outline mt-6">{t('back')}</button>
      </div>
    );
  }

  const title = pubName(project, lang);
  const heroImage = project.coverImage ?? [...project.images].sort((a, b) => a.sortOrder - b.sortOrder).find(() => true)?.url ?? null;
  const gallery = [...project.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => i.url);
  const primary = project.translations.find((tr) => tr.lang === (lang === 'ar' ? 'AR' : 'EN'));
  const which = lang === 'ar' ? 'AR' : 'EN';

  return (
    <div className="container-lux">
      <button onClick={onBack} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900 transition-colors py-6">
        <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
        {t('allProjects')}
      </button>

      {heroImage && (
        <div className="relative overflow-hidden mb-10">
          <LazyImage src={heroImage} alt={title} aspectClass="aspect-[16/9]" />
        </div>
      )}

      <div className="max-w-3xl mb-12">
        <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-2">
          {lang === 'ar' ? project.projectType.labelAr : project.projectType.labelEn}
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-light text-stone-900 mb-4">{title}</h1>
        {project.location && (
          <p className="flex items-center gap-2 text-sm text-stone-500 mb-4">
            <MapPin size={14} strokeWidth={1.5} />
            {project.location}
          </p>
        )}
        {primary?.shortDescription && <p className="text-stone-600 leading-relaxed">{primary.shortDescription}</p>}
      </div>

      {/* Gallery */}
      {gallery.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 md:gap-6 mb-12">
          {gallery.map((img, i) => (
            <Reveal key={i} delay={i * 60}>
              <LazyImage src={img} alt={`${title} ${i + 1}`} aspectClass="aspect-[4/3]" />
            </Reveal>
          ))}
        </div>
      )}

      {/* Materials Used */}
      {project.materials.length > 0 && (
        <div className="pt-8 border-t border-stone-200">
          <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-4">{t('materialsUsed')}</p>
          <div className="flex flex-wrap gap-4">
            {project.materials.map((m) => {
              const meta = materialBySlug(m.slug);
              const img = meta ? [...meta.images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url ?? null : null;
              return (
                <button
                  key={m.slug}
                  onClick={() => navigate(`/material/${m.slug}`)}
                  className="flex items-center gap-3 group"
                >
                  <div className="w-14 h-14 overflow-hidden bg-stone-100">
                    {img && <img src={img} alt={pubName(meta!, lang)} className="w-full h-full object-cover" />}
                  </div>
                  <div className="text-start">
                    <p className="text-sm text-stone-900 group-hover:text-accent transition-colors">
                      {m.translations.find((tr) => tr.lang === which)?.name ?? m.translations[0]?.name ?? ''}
                    </p>
                    {meta && (
                      <p className="text-xs text-stone-500">
                        {lang === 'ar' ? meta.materialType.labelAr : meta.materialType.labelEn}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}