import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../middleware/auth.js';
import { getSettings, updateSettings } from '../services/settings.service.js';

const updateSchema = z.object({
  organization_name: z.string().max(255).optional(),
  default_sender_email: z.string().email().optional(),
  default_sender_name: z.string().max(255).optional(),
  timezone: z.string().max(100).optional(),
});

export const settingsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAdmin());

  // GET /api/settings
  app.get('/', async () => {
    const settings = await getSettings();
    return { data: settings };
  });

  // PATCH /api/settings
  app.patch('/', async (request) => {
    const body = updateSchema.parse(request.body);
    const settings = await updateSettings(body);
    return { data: settings };
  });
};
