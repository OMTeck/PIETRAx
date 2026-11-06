/**
 * Smaller variant of a remote image for thumbnails. Image CDNs that resize via
 * a width query parameter (Pexels: `w`, Unsplash: `w`) are asked for `width`
 * px; any other URL (own uploads, data URLs) is returned unchanged.
 */
export function thumbUrl(url: string, width = 320): string {
  if (!url || url.startsWith('data:')) return url;
  try {
    const u = new URL(url, window.location.href);
    if (/(^|\.)pexels\.com$/.test(u.hostname) || /(^|\.)unsplash\.com$/.test(u.hostname)) {
      const dpr = Math.min(2, Math.max(1, Math.round(window.devicePixelRatio || 1)));
      u.searchParams.set('w', String(width * dpr));
      return u.toString();
    }
  } catch {
    /* not a URL — leave it */
  }
  return url;
}
