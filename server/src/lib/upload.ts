import multer from 'multer';
import type { RequestHandler } from 'express';
import type { MediaKind } from '@prisma/client';
import { prisma } from '../db.js';
import { config } from '../config.js';
import { storeImage, UploadValidationError, type StoredAsset } from './storage.js';
import { recordAudit, AUDIT } from './audit.js';
import { badRequest, unauthorized } from '../http/errors.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.maxUploadBytes,
    files: 40,
    fields: 60,
  },
});

export const multerAny = upload.array('files', 40);

/**
 * Convenience pipeline: memory upload + signature-sniff validation + storage.
 * Used by both the public and admin media endpoints.
 */
export const uploadMiddlewares: RequestHandler[] = [multerAny, processUploads('IMAGE')];

/**
 * Validates every uploaded buffer server-side and stores the optimized assets.
 * Attaches `res.locals.uploadedAssets` (array of StoredAsset) on success.
 */
export function processUploads(kind: MediaKind): RequestHandler {
  return async (req, res, next) => {
    try {
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        next(badRequest('No file was provided.', 'NO_FILE'));
        return;
      }
      const user = res.locals.authUser;
      if (!user) {
        next(unauthorized());
        return;
      }

      const assets: Array<StoredAsset & { id: string }> = [];
      for (const file of files) {
        const stored = await storeImage(file.buffer);
        const row = await prisma.mediaAsset.create({
          data: {
            url: stored.url,
            path: stored.path,
            filename: stored.filename,
            kind,
            mimeType: stored.mimeType,
            sizeBytes: stored.sizeBytes,
            width: stored.width,
            height: stored.height,
            createdById: user.id,
          },
        });
        assets.push({ ...stored, id: row.id });
      }

      res.locals.uploadedAssets = assets;
      await recordAudit(req, {
        action: AUDIT.MEDIA_UPLOADED,
        resourceType: 'MediaAsset',
        metadata: { count: assets.length, urls: assets.map((a) => a.url) },
      });
      next();
    } catch (err) {
      if (err instanceof UploadValidationError) {
        next(badRequest(err.message, 'INVALID_FILE'));
        return;
      }
      next(err);
    }
  };
}