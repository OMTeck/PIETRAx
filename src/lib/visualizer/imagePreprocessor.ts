export interface CompressedImage {
  dataUrl: string;
  blob: Blob;
  width: number;
  height: number;
  bytes: number;
}

/**
 * Client-side compression: downscale to maxDim and re-encode as JPEG.
 * Keeps guest uploads small enough for the server's JSON body limit and
 * reduces the bytes sent to the cloud segmentation service.
 */
export async function compressImage(
  input: File | Blob | string,
  { maxDim = 1280, quality = 0.82, cropAspect }: { maxDim?: number; quality?: number; cropAspect?: number } = {},
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const src = typeof input === 'string' ? input : URL.createObjectURL(input);
    const img = new Image();
    // Remote (preset) photos must be fetched CORS-enabled so the canvas stays
    // untainted and toBlob() does not throw a SecurityError.
    if (typeof input === 'string' && /^https?:/i.test(input)) img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (typeof input === 'string') {
        // nothing to revoke for a data URL
      } else {
        URL.revokeObjectURL(src);
      }
      const nw = img.naturalWidth || 1;
      const nh = img.naturalHeight || 1;
      // Optional center-crop so the AI output aspect matches the display box.
      let sx = 0;
      let sy = 0;
      let sw = nw;
      let sh = nh;
      if (cropAspect && nw > 0 && nh > 0) {
        if (nw / nh > cropAspect) {
          sw = Math.round(nh * cropAspect);
          sx = Math.round((nw - sw) / 2);
        } else {
          sh = Math.round(nw / cropAspect);
          sy = Math.round((nh - sh) / 2);
        }
      }
      const scale = Math.min(1, maxDim / sw, maxDim / sh);
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      c.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Encode failed'));
            return;
          }
          const reader = new FileReader();
          reader.onload = () => resolve({ dataUrl: String(reader.result), blob, width: w, height: h, bytes: blob.size });
          reader.onerror = () => reject(new Error('Read failed'));
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        quality,
      );
    };
    img.onerror = () => {
      if (typeof input !== 'string') URL.revokeObjectURL(src);
      reject(new Error('Load failed'));
    };
    img.src = src;
  });
}