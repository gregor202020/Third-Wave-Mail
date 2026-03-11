import { buildApp } from './app.js';
import { getConfig } from './config.js';
import { destroyDb } from '@twmail/shared';

async function main() {
  const config = getConfig();
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await destroyDb();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  try {
    await app.listen({ port: config.API_PORT, host: config.API_HOST });
    app.log.info(`TWMail API running on ${config.API_HOST}:${config.API_PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
