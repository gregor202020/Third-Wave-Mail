import { Worker, Queue, type Job } from 'bullmq';
import { getDb, getRedis, CampaignStatus, ContactStatus, MessageStatus, EventType } from '@twmail/shared';
import type { Contact, Campaign } from '@twmail/shared';
import { sendEmail } from '../ses-client.js';
import { processMergeTags } from '../merge-tags.js';
import { injectTrackingPixel, rewriteLinks, getUnsubscribeHeaders } from '../tracking.js';

export interface BulkSendJobData {
  contactId: number;
  campaignId: number;
  variantId?: number;
}

export interface CampaignSendJobData {
  campaignId: number;
}

// This worker processes individual email sends from the bulk-send queue
export function createBulkSendWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<BulkSendJobData>(
    'bulk-send',
    async (job: Job<BulkSendJobData>) => {
      const { contactId, campaignId, variantId } = job.data;
      const db = getDb();

      // Fetch contact
      const contact = await db
        .selectFrom('contacts')
        .selectAll()
        .where('id', '=', contactId)
        .where('status', '=', ContactStatus.ACTIVE)
        .executeTakeFirst();

      if (!contact) {
        // Contact no longer active, skip
        return { skipped: true, reason: 'contact_not_active' };
      }

      // Fetch campaign
      const campaign = await db
        .selectFrom('campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

      if (!campaign || campaign.status === CampaignStatus.CANCELLED || campaign.status === CampaignStatus.PAUSED) {
        return { skipped: true, reason: 'campaign_not_active' };
      }

      // Get HTML content (from variant if A/B test, otherwise campaign)
      let html: string;
      let subject: string;
      let previewText: string | null = null;

      if (variantId) {
        const variant = await db
          .selectFrom('campaign_variants')
          .selectAll()
          .where('id', '=', variantId)
          .executeTakeFirst();

        if (!variant) {
          return { skipped: true, reason: 'variant_not_found' };
        }

        html = variant.content_html ?? campaign.content_html ?? '';
        subject = variant.subject;
        previewText = variant.preview_text ?? campaign.preview_text;
      } else {
        html = campaign.content_html ?? '';
        subject = campaign.subject ?? '';
        previewText = campaign.preview_text;
      }

      if (!html || !subject) {
        return { skipped: true, reason: 'missing_content' };
      }

      // Create message record
      const message = await db
        .insertInto('messages')
        .values({
          campaign_id: campaignId,
          variant_id: variantId ?? null,
          contact_id: contactId,
          status: MessageStatus.QUEUED,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      const messageId = message.id;

      // Process merge tags
      html = processMergeTags(html, contact, messageId);
      subject = processMergeTags(subject, contact, messageId);

      // Inject tracking
      html = injectTrackingPixel(html, messageId);
      const linkResult = rewriteLinks(html, messageId);
      html = linkResult.html;
      const linkMap = linkResult.linkMap;

      // Add preview text if present
      if (previewText) {
        previewText = processMergeTags(previewText, contact, messageId);
        html = injectPreviewText(html, previewText);
      }

      // Get unsubscribe headers
      const headers = getUnsubscribeHeaders(messageId);

      // Set SES configuration set header
      headers['X-SES-CONFIGURATION-SET'] = 'marketing';

      // Send via SES
      const fromAddress = campaign.from_name
        ? `${campaign.from_name} <${campaign.from_email}>`
        : campaign.from_email;

      const sesMessageId = await sendEmail({
        from: fromAddress,
        to: contact.email,
        subject,
        html,
        replyTo: campaign.reply_to ?? undefined,
        configurationSet: 'marketing',
        headers,
        messageId,
      });

      // Update message status
      await db
        .updateTable('messages')
        .set({
          status: MessageStatus.SENT,
          ses_message_id: sesMessageId ?? null,
          sent_at: new Date(),
        })
        .where('id', '=', messageId)
        .execute();

      // Create sent event (include link_map so click tracking can resolve URLs)
      await db
        .insertInto('events')
        .values({
          event_type: EventType.SENT,
          contact_id: contactId,
          campaign_id: campaignId,
          variant_id: variantId ?? null,
          message_id: messageId,
          event_time: new Date(),
          metadata: Object.keys(linkMap).length > 0 ? { link_map: linkMap } : null,
        })
        .execute();

      // Increment campaign send counter
      await db
        .updateTable('campaigns')
        .set((eb: any) => ({ total_sent: eb('total_sent', '+', 1) }))
        .where('id', '=', campaignId)
        .execute();

      // Decrement Redis counter and transition campaign when all sends complete
      const remainingCount = await redis.decr(`twmail:remaining:${campaignId}`);

      if (remainingCount <= 0) {
        await redis.del(`twmail:remaining:${campaignId}`);
        await db
          .updateTable('campaigns')
          .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
          .where('id', '=', campaignId)
          .where('status', '=', CampaignStatus.SENDING)
          .execute();
      }

      return { sent: true, messageId, sesMessageId };
    },
    {
      connection: redis as any,
      concurrency: 25,
      limiter: {
        max: 40,
        duration: 1000, // 40 emails/sec
      },
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Bulk send job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('Bulk send worker error:', err);
  });

  return worker;
}

// Campaign orchestrator: resolves recipients and enqueues individual send jobs
export function createCampaignSendWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<CampaignSendJobData>(
    'campaign-send',
    async (job: Job<CampaignSendJobData>) => {
      const { campaignId } = job.data;
      const db = getDb();

      const campaign = await db
        .selectFrom('campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

      if (!campaign) {
        return { error: 'campaign_not_found' };
      }

      // Resolve recipient contacts
      let contactIds: number[] = [];

      if (campaign.segment_id) {
        // Resolve from segment
        const contacts = await db
          .selectFrom('contacts')
          .select('id')
          .where('status', '=', ContactStatus.ACTIVE)
          .innerJoin('contact_segments', 'contact_segments.contact_id', 'contacts.id')
          .where('contact_segments.segment_id', '=', campaign.segment_id)
          .execute();
        contactIds = contacts.map((c) => c.id);
      } else if (campaign.list_id) {
        // Resolve from list
        const contacts = await db
          .selectFrom('contacts')
          .select('contacts.id')
          .where('contacts.status', '=', ContactStatus.ACTIVE)
          .innerJoin('contact_lists', 'contact_lists.contact_id', 'contacts.id')
          .where('contact_lists.list_id', '=', campaign.list_id)
          .execute();
        contactIds = contacts.map((c) => c.id);
      }

      if (contactIds.length === 0) {
        await db
          .updateTable('campaigns')
          .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
          .where('id', '=', campaignId)
          .execute();
        return { sent: 0 };
      }

      // Set Redis counter for campaign completion tracking
      await redis.set(`twmail:remaining:${campaignId}`, contactIds.length);

      // Handle A/B test variant assignment
      const bulkSendQueue = new Queue('bulk-send', { connection: redis as any });

      if (campaign.ab_test_enabled && campaign.ab_test_config) {
        const abConfig = campaign.ab_test_config as {
          test_percentage?: number;
          winner_wait_hours?: number;
        };
        const testPct = abConfig.test_percentage ?? 20;
        const testSize = Math.ceil(contactIds.length * (testPct / 100));

        // Shuffle contacts for random assignment (Fisher-Yates)
        const shuffled = [...contactIds];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }
        const testContacts = shuffled.slice(0, testSize);
        const holdbackContacts = shuffled.slice(testSize);

        // Fetch variants
        const variants = await db
          .selectFrom('campaign_variants')
          .selectAll()
          .where('campaign_id', '=', campaignId)
          .execute();

        if (variants.length >= 2) {
          // Split test contacts among variants
          const perVariant = Math.ceil(testContacts.length / variants.length);
          for (let i = 0; i < variants.length; i++) {
            const start = i * perVariant;
            const end = Math.min(start + perVariant, testContacts.length);
            const variantContacts = testContacts.slice(start, end);

            for (const contactId of variantContacts) {
              await bulkSendQueue.add('send', {
                contactId,
                campaignId,
                variantId: variants[i]!.id,
              });
            }
          }

          // Store holdback contacts in Redis for later winner send
          if (holdbackContacts.length > 0) {
            await redis.set(
              `twmail:ab-holdback:${campaignId}`,
              JSON.stringify(holdbackContacts),
              'EX',
              86400 * 7, // 7 days
            );

            // Schedule A/B evaluation job
            const waitHours = abConfig.winner_wait_hours ?? 4;
            const abEvalQueue = new Queue('ab-eval', { connection: redis as any });
            await abEvalQueue.add(
              'evaluate',
              { campaignId },
              { delay: waitHours * 3600 * 1000 },
            );
            await abEvalQueue.close();
          }
        }
      } else {
        // Standard send: enqueue all contacts
        for (const contactId of contactIds) {
          await bulkSendQueue.add('send', { contactId, campaignId });
        }
      }

      await bulkSendQueue.close();

      return { queued: contactIds.length };
    },
    {
      connection: redis as any,
      concurrency: 5,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Campaign send job ${job?.id} failed:`, err.message);
  });

  return worker;
}

function injectPreviewText(html: string, previewText: string): string {
  // Inject hidden preview text after <body> tag
  const previewHtml = `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div>`;

  if (html.includes('<body')) {
    return html.replace(/(<body[^>]*>)/i, `$1${previewHtml}`);
  }
  return previewHtml + html;
}
