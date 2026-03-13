import { getDb, getRedis, ErrorCode, WebhookDeliveryStatus } from '@twmail/shared';
import type { PaginationParams, PaginatedResponse, WebhookEndpoint, WebhookDelivery } from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';
import { randomBytes } from 'crypto';
import { Queue, type ConnectionOptions } from 'bullmq';

export async function listWebhookEndpoints(): Promise<WebhookEndpoint[]> {
  const db = getDb();
  return db.selectFrom('webhook_endpoints').selectAll().orderBy('created_at', 'desc').execute();
}

export async function getWebhookEndpoint(id: number): Promise<WebhookEndpoint> {
  const db = getDb();
  const endpoint = await db.selectFrom('webhook_endpoints').selectAll().where('id', '=', id).executeTakeFirst();

  if (!endpoint) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Webhook endpoint not found');
  }
  return endpoint;
}

export async function createWebhookEndpoint(data: {
  url: string;
  events: string[];
}): Promise<WebhookEndpoint & { secret: string }> {
  const db = getDb();
  const secret = `whsec_${randomBytes(32).toString('hex')}`;

  const endpoint = await db
    .insertInto('webhook_endpoints')
    .values({
      url: data.url,
      secret,
      events: data.events,
    })
    .returningAll()
    .executeTakeFirstOrThrow();

  return { ...endpoint, secret };
}

export async function updateWebhookEndpoint(
  id: number,
  data: { url?: string; events?: string[]; active?: boolean },
): Promise<WebhookEndpoint> {
  const db = getDb();

  const result = await db
    .updateTable('webhook_endpoints')
    .set(data)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Webhook endpoint not found');
  }
  return result;
}

export async function deleteWebhookEndpoint(id: number): Promise<void> {
  const db = getDb();
  const result = await db.deleteFrom('webhook_endpoints').where('id', '=', id).executeTakeFirst();

  if (result.numDeletedRows === 0n) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Webhook endpoint not found');
  }
}

export async function testWebhookEndpoint(id: number): Promise<void> {
  await getWebhookEndpoint(id); // Validates endpoint exists (throws 404 if not)

  await enqueueWebhookDelivery('webhook.test', {
    test: true,
    endpoint_id: id,
    timestamp: new Date().toISOString(),
  });
}

export async function getWebhookDeliveries(
  endpointId: number,
  params: PaginationParams,
): Promise<PaginatedResponse<WebhookDelivery>> {
  const db = getDb();
  const page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  const [deliveries, countResult] = await Promise.all([
    db
      .selectFrom('webhook_deliveries')
      .selectAll()
      .where('endpoint_id', '=', endpointId)
      .orderBy('created_at', 'desc')
      .limit(perPage)
      .offset(offset)
      .execute(),
    db
      .selectFrom('webhook_deliveries')
      .select(db.fn.countAll<number>().as('count'))
      .where('endpoint_id', '=', endpointId)
      .executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: deliveries,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

// Enqueue a webhook delivery for all matching endpoints
export async function enqueueWebhookDelivery(eventType: string, data: Record<string, unknown>): Promise<void> {
  const db = getDb();

  // Find active endpoints subscribed to this event
  const endpoints = await db.selectFrom('webhook_endpoints').selectAll().where('active', '=', true).execute();

  const matchingEndpoints = endpoints.filter((ep) => ep.events.includes(eventType));

  for (const endpoint of matchingEndpoints) {
    const payload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data,
    };

    // Create delivery record
    const delivery = await db
      .insertInto('webhook_deliveries')
      .values({
        endpoint_id: endpoint.id,
        event_type: eventType,
        payload,
        status: WebhookDeliveryStatus.PENDING,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Enqueue via BullMQ so the webhook worker picks it up from the 'webhook' queue
    const queue = new Queue('webhook', { connection: getRedis() as unknown as ConnectionOptions });
    await queue.add('deliver', {
      deliveryId: delivery.id,
      endpointId: endpoint.id,
      url: endpoint.url,
      secret: endpoint.secret,
      eventType,
      payload,
      attempt: 1,
    });
    await queue.close();
  }
}
