import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { listApiKeys, createApiKey, updateApiKey, deleteApiKey, rotateApiKey } from '../services/api-key.service.js';
import { requireAuth } from '../middleware/auth.js';

const createSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).min(1),
  expires_at: z.string().datetime().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.enum(['read', 'write', 'admin'])).min(1).optional(),
});

export const apiKeyRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/api-keys
  app.get('/', async (request, reply) => {
    const keys = await listApiKeys(request.user!.id);
    return reply.send({ data: keys });
  });

  // POST /api/api-keys
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const result = await createApiKey(request.user!.id, body.name, body.scopes, body.expires_at);
    return reply.status(201).send({ data: result });
  });

  // PATCH /api/api-keys/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const body = updateSchema.parse(request.body);
    const result = await updateApiKey(Number(request.params.id), request.user!.id, body.name, body.scopes);
    return reply.send({ data: result });
  });

  // DELETE /api/api-keys/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteApiKey(Number(request.params.id), request.user!.id);
    return reply.status(204).send();
  });

  // POST /api/api-keys/:id/rotate
  app.post<{ Params: { id: string } }>('/:id/rotate', async (request, reply) => {
    const result = await rotateApiKey(Number(request.params.id), request.user!.id);
    return reply.send({ data: result });
  });
};
