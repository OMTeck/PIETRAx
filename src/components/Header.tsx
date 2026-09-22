import { useState, useEffect } from 'react';
import { Search, Heart, Menu, X, Globe } from 'lucide-react';
import { useLang } from '@/context/LanguageContext';
import { useWishlist } from '@/context/WishlistContext';
import { useRoute } from '@/context/RouteContext';
import { useCatalog } from '@/context/CatalogContext';
import { companySettings } from '@/lib/public';
import type { TranslationKey } from '@/data/i18n';

export function Header({ onSearchOpen }: { onSearchOpen: () => void }) {
  const { lang, t, toggleLang } = useLang();
  const { items: wishlistItems } = useWishlist();
  const { navigate, path } = useRoute();
  const { settings } = useCatalog();
  const brand = companySettings(settings).nameEn || 'PIETRA';
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navItems: { key: TranslationKey; path: string }[] = [
    { key: 'home', path: '/' },
    { key: 'collections', path: '/collections' },
    { key: 'marble', path: '/collections?category=Marble' },
    { key: 'ceramic', path: '/collections?category=Porcelain' },
    { key: 'projects', path: '/projects' },
    { key: 'visualizer', path: '/visualizer' },
    { key: 'about', path: '/about' },
    { key: 'contact', path: '/contact' },
  ];

  const isActive = (p: string) => {
    const base = p.split('?')[0];
    if (base === '/') return path === '/';
    return path.startsWith(base);
  };

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-ivory/95 backdrop-blur-md border-b border-stone-200 py-3'
            : 'bg-transparent py-6'
        }`}
      >
        <div className="container-lux flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={() => navigate('/')}
            className={`font-display text-2xl tracking-[0.3em] font-light transition-colors ${
              scrolled ? 'text-stone-900' : 'text-white'
            }`}
          >
            {brand}
          </button>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-7">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => navigate(item.path)}
                className={`text-xs tracking-[0.15em] uppercase link-underline transition-colors ${
                  scrolled
                    ? isActive(item.path)
                      ? 'text-stone-900 font-medium'
                      : 'text-stone-600 hover:text-stone-900'
                    : isActive(item.path)
                    ? 'text-white font-medium'
                    : 'text-white/80 hover:text-white'
                }`}
              >
                {t(item.key)}
              </button>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4 md:gap-5">
            <button
              onClick={onSearchOpen}
              className={`transition-colors ${scrolled ? 'text-stone-700 hover:text-stone-900' : 'text-white/90 hover:text-white'}`}
              aria-label={t('search')}
            >
              <Search size={18} strokeWidth={1.5} />
            </button>
            <button
              onClick={() => navigate('/wishlist')}
              className={`relative transition-colors ${scrolled ? 'text-stone-700 hover:text-stone-900' : 'text-white/90 hover:text-white'}`}
              aria-label={t('wishlist')}
            >
              <Heart size={18} strokeWidth={1.5} />
              {wishlistItems.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-accent text-white text-[10px] flex items-center justify-center rounded-full">
                  {wishlistItems.length}
                </span>
              )}
            </button>
            <button
              onClick={toggleLang}
              className={`text-xs tracking-[0.15em] uppercase transition-colors ${scrolled ? 'text-stone-700 hover:text-stone-900' : 'text-white/90 hover:text-white'}`}
            >
              {lang === 'ar' ? 'EN' : 'AR'}
            </button>
            <button
              onClick={() => setMobileOpen(true)}
              className={`lg:hidden transition-colors ${scrolled ? 'text-stone-900' : 'text-white'}`}
              aria-label="Menu"
            >
              <Menu size={22} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] bg-ivory">
          <div className="flex items-center justify-between px-6 py-5 border-b border-stone-200">
            <span className="font-display text-2xl tracking-[0.3em] font-light text-stone-900">{brand}</span>
            <button onClick={() => setMobileOpen(false)} className="text-stone-900">
              <X size={24} strokeWidth={1.5} />
            </button>
          </div>
          <nav className="flex flex-col px-6 py-8 gap-1">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => {
                  navigate(item.path);
                  setMobileOpen(false);
                }}
                className="text-start font-display text-2xl font-light text-stone-900 py-3 border-b border-stone-100 hover:text-accent transition-colors"
              >
                {t(item.key)}
              </button>
            ))}
            <div className="flex items-center gap-4 mt-6">
              <button
                onClick={() => {
                  toggleLang();
                }}
                className="flex items-center gap-2 text-sm tracking-[0.15em] uppercase text-stone-600"
              >
                <Globe size={16} strokeWidth={1.5} />
                {lang === 'ar' ? 'English' : 'العربية'}
              </button>
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
