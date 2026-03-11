import { getDb } from '@twmail/shared';
import type { SettingsUpdate } from '@twmail/shared';

export async function getSettings() {
  const db = getDb();
  let row = await db.selectFrom('settings').selectAll().where('id', '=', 1).executeTakeFirst();
  if (!row) {
    // Ensure the singleton row exists
    await db.insertInto('settings').values({ id: 1 } as any).onConflict((oc) => oc.column('id').doNothing()).execute();
    row = await db.selectFrom('settings').selectAll().where('id', '=', 1).executeTakeFirstOrThrow();
  }
  return row;
}

export async function updateSettings(data: SettingsUpdate) {
  const db = getDb();
  const updated = await db
    .updateTable('settings')
    .set({ ...data, updated_at: new Date() })
    .where('id', '=', 1)
    .returningAll()
    .executeTakeFirstOrThrow();
  return updated;
}
