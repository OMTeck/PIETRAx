import { useRef, useCallback } from 'react';
import type { NormalizedPoint } from '@/lib/visualizer/types';

interface PolygonEditorProps {
  imageUrl: string;
  points: NormalizedPoint[];
  onChange: (points: NormalizedPoint[]) => void;
  color?: string;
  disabled?: boolean;
}

/**
 * Touch-friendly polygon editor over a room photo. Coordinates are normalized
 * to 0..1 relative to the image. Hit targets for each vertex are padded to
 * ~40px via invisible circles, and rows are appended by tapping the image.
 */
export function PolygonEditor({ imageUrl, points, onChange, color = '#c2410c', disabled = false }: PolygonEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ index: number; dx: number; dy: number } | null>(null);

  const toNormalized = useCallback((clientX: number, clientY: number): NormalizedPoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGGElement>, index: number) => {
      if (disabled) return;
      e.preventDefault();
      const pt = toNormalized(e.clientX, e.clientY);
      if (!pt) return;
      dragRef.current = { index, dx: pt.x - points[index].x, dy: pt.y - points[index].y };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [toNormalized, disabled, points],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!dragRef.current || disabled) return;
      const pt = toNormalized(e.clientX, e.clientY);
      if (!pt) return;
      const { index, dx, dy } = dragRef.current;
      const next = points.slice();
      next[index] = {
        x: Math.min(1, Math.max(0, pt.x - dx)),
        y: Math.min(1, Math.max(0, pt.y - dy)),
      };
      onChange(next);
    },
    [toNormalized, disabled, onChange, points],
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleBackgroundClick = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (disabled || dragRef.current) return;
      const target = e.target as Element;
      if (target.tagName !== 'svg') return; // vertex clicks are handled by their own handlers
      const pt = toNormalized(e.clientX, e.clientY);
      if (!pt) return;
      onChange([...points, pt]);
    },
    [disabled, toNormalized, onChange, points],
  );

  const handleVertexDoubleClick = useCallback(
    (index: number) => {
      if (disabled || points.length <= 3) return;
      onChange(points.filter((_, i) => i !== index));
    },
    [disabled, onChange, points],
  );

  const poly = points.map((p) => `${(p.x * 100).toFixed(2)},${(p.y * 100).toFixed(2)}`).join(' ');

  return (
    <div className="relative w-full" style={{ touchAction: 'none' }}>
      <img src={imageUrl} alt="" className="block w-full h-auto select-none" draggable={false} />
      <svg
        ref={svgRef}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onPointerDownCapture={handleBackgroundClick}
      >
        <polygon points={poly} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => (
          <g
            key={i}
            onPointerDown={(e) => handlePointerDown(e, i)}
            onDoubleClick={() => handleVertexDoubleClick(i)}
            style={{ cursor: 'move' }}
            className="vertex-hit"
          >
            <circle cx={p.x * 100} cy={p.y * 100} r={4} fill="white" stroke={color} strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
            <circle cx={p.x * 100} cy={p.y * 100} r={18} fill="transparent" />
          </g>
        ))}
      </svg>
    </div>
  );
}