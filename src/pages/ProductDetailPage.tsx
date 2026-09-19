import { useState, useRef } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { useCatalog } from '@/context/CatalogContext';
import { pubName, pubMaterialName, type PubMaterial, type PubLang } from '@/lib/public';
import { QuoteModal, type QuoteItem } from '@/components/QuoteModal';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import { ArrowLeft, Heart, Download, Maximize2, ZoomIn, X } from 'lucide-react';

const specsFor = (m: { color: { labelAr: string; labelEn: string } | null; materialType: { labelAr: string; labelEn: string }; sizes: { label: string }[] }, lang: 'ar' | 'en') => {
  const which: PubLang = lang === 'ar' ? 'AR' : 'EN';
  const c = m.color;
  return {
    colourLabel: c ? (which === 'AR' ? c.labelAr : c.labelEn) : '',
    typeLabel: which === 'AR' ? m.materialType.labelAr : m.materialType.labelEn,
    sizes: m.sizes.map((s) => s.label),
  };
};

export function ProductDetailPage({ slug }: { slug: string }) {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const { has, toggle } = useWishlist();
  const { materials, materialBySlug, loading } = useCatalog();

  const material: PubMaterial | undefined = materialBySlug(slug);
  const [activeImage, setActiveImage] = useState(0);
  const [showSlab, setShowSlab] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [quoteOpen, setQuoteOpen] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  if (loading && !material) {
    return (
      <div className="pt-32 pb-20 text-center">
        <p className="text-stone-500 text-lg">{t('loading')}</p>
      </div>
    );
  }

  if (!material) {
    return (
      <div className="pt-32 pb-20 text-center">
        <p className="text-stone-500 text-lg">Material not found</p>
        <button onClick={() => navigate('/collections')} className="btn-outline mt-6">{t('back')}</button>
      </div>
    );
  }

  const name = pubName(material, lang);
  // Use a texture/slab image for the texture viewer when available.
  const sortedImages = [...material.images].sort((a, b) => a.sortOrder - b.sortOrder);
  const slabImage =
    sortedImages.find((i) => i.kind === 'SLAB')?.url ??
    sortedImages.find((i) => i.kind === 'TEXTURE')?.url ??
    sortedImages[0]?.url ??
    null;
  const allImages = sortedImages.map((i) => i.url);

  const related = materials
    .filter((m) => m.id !== material.id)
    .sort((a, b) => {
      let aScore = 0;
      let bScore = 0;
      if (a.color?.code === material.color?.code) aScore += 3;
      if (b.color?.code === material.color?.code) bScore += 3;
      if (a.materialType.code === material.materialType.code) aScore += 2;
      if (b.materialType.code === material.materialType.code) bScore += 2;
      return bScore - aScore;
    })
    .slice(0, 4);

  const fullLang = lang;
  const which: PubLang = lang === 'ar' ? 'AR' : 'EN';
  const trEach = material.translations.find((t) => t.lang === which) ?? material.translations[0];
  const description = trEach?.longDescription ?? trEach?.shortDescription ?? '';
  const specs = specsFor(material, fullLang);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  };

  const quoteItem: QuoteItem = { slug: material.slug, name, size: specs.sizes[0] };

  return (
    <div className="pt-20 md:pt-24">
      {/* Breadcrumb */}
      <div className="container-lux py-4">
        <button onClick={() => navigate('/collections')} className="flex items-center gap-2 text-xs tracking-[0.15em] uppercase text-stone-500 hover:text-stone-900 transition-colors">
          <ArrowLeft size={14} strokeWidth={1.5} className="rtl:rotate-180" />
          {t('collections')}
        </button>
      </div>

      {/* Main Image + Info */}
      <div className="container-lux">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 mb-16">
          {/* Image Side */}
          <div>
            <div
              ref={imgRef}
              className="relative aspect-[4/5] overflow-hidden cursor-zoom-in bg-stone-100"
              onMouseMove={handleMouseMove}
              onMouseEnter={() => setZoom(2)}
              onMouseLeave={() => setZoom(1)}
            >
              {allImages[activeImage] ? (
                <img
                  src={allImages[activeImage]}
                  alt={name}
                  className="w-full h-full object-cover transition-transform duration-300"
                  style={{ transform: `scale(${zoom})`, transformOrigin: `${zoomPos.x}% ${zoomPos.y}%` }}
                />
              ) : (
                <div className="w-full h-full bg-stone-100" />
              )}
              {material.bookmatch && (
                <span className="absolute top-4 right-4 text-[10px] tracking-[0.15em] uppercase bg-ivory/90 text-stone-900 px-3 py-1.5">
                  Bookmatch Available
                </span>
              )}
            </div>
            {/* Thumbnails */}
            {allImages.length > 0 && (
              <div className="flex gap-3 mt-4 overflow-x-auto scrollbar-hide">
                {allImages.map((img, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImage(i)}
                    className={`shrink-0 w-20 h-20 overflow-hidden border-2 transition-colors ${
                      activeImage === i ? 'border-stone-900' : 'border-transparent hover:border-stone-300'
                    }`}
                  >
                    <img src={img} alt={`${name} ${i + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info Side */}
          <div className="lg:pt-8">
            <Reveal>
              <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-3">{specs.typeLabel}</p>
              <h1 className="font-display text-4xl md:text-5xl font-light text-stone-900 mb-4">{name}</h1>
              {description && <p className="text-stone-600 leading-relaxed mb-8 max-w-md">{description}</p>}

              {/* Specs */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 mb-8 max-w-md">
                <div>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('origin')}</p>
                  <p className="text-stone-900 text-sm">{material.origin ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('colour')}</p>
                  <p className="text-stone-900 text-sm">{specs.colourLabel || '—'}</p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('finish')}</p>
                  <p className="text-stone-900 text-sm">{material.finish ? (which === 'AR' ? material.finish.labelAr : material.finish.labelEn) : '—'}</p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('thickness')}</p>
                  <p className="text-stone-900 text-sm">{material.thickness ?? '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('availableSizes')}</p>
                  <p className="text-stone-900 text-sm">{specs.sizes.join(' · ') || '—'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('applications')}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {material.applications.map((app) => (
                      <span key={app.id} className="text-xs px-3 py-1 border border-stone-200 text-stone-600">
                        {which === 'AR' ? app.labelAr : app.labelEn}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 max-w-md">
                <button onClick={() => navigate('/visualizer')} className="btn-primary w-full">{t('tryInRoom')}</button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setQuoteOpen(true)} className="btn-outline w-full">{t('requestQuote')}</button>
                  <button onClick={() => toggle(material.id)} className="btn-outline w-full flex items-center justify-center gap-2">
                    <Heart size={14} strokeWidth={1.5} fill={has(material.id) ? 'currentColor' : 'none'} className={has(material.id) ? 'text-accent' : ''} />
                    {has(material.id) ? t('remove') : t('addToFavorites')}
                  </button>
                </div>
                <button className="btn-ghost w-full justify-center">{t('downloadSpecs')}</button>
              </div>
            </Reveal>
          </div>
        </div>
      </div>

      {/* Texture Viewer */}
      {slabImage && (
        <section className="py-16 md:py-24 bg-stone-100">
          <div className="container-lux">
            <Reveal>
              <h2 className="font-display text-heading font-light text-stone-900 mb-2">{t('textureViewer')}</h2>
              <p className="text-sm text-stone-500 mb-8">{lang === 'ar' ? 'حرّك المؤشر لرؤية تفاصيل العروق' : 'Move cursor to see veining details'}</p>
            </Reveal>
            <Reveal delay={100}>
              <div
                ref={imgRef}
                className="relative aspect-[16/9] overflow-hidden cursor-zoom-in bg-stone-200"
                onMouseMove={handleMouseMove}
                onMouseEnter={() => setZoom(3)}
                onMouseLeave={() => setZoom(1)}
              >
                <img
                  src={slabImage}
                  alt={name}
                  className="w-full h-full object-cover transition-transform duration-200"
                  style={{ transform: `scale(${zoom})`, transformOrigin: `${zoomPos.x}% ${zoomPos.y}%` }}
                />
                <div className="absolute bottom-4 right-4 flex items-center gap-2 text-xs text-white/80 bg-stone-950/40 px-3 py-2">
                  <ZoomIn size={14} strokeWidth={1.5} />
                  {lang === 'ar' ? 'تكبير' : 'Zoom'}
                </div>
              </div>
            </Reveal>
            <div className="mt-4">
              <button onClick={() => setShowSlab(true)} className="btn-outline">
                <Maximize2 size={14} strokeWidth={1.5} className="mr-2" />
                {t('fullSlabView')}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Applications gallery */}
      <section className="py-16 md:py-24 bg-ivory">
        <div className="container-lux">
          <h2 className="font-display text-heading font-light text-stone-900 mb-12">{t('applications')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {allImages.map((img, i) => (
              <Reveal key={i} delay={i * 100}>
                <LazyImage src={img} alt={`${name} application ${i + 1}`} aspectClass="aspect-[4/3]" className="hover:opacity-90 transition-opacity" />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Related Materials */}
      <section className="py-16 md:py-24 bg-stone-100">
        <div className="container-lux">
          <h2 className="font-display text-heading font-light text-stone-900 mb-12">{t('relatedMaterials')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {related.map((m, i) => {
              const img = [...m.images].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.url;
              return (
                <Reveal key={m.id} delay={i * 80}>
                  <button onClick={() => navigate(`/material/${m.slug}`)} className="group block w-full">
                    <LazyImage src={img ?? ''} alt={pubMaterialName(m.translations, fullLang)} aspectClass="aspect-[4/5]" className="transition-transform duration-500 group-hover:scale-105" />
                    <p className="mt-3 text-sm text-stone-900">{pubMaterialName(m.translations, fullLang)}</p>
                    <p className="text-xs text-stone-500">{lang === 'ar' ? m.materialType.labelAr : m.materialType.labelEn} · {m.color ? (lang === 'ar' ? m.color.labelAr : m.color.labelEn) : ''}</p>
                  </button>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Full Slab Modal */}
      {showSlab && slabImage && (
        <div className="fixed inset-0 z-[80] bg-stone-950/90 flex items-center justify-center p-4" onClick={() => setShowSlab(false)}>
          <button className="absolute top-6 right-6 text-white/80 hover:text-white" onClick={() => setShowSlab(false)}>
            <X size={28} strokeWidth={1.5} />
          </button>
          <img src={slabImage} alt={name} className="max-w-full max-h-full object-contain" />
        </div>
      )}

      <QuoteModal open={quoteOpen} items={[quoteItem]} onClose={() => setQuoteOpen(false)} />
    </div>
  );
}