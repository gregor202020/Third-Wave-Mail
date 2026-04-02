import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import { getDb, ContactStatus, EventType, MessageStatus } from '@twmail/shared';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@twmail/shared';

// Fields used to build the signing string for SNS signature verification
const NOTIFICATION_SIGNING_FIELDS = [
  'Message',
  'MessageId',
  'Subject',
  'Timestamp',
  'TopicArn',
  'Type',
];
const SUBSCRIPTION_SIGNING_FIELDS = [
  'Message',
  'MessageId',
  'SubscribeURL',
  'Timestamp',
  'Token',
  'TopicArn',
  'Type',
];

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
function buildSigningString(
  message: Record<string, unknown>,
  fields: string[],
): string {
  const parts: string[] = [];
  for (const field of fields) {
    if (field in message && message[field] != null) {
      parts.push(`${field}\n${message[field] as string}`);
    }
  }
  return parts.join('\n') + '\n';
}

/**
 * Verify the SNS message signature using the signing certificate.
 */
async function verifySnsSignature(
  message: Record<string, unknown>,
): Promise<boolean> {
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
  if (cached && Date.now() - cached.fetchedAt < CERT_CACHE_TTL_MS) {
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

  const fields =
    type === 'Notification'
      ? NOTIFICATION_SIGNING_FIELDS
      : SUBSCRIPTION_SIGNING_FIELDS;
  const signingString = buildSigningString(message, fields);

  try {
    const verifier = crypto.createVerify('SHA1');
    verifier.update(signingString);
    return verifier.verify(pem, signature, 'base64');
  } catch {
    return false;
  }
}

export async function processBounceSnsEvent(
  db: Kysely<Database>,
  snsMessageId: string,
  messageId: string,
  contactId: number,
  campaignId: number,
  variantId: number | null,
  bounceType: string,
  metadata: Record<string, unknown>,
): Promise<{ inserted: boolean }> {
  const eventType = bounceType === 'Permanent' ? EventType.HARD_BOUNCE : EventType.SOFT_BOUNCE;
  const eventValues = buildBounceEventValues(
    snsMessageId,
    messageId,
    contactId,
    campaignId,
    variantId,
    bounceType,
    eventType,
    metadata,
  );

  try {
    const insertResult = await db
      .insertInto('events')
      .values(eventValues)
      .onConflict((oc) => oc.columns(['message_id', 'event_type']).doNothing())
      .executeTakeFirst();

    return {
      inserted: (insertResult?.numInsertedOrUpdatedRows ?? 0n) > 0n,
    };
  } catch (error) {
    if (!isMissingConflictConstraintError(error)) {
      throw error;
    }

    return db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(hashtext(${messageId}), ${eventType})`.execute(trx);

      const existing = await trx
        .selectFrom('events')
        .select('id')
        .where('message_id', '=', messageId)
        .where('event_type', '=', eventType)
        .executeTakeFirst();

      if (existing) {
        return { inserted: false };
      }

      await trx.insertInto('events').values(eventValues).execute();
      return { inserted: true };
    });
  }
}

export const webhooksInboundRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/webhooks/inbound/sns — SES SNS notification receiver
  app.post('/inbound/sns', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const db = getDb();

    // Verify SNS message signature (log for debugging)
    request.log.info({ snsType: body['Type'], topicArn: body['TopicArn'], bodyKeys: Object.keys(body) }, 'SNS webhook received');
    const isValid = await verifySnsSignature(body);
    if (!isValid) {
      request.log.warn(
        { signingCertUrl: body['SigningCertURL'], signatureVersion: body['SignatureVersion'] },
        'SNS signature verification failed',
      );
      return reply.status(400).send({
        error: {
          code: 'INVALID_SNS_SIGNATURE',
          message: 'Invalid SNS signature',
        },
      });
    }

    // Handle SNS subscription confirmation
    if (body['Type'] === 'SubscriptionConfirmation') {
      const subscribeUrl = body['SubscribeURL'] as string;
      if (subscribeUrl) {
        try {
          const parsed = new URL(subscribeUrl);
          if (
            parsed.protocol === 'https:' &&
            /\.amazonaws\.com$/.test(parsed.hostname)
          ) {
            await fetch(subscribeUrl);
          } else {
            request.log.warn(
              { subscribeUrl },
              'Rejected SubscribeURL with non-AWS domain',
            );
            return reply.status(400).send({
              error: {
                code: 'INVALID_SUBSCRIBE_URL',
                message: 'Invalid SubscribeURL',
              },
            });
          }
        } catch {
          return reply.status(400).send({
            error: {
              code: 'INVALID_SUBSCRIBE_URL',
              message: 'Invalid SubscribeURL',
            },
          });
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
        messageBody = JSON.parse(body['Message']) as Record<string, unknown>;
      } catch {
        request.log.warn('Failed to parse SNS Message body as JSON');
        return reply.status(400).send({
          error: {
            code: 'INVALID_SNS_MESSAGE',
            message: 'Invalid SNS Message JSON',
          },
        });
      }
    } else {
      messageBody = body['Message'] as Record<string, unknown>;
    }

    const notificationType = (messageBody?.notificationType ??
      messageBody?.eventType) as string | undefined;

    if (!notificationType) {
      return reply.status(200).send();
    }

    // Process async to return 200 fast
    processNotification(db, notificationType, messageBody).catch((err) => {
      request.log.error({ err }, 'SES notification processing error');
    });

    return reply.status(200).send();
  });
};

async function processNotification(
  db: Kysely<Database>,
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

  switch (type) {
    case 'Bounce': {
      const bounce = data['bounce'] as Record<string, unknown>;
      const bounceType = bounce?.['bounceType'] as string;
      const isHard = bounceType === 'Permanent';
      const bouncedRecipients = bounce?.['bouncedRecipients'] as
        | Array<{ diagnosticCode?: string }>
        | undefined;

      const bounceInsert = await processBounceSnsEvent(
        db,
        (mail?.['messageId'] as string | undefined) ?? '',
        message.id,
        message.contact_id,
        message.campaign_id,
        message.variant_id,
        bounceType,
        {
          diagnostic: bouncedRecipients?.[0]?.diagnosticCode,
          sub_type: bounce?.['bounceSubType'],
        },
      );

      // Skip side effects if this was a duplicate (0 rows inserted)
      if (!bounceInsert.inserted) {
        break;
      }

      const bounceOps: Promise<unknown>[] = [
        db
          .updateTable('messages')
          .set({ status: MessageStatus.BOUNCED })
          .where('id', '=', message.id)
          .execute(),
        db
          .updateTable('campaigns')
          .set((eb) => ({ total_bounces: eb('total_bounces', '+', 1) }))
          .where('id', '=', message.campaign_id)
          .execute(),
      ];

      if (isHard) {
        bounceOps.push(
          db
            .updateTable('contacts')
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

      // Idempotent insert via ON CONFLICT DO NOTHING
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
        .onConflict((oc) =>
          oc.columns(['message_id', 'event_type']).doNothing(),
        )
        .executeTakeFirst();

      // Skip side effects if this was a duplicate (0 rows inserted)
      if ((complaintInsert?.numInsertedOrUpdatedRows ?? 0n) === 0n) {
        break;
      }

      await Promise.all([
        db
          .updateTable('messages')
          .set({ status: MessageStatus.COMPLAINED })
          .where('id', '=', message.id)
          .execute(),
        db
          .updateTable('contacts')
          .set({ status: ContactStatus.COMPLAINED })
          .where('id', '=', message.contact_id)
          .execute(),
        db
          .updateTable('campaigns')
          .set((eb) => ({
            total_complaints: eb('total_complaints', '+', 1),
          }))
          .where('id', '=', message.campaign_id)
          .execute(),
      ]);
      break;
    }

    case 'Delivery': {
      await Promise.all([
        db
          .insertInto('events')
          .values({
            event_type: EventType.DELIVERED,
            contact_id: message.contact_id,
            campaign_id: message.campaign_id,
            variant_id: message.variant_id,
            message_id: message.id,
            event_time: new Date(),
          })
          .execute(),
        db
          .updateTable('messages')
          .set({ status: MessageStatus.DELIVERED, delivered_at: new Date() })
          .where('id', '=', message.id)
          .execute(),
        db
          .updateTable('campaigns')
          .set((eb) => ({
            total_delivered: eb('total_delivered', '+', 1),
          }))
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

function buildBounceEventValues(
  snsMessageId: string,
  messageId: string,
  contactId: number,
  campaignId: number,
  variantId: number | null,
  bounceType: string,
  eventType: number,
  metadata: Record<string, unknown>,
) {
  return {
    event_type: eventType,
    contact_id: contactId,
    campaign_id: campaignId,
    variant_id: variantId,
    message_id: messageId,
    event_time: new Date(),
    metadata: {
      sns_message_id: snsMessageId,
      bounce_type: bounceType,
      ...metadata,
    },
  };
}

function isMissingConflictConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '42P10'
  );
}
