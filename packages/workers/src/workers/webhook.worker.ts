import { Worker, type Job } from 'bullmq';
import { getDb, getRedis, WebhookDeliveryStatus } from '@twmail/shared';
import { createHmac } from 'crypto';

export interface WebhookJobData {
  deliveryId: number;
  endpointId: number;
  url: string;
  secret: string;
  eventType: string;
  payload: Record<string, unknown>;
  attempt: number;
}

export function createWebhookWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<WebhookJobData>(
    'webhook',
    async (job: Job<WebhookJobData>) => {
      const { deliveryId, endpointId, url, secret, eventType, payload, attempt } = job.data;
      const db = getDb();

      const body = JSON.stringify(payload);
      const signature = createHmac('sha256', secret).update(body).digest('hex');

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': `sha256=${signature}`,
            'X-Webhook-Event': eventType,
            'User-Agent': 'TWMail-Webhook/1.0',
          },
          body,
          signal: AbortSignal.timeout(30000), // 30s timeout
        });

        const responseBody = await response.text().catch(() => '');

        if (response.ok) {
          // Success
          await db
            .updateTable('webhook_deliveries')
            .set({
              status: WebhookDeliveryStatus.DELIVERED,
              response_code: response.status,
              response_body: responseBody.substring(0, 1000),
              attempts: attempt,
            })
            .where('id', '=', deliveryId)
            .execute();

          // Reset failure count on endpoint
          await db
            .updateTable('webhook_endpoints')
            .set({ failure_count: 0, last_triggered_at: new Date() })
            .where('id', '=', endpointId)
            .execute();

          return { delivered: true };
        }

        // Non-2xx response — will retry via backoff
        await db
          .updateTable('webhook_deliveries')
          .set({
            response_code: response.status,
            response_body: responseBody.substring(0, 1000),
            attempts: attempt,
          })
          .where('id', '=', deliveryId)
          .execute();

        throw new Error(`Webhook returned ${response.status}`);
      } catch (err: any) {
        // Update delivery attempt count
        await db
          .updateTable('webhook_deliveries')
          .set({ attempts: attempt })
          .where('id', '=', deliveryId)
          .execute();

        // Increment endpoint failure count
        await db
          .updateTable('webhook_endpoints')
          .set((eb: any) => ({ failure_count: eb('failure_count', '+', 1) }))
          .where('id', '=', endpointId)
          .execute();

        // Disable endpoint after 50 consecutive failures
        const endpoint = await db
          .selectFrom('webhook_endpoints')
          .select('failure_count')
          .where('id', '=', endpointId)
          .executeTakeFirst();

        if (endpoint && endpoint.failure_count >= 50) {
          await db
            .updateTable('webhook_endpoints')
            .set({ active: false })
            .where('id', '=', endpointId)
            .execute();
        }

        // Mark as failed after max retries (5 attempts)
        if (attempt >= 5) {
          await db
            .updateTable('webhook_deliveries')
            .set({ status: WebhookDeliveryStatus.FAILED })
            .where('id', '=', deliveryId)
            .execute();
          return { failed: true, error: err.message };
        }

        throw err; // BullMQ will retry
      }
    },
    {
      connection: redis as any,
      concurrency: 10,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Webhook delivery job ${job?.id} failed:`, err.message);
  });

  return worker;
}
