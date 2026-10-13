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
  { maxDim = 1280, quality = 0.82 } = {},
): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const src = typeof input === 'string' ? input : URL.createObjectURL(input);
    const img = new Image();
    img.onload = () => {
      if (typeof input === 'string') {
        // nothing to revoke for a data URL
      } else {
        URL.revokeObjectURL(src);
      }
      const scale = Math.min(1, maxDim / (img.naturalWidth || 1), maxDim / (img.naturalHeight || 1));
      const w = Math.max(1, Math.round((img.naturalWidth || 1) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || 1) * scale));
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas unavailable'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
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