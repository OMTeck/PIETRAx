import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubName, pubCover, pubCollectionName, companySettings } from '@/lib/public';
import { LazyImage } from '@/components/ui/Reveal';

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const { materials, projects, collections, settings } = useCatalog();
  const brand = companySettings(settings).nameEn || 'PIETRA';
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return { materials: [] as typeof materials, projects: [] as typeof projects, collections: [] as typeof collections };
    const q = query.toLowerCase();
    const matches = <T extends { translations: { lang: string; name: string }[] }>(arr: T[]) =>
      arr.filter((item) =>
        item.translations.some((tr) => tr.name.toLowerCase().includes(q))
      );
    return {
      materials: matches(materials).slice(0, 6),
      projects: projects.filter((p) => pubName(p, lang).toLowerCase().includes(q)).slice(0, 4),
      collections: matches(collections).slice(0, 4),
    };
  }, [query, materials, projects, collections, lang]);

  if (!open) return null;

  const hasResults = results.materials.length > 0 || results.projects.length > 0 || results.collections.length > 0;

  return (
    <div className="fixed inset-0 z-[70] bg-ivory">
      <div className="container-lux pt-8">
        <div className="flex items-center justify-between mb-12">
          <span className="font-display text-2xl tracking-[0.3em] font-light text-stone-900">{brand}</span>
          <button onClick={onClose} className="text-stone-700 hover:text-stone-900">
            <X size={24} strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex items-center gap-4 border-b-2 border-stone-900 pb-4 mb-12">
          <Search size={24} strokeWidth={1.5} className="text-stone-900" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            className="flex-1 bg-transparent text-2xl md:text-3xl font-display font-light text-stone-900 placeholder-stone-400 focus:outline-none"
          />
        </div>

        {query.trim() === '' ? (
          <div className="text-center py-20">
            <p className="text-stone-400 text-sm tracking-[0.15em] uppercase">{t('searchPlaceholder')}</p>
          </div>
        ) : !hasResults ? (
          <div className="text-center py-20">
            <p className="text-stone-500 text-lg">{t('noSearchResults')}</p>
          </div>
        ) : (
          <div className="space-y-12">
            {results.collections.length > 0 && (
              <div>
                <h3 className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-5">{t('collections')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {results.collections.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        navigate(`/collections?collection=${c.slug}`);
                        onClose();
                      }}
                      className="group text-start"
                    >
                      <LazyImage
                        src={c.coverImage ?? ''}
                        alt={pubCollectionName(c.translations, lang)}
                        aspectClass="aspect-[4/3]"
                        className="group-hover:opacity-90 transition-opacity"
                      />
                      <p className="mt-2 text-sm text-stone-900">{pubCollectionName(c.translations, lang)}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {results.materials.length > 0 && (
              <div>
                <h3 className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-5">{t('materials')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  {results.materials.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => {
                        navigate(`/material/${m.slug}`);
                        onClose();
                      }}
                      className="group text-start"
                    >
                      <LazyImage
                        src={pubCover(m) ?? ''}
                        alt={pubName(m, lang)}
                        aspectClass="aspect-square"
                        className="group-hover:opacity-90 transition-opacity"
                      />
                      <p className="mt-2 text-sm text-stone-900">{pubName(m, lang)}</p>
                      <p className="text-xs text-stone-500">{lang === 'ar' ? m.materialType.labelAr : m.materialType.labelEn}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {results.projects.length > 0 && (
              <div>
                <h3 className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-5">{t('projectsTitle')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {results.projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        navigate(`/project/${p.slug}`);
                        onClose();
                      }}
                      className="group text-start"
                    >
                      <LazyImage
                        src={p.coverImage ?? ''}
                        alt={pubName(p, lang)}
                        aspectClass="aspect-[4/3]"
                        className="group-hover:opacity-90 transition-opacity"
                      />
                      <p className="mt-2 text-sm text-stone-900">{pubName(p, lang)}</p>
                      {p.location && <p className="text-xs text-stone-500">{p.location}</p>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}