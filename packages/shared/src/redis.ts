import Redis from 'ioredis';

let redis: Redis | undefined;

export function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env['REDIS_URL'];
    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is required');
    }

    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return redis;
}

export async function destroyRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = undefined;
  }
}

export { redis };
