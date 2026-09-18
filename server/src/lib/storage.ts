import { mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { config } from '../config.js';

export interface StoredAsset {
  url: string; // public URL path e.g. /uploads/2026/09/uuid.webp
  thumbUrl: string | null;
  path: string; // absolute path on disk
  filename: string;
  mimeType: string;
  ext: string;
  sizeBytes: number;
  width: number;
  height: number;
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const MAX_DIMENSION = 12000;
const LARGE_EDGE = 2400;
const THUMB_EDGE = 480;

export class UploadValidationError extends Error {}

/**
 * Security checks are performed on the SERVER. The buffer is sniffed for its
 * real signature (never trusting the client filename or extension), and only
 * raster image formats are accepted. SVG, HTML, JS, executables and unknown
 * formats are rejected outright.
 */
async function validateImage(buf: Buffer): Promise<{ mime: string; ext: string }> {
  const detected = await fileTypeFromBuffer(buf);
  if (!detected) throw new UploadValidationError('Unsupported or unreadable file.');
  if (!ALLOWED_MIME.has(detected.mime)) {
    throw new UploadValidationError('Only JPEG, PNG, WebP and AVIF images are allowed.');
  }
  return { mime: detected.mime, ext: detected.ext };
}

async function optimize(buffer: Buffer, ext: string): Promise<{ data: Buffer; outExt: string; mime: string }> {
  let pipeline = sharp(buffer, { failOn: 'error' }).rotate(); // normalize EXIF orientation

  const meta = await pipeline.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width <= 0 || height <= 0 || width > MAX_DIMENSION || height > MAX_DIMENSION) {
    throw new UploadValidationError('Image dimensions are invalid or exceed the allowed maximum.');
  }

  const resized = (p: ReturnType<typeof sharp>) =>
    p.resize({ width: width > LARGE_EDGE ? LARGE_EDGE : undefined, withoutEnlargement: true });

  if (ext === 'jpeg' || ext === 'png') {
    const data = await resized(pipeline).webp({ quality: 82, effort: 4 }).toBuffer();
    return { data, outExt: 'webp', mime: 'image/webp' };
  }
  const data = await resized(pipeline).toBuffer();
  const mime = ext === 'avif' ? 'image/avif' : ext === 'webp' ? 'image/webp' : `image/${ext}`;
  return { data, outExt: ext, mime };
}

async function writeFile(rel: string, data: Buffer): Promise<string> {
  const abs = path.join(config.uploadDir, rel);
  await mkdir(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.${randomUUID()}.tmp`;
  await (await import('node:fs/promises')).writeFile(tmp, data);
  await (await import('node:fs/promises')).rename(tmp, abs);
  return abs;
}

function safeRelDir(): string {
  const now = new Date();
  return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Disk-backed object storage adapter. For production, swap `DiskStorage.save`
 * for a signed-URL object store (S3/Supabase) implementing the same contract —
 * see SECURITY.md "File uploads". Randomized server-side filenames are always
 * used; raw user filenames are never used as storage paths (no path traversal).
 */
export async function storeImage(buffer: Buffer): Promise<StoredAsset> {
  const { mime: detectedMime, ext: detectedExt } = await validateImage(buffer);
  const { data, outExt, mime } = await optimize(buffer, detectedExt);

  const stem = randomUUID();
  const rel = `${safeRelDir()}/${stem}.${outExt}`;
  const thumbRel = `${safeRelDir()}/${stem}.thumb.webp`;

  const thumbData = await sharp(data, { failOn: 'error' })
    .resize({ width: THUMB_EDGE, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toBuffer();

  const abs = await writeFile(rel, data);
  const thumbAbs = await writeFile(thumbRel, thumbData);

  void detectedMime;

  return {
    url: `/uploads/${rel}`,
    thumbUrl: `/uploads/${thumbRel}`,
    path: abs,
    filename: `${stem}.${outExt}`,
    mimeType: mime,
    ext: outExt,
    sizeBytes: data.length,
    width: (await sharp(data, { failOn: 'error' }).metadata()).width ?? 0,
    height: (await sharp(data, { failOn: 'error' }).metadata()).height ?? 0,
  };
}

export async function removeStoredImage(url: string): Promise<void> {
  if (!url.startsWith('/uploads/')) return;
  const abs = path.join(config.uploadDir, url.replace('/uploads/', ''));
  await rm(abs, { force: true }).catch(() => undefined);
  if (abs.endsWith('.webp')) {
    const thumb = abs.replace('.webp', '.thumb.webp');
    await rm(thumb, { force: true }).catch(() => undefined);
  }
}

export function isSafeUploadUrl(url: string): boolean {
  return url.startsWith('/uploads/') && !url.includes('..');
}