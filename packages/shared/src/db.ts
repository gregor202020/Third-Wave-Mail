import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { Database } from './schema.js';

const { Pool } = pg;

let db: Kysely<Database> | undefined;

export function getDb(): Kysely<Database> {
  if (!db) {
    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
    });

    db = new Kysely<Database>({
      dialect: new PostgresDialect({ pool }),
    });
  }
  return db;
}

export async function destroyDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = undefined;
  }
}

export { db };
