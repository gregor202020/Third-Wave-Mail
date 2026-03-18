import type { FastifyPluginAsync } from 'fastify';
import { getDb, ErrorCode, StorageType } from '@twmail/shared';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';
import { getConfig } from '../config.js';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'video/mp4',
  'video/quicktime',
  'application/zip',
]);

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const assetRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // POST /api/assets/upload
  app.post<{ Querystring: { campaign_id?: string } }>('/upload', async (request, reply) => {
    const cfg = getConfig();
    const data = await request.file();
    if (!data) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No file uploaded');
    }

    if (!ALLOWED_MIME_TYPES.has(data.mimetype)) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `File type not allowed: ${data.mimetype}`);
    }

    const buffer = await data.toBuffer();

    const isImage = data.mimetype.startsWith('image/');
    const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;

    if (buffer.length > maxSize) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, `File too large (max ${isImage ? '25MB' : '50MB'})`);
    }

    const ext = extname(data.filename) || '.bin';
    const storedFilename = `${randomUUID()}${ext}`;

    // Store locally
    await mkdir(cfg.ASSETS_DIR, { recursive: true });
    await writeFile(join(cfg.ASSETS_DIR, storedFilename), buffer);

    const url = `/assets/${storedFilename}`;

    const db = getDb();
    const asset = await db
      .insertInto('assets')
      .values({
        filename: storedFilename,
        original_name: data.filename,
        mime_type: data.mimetype,
        size_bytes: buffer.length,
        storage_type: StorageType.LOCAL,
        url,
        campaign_id: request.query.campaign_id ? Number(request.query.campaign_id) : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: asset });
  });

  // GET /api/assets
  app.get<{
    Querystring: { page?: string; per_page?: string };
  }>('/', async (request, reply) => {
    const db = getDb();
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = Math.min(request.query.per_page ? Number(request.query.per_page) : 50, 200);
    const offset = (page - 1) * perPage;

    const [assets, countResult] = await Promise.all([
      db
        .selectFrom('assets')
        .selectAll()
        .orderBy('created_at', 'desc')
        .limit(perPage)
        .offset(offset)
        .execute(),
      db
        .selectFrom('assets')
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    return reply.send({
      data: assets,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // GET /api/assets/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const asset = await db
      .selectFrom('assets')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!asset) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Asset not found');
    }

    return reply.send({ data: asset });
  });

  // DELETE /api/assets/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const cfg = getConfig();
    const db = getDb();
    const id = Number(request.params.id);

    const asset = await db
      .selectFrom('assets')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!asset) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Asset not found');
    }

    // Delete file if stored locally
    if (asset.storage_type === StorageType.LOCAL) {
      try {
        await unlink(join(cfg.ASSETS_DIR, asset.filename));
      } catch {
        // File might already be deleted
      }
    }

    await db.deleteFrom('assets').where('id', '=', id).executeTakeFirst();

    return reply.status(204).send();
  });
};
