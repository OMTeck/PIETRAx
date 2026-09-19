import { useState, useMemo, useEffect } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubName, pubCover, pubMaterialName, type PubMaterial, type PubTaxonomy } from '@/lib/public';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import { Search, SlidersHorizontal, X, Heart, Eye, Maximize2 } from 'lucide-react';

type SortBy = 'newest' | 'name' | 'colour' | 'popular';

const TYPE_CODE_BY_LABEL: Record<string, string> = {
  Marble: 'marble', Ceramic: 'ceramic', Porcelain: 'porcelain', Granite: 'granite', Travertine: 'travertine', Onyx: 'onyx',
};
const COLOUR_CODE_BY_LABEL: Record<string, string> = {
  White: 'white', Beige: 'beige', Grey: 'grey', Black: 'black', Brown: 'brown', Green: 'green', Blue: 'blue', Multicolor: 'multicolor',
};

function toCode(raw: string | null, lookup: Record<string, string>): string | null {
  if (!raw) return null;
  if (Object.values(lookup).includes(raw)) return raw;
  return lookup[raw] ?? null;
}

export function CollectionsPage() {
  const { t, lang } = useLang();
  const { navigate, path } = useRoute();
  const { has, toggle } = useWishlist();
  const { materials } = useCatalog();

  const params = new URLSearchParams(path.split('?')[1] || '');

  const [search, setSearch] = useState('');
  const [selectedMaterials, setSelectedMaterials] = useState<Set<string>>(
    new Set(toCode(params.get('category'), TYPE_CODE_BY_LABEL) ? [toCode(params.get('category'), TYPE_CODE_BY_LABEL)!] : []),
  );
  const [selectedColours, setSelectedColours] = useState<Set<string>>(
    new Set(toCode(params.get('colour'), COLOUR_CODE_BY_LABEL) ? [toCode(params.get('colour'), COLOUR_CODE_BY_LABEL)!] : []),
  );
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [selectedFinishes, setSelectedFinishes] = useState<Set<string>>(new Set());
  const [selectedCollection, setSelectedCollection] = useState<string | null>(params.get('collection'));
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const cat = toCode(params.get('category'), TYPE_CODE_BY_LABEL);
    const col = toCode(params.get('colour'), COLOUR_CODE_BY_LABEL);
    const coll = params.get('collection');
    if (cat) setSelectedMaterials(new Set([cat]));
    if (col) setSelectedColours(new Set([col]));
    setSelectedCollection(coll);
  }, [path]);

  const optionGroups = useMemo(() => {
    const types = new Map<string, PubTaxonomy>();
    const colours = new Map<string, PubTaxonomy>();
    const apps = new Map<string, PubTaxonomy>();
    const finishes = new Map<string, PubTaxonomy>();
    for (const m of materials) {
      if (!types.has(m.materialType.code)) types.set(m.materialType.code, m.materialType);
      if (m.color && !colours.has(m.color.code)) colours.set(m.color.code, m.color);
      if (m.finish && !finishes.has(m.finish.code)) finishes.set(m.finish.code, m.finish);
      for (const a of m.applications) if (!apps.has(a.code)) apps.set(a.code, a);
    }
    const label = (n: PubTaxonomy) => (lang === 'ar' ? n.labelAr : n.labelEn);
    return {
      types: [...types.values()].map((n) => ({ code: n.code, label: label(n) })),
      colours: [...colours.values()].map((n) => ({ code: n.code, label: label(n) })),
      apps: [...apps.values()].map((n) => ({ code: n.code, label: label(n) })),
      finishes: [...finishes.values()].map((n) => ({ code: n.code, label: label(n) })),
    };
  }, [materials, lang]);

  useEffect(() => {
    setSelectedMaterials(new Set());
    setSelectedColours(new Set());
    setSelectedApps(new Set());
    setSelectedFinishes(new Set());
    setSelectedCollection(null);
    setOnlyAvailable(false);
    setSearch('');
  }, [lang]);

  const toggleFilter = (set: Set<string>, setter: (s: Set<string>) => void, value: string) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  };

  const filtered = useMemo(() => {
    let result = materials.filter((m) => {
      const name = pubMaterialName(m.translations, lang).toLowerCase();
      const altName = pubMaterialName(m.translations, lang === 'ar' ? 'en' : 'ar').toLowerCase();
      const q = search.trim().toLowerCase();
      if (q && !name.includes(q) && !altName.includes(q) && !m.slug.toLowerCase().includes(q) && !(m.sku ?? '').toLowerCase().includes(q)) return false;
      if (selectedMaterials.size > 0 && !selectedMaterials.has(m.materialType.code)) return false;
      if (selectedColours.size > 0 && (!m.color || !selectedColours.has(m.color.code))) return false;
      if (selectedApps.size > 0 && !m.applications.some((a) => selectedApps.has(a.code))) return false;
      if (selectedFinishes.size > 0 && (!m.finish || !selectedFinishes.has(m.finish.code))) return false;
      if (selectedCollection && !m.collections.some((c) => c.slug === selectedCollection)) return false;
      if (onlyAvailable && !m.availability) return false;
      return true;
    });

    switch (sortBy) {
      case 'newest':
        result = [...result].sort((a, b) => Number(b.newArrival) - Number(a.newArrival));
        break;
      case 'name':
        result = [...result].sort((a, b) => pubMaterialName(a.translations, 'en').localeCompare(pubMaterialName(b.translations, 'en')));
        break;
      case 'colour':
        result = [...result].sort((a, b) => (a.color?.code ?? '').localeCompare(b.color?.code ?? ''));
        break;
      case 'popular':
        result = [...result].sort((a, b) => Number(b.popular) - Number(a.popular));
        break;
    }
    return result;
  }, [search, selectedMaterials, selectedColours, selectedApps, selectedFinishes, selectedCollection, onlyAvailable, sortBy, materials, lang]);

  const hasActiveFilters =
    selectedMaterials.size > 0 || selectedColours.size > 0 || selectedApps.size > 0 || selectedFinishes.size > 0 || selectedCollection || onlyAvailable;

  const FilterSection = ({ title, options, selected, onToggle }: { title: string; options: { code: string; label: string }[]; selected: Set<string>; onToggle: (v: string) => void }) => (
    <div className="mb-6">
      <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-3">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.code}
            onClick={() => onToggle(opt.code)}
            className={`filter-chip ${selected.has(opt.code) ? 'filter-chip-active' : ''}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="pt-24 md:pt-32 pb-20">
      {/* Header */}
      <div className="container-lux mb-12">
        <Reveal>
          <h1 className="font-display text-display font-light text-stone-900 mb-2">{t('exploreMaterials')}</h1>
          <p className="text-sm tracking-[0.15em] uppercase text-stone-500">{filtered.length} {t('results')}</p>
        </Reveal>
      </div>

      {/* Search Bar */}
      <div className="container-lux mb-8">
        <div className="flex items-center gap-3 border-b border-stone-300 pb-3 max-w-2xl">
          <Search size={18} strokeWidth={1.5} className="text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchMaterials')}
            className="flex-1 bg-transparent text-stone-900 placeholder-stone-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="container-lux">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar — Desktop */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-28">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xs tracking-[0.2em] uppercase text-stone-900 font-medium">{t('filters')}</h3>
                {hasActiveFilters && (
                  <button
                    onClick={() => {
                      setSelectedMaterials(new Set());
                      setSelectedColours(new Set());
                      setSelectedApps(new Set());
                      setSelectedFinishes(new Set());
                      setSelectedCollection(null);
                      setOnlyAvailable(false);
                    }}
                    className="text-xs text-stone-500 hover:text-stone-900"
                  >
                    {t('reset')}
                  </button>
                )}
              </div>
              <FilterSection title={t('material')} options={optionGroups.types} selected={selectedMaterials} onToggle={(v) => toggleFilter(selectedMaterials, setSelectedMaterials, v)} />
              <FilterSection title={t('colour')} options={optionGroups.colours} selected={selectedColours} onToggle={(v) => toggleFilter(selectedColours, setSelectedColours, v)} />
              {optionGroups.apps.length > 0 && <FilterSection title={t('application')} options={optionGroups.apps} selected={selectedApps} onToggle={(v) => toggleFilter(selectedApps, setSelectedApps, v)} />}
              {optionGroups.finishes.length > 0 && <FilterSection title={t('finish')} options={optionGroups.finishes} selected={selectedFinishes} onToggle={(v) => toggleFilter(selectedFinishes, setSelectedFinishes, v)} />}
              <div className="mb-6">
                <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-3">{t('availability')}</p>
                <button onClick={() => setOnlyAvailable(!onlyAvailable)} className={`filter-chip ${onlyAvailable ? 'filter-chip-active' : ''}`}>
                  {onlyAvailable ? t('inStock') : t('all')}
                </button>
              </div>
            </div>
          </aside>

          {/* Mobile Filter Toggle */}
          <div className="lg:hidden">
            <button onClick={() => setShowFilters(true)} className="flex items-center gap-2 text-sm tracking-[0.15em] uppercase text-stone-900 border border-stone-300 px-5 py-3">
              <SlidersHorizontal size={16} strokeWidth={1.5} />
              {t('filters')}
            </button>
          </div>

          {/* Grid */}
          <div className="flex-1">
            {/* Sort Bar */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="text-xs tracking-[0.15em] uppercase text-stone-500">{t('sortBy')}</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  className="text-sm text-stone-900 bg-transparent border-b border-stone-300 focus:border-stone-900 focus:outline-none cursor-pointer"
                >
                  <option value="newest">{t('newest')}</option>
                  <option value="name">{t('name')}</option>
                  <option value="colour">{t('colour')}</option>
                  <option value="popular">{t('popular')}</option>
                </select>
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-stone-500 text-lg">{t('noResults')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                {filtered.map((m, i) => {
                  const name = pubName(m, lang);
                  const typeLabel = lang === 'ar' ? m.materialType.labelAr : m.materialType.labelEn;
                  const colourLabel = m.color ? (lang === 'ar' ? m.color.labelAr : m.color.labelEn) : '';
                  return (
                    <Reveal key={m.id} delay={(i % 3) * 80}>
                      <div className="group relative overflow-hidden">
                        <button onClick={() => navigate(`/material/${m.slug}`)} className="block w-full">
                          <LazyImage
                            src={pubCover(m) ?? ''}
                            alt={name}
                            aspectClass="aspect-[4/5]"
                            className="transition-transform duration-700 group-hover:scale-110"
                          />
                        </button>
                        <div className="absolute inset-0 bg-stone-950/0 group-hover:bg-stone-950/30 transition-colors duration-500 pointer-events-none" />
                        {/* Hover Actions */}
                        <div className="absolute inset-x-0 bottom-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-500">
                          <div className="flex gap-2">
                            <button onClick={() => navigate(`/material/${m.slug}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs tracking-wider uppercase bg-white/90 text-stone-900 hover:bg-white transition-colors">
                              <Eye size={13} strokeWidth={1.5} /> {t('viewDetails')}
                            </button>
                            <button onClick={() => navigate(`/visualizer?material=${m.slug}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs tracking-wider uppercase bg-stone-900/90 text-white hover:bg-stone-900 transition-colors">
                              <Maximize2 size={13} strokeWidth={1.5} /> {t('tryInRoomBtn')}
                            </button>
                            <button onClick={() => toggle(m.id)} className="w-10 flex items-center justify-center bg-white/90 text-stone-900 hover:bg-white transition-colors">
                              <Heart size={14} strokeWidth={1.5} fill={has(m.id) ? 'currentColor' : 'none'} className={has(m.id) ? 'text-accent' : ''} />
                            </button>
                          </div>
                        </div>
                        {/* Info */}
                        <div className="absolute top-0 left-0 right-0 p-4 flex items-start justify-between">
                          <div className="text-start">
                            <p className="text-white font-display text-lg font-light drop-shadow-md">{name}</p>
                            <p className="text-white/70 text-xs drop-shadow-md">{typeLabel} · {colourLabel}</p>
                          </div>
                          {!m.availability && (
                            <span className="text-[10px] tracking-wider uppercase bg-stone-900/60 text-white px-2 py-1">{t('outOfStock')}</span>
                          )}
                        </div>
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Filters Drawer */}
      {showFilters && (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <div className="absolute inset-0 bg-stone-950/40" onClick={() => setShowFilters(false)} />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] bg-ivory overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm tracking-[0.2em] uppercase font-medium">{t('filters')}</h3>
              <button onClick={() => setShowFilters(false)}><X size={20} /></button>
            </div>
            <FilterSection title={t('material')} options={optionGroups.types} selected={selectedMaterials} onToggle={(v) => toggleFilter(selectedMaterials, setSelectedMaterials, v)} />
            <FilterSection title={t('colour')} options={optionGroups.colours} selected={selectedColours} onToggle={(v) => toggleFilter(selectedColours, setSelectedColours, v)} />
            <FilterSection title={t('application')} options={optionGroups.apps} selected={selectedApps} onToggle={(v) => toggleFilter(selectedApps, setSelectedApps, v)} />
            <FilterSection title={t('finish')} options={optionGroups.finishes} selected={selectedFinishes} onToggle={(v) => toggleFilter(selectedFinishes, setSelectedFinishes, v)} />
            <button onClick={() => setShowFilters(false)} className="btn-primary w-full mt-4">
              {t('close')} ({filtered.length} {t('results')})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}