import pino from 'pino';

const REDACT_PATHS = ['*.email', '*.authorization'];

const isProduction = process.env['NODE_ENV'] === 'production';

export const logger = pino({
  level: process.env['LOG_LEVEL'] ?? 'info',
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' },
        },
      }),
});
