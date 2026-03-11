import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { ErrorCode } from '@twmail/shared';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, _request, reply) => {
    // Zod validation errors
    if (error instanceof ZodError) {
      const details = error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return reply.status(400).send({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details,
        },
      });
    }

    // App-level errors
    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      });
    }

    // Fastify validation errors
    if (error.validation) {
      const details = error.validation.map((v) => ({
        field: v.instancePath || v.params?.missingProperty || 'unknown',
        message: v.message || 'Invalid value',
      }));
      return reply.status(400).send({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Validation failed',
          details,
        },
      });
    }

    // Rate limit errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many requests',
        },
      });
    }

    // Unknown errors
    app.log.error(error);
    return reply.status(500).send({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'Internal server error',
      },
    });
  });
};

export const errorHandlerPlugin = fp(plugin, { name: 'error-handler' });
