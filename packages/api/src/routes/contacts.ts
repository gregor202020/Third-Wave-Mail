import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  getContactTimeline,
  searchContacts,
} from '../services/contacts.service.js';
import { requireAuth } from '../middleware/auth.js';

const createSchema = z.object({
  email: z.string().email(),
  first_name: z.string().optional().nullable(),
  last_name: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  company: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  timezone: z.string().optional().nullable(),
  custom_fields: z.record(z.unknown()).optional(),
  source: z.string().optional().nullable(),
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
    const result = await listContacts({
      page: request.query.page ? Number(request.query.page) : undefined,
      per_page: request.query.per_page ? Number(request.query.per_page) : undefined,
      status: request.query.status ? Number(request.query.status) : undefined,
      search: request.query.search,
      sort_by: request.query.sort_by,
      sort_order: request.query.sort_order as 'asc' | 'desc' | undefined,
    });
    return reply.send(result);
  });

  // POST /api/contacts
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const contact = await createContact(body);
    return reply.status(201).send({ data: contact });
  });

  // POST /api/contacts/search
  app.post('/search', async (request, reply) => {
    const body = searchSchema.parse(request.body);
    const result = await searchContacts(body);
    return reply.send(result);
  });

  // GET /api/contacts/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const contact = await getContact(Number(request.params.id));
    return reply.send({ data: contact });
  });

  // PATCH /api/contacts/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const contact = await updateContact(Number(request.params.id), body);
    return reply.send({ data: contact });
  });

  // DELETE /api/contacts/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteContact(Number(request.params.id));
    return reply.status(204).send();
  });

  // GET /api/contacts/:id/timeline
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string };
  }>('/:id/timeline', async (request, reply) => {
    const result = await getContactTimeline(
      Number(request.params.id),
      request.query.page ? Number(request.query.page) : undefined,
      request.query.per_page ? Number(request.query.per_page) : undefined,
    );
    return reply.send(result);
  });
};
