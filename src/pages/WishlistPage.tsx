import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { useWishlist } from '@/context/WishlistContext';
import { materials } from '@/data/materials';
import { Reveal, LazyImage } from '@/components/ui/Reveal';
import { Heart, X, ArrowRight } from 'lucide-react';

export function WishlistPage() {
  const { t, lang } = useLang();
  const { navigate } = useRoute();
  const { items, remove, clear } = useWishlist();

  const wishlistMaterials = materials.filter((m) => items.includes(m.id));

  if (wishlistMaterials.length === 0) {
    return (
      <div className="pt-32 pb-20 text-center">
        <div className="w-20 h-20 mx-auto mb-6 border-2 border-stone-200 rounded-full flex items-center justify-center">
          <Heart size={32} strokeWidth={1} className="text-stone-300" />
        </div>
        <h1 className="font-display text-3xl font-light text-stone-900 mb-2">{t('wishlistTitle')}</h1>
        <p className="text-stone-500 mb-1">{t('wishlistEmpty')}</p>
        <p className="text-sm text-stone-400 mb-8">{t('wishlistEmptyDesc')}</p>
        <button onClick={() => navigate('/collections')} className="btn-primary">
          {t('exploreCollection')}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-24 md:pt-32 pb-20">
      <div className="container-lux">
        <div className="flex items-center justify-between mb-12">
          <Reveal>
            <h1 className="font-display text-display font-light text-stone-900">{t('wishlistTitle')}</h1>
          </Reveal>
          <div className="flex gap-3">
            <button onClick={() => navigate('/contact')} className="btn-primary text-xs">
              {t('requestQuoteAll')}
            </button>
            <button onClick={clear} className="btn-ghost text-xs">
              {t('reset')}
            </button>
          </div>
        </div>

        {/* Compare Grid */}
        <div className="overflow-x-auto">
          <div className="flex gap-6 min-w-max pb-4">
            {wishlistMaterials.map((m, i) => (
              <Reveal key={m.id} delay={i * 80}>
                <div className="w-64 shrink-0 group">
                  <div className="relative">
                    <button onClick={() => navigate(`/material/${m.slug}`)} className="block w-full">
                      <LazyImage
                        src={m.textureImage}
                        alt={m.name}
                        aspectClass="aspect-[4/5]"
                        className="transition-transform duration-500 group-hover:scale-105"
                      />
                    </button>
                    <button
                      onClick={() => remove(m.id)}
                      className="absolute top-3 right-3 w-8 h-8 bg-ivory/90 flex items-center justify-center text-stone-900 hover:bg-stone-900 hover:text-ivory transition-colors"
                    >
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="mt-4">
                    <p className="font-display text-lg font-light text-stone-900">{m.name}</p>
                    <p className="text-xs text-stone-500 mt-0.5">{m.category} · {m.colour}</p>
                    <p className="text-xs text-stone-500">{m.finish} · {m.sizes[0]}</p>
                    <div className="flex gap-2 mt-4">
                      <button onClick={() => navigate(`/material/${m.slug}`)} className="flex-1 text-xs tracking-wider uppercase border border-stone-200 py-2.5 hover:border-stone-900 transition-colors">
                        {t('viewDetails')}
                      </button>
                      <button onClick={() => navigate(`/visualizer?material=${m.slug}`)} className="flex-1 text-xs tracking-wider uppercase border border-stone-900 bg-stone-900 text-ivory py-2.5 hover:bg-stone-700 transition-colors">
                        {t('tryInRoomBtn')}
                      </button>
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        {/* Bottom action */}
        <div className="mt-12 text-center">
          <button onClick={() => navigate('/collections')} className="btn-outline">
            {t('exploreCollection')}
            <ArrowRight size={14} strokeWidth={1.5} className="ml-2 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </div>
  );
}
