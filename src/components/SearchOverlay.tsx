import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { materials } from '@/data/materials';
import { projects } from '@/data/content';
import { LazyImage } from '@/components/ui/Reveal';

export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return { materials: [], projects: [] };
    const q = query.toLowerCase();
    return {
      materials: materials
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.category.toLowerCase().includes(q) ||
            m.colour.toLowerCase().includes(q) ||
            m.slug.toLowerCase().includes(q)
        )
        .slice(0, 6),
      projects: projects
        .filter(
          (p) =>
            p.title.toLowerCase().includes(q) ||
            p.location.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        )
        .slice(0, 4),
    };
  }, [query]);

  if (!open) return null;

  const hasResults = results.materials.length > 0 || results.projects.length > 0;

  return (
    <div className="fixed inset-0 z-[70] bg-ivory">
      <div className="container-lux pt-8">
        <div className="flex items-center justify-between mb-12">
          <span className="font-display text-2xl tracking-[0.3em] font-light text-stone-900">PIETRA</span>
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
                        src={m.textureImage}
                        alt={m.name}
                        aspectClass="aspect-square"
                        className="group-hover:opacity-90 transition-opacity"
                      />
                      <p className="mt-2 text-sm text-stone-900">{m.name}</p>
                      <p className="text-xs text-stone-500">{m.category}</p>
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
                        src={p.image}
                        alt={p.title}
                        aspectClass="aspect-[4/3]"
                        className="group-hover:opacity-90 transition-opacity"
                      />
                      <p className="mt-2 text-sm text-stone-900">{p.title}</p>
                      <p className="text-xs text-stone-500">{p.location}</p>
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
