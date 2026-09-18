import { Router } from 'express';
import type { Request, Response } from 'express';
import { prisma } from '../../db.js';
import { asyncHandler, notFound } from '../../http/errors.js';
import { paginationSchema, parsePagination } from '../../lib/validate.js';
import { requirePermission } from '../../http/auth.js';
import { PERM } from '../../authz/permissions.js';
import { recordAudit, AUDIT } from '../../lib/audit.js';
import { uploadMiddlewares } from '../../lib/upload.js';
import { findMediaUsage } from '../../lib/usage.js';
import { removeStoredImage } from '../../lib/storage.js';
import { uploadLimiter } from '../../http/rateLimit.js';
import type { MediaKind, Prisma } from '@prisma/client';

const mediaKinds: MediaKind[] = ['IMAGE', 'TEXTURE', 'SLAB', 'PROJECT', 'ROOM', 'OTHER'];

function kindFromBody(req: { body: Record<string, unknown> }): MediaKind {
  const kind = req.body.kind;
  return typeof kind === 'string' && (mediaKinds as string[]).includes(kind) ? (kind as MediaKind) : 'IMAGE';
}

export const mediaRouter = Router();

mediaRouter.use(requirePermission(PERM.materialsView));

// Pipeline: multipart -> memory -> signature sniff -> re-encode -> thumbnail -> DB row.
async function handleUpload(req: Request, res: Response): Promise<void> {
  const ids = (res.locals.uploadedAssets as Array<{ id: string }>).map((a) => a.id);
  const assets = await prisma.mediaAsset.findMany({ where: { id: { in: ids } } });
  res.json({ assets });
}

mediaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = paginationSchema.parse(req.query);
    const search = req.query.search;
    const kind = req.query.kind;
    const where: Prisma.MediaAssetWhereInput = {};
    if (typeof kind === 'string' && kind && (mediaKinds as string[]).includes(kind)) where.kind = kind as MediaKind;
    if (typeof search === 'string' && search.trim()) {
      where.OR = [
        { filename: { contains: search.trim(), mode: 'insensitive' } },
        { url: { contains: search.trim(), mode: 'insensitive' } },
      ];
    }
    const { page, pageSize, skip, take } = parsePagination(q.page, q.pageSize);
    const [total, rows] = await Promise.all([
      prisma.mediaAsset.count({ where }),
      prisma.mediaAsset.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
    ]);
    res.json({ items: rows, pagination: { page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)) } });
  }),
);

mediaRouter.post(
  '/',
  uploadLimiter,
  requirePermission(PERM.mediaUpload),
  uploadMiddlewares,
  asyncHandler(async (req, res) => {
    const kind = kindFromBody(req);
    await prisma.mediaAsset.updateMany({
      where: { id: { in: (res.locals.uploadedAssets as Array<{ id: string }>).map((a) => a.id) } },
      data: { kind },
    });
    await handleUpload(req, res);
  }),
);

mediaRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const row = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Asset not found');
    res.json({ item: row });
  }),
);

mediaRouter.delete(
  '/:id',
  requirePermission(PERM.mediaDelete),
  asyncHandler(async (req, res) => {
    const row = await prisma.mediaAsset.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound('Asset not found');

    const refs = await findMediaUsage(row.url);
    const force = req.query.force === '1';
    if (refs.length > 0 && !force) {
      res.status(409).json({
        error: { code: 'IN_USE', message: `This image is used by ${refs.length} place(s). Remove those references first.` },
        refs,
      });
      return;
    }

    await prisma.mediaAsset.delete({ where: { id: row.id } });
    await removeStoredImage(row.url);
    await recordAudit(req, { action: AUDIT.MEDIA_DELETED, resourceType: 'MediaAsset', resourceId: row.id, metadata: { url: row.url, forced: force } });
    res.status(204).end();
  }),
);

export { mediaKinds };