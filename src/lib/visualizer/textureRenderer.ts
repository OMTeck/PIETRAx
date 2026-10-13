import type { CSSProperties } from 'react';
import type { RoomLayout } from './types';

/**
 * Perspective-correct tile overlay style for a given surface: the texture is
 * repeated at a real physical size (tileCm) and the whole layer is tilted so
 * rows converge toward the detected horizon.
 */
export function tileCss(opts: {
  textureUrl: string;
  tileCm: number;
  pxPerMeter: number;
  kind: 'floor' | 'wall' | 'ceiling' | 'countertop';
  horizonY: number; // room-horizon fraction of image height
  rotation?: number; // tiles rotated within the surface plane (deg)
  groutWidth?: number; // visual gap between tiles (px, scaled)
}): CSSProperties {
  const tilePx = Math.max(10, Math.round((opts.tileCm / 100) * opts.pxPerMeter));
  let transform = '';
  let origin = `50% ${(opts.horizonY * 100).toFixed(1)}%`;
  if (opts.kind === 'floor') {
    transform = 'perspective(900px) rotateX(56deg)';
    origin = '50% 0%';
  } else if (opts.kind === 'wall') {
    transform = 'perspective(900px) rotateX(-14deg)';
    origin = '50% 50%';
  } else if (opts.kind === 'ceiling') {
    transform = 'perspective(900px) rotateX(-62deg)';
    origin = '50% 100%';
  } else {
    transform = 'perspective(900px) rotateX(18deg)';
    origin = '50% 0%';
  }
  if (opts.rotation) transform = `${transform} rotate(${opts.rotation}deg)`;

  const size: CSSProperties['backgroundSize'] = `${tilePx}px ${tilePx}px`;
  return {
    backgroundImage: `url(${opts.textureUrl})`,
    backgroundSize: size,
    backgroundRepeat: 'repeat',
    transform,
    transformOrigin: origin,
    WebkitTransform: transform,
    backfaceVisibility: 'hidden',
    mixBlendMode: 'multiply',
    willChange: 'transform',
  };
}

export function layoutToTileCss(layout: RoomLayout, opts: Omit<Parameters<typeof tileCss>[0], 'horizonY' | 'pxPerMeter'>) {
  return tileCss({ ...opts, pxPerMeter: layout.pxPerMeter, horizonY: layout.horizonY });
}