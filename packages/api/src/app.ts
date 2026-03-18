import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { getConfig } from './config.js';
import type { Config } from './config.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { authPlugin } from './plugins/auth.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { apiKeyRoutes } from './routes/api-keys.js';
import { contactRoutes } from './routes/contacts.js';
import { listRoutes } from './routes/lists.js';
import { segmentRoutes } from './routes/segments.js';
import { templateRoutes } from './routes/templates.js';
import { campaignRoutes } from './routes/campaigns.js';
import { trackingRoutes } from './routes/tracking.js';
import { webhooksInboundRoutes } from './routes/webhooks-inbound.js';
import { webhookRoutes } from './routes/webhooks.js';
import { assetRoutes } from './routes/assets.js';
import { importRoutes } from './routes/imports.js';
import { reportRoutes } from './routes/reports.js';
import { userRoutes } from './routes/users.js';
import { settingsRoutes } from './routes/settings.js';

const PII_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.email',
  'req.body.password',
  '*.email',
];

function buildLogger(cfg: Config) {
  const base = {
    level: cfg.LOG_LEVEL,
    redact: { paths: PII_REDACT_PATHS, censor: '[REDACTED]' },
  };

  if (cfg.NODE_ENV !== 'production') {
    return {
      ...base,
      transport: {
        target: 'pino-pretty',
        options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
      },
    };
  }

  return base;
}

export async function buildApp() {
  const cfg = getConfig();

  const app = Fastify({
    logger: buildLogger(cfg),
  });

  // Plugins
  const rawOrigins = cfg.ALLOWED_ORIGINS;
  const allowedOrigins = new Set(
    rawOrigins
      .split(',')
      .map((o: string) => o.trim())
      .filter(Boolean),
  );

  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (server-to-server: SNS webhooks, cron, curl)
      if (!origin) return cb(null, true);
      if (allowedOrigins.has(origin)) return cb(null, true);
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await app.register(errorHandlerPlugin);
  await app.register(authPlugin);
  await app.register(rateLimitPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(apiKeyRoutes, { prefix: '/api/api-keys' });
  await app.register(contactRoutes, { prefix: '/api/contacts' });
  await app.register(listRoutes, { prefix: '/api/lists' });
  await app.register(segmentRoutes, { prefix: '/api/segments' });
  await app.register(templateRoutes, { prefix: '/api/templates' });
  await app.register(campaignRoutes, { prefix: '/api/campaigns' });
  await app.register(webhookRoutes, { prefix: '/api/webhooks' });
  await app.register(webhooksInboundRoutes, { prefix: '/api/webhooks' });
  await app.register(assetRoutes, { prefix: '/api/assets' });
  await app.register(importRoutes, { prefix: '/api/contacts/import' });
  await app.register(reportRoutes, { prefix: '/api/reports' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  // Static asset serving (no auth - images need to be publicly accessible in emails)
  app.get<{ Params: { filename: string } }>('/assets/:filename', async (request, reply) => {
    const { filename } = request.params;
    // Sanitize filename to prevent directory traversal
    const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    if (safe !== filename || filename.includes('..')) {
      return reply.status(400).send({ error: 'Invalid filename' });
    }
    const { join } = await import('path');
    const { createReadStream, existsSync } = await import('fs');
    const filePath = join(cfg.ASSETS_DIR, safe);
    if (!existsSync(filePath)) {
      return reply.status(404).send({ error: 'Not found' });
    }
    const ext = safe.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      pdf: 'application/pdf', mp4: 'video/mp4',
    };
    const contentType = mimeMap[ext ?? ''] || 'application/octet-stream';
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    return reply.send(createReadStream(filePath));
  });

  // Tracking routes (no auth, lightweight)
  await app.register(trackingRoutes);

  return app;
}
