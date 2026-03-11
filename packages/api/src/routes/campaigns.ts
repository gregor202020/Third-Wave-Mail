import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  sendCampaign,
  scheduleCampaign,
  pauseCampaign,
  cancelCampaign,
  duplicateCampaign,
  getCampaignReport,
  getCampaignRecipients,
  configureAbTest,
  getAbResults,
} from '../services/campaigns.service.js';
import { requireAuth } from '../middleware/auth.js';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().max(500).optional().nullable(),
  preview_text: z.string().max(500).optional().nullable(),
  from_name: z.string().max(255).optional(),
  from_email: z.string().email().optional(),
  reply_to: z.string().email().optional().nullable(),
  template_id: z.number().optional().nullable(),
  content_html: z.string().optional().nullable(),
  content_json: z.record(z.unknown()).optional().nullable(),
  segment_id: z.number().optional().nullable(),
  list_id: z.number().optional().nullable(),
  ab_test_enabled: z.boolean().optional(),
  ab_test_config: z.record(z.unknown()).optional().nullable(),
  resend_enabled: z.boolean().optional(),
  resend_config: z.record(z.unknown()).optional().nullable(),
});

const updateSchema = createSchema.partial();

const scheduleSchema = z.object({
  scheduled_at: z.string().datetime(),
  timezone: z.string().optional(),
});

const abTestSchema = z.object({
  variants: z.array(
    z.object({
      variant_name: z.string().min(1),
      subject: z.string().min(1),
      preview_text: z.string().optional().nullable(),
      content_html: z.string().optional().nullable(),
      content_json: z.record(z.unknown()).optional().nullable(),
      percentage: z.number().min(1).max(100),
    }),
  ).min(2).max(4),
});

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/campaigns
  app.get<{
    Querystring: { page?: string; per_page?: string; status?: string };
  }>('/', async (request) => {
    const { page, per_page, status } = request.query;
    return listCampaigns({
      page: page ? Number(page) : undefined,
      per_page: per_page ? Number(per_page) : undefined,
      status: status ? Number(status) : undefined,
    });
  });

  // GET /api/campaigns/:id
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const campaign = await getCampaign(Number(request.params.id));
    return { data: campaign };
  });

  // POST /api/campaigns
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const campaign = await createCampaign(body);
    reply.status(201);
    return { data: campaign };
  });

  // PATCH /api/campaigns/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request) => {
    const body = updateSchema.parse(request.body);
    const campaign = await updateCampaign(Number(request.params.id), body);
    return { data: campaign };
  });

  // DELETE /api/campaigns/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteCampaign(Number(request.params.id));
    reply.status(204);
  });

  // POST /api/campaigns/:id/send
  app.post<{ Params: { id: string } }>('/:id/send', async (request) => {
    const campaign = await sendCampaign(Number(request.params.id));
    return { data: campaign };
  });

  // POST /api/campaigns/:id/schedule
  app.post<{ Params: { id: string } }>('/:id/schedule', async (request) => {
    const body = scheduleSchema.parse(request.body);
    const campaign = await scheduleCampaign(Number(request.params.id), body);
    return { data: campaign };
  });

  // POST /api/campaigns/:id/pause
  app.post<{ Params: { id: string } }>('/:id/pause', async (request) => {
    const campaign = await pauseCampaign(Number(request.params.id));
    return { data: campaign };
  });

  // POST /api/campaigns/:id/cancel
  app.post<{ Params: { id: string } }>('/:id/cancel', async (request) => {
    const campaign = await cancelCampaign(Number(request.params.id));
    return { data: campaign };
  });

  // POST /api/campaigns/:id/duplicate
  app.post<{ Params: { id: string } }>('/:id/duplicate', async (request, reply) => {
    const campaign = await duplicateCampaign(Number(request.params.id));
    reply.status(201);
    return { data: campaign };
  });

  // GET /api/campaigns/:id/report
  app.get<{ Params: { id: string } }>('/:id/report', async (request) => {
    const report = await getCampaignReport(Number(request.params.id));
    return { data: report };
  });

  // GET /api/campaigns/:id/recipients
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string; status?: string };
  }>('/:id/recipients', async (request) => {
    const { page, per_page, status } = request.query;
    return getCampaignRecipients(Number(request.params.id), {
      page: page ? Number(page) : undefined,
      per_page: per_page ? Number(per_page) : undefined,
      status: status ? Number(status) : undefined,
    });
  });

  // POST /api/campaigns/:id/ab-test
  app.post<{ Params: { id: string } }>('/:id/ab-test', async (request, reply) => {
    const body = abTestSchema.parse(request.body);
    const variants = await configureAbTest(Number(request.params.id), body.variants);
    reply.status(201);
    return { data: variants };
  });

  // GET /api/campaigns/:id/ab-results
  app.get<{ Params: { id: string } }>('/:id/ab-results', async (request) => {
    const results = await getAbResults(Number(request.params.id));
    return { data: results };
  });
};
