import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { getDb, ContactStatus, EventType, MessageStatus } from '@twmail/shared';

// Fields used to build the signing string for SNS signature verification
const NOTIFICATION_SIGNING_FIELDS = ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'];
const SUBSCRIPTION_SIGNING_FIELDS = ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

// Cache for downloaded signing certificates (with TTL and max size)
const CERT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const CERT_CACHE_MAX_SIZE = 20;
const certCache = new Map<string, { pem: string; fetchedAt: number }>();

/**
 * Validate that the SigningCertURL is from a legitimate AWS SNS endpoint.
 */
function isValidSigningCertUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.pathname.endsWith('.pem') &&
      /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(parsed.hostname)
    );
  } catch {
    return false;
  }
}

/**
 * Build the canonical signing string for an SNS message.
 */
function buildSigningString(message: Record<string, unknown>, fields: string[]): string {
  const parts: string[] = [];
  for (const field of fields) {
    if (field in message && message[field] != null) {
      parts.push(`${field}\n${String(message[field])}`);
    }
  }
  return parts.join('\n') + '\n';
}

/**
 * Verify the SNS message signature using the signing certificate.
 */
async function verifySnsSignature(message: Record<string, unknown>): Promise<boolean> {
  const certUrl = message['SigningCertURL'] as string | undefined;
  const signature = message['Signature'] as string | undefined;
  const type = message['Type'] as string | undefined;

  if (!certUrl || !signature || !type) {
    return false;
  }

  if (!isValidSigningCertUrl(certUrl)) {
    return false;
  }

  // Download and cache the signing certificate
  const cached = certCache.get(certUrl);
  let pem: string | undefined;
  if (cached && (Date.now() - cached.fetchedAt) < CERT_CACHE_TTL_MS) {
    pem = cached.pem;
  } else {
    certCache.delete(certUrl);
    try {
      const res = await fetch(certUrl);
      if (!res.ok) return false;
      pem = await res.text();
      // Evict oldest entries if cache is at capacity
      if (certCache.size >= CERT_CACHE_MAX_SIZE) {
        const oldestKey = certCache.keys().next().value!;
        certCache.delete(oldestKey);
      }
      certCache.set(certUrl, { pem, fetchedAt: Date.now() });
    } catch {
      return false;
    }
  }

  const fields = type === 'Notification' ? NOTIFICATION_SIGNING_FIELDS : SUBSCRIPTION_SIGNING_FIELDS;
  const signingString = buildSigningString(message, fields);

  try {
    const verifier = crypto.createVerify('SHA1');
    verifier.update(signingString);
    return verifier.verify(pem, signature, 'base64');
  } catch {
    return false;
  }
}

export const webhooksInboundRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/webhooks/inbound/ses — SES SNS notification receiver
  app.post('/inbound/ses', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const db = getDb();

    // Verify SNS message signature
    const isValid = await verifySnsSignature(body);
    if (!isValid) {
      request.log.warn('SNS signature verification failed');
      return reply.status(403).send({ error: 'Invalid SNS signature' });
    }

    // Handle SNS subscription confirmation
    if (body['Type'] === 'SubscriptionConfirmation') {
      const subscribeUrl = body['SubscribeURL'] as string;
      // Validate SubscribeURL domain before following it
      if (subscribeUrl) {
        try {
          const parsed = new URL(subscribeUrl);
          if (parsed.protocol === 'https:' && /\.amazonaws\.com$/.test(parsed.hostname)) {
            await fetch(subscribeUrl);
          } else {
            request.log.warn({ subscribeUrl }, 'Rejected SubscribeURL with non-AWS domain');
            return reply.status(400).send({ error: 'Invalid SubscribeURL' });
          }
        } catch {
          return reply.status(400).send({ error: 'Invalid SubscribeURL' });
        }
      }
      return reply.status(200).send({ confirmed: true });
    }

    // Handle SNS notification
    if (body['Type'] !== 'Notification') {
      return reply.status(200).send();
    }

    let messageBody: Record<string, unknown>;
    if (typeof body['Message'] === 'string') {
      try {
        messageBody = JSON.parse(body['Message']);
      } catch {
        request.log.warn('Failed to parse SNS Message body as JSON');
        return reply.status(400).send({ error: 'Invalid SNS Message JSON' });
      }
    } else {
      messageBody = body['Message'] as Record<string, unknown>;
    }

    const notificationType = (messageBody?.notificationType ?? messageBody?.eventType) as string | undefined;

    if (!notificationType) {
      return reply.status(200).send();
    }

    // Process async to return 200 fast
    processNotification(db, notificationType as string, messageBody).catch((err) => {
      console.error('SES notification processing error:', err);
    });

    return reply.status(200).send();
  });
};

async function processNotification(
  db: any,
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const mail = data['mail'] as Record<string, unknown> | undefined;
  const sesMessageId = (mail?.['messageId'] as string) ?? null;

  if (!sesMessageId) return;

  // Find our message by SES message ID
  const message = await db
    .selectFrom('messages')
    .select(['id', 'contact_id', 'campaign_id', 'variant_id'])
    .where('ses_message_id', '=', sesMessageId)
    .executeTakeFirst();

  if (!message) return;

  // Idempotency check using SES feedback ID
  const feedbackId =
    (data as any)?.bounce?.feedbackId ??
    (data as any)?.complaint?.feedbackId ??
    (data as any)?.delivery?.timestamp;

  switch (type) {
    case 'Bounce': {
      const bounce = data['bounce'] as Record<string, unknown>;
      const bounceType = bounce?.['bounceType'] as string;
      const isHard = bounceType === 'Permanent';
      const eventType = isHard ? EventType.HARD_BOUNCE : EventType.SOFT_BOUNCE;

      // COMP-01: Idempotent insert — ON CONFLICT DO NOTHING prevents duplicate events
      const bounceInsert = await db
        .insertInto('events')
        .values({
          event_type: eventType,
          contact_id: message.contact_id,
          campaign_id: message.campaign_id,
          variant_id: message.variant_id,
          message_id: message.id,
          event_time: new Date(),
          metadata: {
            bounce_type: bounceType,
            diagnostic: (bounce?.['bouncedRecipients'] as any)?.[0]?.diagnosticCode,
            sub_type: bounce?.['bounceSubType'],
          },
        })
        .onConflict((oc: any) => oc.columns(['message_id', 'event_type']).doNothing())
        .executeTakeFirst();

      // Skip side effects if this was a duplicate (0 rows inserted)
      if ((bounceInsert as any)?.numInsertedOrUpdatedRows === 0n) {
        break;
      }

      const bounceOps: Promise<unknown>[] = [
        db.updateTable('messages')
          .set({ status: MessageStatus.BOUNCED })
          .where('id', '=', message.id)
          .execute(),
        db.updateTable('campaigns')
          .set((eb: any) => ({ total_bounces: eb('total_bounces', '+', 1) }))
          .where('id', '=', message.campaign_id)
          .execute(),
      ];

      if (isHard) {
        bounceOps.push(
          db.updateTable('contacts')
            .set({ status: ContactStatus.BOUNCED })
            .where('id', '=', message.contact_id)
            .execute(),
        );
      }

      await Promise.all(bounceOps);
      break;
    }

    case 'Complaint': {
      const complaint = data['complaint'] as Record<string, unknown>;

      // COMP-01: Idempotent insert — ON CONFLICT DO NOTHING prevents duplicate events
      const complaintInsert = await db
        .insertInto('events')
        .values({
          event_type: EventType.COMPLAINT,
          contact_id: message.contact_id,
          campaign_id: message.campaign_id,
          variant_id: message.variant_id,
          message_id: message.id,
          event_time: new Date(),
          metadata: {
            feedback_type: complaint?.['complaintFeedbackType'],
            complaint_timestamp: complaint?.['timestamp'],
          },
        })
        .onConflict((oc: any) => oc.columns(['message_id', 'event_type']).doNothing())
        .executeTakeFirst();

      // Skip side effects if this was a duplicate (0 rows inserted)
      if ((complaintInsert as any)?.numInsertedOrUpdatedRows === 0n) {
        break;
      }

      await Promise.all([
        db.updateTable('messages')
          .set({ status: MessageStatus.COMPLAINED })
          .where('id', '=', message.id)
          .execute(),
        db.updateTable('contacts')
          .set({ status: ContactStatus.COMPLAINED })
          .where('id', '=', message.contact_id)
          .execute(),
        db.updateTable('campaigns')
          .set((eb: any) => ({ total_complaints: eb('total_complaints', '+', 1) }))
          .where('id', '=', message.campaign_id)
          .execute(),
      ]);
      break;
    }

    case 'Delivery': {
      await Promise.all([
        db.insertInto('events').values({
          event_type: EventType.DELIVERED,
          contact_id: message.contact_id,
          campaign_id: message.campaign_id,
          variant_id: message.variant_id,
          message_id: message.id,
          event_time: new Date(),
        }).execute(),
        db.updateTable('messages')
          .set({ status: MessageStatus.DELIVERED, delivered_at: new Date() })
          .where('id', '=', message.id)
          .execute(),
        db.updateTable('campaigns')
          .set((eb: any) => ({ total_delivered: eb('total_delivered', '+', 1) }))
          .where('id', '=', message.campaign_id)
          .execute(),
      ]);
      break;
    }

    // Ignore Open/Click from SES — we use our own tracking
    default:
      break;
  }
}
