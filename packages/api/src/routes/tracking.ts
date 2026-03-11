import type { FastifyPluginAsync } from 'fastify';
import { getDb, ContactStatus, EventType, MessageStatus } from '@twmail/shared';
import { sql } from 'kysely';

// 1x1 transparent PNG pixel
const TRACKING_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

// Apple proxy IP ranges for machine open detection
const APPLE_PROXY_PREFIXES = ['17.'];

export const trackingRoutes: FastifyPluginAsync = async (app) => {
  // GET /t/o/:messageId.png — Open tracking pixel
  app.get<{ Params: { messageId: string } }>(
    '/t/o/:messageId.png',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const messageId = request.params.messageId;
      const db = getDb();

      // Return pixel immediately
      reply.header('Content-Type', 'image/png');
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');

      // Record open event async (fire and forget)
      recordOpen(db, messageId, request).catch(() => {});

      return reply.send(TRACKING_PIXEL);
    },
  );

  // GET /t/c/:messageId/:linkHash — Click tracking redirect
  app.get<{ Params: { messageId: string; linkHash: string } }>(
    '/t/c/:messageId/:linkHash',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const { messageId, linkHash } = request.params;
      const db = getDb();

      // Look up the original URL from metadata
      const event = await db
        .selectFrom('events')
        .select('metadata')
        .where('message_id', '=', messageId)
        .where('event_type', '=', EventType.CLICK)
        .where(sql`metadata->>'link_hash'`, '=', linkHash)
        .executeTakeFirst();

      let targetUrl = 'https://thirdwavebbq.com.au'; // fallback

      if (event?.metadata && typeof event.metadata === 'object' && 'url' in event.metadata) {
        targetUrl = String(event.metadata.url);
      } else {
        // Check link_map stored when email was sent
        const linkMap = await db
          .selectFrom('events')
          .select('metadata')
          .where('message_id', '=', messageId)
          .where('event_type', '=', EventType.SENT)
          .executeTakeFirst();

        if (linkMap?.metadata && typeof linkMap.metadata === 'object' && 'link_map' in linkMap.metadata) {
          const map = linkMap.metadata.link_map as Record<string, string>;
          if (map[linkHash]) {
            targetUrl = map[linkHash];
          }
        }
      }

      // Validate redirect URL to prevent open redirect (block javascript:, data:, etc.)
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          targetUrl = 'https://thirdwavebbq.com.au'; // fallback for unsafe protocols
        }
      } catch {
        targetUrl = 'https://thirdwavebbq.com.au'; // fallback for malformed URLs
      }

      // Record click event async
      recordClick(db, messageId, linkHash, targetUrl, request).catch(() => {});

      return reply.redirect(targetUrl);
    },
  );

  // POST /t/u/:messageId — One-click unsubscribe (RFC 8058)
  app.post<{ Params: { messageId: string } }>(
    '/t/u/:messageId',
    { config: { rateLimit: false } },
    async (request, reply) => {
      const messageId = request.params.messageId;
      const db = getDb();

      const message = await db
        .selectFrom('messages')
        .select(['contact_id', 'campaign_id'])
        .where('id', '=', messageId)
        .executeTakeFirst();

      if (!message) {
        return reply.status(200).send(); // Return 200 even if not found (RFC compliance)
      }

      // Update contact status
      await db
        .updateTable('contacts')
        .set({ status: ContactStatus.UNSUBSCRIBED, unsubscribed_at: new Date() })
        .where('id', '=', message.contact_id)
        .execute();

      // Record unsubscribe event
      await db
        .insertInto('events')
        .values({
          event_type: EventType.UNSUBSCRIBE,
          contact_id: message.contact_id,
          campaign_id: message.campaign_id,
          message_id: messageId,
          event_time: new Date(),
        })
        .execute();

      // Update message status
      await db
        .updateTable('messages')
        .set({ status: MessageStatus.UNSUBSCRIBED })
        .where('id', '=', messageId)
        .execute();

      return reply.status(200).send();
    },
  );

  // GET /t/u/:messageId — Unsubscribe confirmation page
  app.get<{ Params: { messageId: string } }>(
    '/t/u/:messageId',
    { config: { rateLimit: false } },
    async (request, reply) => {
      reply.header('Content-Type', 'text/html');
      return reply.send(`<!DOCTYPE html>
<html><head><title>Unsubscribe</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font-family:-apple-system,sans-serif;max-width:500px;margin:80px auto;padding:20px;text-align:center}
.btn{display:inline-block;padding:12px 32px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;border:none;cursor:pointer;font-size:16px}
.btn:hover{background:#b91c1c}</style></head>
<body>
<h2>Unsubscribe</h2>
<p>Click the button below to unsubscribe from our emails.</p>
<form method="POST" action="/t/u/${request.params.messageId}">
<button type="submit" class="btn">Unsubscribe</button>
</form>
<p style="margin-top:24px;color:#666;font-size:14px">You can also manage your email preferences in your account settings.</p>
</body></html>`);
    },
  );
};

async function recordOpen(db: any, messageId: string, request: any): Promise<void> {
  const message = await db
    .selectFrom('messages')
    .select(['contact_id', 'campaign_id', 'variant_id'])
    .where('id', '=', messageId)
    .executeTakeFirst();

  if (!message) return;

  const ip = request.ip ?? '';
  const userAgent = request.headers['user-agent'] ?? '';
  const isMachine = detectMachineOpen(ip, userAgent);

  const eventType = isMachine ? EventType.MACHINE_OPEN : EventType.OPEN;

  await db
    .insertInto('events')
    .values({
      event_type: eventType,
      contact_id: message.contact_id,
      campaign_id: message.campaign_id,
      variant_id: message.variant_id,
      message_id: messageId,
      event_time: new Date(),
      metadata: { user_agent: userAgent, ip, is_machine: isMachine },
    })
    .execute();

  // Update message first_open_at if not already set
  if (!isMachine) {
    await db
      .updateTable('messages')
      .set({ first_open_at: new Date(), status: MessageStatus.OPENED })
      .where('id', '=', messageId)
      .where('first_open_at', 'is', null)
      .execute();

    // Update campaign counters
    await db
      .updateTable('campaigns')
      .set((eb: any) => ({
        total_opens: eb('total_opens', '+', 1),
        total_human_opens: eb('total_human_opens', '+', 1),
      }))
      .where('id', '=', message.campaign_id)
      .execute();

    // Update contact last_open_at
    await db
      .updateTable('contacts')
      .set({ last_open_at: new Date(), last_activity_at: new Date() })
      .where('id', '=', message.contact_id)
      .execute();
  } else {
    await db
      .updateTable('campaigns')
      .set((eb: any) => ({ total_opens: eb('total_opens', '+', 1) }))
      .where('id', '=', message.campaign_id)
      .execute();

    await db
      .updateTable('messages')
      .set({ is_machine_open: true })
      .where('id', '=', messageId)
      .execute();
  }
}

async function recordClick(
  db: any,
  messageId: string,
  linkHash: string,
  url: string,
  request: any,
): Promise<void> {
  const message = await db
    .selectFrom('messages')
    .select(['contact_id', 'campaign_id', 'variant_id'])
    .where('id', '=', messageId)
    .executeTakeFirst();

  if (!message) return;

  const userAgent = request.headers['user-agent'] ?? '';

  await db
    .insertInto('events')
    .values({
      event_type: EventType.CLICK,
      contact_id: message.contact_id,
      campaign_id: message.campaign_id,
      variant_id: message.variant_id,
      message_id: messageId,
      event_time: new Date(),
      metadata: { url, link_hash: linkHash, user_agent: userAgent },
    })
    .execute();

  // Update message first_click_at
  await db
    .updateTable('messages')
    .set({ first_click_at: new Date(), status: MessageStatus.CLICKED })
    .where('id', '=', messageId)
    .where('first_click_at', 'is', null)
    .execute();

  // Update campaign counters
  await db
    .updateTable('campaigns')
    .set((eb: any) => ({
      total_clicks: eb('total_clicks', '+', 1),
      total_human_clicks: eb('total_human_clicks', '+', 1),
    }))
    .where('id', '=', message.campaign_id)
    .execute();

  // Update contact
  await db
    .updateTable('contacts')
    .set({ last_click_at: new Date(), last_activity_at: new Date() })
    .where('id', '=', message.contact_id)
    .execute();
}

function detectMachineOpen(ip: string, userAgent: string): boolean {
  // Apple Mail Privacy Protection
  for (const prefix of APPLE_PROXY_PREFIXES) {
    if (ip.startsWith(prefix)) return true;
  }
  return false;
}
