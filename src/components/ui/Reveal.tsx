import { useState, type ReactNode } from 'react';
import { useLang } from '@/context/LanguageContext';

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div
      ref={(el) => {
        if (el && !visible) {
          const obs = new IntersectionObserver(
            ([entry]) => {
              if (entry.isIntersecting) {
                setVisible(true);
                obs.disconnect();
              }
            },
            { threshold: 0.15 }
          );
          obs.observe(el);
        }
      }}
      className={`transition-all duration-1000 ease-out ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function LazyImage({
  src,
  alt,
  className = '',
  aspectClass = '',
}: {
  src: string;
  alt: string;
  className?: string;
  aspectClass?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className={`relative overflow-hidden ${aspectClass} ${className}`}>
      {!loaded && <div className="absolute inset-0 img-placeholder" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full object-cover transition-all duration-700 ${
          loaded ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
        }`}
      />
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  centered = true,
}: {
  title: string;
  subtitle?: string;
  centered?: boolean;
}) {
  const { t } = useLang();
  return (
    <div className={`${centered ? 'text-center' : ''} mb-12 md:mb-16`}>
      <Reveal>
        <h2 className="font-display text-heading font-light text-stone-900">{title}</h2>
        {subtitle && (
          <p className="mt-3 text-sm tracking-[0.15em] uppercase text-stone-500">{subtitle}</p>
        )}
      </Reveal>
    </div>
  );
}
