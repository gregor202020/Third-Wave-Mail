import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  getDb,
  ErrorCode,
  SegmentType,
  ContactStatus,
  buildRuleFilter,
} from '@twmail/shared';
import type { SegmentRuleGroup } from '@twmail/shared';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.number().min(1).max(2).optional(),
  rules: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  rules: z.record(z.unknown()).optional(),
  description: z.string().max(1000).optional(),
});

const addContactsSchema = z.object({
  contact_ids: z.array(z.number()).min(1).max(1000),
});

export const segmentRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/segments
  app.get('/', async (_request, reply) => {
    const db = getDb();

    const segments = await db
      .selectFrom('segments')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();

    return reply.send({ data: segments });
  });

  // POST /api/segments
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const db = getDb();

    const segment = await db
      .insertInto('segments')
      .values({
        name: body.name,
        type: body.type ?? SegmentType.DYNAMIC,
        rules: body.rules,
        description: body.description,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: segment });
  });

  // GET /api/segments/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const segment = await db
      .selectFrom('segments')
      .selectAll()
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (!segment) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
    }

    return reply.send({ data: segment });
  });

  // PATCH /api/segments/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const db = getDb();

    const result = await db
      .updateTable('segments')
      .set(body)
      .where('id', '=', Number(request.params.id))
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
    }

    return reply.send({ data: result });
  });

  // DELETE /api/segments/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();

    const result = await db
      .deleteFrom('segments')
      .where('id', '=', Number(request.params.id))
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
    }

    return reply.status(204).send();
  });

  // GET /api/segments/:id/contacts
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string };
  }>('/:id/contacts', async (request, reply) => {
    const db = getDb();
    const segmentId = Number(request.params.id);
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = Math.min(request.query.per_page ? Number(request.query.per_page) : 50, 200);
    const offset = (page - 1) * perPage;

    const segment = await db
      .selectFrom('segments')
      .selectAll()
      .where('id', '=', segmentId)
      .executeTakeFirst();

    if (!segment) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
    }

    if (segment.type === SegmentType.STATIC) {
      const [contacts, countResult] = await Promise.all([
        db
          .selectFrom('contacts')
          .innerJoin('contact_segments', 'contact_segments.contact_id', 'contacts.id')
          .selectAll('contacts')
          .where('contact_segments.segment_id', '=', segmentId)
          .orderBy('contacts.created_at', 'desc')
          .limit(perPage)
          .offset(offset)
          .execute(),
        db
          .selectFrom('contact_segments')
          .select(db.fn.countAll<number>().as('count'))
          .where('segment_id', '=', segmentId)
          .executeTakeFirstOrThrow(),
      ]);

      const total = Number(countResult.count);

      return reply.send({
        data: contacts,
        pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
      });
    }

    // Dynamic segment
    if (!segment.rules) {
      return reply.send({
        data: [],
        pagination: { page, per_page: perPage, total: 0, total_pages: 0 },
      });
    }

    const ruleGroup = segment.rules as unknown as SegmentRuleGroup;
    const ruleFilter = buildRuleFilter(ruleGroup);

    let query = db
      .selectFrom('contacts')
      .selectAll()
      .where('status', '=', ContactStatus.ACTIVE)
      .where(ruleFilter);

    const countQuery = db
      .selectFrom('contacts')
      .select(db.fn.countAll<number>().as('count'))
      .where('status', '=', ContactStatus.ACTIVE)
      .where(ruleFilter);

    query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

    const [contacts, countResult] = await Promise.all([
      query.execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    // Update cache (fire and forget)
    db.updateTable('segments')
      .set({ cached_count: total })
      .where('id', '=', segmentId)
      .execute()
      .catch(() => {});

    return reply.send({
      data: contacts,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // GET /api/segments/:id/count
  app.get<{ Params: { id: string } }>('/:id/count', async (request, reply) => {
    const db = getDb();
    const segmentId = Number(request.params.id);

    const segment = await db
      .selectFrom('segments')
      .selectAll()
      .where('id', '=', segmentId)
      .executeTakeFirst();

    if (!segment) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
    }

    if (segment.type === SegmentType.STATIC) {
      const result = await db
        .selectFrom('contact_segments')
        .select(db.fn.countAll<number>().as('count'))
        .where('segment_id', '=', segmentId)
        .executeTakeFirstOrThrow();

      return reply.send({ data: { count: Number(result.count) } });
    }

    if (!segment.rules) {
      return reply.send({ data: { count: 0 } });
    }

    const ruleGroup = segment.rules as unknown as SegmentRuleGroup;
    const result = await db
      .selectFrom('contacts')
      .select(db.fn.countAll<number>().as('count'))
      .where('status', '=', ContactStatus.ACTIVE)
      .where(buildRuleFilter(ruleGroup))
      .executeTakeFirstOrThrow();

    const count = Number(result.count);

    // Update cache (fire and forget)
    db.updateTable('segments')
      .set({ cached_count: count })
      .where('id', '=', segmentId)
      .execute()
      .catch(() => {});

    return reply.send({ data: { count } });
  });

  // POST /api/segments/:id/contacts (static segments only)
  app.post<{ Params: { id: string } }>('/:id/contacts', async (request, reply) => {
    const body = addContactsSchema.parse(request.body);
    const db = getDb();
    const segmentId = Number(request.params.id);

    const segment = await db
      .selectFrom('segments')
      .selectAll()
      .where('id', '=', segmentId)
      .executeTakeFirst();

    if (!segment) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
    }

    if (segment.type !== SegmentType.STATIC) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only add contacts to static segments');
    }

    let added = 0;
    for (const contactId of body.contact_ids) {
      try {
        await db
          .insertInto('contact_segments')
          .values({ contact_id: contactId, segment_id: segmentId })
          .onConflict((oc) => oc.columns(['contact_id', 'segment_id']).doNothing())
          .execute();
        added++;
      } catch {
        // Skip invalid contact IDs
      }
    }

    return reply.send({ data: { added } });
  });

  // DELETE /api/segments/:id/contacts/:contactId (static segments only)
  app.delete<{ Params: { id: string; contactId: string } }>(
    '/:id/contacts/:contactId',
    async (request, reply) => {
      const db = getDb();
      const segmentId = Number(request.params.id);
      const contactId = Number(request.params.contactId);

      const segment = await db
        .selectFrom('segments')
        .selectAll()
        .where('id', '=', segmentId)
        .executeTakeFirst();

      if (!segment) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Segment not found');
      }

      if (segment.type !== SegmentType.STATIC) {
        throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only remove contacts from static segments');
      }

      const result = await db
        .deleteFrom('contact_segments')
        .where('segment_id', '=', segmentId)
        .where('contact_id', '=', contactId)
        .executeTakeFirst();

      if (result.numDeletedRows === 0n) {
        throw new AppError(404, ErrorCode.NOT_FOUND, 'Contact not in this segment');
      }

      return reply.status(204).send();
    },
  );
};
