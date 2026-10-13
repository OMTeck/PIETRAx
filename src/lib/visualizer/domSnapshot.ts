/**
 * Snapshots a DOM subtree to a PNG blob by copying layout-affecting computed
 * styles in-line and rendering it via an SVG foreignObject. This reproduces
 * the exact CSS output (clip paths, 3D perspective, blend modes) that a naive
 * canvas re-render cannot.
 */

function inlineStyles(source: HTMLElement, target: HTMLElement): void {
  const style = window.getComputedStyle(source);
  const keep = [
    'position', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'aspect-ratio',
    'transform', 'transform-origin',
    'clip-path',
    'background-image', 'background-size', 'background-repeat', 'background-position',
    'mix-blend-mode', 'opacity',
    'overflow', 'z-index',
    'transform-style',
  ];
  for (const prop of keep) {
    const value = style.getPropertyValue(prop);
    if (value) target.style.setProperty(prop, value);
  }
}

function cloneNodeWithStyles(source: Node): Node {
  if (source.nodeType === Node.TEXT_NODE) return document.createTextNode(source.textContent ?? '');
  const el = source as HTMLElement;
  const copy = el.cloneNode(false) as HTMLElement;
  inlineStyles(el, copy);
  for (const child of Array.from(el.childNodes)) {
    copy.appendChild(cloneNodeWithStyles(child));
  }
  return copy;
}

/** Renders a live DOM element into a PNG blob. */
export async function snapshotElement(el: HTMLElement): Promise<Blob> {
  const width = Math.max(1, Math.round(el.getBoundingClientRect().width));
  const height = Math.max(1, Math.round(el.getBoundingClientRect().height));

  const clone = cloneNodeWithStyles(el) as HTMLElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
  clone.style.margin = '0';
  // The element may carry a visual zoom/scale transform; drop it so the cloned
  // box (already scaled by getBoundingClientRect) isn't transformed twice.
  clone.style.transform = 'none';
  clone.style.transformOrigin = '50% 50%';

  const xml = new XMLSerializer().serializeToString(clone);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <foreignObject width="100%" height="100%">${xml}</foreignObject>
  </svg>`;

  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Snapshot render failed'));
      img.src = svgUrl;
    });
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Encode failed'))), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Shares the image via the Web Share API when available; falls back to download. */
export async function shareBlob(blob: Blob, title: string, fallbackFilename: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], fallbackFilename, { type: 'image/png' });
  const shareData = { title, files: [file] };
  if (navigator.share && navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch (err) {
      // AbortError means the user closed the sheet — that's not a failure.
      if ((err as { name?: string })?.name === 'AbortError') return 'shared';
      throw err;
    }
  }
  downloadBlob(blob, fallbackFilename);
  return 'downloaded';
}