import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { getConfig } from '../config.js';

const plugin: FastifyPluginAsync = async (app) => {
  const config = getConfig();

  await app.register(rateLimit, {
    global: false,
    max: config.RATE_LIMIT_DASHBOARD,
    timeWindow: config.RATE_LIMIT_WINDOW_MS,
    keyGenerator: (request) => {
      // Use user ID if authenticated, otherwise IP
      return request.user?.id?.toString() ?? request.ip;
    },
  });
};

export const rateLimitPlugin = fp(plugin, {
  name: 'rate-limit',
  dependencies: ['auth'],
});
