// Scroll-motion primitives (apple-design-web skill).
//
// The signature "alive" behavior is a *continuous damped scroll-progress*: every
// transform is bound to a lerped "shadow" scroll value rather than a one-shot
// reveal. One shared rAF loop reads layout first, then writes styles — never an
// interleaved read/write, and never a scroll-event handler doing layout.
//
// Progressive enhancement: everything is gated behind prefers-reduced-motion and
// degrades to the static (rest) state — content is always visible without JS.
import { useEffect, useRef, useState, type RefObject } from 'react';

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Maps v from [inMin,inMax] to [outMin,outMax], clamped to the input range. */
export function mapRange(v: number, inMin: number, inMax: number, outMin: number, outMax: number): number {
  if (inMax === inMin) return outMin;
  const t = clamp((v - inMin) / (inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * t;
}

export interface ScrollFrame {
  /** Element progress through the viewport: 0 entering from bottom, 1 leaving top. */
  progress: number;
  /** How far the element has scrolled past its own start: 0 at top, 1 fully gone. */
  exit: number;
  /** Element's current bounding rect. */
  rect: DOMRect;
  /** Lerped (damped) shadow-scroll Y. */
  dampedY: number;
  /** Raw window.scrollY. */
  rawY: number;
  /** Whole-document scroll ratio 0→1. */
  docProgress: number;
  /** Viewport height. */
  vh: number;
}

type ScrollUpdate = (frame: ScrollFrame) => void;
interface Effect {
  el: HTMLElement;
  update: ScrollUpdate;
}

const effects = new Set<Effect>();
const LERP = 0.1;
let running = false;
let dampedY = 0;

function frame() {
  const rawY = window.scrollY || window.pageYOffset || 0;
  // Damped shadow-scroll: lerp toward the real value so motion trails the scroll.
  dampedY += (rawY - dampedY) * LERP;
  if (Math.abs(rawY - dampedY) < 0.05) dampedY = rawY;

  const vh = window.innerHeight;
  const docMax = document.documentElement.scrollHeight - vh;
  const docProgress = docMax > 0 ? clamp(rawY / docMax, 0, 1) : 0;

  // READ phase — every layout read happens before any write (no thrash).
  const reads: { e: Effect; rect: DOMRect }[] = [];
  for (const e of effects) {
    if (!e.el.isConnected) {
      effects.delete(e);
      continue;
    }
    reads.push({ e, rect: e.el.getBoundingClientRect() });
  }

  // WRITE phase.
  for (const { e, rect } of reads) {
    const span = vh + rect.height || 1;
    const progress = clamp((vh - rect.top) / span, 0, 1);
    const exit = clamp(-rect.top / (rect.height || 1), 0, 1);
    e.update({ progress, exit, rect, dampedY, rawY, docProgress, vh });
  }

  if (effects.size === 0) {
    running = false;
    return;
  }
  requestAnimationFrame(frame);
}

function ensureRunning() {
  if (running) return;
  running = true;
  dampedY = window.scrollY || 0;
  requestAnimationFrame(frame);
}

/**
 * Runs `update` every animation frame for the element `ref`, with batched
 * read-then-write ordering. No-ops under prefers-reduced-motion (the element
 * keeps its static rest state).
 */
export function useScrollScene(
  ref: RefObject<HTMLElement | null>,
  update: ScrollUpdate,
  enabled = true,
) {
  const updateRef = useRef(update);
  updateRef.current = update;
  useEffect(() => {
    if (!enabled || prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const effect: Effect = { el, update: (f) => updateRef.current(f) };
    effects.add(effect);
    ensureRunning();
    return () => {
      effects.delete(effect);
    };
  }, [ref, enabled]);
}

/**
 * Sticky-stack "chaptered cards": each `.stack-card` inside `containerRef` pins
 * at a staggered top (CSS) and recedes (scale + opacity) once later cards pin on
 * top of it. Pure layout does the stacking; this only adds the recede polish.
 */
export function useStickyStack(containerRef: RefObject<HTMLElement | null>, enabled = true) {
  useScrollScene(
    containerRef,
    () => {
      const container = containerRef.current;
      if (!container) return;
      const cards = Array.from(container.querySelectorAll<HTMLElement>('.stack-card'));
      if (cards.length === 0) return;

      const rects = cards.map((c) => c.getBoundingClientRect());
      const tops = cards.map((c) => parseFloat(getComputedStyle(c).top) || 0);

      const SLOP = 6;
      cards.forEach((card, i) => {
        const stuck = rects[i].top <= tops[i] + SLOP;
        let buried = 0;
        if (stuck) {
          for (let j = i + 1; j < cards.length; j++) {
            if (rects[j].top <= tops[j] + SLOP) buried++;
          }
        }
        const scale = buried ? Math.max(0.9, 1 - 0.03 * buried) : 1;
        const opacity = buried ? Math.max(0.72, 1 - buried * 0.1) : 1;
        card.style.transform = `scale(${scale.toFixed(3)})`;
        card.style.opacity = opacity.toFixed(3);
      });
    },
    enabled,
  );
}

/**
 * Cross-section theme morph (light↔dark chapters). Watches `[data-theme-section]`
 * on a zero-height band at the viewport centre so it flips regardless of section
 * height (threshold:0.5 would silently never fire on tall pinned chapters).
 * Returns the active chapter (or null when the page has no themed sections) and
 * mirrors it onto <html data-chapter>.
 */
export function useChapterTheme(resetKey?: string): 'light' | 'dark' | null {
  const [chapter, setChapter] = useState<'light' | 'dark' | null>(null);
  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-theme-section]'),
    );
    setChapter(null);
    document.documentElement.removeAttribute('data-chapter');
    if (sections.length === 0) return;
    const apply = (el: HTMLElement) => {
      const t = el.dataset.themeSection === 'light' ? 'light' : 'dark';
      setChapter(t);
      document.documentElement.setAttribute('data-chapter', t);
    };
    const atCenter = () => {
      const cy = window.innerHeight / 2;
      for (const s of sections) {
        const r = s.getBoundingClientRect();
        if (r.top <= cy && r.bottom >= cy) return s;
      }
      return null;
    };
    const initial = atCenter();
    if (initial) apply(initial);
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) apply(entry.target as HTMLElement);
        }
      },
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [resetKey]);
  return chapter;
}

/**
 * Header-local "is the nav bar sitting over a dark section?" signal.
 *
 * `useChapterTheme` reports the chapter crossing the *viewport centre*, which lags
 * the header by ~half a viewport — so a nav that follows it turns white while still
 * parked over the light section that precedes a dark one (white-on-ivory, invisible).
 * This reads the section under the header's own vertical position instead, so the
 * nav flips exactly when the boundary passes underneath it.
 */
export function useHeaderOverDark(resetKey?: string): boolean {
  const [overDark, setOverDark] = useState(false);
  useEffect(() => {
    let raf = 0;
    let last: boolean | null = null;
    const tick = () => {
      const y = 32; // inside the header for both its scrolled and unscrolled padding
      let dark = false;
      for (const s of document.querySelectorAll<HTMLElement>('[data-theme-section]')) {
        const r = s.getBoundingClientRect();
        if (r.top <= y && r.bottom > y) dark = s.dataset.themeSection === 'dark';
      }
      if (dark !== last) {
        last = dark;
        setOverDark(dark);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      last = null;
    };
  }, [resetKey]);
  return overDark;
}
