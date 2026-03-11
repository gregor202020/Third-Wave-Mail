import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { getDb, ErrorCode } from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';

const BCRYPT_ROUNDS = 12;

export async function listApiKeys(userId: number) {
  const db = getDb();
  return db
    .selectFrom('api_keys')
    .select(['id', 'name', 'key_prefix', 'scopes', 'last_used_at', 'expires_at', 'created_at'])
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .execute();
}

export async function createApiKey(userId: number, name: string, scopes: string[], expiresAt?: string) {
  const db = getDb();

  // Generate key: mk_live_ + 40 random hex chars
  const rawKey = `mk_live_${crypto.randomBytes(20).toString('hex')}`;
  const prefix = rawKey.substring(0, 12);
  const hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

  const result = await db
    .insertInto('api_keys')
    .values({
      user_id: userId,
      name,
      key_prefix: prefix,
      key_hash: hash,
      scopes,
      expires_at: expiresAt ? new Date(expiresAt) : null,
    })
    .returning(['id', 'name', 'key_prefix', 'scopes', 'expires_at', 'created_at'])
    .executeTakeFirstOrThrow();

  // Return full key only on creation
  return { ...result, key: rawKey };
}

export async function updateApiKey(id: number, userId: number, name?: string, scopes?: string[]) {
  const db = getDb();

  const existing = await db
    .selectFrom('api_keys')
    .select('id')
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!existing) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'API key not found');
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates['name'] = name;
  if (scopes !== undefined) updates['scopes'] = scopes;

  if (Object.keys(updates).length === 0) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'No fields to update');
  }

  return db
    .updateTable('api_keys')
    .set(updates)
    .where('id', '=', id)
    .returning(['id', 'name', 'key_prefix', 'scopes', 'expires_at', 'created_at'])
    .executeTakeFirstOrThrow();
}

export async function deleteApiKey(id: number, userId: number) {
  const db = getDb();

  const result = await db
    .deleteFrom('api_keys')
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'API key not found');
  }
}

export async function rotateApiKey(id: number, userId: number) {
  const db = getDb();

  const existing = await db
    .selectFrom('api_keys')
    .select(['id', 'name', 'scopes', 'expires_at'])
    .where('id', '=', id)
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!existing) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'API key not found');
  }

  // Generate new key
  const rawKey = `mk_live_${crypto.randomBytes(20).toString('hex')}`;
  const prefix = rawKey.substring(0, 12);
  const hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);

  const result = await db
    .updateTable('api_keys')
    .set({
      key_prefix: prefix,
      key_hash: hash,
    })
    .where('id', '=', id)
    .returning(['id', 'name', 'key_prefix', 'scopes', 'expires_at', 'created_at'])
    .executeTakeFirstOrThrow();

  return { ...result, key: rawKey };
}
