import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { login, refreshToken, getMe } from '../services/auth.service.js';
import { requireAuth } from '../middleware/auth.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const authRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/auth/login
  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await login(body.email, body.password);
    return reply.status(200).send({ data: result });
  });

  // POST /api/auth/refresh
  app.post('/refresh', async (request, reply) => {
    const body = refreshSchema.parse(request.body);
    const result = await refreshToken(body.refresh_token);
    return reply.status(200).send({ data: result });
  });

  // POST /api/auth/logout
  app.post('/logout', { preHandler: [requireAuth] }, async (_request, reply) => {
    // Stateless JWT — client discards token. Future: add to Redis blacklist.
    return reply.status(200).send({ data: { message: 'Logged out' } });
  });

  // GET /api/auth/me
  app.get('/me', { preHandler: [requireAuth] }, async (request, reply) => {
    const user = await getMe(request.user!.id);
    return reply.status(200).send({ data: user });
  });
};
