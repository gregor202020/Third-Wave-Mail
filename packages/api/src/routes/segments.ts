import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listSegments,
  getSegment,
  createSegment,
  updateSegment,
  deleteSegment,
  getSegmentContacts,
  getSegmentCount,
  addContactsToSegment,
  removeContactFromSegment,
} from '../services/segments.service.js';
import { requireAuth } from '../middleware/auth.js';

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
    const segments = await listSegments();
    return reply.send({ data: segments });
  });

  // POST /api/segments
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const segment = await createSegment(body);
    return reply.status(201).send({ data: segment });
  });

  // GET /api/segments/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const segment = await getSegment(Number(request.params.id));
    return reply.send({ data: segment });
  });

  // PATCH /api/segments/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const segment = await updateSegment(Number(request.params.id), body);
    return reply.send({ data: segment });
  });

  // DELETE /api/segments/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteSegment(Number(request.params.id));
    return reply.status(204).send();
  });

  // GET /api/segments/:id/contacts
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string };
  }>('/:id/contacts', async (request, reply) => {
    const result = await getSegmentContacts(Number(request.params.id), {
      page: request.query.page ? Number(request.query.page) : undefined,
      per_page: request.query.per_page ? Number(request.query.per_page) : undefined,
    });
    return reply.send(result);
  });

  // GET /api/segments/:id/count
  app.get<{ Params: { id: string } }>('/:id/count', async (request, reply) => {
    const result = await getSegmentCount(Number(request.params.id));
    return reply.send({ data: result });
  });

  // POST /api/segments/:id/contacts (static segments only)
  app.post<{ Params: { id: string } }>('/:id/contacts', async (request, reply) => {
    const body = addContactsSchema.parse(request.body);
    const result = await addContactsToSegment(Number(request.params.id), body.contact_ids);
    return reply.send({ data: result });
  });

  // DELETE /api/segments/:id/contacts/:cid (static segments only)
  app.delete<{ Params: { id: string; cid: string } }>('/:id/contacts/:cid', async (request, reply) => {
    await removeContactFromSegment(Number(request.params.id), Number(request.params.cid));
    return reply.status(204).send();
  });
};
