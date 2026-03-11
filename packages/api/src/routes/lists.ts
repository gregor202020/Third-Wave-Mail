import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listLists,
  getList,
  createList,
  updateList,
  deleteList,
  getListContacts,
  addContactsToList,
  removeContactFromList,
  getListCount,
} from '../services/lists.service.js';
import { requireAuth } from '../middleware/auth.js';

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  type: z.number().min(1).max(2).optional(),
});

const updateSchema = createSchema.partial();

const addContactsSchema = z.object({
  contact_ids: z.array(z.number()).min(1).max(1000),
});

export const listRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/lists
  app.get('/', async (_request, reply) => {
    const lists = await listLists();
    return reply.send({ data: lists });
  });

  // POST /api/lists
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const list = await createList(body);
    return reply.status(201).send({ data: list });
  });

  // GET /api/lists/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const list = await getList(Number(request.params.id));
    return reply.send({ data: list });
  });

  // PATCH /api/lists/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const list = await updateList(Number(request.params.id), body);
    return reply.send({ data: list });
  });

  // DELETE /api/lists/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteList(Number(request.params.id));
    return reply.status(204).send();
  });

  // GET /api/lists/:id/contacts
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string };
  }>('/:id/contacts', async (request, reply) => {
    const result = await getListContacts(Number(request.params.id), {
      page: request.query.page ? Number(request.query.page) : undefined,
      per_page: request.query.per_page ? Number(request.query.per_page) : undefined,
    });
    return reply.send(result);
  });

  // POST /api/lists/:id/contacts
  app.post<{ Params: { id: string } }>('/:id/contacts', async (request, reply) => {
    const body = addContactsSchema.parse(request.body);
    const result = await addContactsToList(Number(request.params.id), body.contact_ids);
    return reply.send({ data: result });
  });

  // DELETE /api/lists/:id/contacts/:cid
  app.delete<{ Params: { id: string; cid: string } }>('/:id/contacts/:cid', async (request, reply) => {
    await removeContactFromList(Number(request.params.id), Number(request.params.cid));
    return reply.status(204).send();
  });

  // GET /api/lists/:id/count
  app.get<{ Params: { id: string } }>('/:id/count', async (request, reply) => {
    const result = await getListCount(Number(request.params.id));
    return reply.send({ data: result });
  });
};
