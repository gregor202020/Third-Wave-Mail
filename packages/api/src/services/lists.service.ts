import { getDb, ErrorCode, ContactListStatus } from '@twmail/shared';
import type { PaginationParams, PaginatedResponse, List, Contact } from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';

export async function listLists() {
  const db = getDb();

  const lists = await db
    .selectFrom('lists')
    .selectAll()
    .orderBy('created_at', 'desc')
    .execute();

  return lists;
}

export async function getList(id: number): Promise<List> {
  const db = getDb();

  const list = await db
    .selectFrom('lists')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!list) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
  }

  return list;
}

export async function createList(data: { name: string; description?: string; type?: number }): Promise<List> {
  const db = getDb();

  return db
    .insertInto('lists')
    .values({
      name: data.name,
      description: data.description ?? null,
      type: data.type ?? 1,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateList(id: number, data: { name?: string; description?: string; type?: number }): Promise<List> {
  const db = getDb();

  const result = await db
    .updateTable('lists')
    .set(data)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
  }

  return result;
}

export async function deleteList(id: number): Promise<void> {
  const db = getDb();

  const result = await db
    .deleteFrom('lists')
    .where('id', '=', id)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'List not found');
  }
}

export async function getListContacts(
  listId: number,
  params: PaginationParams,
): Promise<PaginatedResponse<Contact>> {
  const db = getDb();
  const page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  // Verify list exists
  await getList(listId);

  const [contacts, countResult] = await Promise.all([
    db
      .selectFrom('contacts')
      .innerJoin('contact_lists', 'contact_lists.contact_id', 'contacts.id')
      .selectAll('contacts')
      .where('contact_lists.list_id', '=', listId)
      .where('contact_lists.status', '=', ContactListStatus.CONFIRMED)
      .orderBy('contacts.created_at', 'desc')
      .limit(perPage)
      .offset(offset)
      .execute(),
    db
      .selectFrom('contact_lists')
      .select(db.fn.countAll<number>().as('count'))
      .where('list_id', '=', listId)
      .where('status', '=', ContactListStatus.CONFIRMED)
      .executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: contacts,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

export async function addContactsToList(listId: number, contactIds: number[]): Promise<{ added: number }> {
  const db = getDb();

  // Verify list exists
  await getList(listId);

  let added = 0;
  for (const contactId of contactIds) {
    try {
      await db
        .insertInto('contact_lists')
        .values({
          contact_id: contactId,
          list_id: listId,
          status: ContactListStatus.CONFIRMED,
        })
        .onConflict((oc) => oc.columns(['contact_id', 'list_id']).doNothing())
        .execute();
      added++;
    } catch {
      // Skip invalid contact IDs
    }
  }

  return { added };
}

export async function removeContactFromList(listId: number, contactId: number): Promise<void> {
  const db = getDb();

  const result = await db
    .deleteFrom('contact_lists')
    .where('list_id', '=', listId)
    .where('contact_id', '=', contactId)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not in this list');
  }
}

export async function getListCount(listId: number): Promise<{ count: number }> {
  const db = getDb();

  await getList(listId);

  const result = await db
    .selectFrom('contact_lists')
    .select(db.fn.countAll<number>().as('count'))
    .where('list_id', '=', listId)
    .where('status', '=', ContactListStatus.CONFIRMED)
    .executeTakeFirstOrThrow();

  return { count: Number(result.count) };
}
