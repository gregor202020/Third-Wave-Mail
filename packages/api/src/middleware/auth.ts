import type { FastifyRequest, FastifyReply } from 'fastify';
import { AppError } from '../plugins/error-handler.js';
import { ErrorCode, UserRole } from '@twmail/shared';

export async function requireAuth(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  await (request.server as any).authenticate(request);
}

export function requireRole(...roles: number[]) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(request, reply);
    if (!request.user || !roles.includes(request.user.role)) {
      throw new AppError(403, ErrorCode.FORBIDDEN, 'Insufficient permissions');
    }
  };
}

export function requireAdmin() {
  return requireRole(UserRole.ADMIN);
}

export function requireEditor() {
  return requireRole(UserRole.ADMIN, UserRole.EDITOR);
}
