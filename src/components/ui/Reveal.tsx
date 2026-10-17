import { useState, useRef, useEffect, type ReactNode } from 'react';
import { prefersReducedMotion, useScrollScene } from '@/lib/motion';

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

/**
 * Clip-path word wipe — each word rises out of an overflow-hidden mask, staggered
 * so the line reads as a purposeful revelation rather than a generic fade. Falls
 * back to plain, fully-visible text under reduced motion.
 */
export function TextReveal({
  text,
  className = '',
  wordDelay = 55,
  startDelay = 0,
  once = true,
}: {
  text: string;
  className?: string;
  wordDelay?: number;
  startDelay?: number;
  once?: boolean;
}) {
  const reduced = prefersReducedMotion();
  const [visible, setVisible] = useState(reduced);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (reduced) return;
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setVisible(false);
        }
      },
      { threshold: 0.35 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [reduced, once]);

  const words = text.split(' ');

  return (
    <span ref={ref} className={className}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="inline-block overflow-hidden align-bottom py-[0.06em]">
          <span
            className="inline-block will-change-transform transition-transform duration-[900ms] ease-out"
            style={{
              transform: visible ? 'translateY(0)' : 'translateY(115%)',
              transitionDelay: `${startDelay + i * wordDelay}ms`,
            }}
          >
            {word}
            {i < words.length - 1 ? '\u00A0' : ''}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * Scroll-bound parallax layer: translates its children as the wrapper crosses
 * the viewport (damped, conservative differential). No-op under reduced motion.
 */
export function Parallax({
  children,
  className = '',
  speed = 0.15,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const inner = useRef<HTMLDivElement | null>(null);

  useScrollScene(ref, ({ progress }) => {
    if (!inner.current) return;
    const offset = (progress - 0.5) * 2 * speed * 120;
    inner.current.style.transform = `translateY(${offset.toFixed(2)}px)`;
  });

  return (
    <div ref={ref} className={className}>
      <div ref={inner} className="will-change-transform">
        {children}
      </div>
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
  return (
    <div className={`${centered ? 'text-center' : ''} mb-12 md:mb-16`}>
      <Reveal>
        <h2 className="font-display text-heading font-light text-stone-900">
          <TextReveal text={title} />
        </h2>
        {subtitle && (
          <p className="mt-3 text-sm tracking-[0.15em] uppercase text-stone-500">{subtitle}</p>
        )}
      </Reveal>
    </div>
  );
}
