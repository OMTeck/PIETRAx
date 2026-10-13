import type { NormalizedPoint } from './types';

/** Build a CSS clip-path polygon from normalized (0..1) points. */
export function pointsToClipPath(points: NormalizedPoint[]): string {
  if (points.length < 3) return 'none';
  const parts = points.map((p) => `${(p.x * 100).toFixed(2)}% ${(p.y * 100).toFixed(2)}%`);
  return `polygon(${parts.join(', ')})`;
}

/** Shoelace area in normalized units (0..1 square). */
export function polygonArea(points: NormalizedPoint[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Ramer-Douglas-Peucker simplification. Keeps the overall shape while capping
 * the number of vertices returned by the cloud model (client-side, free).
 */
export function simplifyPolygon(points: NormalizedPoint[], epsilon = 0.02, maxPoints = 30): NormalizedPoint[] {
  if (points.length <= 3) return points;

  const squaredDistance = (p: NormalizedPoint, a: NormalizedPoint, b: NormalizedPoint): number => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lenSq = vx * vx + vy * vy;
    if (lenSq === 0) return (p.x - a.x) ** 2 + (p.y - a.y) ** 2;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / lenSq));
    const proj = { x: a.x + t * vx, y: a.y + t * vy };
    return (p.x - proj.x) ** 2 + (p.y - proj.y) ** 2;
  };

  const keep = new Uint8Array(points.length).fill(0);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = squaredDistance(points[i], points[start], points[end]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsilon * epsilon && idx !== -1) {
      keep[idx] = 1;
      stack.push([start, idx]);
      stack.push([idx, end]);
    }
  }

  const out = points.filter((_, i) => keep[i]);
  if (out.length > maxPoints) {
    const stride = Math.ceil(out.length / maxPoints);
    const decimated = out.filter((_, i) => i % stride === 0);
    if (decimated[decimated.length - 1] !== out[out.length - 1]) decimated.push(out[out.length - 1]);
    return decimated;
  }
  return out;
}