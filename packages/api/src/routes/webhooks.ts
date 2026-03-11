import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listWebhookEndpoints,
  getWebhookEndpoint,
  createWebhookEndpoint,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
  testWebhookEndpoint,
  getWebhookDeliveries,
} from '../services/webhooks.service.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const VALID_EVENTS = [
  'contact.created', 'contact.updated', 'contact.deleted', 'contact.unsubscribed',
  'email.sent', 'email.delivered', 'email.opened', 'email.clicked',
  'email.bounced', 'email.complained',
  'campaign.scheduled', 'campaign.sending', 'campaign.completed', 'campaign.ab_winner',
  'import.completed', 'webhook.test',
];

const createSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().refine((e) => VALID_EVENTS.includes(e), { message: 'Invalid event type' })).min(1),
});

const updateSchema = z.object({
  url: z.string().url().optional(),
  events: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin());

  // GET /api/webhooks
  app.get('/', async () => {
    const endpoints = await listWebhookEndpoints();
    // Mask secrets
    return {
      data: endpoints.map((ep) => ({
        ...ep,
        secret: ep.secret.substring(0, 10) + '...',
      })),
    };
  });

  // POST /api/webhooks
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const endpoint = await createWebhookEndpoint(body);
    reply.status(201);
    return { data: endpoint }; // Returns full secret on creation only
  });

  // PATCH /api/webhooks/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = updateSchema.parse(request.body);
    const endpoint = await updateWebhookEndpoint(Number(request.params.id), body);
    return { data: { ...endpoint, secret: endpoint.secret.substring(0, 10) + '...' } };
  });

  // DELETE /api/webhooks/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteWebhookEndpoint(Number(request.params.id));
    reply.status(204);
  });

  // POST /api/webhooks/:id/test
  app.post<{ Params: { id: string } }>('/:id/test', async (request) => {
    await testWebhookEndpoint(Number(request.params.id));
    return { data: { message: 'Test webhook queued' } };
  });

  // GET /api/webhooks/:id/deliveries
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string };
  }>('/:id/deliveries', async (request) => {
    const { page, per_page } = request.query;
    return getWebhookDeliveries(Number(request.params.id), {
      page: page ? Number(page) : undefined,
      per_page: per_page ? Number(per_page) : undefined,
    });
  });
};
