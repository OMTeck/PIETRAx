import { useState, useRef } from 'react';
import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { getMaterialBySlug, getRelatedMaterials } from '@/data/materials';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import { ArrowLeft, Heart, Download, Maximize2, ZoomIn, X } from 'lucide-react';

export function ProductDetailPage({ slug }: { slug: string }) {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const { has, toggle } = useWishlist();
  const material = getMaterialBySlug(slug);
  const [activeImage, setActiveImage] = useState(0);
  const [showSlab, setShowSlab] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const imgRef = useRef<HTMLDivElement>(null);

  if (!material) {
    return (
      <div className="pt-32 pb-20 text-center">
        <p className="text-stone-500 text-lg">Material not found</p>
        <button onClick={() => navigate('/collections')} className="btn-outline mt-6">{t('back')}</button>
      </div>
    );
  }

  const related = getRelatedMaterials(material, 4);
  const allImages = [material.slabImage, ...material.roomImages, ...material.gallery];

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({ x, y });
  };

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
              <img
                src={allImages[activeImage]}
                alt={material.name}
                className="w-full h-full object-cover transition-transform duration-300"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                }}
              />
              {material.bookmatch && (
                <span className="absolute top-4 right-4 text-[10px] tracking-[0.15em] uppercase bg-ivory/90 text-stone-900 px-3 py-1.5">
                  Bookmatch Available
                </span>
              )}
            </div>
            {/* Thumbnails */}
            <div className="flex gap-3 mt-4 overflow-x-auto scrollbar-hide">
              {allImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={`shrink-0 w-20 h-20 overflow-hidden border-2 transition-colors ${
                    activeImage === i ? 'border-stone-900' : 'border-transparent hover:border-stone-300'
                  }`}
                >
                  <img src={img} alt={`${material.name} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Info Side */}
          <div className="lg:pt-8">
            <Reveal>
              <p className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-3">{material.category}</p>
              <h1 className="font-display text-4xl md:text-5xl font-light text-stone-900 mb-4">{material.name}</h1>
              <p className="text-stone-600 leading-relaxed mb-8 max-w-md">{material.description}</p>

              {/* Specs */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 mb-8 max-w-md">
                <div>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('origin')}</p>
                  <p className="text-stone-900 text-sm">{material.origin}</p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('colour')}</p>
                  <p className="text-stone-900 text-sm">{material.colour}</p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('finish')}</p>
                  <p className="text-stone-900 text-sm">{material.finish}</p>
                </div>
                <div>
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('thickness')}</p>
                  <p className="text-stone-900 text-sm">{material.thickness}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('availableSizes')}</p>
                  <p className="text-stone-900 text-sm">{material.sizes.join(' · ')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs tracking-[0.15em] uppercase text-stone-500 mb-1">{t('applications')}</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {material.applications.map((app) => (
                      <span key={app} className="text-xs px-3 py-1 border border-stone-200 text-stone-600">{app}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-3 max-w-md">
                <button onClick={() => navigate('/visualizer')} className="btn-primary w-full">{t('tryInRoom')}</button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => navigate('/contact')} className="btn-outline w-full">{t('requestQuote')}</button>
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
                src={material.slabImage}
                alt={material.name}
                className="w-full h-full object-cover transition-transform duration-200"
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: `${zoomPos.x}% ${zoomPos.y}%`,
                }}
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

      {/* Applications */}
      <section className="py-16 md:py-24 bg-ivory">
        <div className="container-lux">
          <h2 className="font-display text-heading font-light text-stone-900 mb-12">{t('applications')}</h2>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {material.roomImages.map((img, i) => (
              <Reveal key={i} delay={i * 100}>
                <LazyImage src={img} alt={`${material.name} application ${i + 1}`} aspectClass="aspect-[4/3]" className="hover:opacity-90 transition-opacity" />
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
            {related.map((m, i) => (
              <Reveal key={m.id} delay={i * 80}>
                <button onClick={() => navigate(`/material/${m.slug}`)} className="group block w-full">
                  <LazyImage src={m.textureImage} alt={m.name} aspectClass="aspect-[4/5]" className="transition-transform duration-500 group-hover:scale-105" />
                  <p className="mt-3 text-sm text-stone-900">{m.name}</p>
                  <p className="text-xs text-stone-500">{m.category} · {m.colour}</p>
                </button>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Full Slab Modal */}
      {showSlab && (
        <div className="fixed inset-0 z-[80] bg-stone-950/90 flex items-center justify-center p-4" onClick={() => setShowSlab(false)}>
          <button className="absolute top-6 right-6 text-white/80 hover:text-white" onClick={() => setShowSlab(false)}>
            <X size={28} strokeWidth={1.5} />
          </button>
          <img src={material.slabImage} alt={material.name} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
}
