import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { getDb } from '@twmail/shared';
import { getConfig } from '../config.js';
import { AppError } from './error-handler.js';
import { ErrorCode } from '@twmail/shared';

export interface JwtPayload {
  sub: number;
  email: string;
  role: number;
  type: 'access' | 'refresh';
}

export interface AuthUser {
  id: number;
  email: string;
  role: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
    authType?: 'jwt' | 'api-key';
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.decorate('authenticate', async function (request: import('fastify').FastifyRequest) {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Missing authorization header');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid authorization format');
    }

    // Check if it's an API key (starts with mk_live_ or mk_test_)
    if (token.startsWith('mk_live_') || token.startsWith('mk_test_')) {
      await authenticateApiKey(request, token);
      return;
    }

    // Otherwise treat as JWT
    await authenticateJwt(request, token);
  });
};

async function authenticateJwt(request: import('fastify').FastifyRequest, token: string): Promise<void> {
  const config = getConfig();
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    if (payload.type !== 'access') {
      throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid token type');
    }
    request.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
    };
    request.authType = 'jwt';
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid or expired token');
  }
}

async function authenticateApiKey(request: import('fastify').FastifyRequest, token: string): Promise<void> {
  const db = getDb();
  const prefix = token.substring(0, 12);

  const keys = await db
    .selectFrom('api_keys')
    .innerJoin('users', 'users.id', 'api_keys.user_id')
    .select([
      'api_keys.id',
      'api_keys.key_hash',
      'api_keys.scopes',
      'api_keys.expires_at',
      'users.id as user_id',
      'users.email',
      'users.role',
    ])
    .where('api_keys.key_prefix', '=', prefix)
    .execute();

  for (const key of keys) {
    const valid = await bcrypt.compare(token, key.key_hash);
    if (valid) {
      // Check expiry
      if (key.expires_at && new Date(key.expires_at) < new Date()) {
        throw new AppError(401, ErrorCode.UNAUTHORIZED, 'API key has expired');
      }

      request.user = {
        id: key.user_id,
        email: key.email,
        role: key.role,
      };
      request.authType = 'api-key';

      // Update last_used_at (fire and forget)
      db.updateTable('api_keys')
        .set({ last_used_at: new Date() })
        .where('id', '=', key.id)
        .execute()
        .catch(() => {});

      return;
    }
  }

  throw new AppError(401, ErrorCode.UNAUTHORIZED, 'Invalid API key');
}

export const authPlugin = fp(plugin, { name: 'auth' });
