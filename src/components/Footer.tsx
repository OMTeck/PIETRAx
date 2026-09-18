import { useLang } from '@/context/LanguageContext';
import { useRoute } from '@/context/RouteContext';
import { Instagram, Facebook, Twitter, Linkedin } from 'lucide-react';
import type { TranslationKey } from '@/data/i18n';

export function Footer() {
  const { t } = useLang();
  const { navigate } = useRoute();

  const links: { key: TranslationKey; path: string }[] = [
    { key: 'collections', path: '/collections' },
    { key: 'projects', path: '/projects' },
    { key: 'visualizer', path: '/visualizer' },
    { key: 'about', path: '/about' },
    { key: 'contact', path: '/contact' },
    { key: 'faq', path: '/contact' },
    { key: 'privacy', path: '/contact' },
  ];

  return (
    <footer className="bg-stone-950 text-stone-300 pt-20 pb-8">
      <div className="container-lux">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-2">
            <h3 className="font-display text-3xl tracking-[0.3em] font-light text-ivory mb-4">PIETRA</h3>
            <p className="text-sm text-stone-400 leading-relaxed max-w-sm">{t('footerAbout')}</p>
            <div className="flex gap-4 mt-6">
              {[Instagram, Facebook, Twitter, Linkedin].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 border border-stone-700 flex items-center justify-center text-stone-400 hover:border-accent hover:text-accent transition-colors"
                >
                  <Icon size={15} strokeWidth={1.5} />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-5">{t('quickLinks')}</h4>
            <ul className="space-y-3">
              {links.map((link) => (
                <li key={link.key}>
                  <button
                    onClick={() => navigate(link.path)}
                    className="text-sm text-stone-400 hover:text-ivory transition-colors"
                  >
                    {t(link.key)}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-xs tracking-[0.2em] uppercase text-stone-500 mb-5">{t('contact')}</h4>
            <ul className="space-y-3 text-sm text-stone-400">
              <li>King Fahd Road, Riyadh</li>
              <li>+966 11 234 5678</li>
              <li>info@pietra-gallery.com</li>
              <li>Sat – Thu: 9AM – 8PM</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-stone-800 pt-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-stone-500">© 2026 PIETRA Gallery. All rights reserved.</p>
          <p className="text-xs text-stone-500">Designed for exceptional spaces.</p>
        </div>
      </div>
    </footer>
  );
}
