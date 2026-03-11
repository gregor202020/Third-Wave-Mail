import type { FastifyPluginAsync } from 'fastify';
import { listAssets, getAsset, uploadAsset, deleteAsset } from '../services/assets.service.js';
import { requireAuth } from '../middleware/auth.js';

export const assetRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // POST /api/assets/upload
  app.post('/upload', async (request, reply) => {
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({ error: { code: 'VALIDATION_ERROR', message: 'No file uploaded' } });
    }

    const buffer = await data.toBuffer();
    const asset = await uploadAsset({
      filename: data.filename,
      mimeType: data.mimetype,
      buffer,
      campaignId: (request.query as any)?.campaign_id ? Number((request.query as any).campaign_id) : undefined,
    });

    reply.status(201);
    return { data: asset };
  });

  // GET /api/assets
  app.get<{
    Querystring: { page?: string; per_page?: string };
  }>('/', async (request) => {
    const { page, per_page } = request.query;
    return listAssets({
      page: page ? Number(page) : undefined,
      per_page: per_page ? Number(per_page) : undefined,
    });
  });

  // GET /api/assets/:id
  app.get<{ Params: { id: string } }>('/:id', async (request) => {
    const asset = await getAsset(Number(request.params.id));
    return { data: asset };
  });

  // DELETE /api/assets/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteAsset(Number(request.params.id));
    reply.status(204);
  });
};
