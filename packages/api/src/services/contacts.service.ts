import { getDb, ErrorCode, ContactStatus } from '@twmail/shared';
import type { PaginationParams, PaginatedResponse, Contact, NewContact, ContactUpdate } from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';

export async function listContacts(
  params: PaginationParams & {
    status?: number;
    search?: string;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
  },
): Promise<PaginatedResponse<Contact>> {
  const db = getDb();
  const page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  let query = db.selectFrom('contacts').selectAll();
  let countQuery = db.selectFrom('contacts').select(db.fn.countAll<number>().as('count'));

  if (params.status !== undefined) {
    query = query.where('status', '=', params.status);
    countQuery = countQuery.where('status', '=', params.status);
  }

  if (params.search) {
    const search = `%${params.search}%`;
    query = query.where((eb) =>
      eb.or([
        eb('email', 'ilike', search),
        eb('first_name', 'ilike', search),
        eb('last_name', 'ilike', search),
        eb('company', 'ilike', search),
      ]),
    );
    countQuery = countQuery.where((eb) =>
      eb.or([
        eb('email', 'ilike', search),
        eb('first_name', 'ilike', search),
        eb('last_name', 'ilike', search),
        eb('company', 'ilike', search),
      ]),
    );
  }

  const sortBy = params.sort_by ?? 'created_at';
  const sortOrder = params.sort_order ?? 'desc';
  query = query.orderBy(sortBy as any, sortOrder).limit(perPage).offset(offset);

  const [contacts, countResult] = await Promise.all([
    query.execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: contacts,
    meta: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
    },
  };
}

export async function getContact(id: number): Promise<Contact> {
  const db = getDb();

  const contact = await db
    .selectFrom('contacts')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!contact) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not found');
  }

  return contact;
}

export async function createContact(data: NewContact): Promise<Contact> {
  const db = getDb();

  try {
    return await db
      .insertInto('contacts')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  } catch (err: any) {
    if (err.code === '23505') {
      throw new AppError(409, ErrorCode.CONFLICT, 'Contact with this email already exists');
    }
    throw err;
  }
}

export async function updateContact(id: number, data: ContactUpdate): Promise<Contact> {
  const db = getDb();

  const result = await db
    .updateTable('contacts')
    .set(data)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not found');
  }

  return result;
}

export async function deleteContact(id: number): Promise<void> {
  const db = getDb();

  const result = await db
    .deleteFrom('contacts')
    .where('id', '=', id)
    .executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not found');
  }
}

export async function getContactTimeline(contactId: number, page: number = 1, perPage: number = 50) {
  const db = getDb();
  const offset = (page - 1) * perPage;

  // Verify contact exists
  await getContact(contactId);

  const [events, countResult] = await Promise.all([
    db
      .selectFrom('events')
      .selectAll()
      .where('contact_id', '=', contactId)
      .orderBy('event_time', 'desc')
      .limit(perPage)
      .offset(offset)
      .execute(),
    db
      .selectFrom('events')
      .select(db.fn.countAll<number>().as('count'))
      .where('contact_id', '=', contactId)
      .executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: events,
    meta: {
      page,
      per_page: perPage,
      total,
      total_pages: Math.ceil(total / perPage),
    },
  };
}

export async function searchContacts(query: {
  email?: string;
  first_name?: string;
  last_name?: string;
  custom_fields?: Record<string, unknown>;
  page?: number;
  per_page?: number;
}) {
  const db = getDb();
  const page = query.page ?? 1;
  const perPage = Math.min(query.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  let dbQuery = db.selectFrom('contacts').selectAll();
  let countQuery = db.selectFrom('contacts').select(db.fn.countAll<number>().as('count'));

  if (query.email) {
    dbQuery = dbQuery.where('email', 'ilike', `%${query.email}%`);
    countQuery = countQuery.where('email', 'ilike', `%${query.email}%`);
  }
  if (query.first_name) {
    dbQuery = dbQuery.where('first_name', 'ilike', `%${query.first_name}%`);
    countQuery = countQuery.where('first_name', 'ilike', `%${query.first_name}%`);
  }
  if (query.last_name) {
    dbQuery = dbQuery.where('last_name', 'ilike', `%${query.last_name}%`);
    countQuery = countQuery.where('last_name', 'ilike', `%${query.last_name}%`);
  }

  dbQuery = dbQuery.orderBy('created_at', 'desc').limit(perPage).offset(offset);

  const [contacts, countResult] = await Promise.all([
    dbQuery.execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: contacts,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}
