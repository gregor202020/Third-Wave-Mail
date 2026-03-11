import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  cloneTemplate,
} from '../services/templates.service.js';
import { requireAuth } from '../middleware/auth.js';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  category: z.string().max(100).optional().nullable(),
  content_html: z.string().optional().nullable(),
  content_json: z.record(z.unknown()).optional(),
  thumbnail_url: z.string().url().optional().nullable(),
  is_default: z.boolean().optional(),
});

const updateSchema = createSchema.partial();

export const templateRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/templates
  app.get<{
    Querystring: { page?: string; per_page?: string; category?: string };
  }>('/', async (request) => {
    const { page, per_page, category } = request.query;
    const result = await listTemplates({
      page: page ? Number(page) : undefined,
      per_page: per_page ? Number(per_page) : undefined,
      category: category || undefined,
    });
    return result;
  });

  // GET /api/templates/:id
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const template = await getTemplate(Number(request.params.id));
    return { data: template };
  });

  // POST /api/templates
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const template = await createTemplate(body);
    reply.status(201);
    return { data: template };
  });

  // PATCH /api/templates/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = updateSchema.parse(request.body);
    const template = await updateTemplate(Number(request.params.id), body);
    return { data: template };
  });

  // DELETE /api/templates/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteTemplate(Number(request.params.id));
    reply.status(204);
  });

  // POST /api/templates/:id/clone
  app.post<{ Params: { id: string } }>('/:id/clone', async (request, reply) => {
    const template = await cloneTemplate(Number(request.params.id));
    reply.status(201);
    return { data: template };
  });
};
