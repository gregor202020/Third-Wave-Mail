import { destroyDb, destroyRedis } from '@twmail/shared';
import type { Worker } from 'bullmq';

const workerType = process.env['WORKER_TYPE'] ?? 'bulk';

async function main() {
  console.log(`TWMail Worker starting (type: ${workerType})...`);

  const workers: Worker[] = [];
  let schedulerCleanup: (() => Promise<void>) | null = null;

  if (workerType === 'bulk') {
    const { createBulkSendWorker, createCampaignSendWorker } = await import('./workers/bulk-send.worker.js');
    const { createAbEvalWorker } = await import('./workers/ab-eval.worker.js');
    const { createResendWorker } = await import('./workers/resend.worker.js');

    workers.push(createBulkSendWorker());
    workers.push(createCampaignSendWorker());
    workers.push(createAbEvalWorker());
    workers.push(createResendWorker());

    // BUG-05: Start scheduled campaign polling
    const { startScheduler } = await import('./scheduler.js');
    const scheduler = await startScheduler();
    schedulerCleanup = async () => {
      clearInterval(scheduler.interval);
      await scheduler.queue.close();
    };

    console.log('Started: bulk-send, campaign-send, ab-eval, resend workers + scheduler');
  } else if (workerType === 'system') {
    const { createImportWorker } = await import('./workers/import.worker.js');
    const { createWebhookWorker } = await import('./workers/webhook.worker.js');

    workers.push(createImportWorker());
    workers.push(createWebhookWorker());

    console.log('Started: import, webhook workers');
  }

  console.log(`TWMail Worker (${workerType}) ready — waiting for jobs...`);

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down workers...`);
    if (schedulerCleanup) await schedulerCleanup();
    await Promise.all(workers.map((w) => w.close()));
    await destroyDb();
    await destroyRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
