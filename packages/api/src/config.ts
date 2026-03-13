import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(3000),
  API_HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  RATE_LIMIT_DASHBOARD: z.coerce.number().default(100),
  RATE_LIMIT_API_KEY: z.coerce.number().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  ALLOWED_ORIGINS: z.string().default(''),
  SENTRY_DSN: z.string().optional(),
});

export type Config = z.infer<typeof envSchema>;

let config: Config | undefined;

export function getConfig(): Config {
  if (!config) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      const missing = Object.entries(errors)
        .map(([key, msgs]) => `  ${key}: ${msgs?.join(', ')}`)
        .join('\n');
      throw new Error(`Invalid environment variables:\n${missing}`);
    }
    config = result.data;
  }
  return config;
}
