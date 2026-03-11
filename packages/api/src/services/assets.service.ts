import { getDb, ErrorCode, StorageType } from '@twmail/shared';
import type { PaginationParams, PaginatedResponse, Asset } from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';
import { randomUUID } from 'crypto';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join, extname } from 'path';

const ASSETS_DIR = process.env['ASSETS_DIR'] ?? '/data/assets';
const BASE_URL = process.env['BASE_URL'] ?? 'https://mail.thirdwavebbq.com.au';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'video/mp4', 'video/quicktime', 'application/zip',
]);

const MAX_IMAGE_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export async function listAssets(
  params: PaginationParams,
): Promise<PaginatedResponse<Asset>> {
  const db = getDb();
  const page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  const [assets, countResult] = await Promise.all([
    db.selectFrom('assets').selectAll()
      .orderBy('created_at', 'desc')
      .limit(perPage).offset(offset)
      .execute(),
    db.selectFrom('assets').select(db.fn.countAll<number>().as('count'))
      .executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: assets,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

export async function getAsset(id: number): Promise<Asset> {
  const db = getDb();
  const asset = await db
    .selectFrom('assets')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!asset) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Asset not found');
  }
  return asset;
}

export async function uploadAsset(data: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  campaignId?: number;
}): Promise<Asset> {
  if (!ALLOWED_MIME_TYPES.has(data.mimeType)) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `File type not allowed: ${data.mimeType}`);
  }

  const isImage = data.mimeType.startsWith('image/');
  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;

  if (data.buffer.length > maxSize) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, `File too large (max ${isImage ? '25MB' : '50MB'})`);
  }

  const ext = extname(data.filename) || '.bin';
  const storedFilename = `${randomUUID()}${ext}`;

  // Store locally
  await mkdir(ASSETS_DIR, { recursive: true });
  await writeFile(join(ASSETS_DIR, storedFilename), data.buffer);

  const url = `${BASE_URL}/assets/${storedFilename}`;

  const db = getDb();
  return db
    .insertInto('assets')
    .values({
      filename: storedFilename,
      original_name: data.filename,
      mime_type: data.mimeType,
      size_bytes: data.buffer.length,
      storage_type: StorageType.LOCAL,
      url,
      campaign_id: data.campaignId ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function deleteAsset(id: number): Promise<void> {
  const db = getDb();
  const asset = await getAsset(id);

  // Delete file if stored locally
  if (asset.storage_type === StorageType.LOCAL) {
    try {
      await unlink(join(ASSETS_DIR, asset.filename));
    } catch {
      // File might already be deleted
    }
  }

  await db.deleteFrom('assets').where('id', '=', id).executeTakeFirst();
}
