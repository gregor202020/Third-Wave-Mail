import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, ErrorCode } from '@twmail/shared';
import type { Contact } from '@twmail/shared';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const createSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  timezone: z.string().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  source: z.string().optional(),
  status: z.number().min(1).max(5).optional(),
});

const updateSchema = createSchema.partial().omit({ email: true }).extend({
  email: z.string().email().optional(),
});

const searchSchema = z.object({
  email: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  custom_fields: z.record(z.unknown()).optional(),
  page: z.coerce.number().min(1).optional(),
  per_page: z.coerce.number().min(1).max(200).optional(),
});

const ALLOWED_SORT_COLUMNS = new Set<keyof Contact>([
  'email',
  'status',
  'first_name',
  'last_name',
  'company',
  'engagement_score',
  'last_open_at',
  'last_click_at',
  'created_at',
  'updated_at',
]);

export const contactRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/contacts
  app.get<{
    Querystring: {
      page?: string;
      per_page?: string;
      status?: string;
      search?: string;
      sort_by?: string;
      sort_order?: string;
    };
  }>('/', async (request, reply) => {
    const db = getDb();
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = Math.min(request.query.per_page ? Number(request.query.per_page) : 50, 200);
    const offset = (page - 1) * perPage;
    const statusFilter = request.query.status ? Number(request.query.status) : undefined;
    const search = request.query.search;

    let query = db.selectFrom('contacts').selectAll();
    let countQuery = db.selectFrom('contacts').select(db.fn.countAll<number>().as('count'));

    if (statusFilter !== undefined) {
      query = query.where('status', '=', statusFilter);
      countQuery = countQuery.where('status', '=', statusFilter);
    }

    if (search) {
      const searchPattern = `%${search}%`;
      query = query.where((eb) =>
        eb.or([
          eb('email', 'ilike', searchPattern),
          eb('first_name', 'ilike', searchPattern),
          eb('last_name', 'ilike', searchPattern),
          eb('company', 'ilike', searchPattern),
        ]),
      );
      countQuery = countQuery.where((eb) =>
        eb.or([
          eb('email', 'ilike', searchPattern),
          eb('first_name', 'ilike', searchPattern),
          eb('last_name', 'ilike', searchPattern),
          eb('company', 'ilike', searchPattern),
        ]),
      );
    }

    const rawSort = request.query.sort_by ?? 'created_at';
    const sortBy: keyof Contact = ALLOWED_SORT_COLUMNS.has(rawSort as keyof Contact)
      ? (rawSort as keyof Contact)
      : 'created_at';
    const sortOrder = (request.query.sort_order as 'asc' | 'desc') ?? 'desc';

    query = query.orderBy(sortBy, sortOrder).limit(perPage).offset(offset);

    const [contacts, countResult] = await Promise.all([
      query.execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    return reply.send({
      data: contacts,
      meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // POST /api/contacts
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const db = getDb();

    try {
      const contact = await db
        .insertInto('contacts')
        .values(body)
        .returningAll()
        .executeTakeFirstOrThrow();

      return reply.status(201).send({ data: contact });
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: string }).code === '23505') {
        throw new AppError(409, ErrorCode.CONFLICT, 'Contact with this email already exists');
      }
      throw err;
    }
  });

  // POST /api/contacts/search
  app.post('/search', async (request, reply) => {
    const body = searchSchema.parse(request.body);
    const db = getDb();
    const page = body.page ?? 1;
    const perPage = Math.min(body.per_page ?? 50, 200);
    const offset = (page - 1) * perPage;

    let query = db.selectFrom('contacts').selectAll();
    let countQuery = db.selectFrom('contacts').select(db.fn.countAll<number>().as('count'));

    if (body.email) {
      query = query.where('email', 'ilike', `%${body.email}%`);
      countQuery = countQuery.where('email', 'ilike', `%${body.email}%`);
    }
    if (body.first_name) {
      query = query.where('first_name', 'ilike', `%${body.first_name}%`);
      countQuery = countQuery.where('first_name', 'ilike', `%${body.first_name}%`);
    }
    if (body.last_name) {
      query = query.where('last_name', 'ilike', `%${body.last_name}%`);
      countQuery = countQuery.where('last_name', 'ilike', `%${body.last_name}%`);
    }

    query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

    const [contacts, countResult] = await Promise.all([
      query.execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    return reply.send({
      data: contacts,
      meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // GET /api/contacts/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const contact = await db
      .selectFrom('contacts')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!contact) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not found');
    }

    return reply.send({ data: contact });
  });

  // PATCH /api/contacts/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();

    const result = await db
      .updateTable('contacts')
      .set(body)
      .where('id', '=', Number(request.params.id))
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not found');
    }

    return reply.send({ data: result });
  });

  // DELETE /api/contacts/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const result = await db
      .deleteFrom('contacts')
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not found');
    }

    return reply.status(204).send();
  });

  // GET /api/contacts/:id/timeline
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string };
  }>('/:id/timeline', async (request, reply) => {
    const db = getDb();
    const contactId = Number(request.params.id);
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = request.query.per_page ? Number(request.query.per_page) : 50;
    const offset = (page - 1) * perPage;

    // Verify contact exists
    const contact = await db
      .selectFrom('contacts')
      .select('id')
      .where('id', '=', contactId)
      .executeTakeFirst();

    if (!contact) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not found');
    }

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

    return reply.send({
      data: events,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });
};
