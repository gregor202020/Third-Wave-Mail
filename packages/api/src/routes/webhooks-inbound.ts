import type { FastifyPluginAsync } from 'fastify';
import { getDb, ContactStatus, EventType, MessageStatus } from '@twmail/shared';

export const webhooksInboundRoutes: FastifyPluginAsync = async (app) => {
  // POST /api/webhooks/inbound/ses — SES SNS notification receiver
  app.post('/inbound/ses', async (request, reply) => {
    const body = request.body as Record<string, unknown>;
    const db = getDb();

    // Handle SNS subscription confirmation
    if (body['Type'] === 'SubscriptionConfirmation') {
      const subscribeUrl = body['SubscribeURL'] as string;
      if (subscribeUrl) {
        await fetch(subscribeUrl);
      }
      return reply.status(200).send({ confirmed: true });
    }

    // Handle SNS notification
    if (body['Type'] !== 'Notification') {
      return reply.status(200).send();
    }

    const messageBody = typeof body['Message'] === 'string'
      ? JSON.parse(body['Message'])
      : body['Message'];

    const notificationType = messageBody?.notificationType ?? messageBody?.eventType;

    if (!notificationType) {
      return reply.status(200).send();
    }

    // Process async to return 200 fast
    processNotification(db, notificationType, messageBody).catch((err) => {
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

      await db.insertInto('events').values({
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
      }).execute();

      // Update message status
      await db.updateTable('messages')
        .set({ status: MessageStatus.BOUNCED })
        .where('id', '=', message.id)
        .execute();

      // Update campaign bounce counter
      await db.updateTable('campaigns')
        .set((eb: any) => ({ total_bounces: eb('total_bounces', '+', 1) }))
        .where('id', '=', message.campaign_id)
        .execute();

      // Hard bounce: update contact status
      if (isHard) {
        await db.updateTable('contacts')
          .set({ status: ContactStatus.BOUNCED })
          .where('id', '=', message.contact_id)
          .execute();
      }
      break;
    }

    case 'Complaint': {
      const complaint = data['complaint'] as Record<string, unknown>;

      await db.insertInto('events').values({
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
      }).execute();

      // Update message status
      await db.updateTable('messages')
        .set({ status: MessageStatus.COMPLAINED })
        .where('id', '=', message.id)
        .execute();

      // Update contact status
      await db.updateTable('contacts')
        .set({ status: ContactStatus.COMPLAINED })
        .where('id', '=', message.contact_id)
        .execute();

      // Update campaign complaint counter
      await db.updateTable('campaigns')
        .set((eb: any) => ({ total_complaints: eb('total_complaints', '+', 1) }))
        .where('id', '=', message.campaign_id)
        .execute();
      break;
    }

    case 'Delivery': {
      await db.insertInto('events').values({
        event_type: EventType.DELIVERED,
        contact_id: message.contact_id,
        campaign_id: message.campaign_id,
        variant_id: message.variant_id,
        message_id: message.id,
        event_time: new Date(),
      }).execute();

      // Update message
      await db.updateTable('messages')
        .set({ status: MessageStatus.DELIVERED, delivered_at: new Date() })
        .where('id', '=', message.id)
        .execute();

      // Update campaign delivered counter
      await db.updateTable('campaigns')
        .set((eb: any) => ({ total_delivered: eb('total_delivered', '+', 1) }))
        .where('id', '=', message.campaign_id)
        .execute();
      break;
    }

    // Ignore Open/Click from SES — we use our own tracking
    default:
      break;
  }
}
