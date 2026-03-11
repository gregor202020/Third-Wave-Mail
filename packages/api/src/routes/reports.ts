import type { FastifyPluginAsync } from 'fastify';
import {
  getOverview,
  getCampaignComparison,
  getGrowthReport,
  getEngagementReport,
  getDeliverabilityReport,
} from '../services/reports.service.js';
import { requireAuth } from '../middleware/auth.js';

export const reportRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/reports/overview
  app.get('/overview', async () => {
    const data = await getOverview();
    return { data };
  });

  // GET /api/reports/campaigns
  app.get('/campaigns', async () => {
    const data = await getCampaignComparison();
    return { data };
  });

  // GET /api/reports/growth
  app.get<{ Querystring: { days?: string } }>('/growth', async (request) => {
    const days = request.query.days ? Number(request.query.days) : 30;
    const data = await getGrowthReport(days);
    return { data };
  });

  // GET /api/reports/engagement
  app.get('/engagement', async () => {
    const data = await getEngagementReport();
    return { data };
  });

  // GET /api/reports/deliverability
  app.get<{ Querystring: { days?: string } }>('/deliverability', async (request) => {
    const days = request.query.days ? Number(request.query.days) : 30;
    const data = await getDeliverabilityReport(days);
    return { data };
  });
};
