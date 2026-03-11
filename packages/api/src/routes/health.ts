import type { FastifyPluginAsync } from 'fastify';
import { getDb, getRedis } from '@twmail/shared';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  app.get('/ready', async (_request, reply) => {
    const checks: Record<string, string> = {};

    try {
      const db = getDb();
      await db.selectFrom('users').select('id').limit(1).execute();
      checks['database'] = 'ok';
    } catch {
      checks['database'] = 'error';
    }

    try {
      const redis = getRedis();
      await redis.ping();
      checks['redis'] = 'ok';
    } catch {
      checks['redis'] = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    return reply.status(allOk ? 200 : 503).send({
      status: allOk ? 'ready' : 'not_ready',
      checks,
      timestamp: new Date().toISOString(),
    });
  });
};
