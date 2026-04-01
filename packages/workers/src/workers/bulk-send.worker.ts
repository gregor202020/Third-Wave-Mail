import { Worker, Queue, type Job, type ConnectionOptions } from 'bullmq';
import {
  getDb,
  getRedis,
  CampaignStatus,
  ContactStatus,
  MessageStatus,
  EventType,
} from '@twmail/shared';
import type { ExpressionBuilder } from 'kysely';
import type { Database } from '@twmail/shared';
import { sendEmail } from '../ses-client.js';
import { processMergeTags } from '../merge-tags.js';
import { injectTrackingPixel, rewriteLinks, getUnsubscribeHeaders } from '../tracking.js';
import { assertAbsoluteUrls, isMjmlSource } from '../email-output.js';
import { logger } from '../logger.js';

const SES_CONFIG_SET = process.env['SES_CONFIGURATION_SET'] ?? 'marketing';

/**
 * BUG-04: Atomic decrement-and-check via Lua script.
 * Only one concurrent worker will receive shouldComplete === 1,
 * ensuring exactly-once campaign completion transition.
 */
const DECR_AND_CHECK_LUA = `
  local key = KEYS[1]
  local current = redis.call('DECR', key)
  if current <= 0 then
    redis.call('DEL', key)
    return 1
  end
  return 0
`;

export interface BulkSendJobData {
  contactId: number;
  campaignId: number;
  variantId?: number;
}

/**
 * Idempotency check: returns true if a message record already exists for
 * this campaign/contact pair. The UNIQUE constraint on (campaign_id, contact_id)
 * in the messages table also guards against duplicates at the DB level.
 */
export async function shouldSkipSend(
  db: ReturnType<typeof getDb>,
  campaignId: number,
  contactId: number,
): Promise<boolean> {
  const existing = await db
    .selectFrom('messages')
    .select(['id'])
    .where('campaign_id', '=', campaignId)
    .where('contact_id', '=', contactId)
    .executeTakeFirst();

  return existing !== undefined;
}

/**
 * Bulk-send worker: processes individual email sends.
 *
 * Each job represents one email to one contact for one campaign (optionally
 * a specific A/B variant). The worker:
 *   1. Loads contact, campaign, variant
 *   2. Validates status (active contact, non-cancelled campaign)
 *   3. Dedup check (shouldSkipSend)
 *   4. Creates message record (QUEUED)
 *   5. Processes merge tags on subject + HTML
 *   6. Validates output (no relative URLs, no uncompiled MJML)
 *   7. Injects tracking pixel + rewrites links
 *   8. Builds headers (List-Unsubscribe per RFC 8058)
 *   9. Sends via SES
 *  10. Updates message to SENT with ses_message_id
 *  11. Creates SENT event with link_map metadata
 *  12. Increments campaign.total_sent (and variant.total_sent if applicable)
 *  13. Decrements Redis counter; if 0, marks campaign SENT
 *
 * Concurrency: 10, rate-limited to 14/sec to stay within SES limits.
 */
export function createBulkSendWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<BulkSendJobData>(
    'bulk-send',
    async (job: Job<BulkSendJobData>) => {
      const { contactId, campaignId, variantId } = job.data;
      const db = getDb();

      // Load contact (must be ACTIVE)
      const contact = await db
        .selectFrom('contacts')
        .selectAll()
        .where('id', '=', contactId)
        .where('status', '=', ContactStatus.ACTIVE)
        .executeTakeFirst();

      if (!contact) {
        await decrementCounter(redis, db, campaignId);
        return { skipped: true, reason: 'contact_not_active' };
      }

      // Load campaign
      const campaign = await db
        .selectFrom('campaigns')
        .selectAll()
        .where('id', '=', campaignId)
        .executeTakeFirst();

      if (
        !campaign ||
        campaign.status === CampaignStatus.CANCELLED ||
        campaign.status === CampaignStatus.PAUSED
      ) {
        await decrementCounter(redis, db, campaignId);
        return { skipped: true, reason: 'campaign_not_active' };
      }

      // Resolve content: variant overrides campaign if A/B test
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
          await decrementCounter(redis, db, campaignId);
          return { skipped: true, reason: 'variant_not_found' };
        }

        html = variant.content_html ?? campaign.content_html ?? '';
        subject = variant.subject;
        previewText = campaign.preview_text;
      } else {
        html = campaign.content_html ?? '';
        subject = campaign.subject ?? '';
        previewText = campaign.preview_text;
      }

      if (!html || !subject) {
        await decrementCounter(redis, db, campaignId);
        return { skipped: true, reason: 'missing_content' };
      }

      // OPS-04: Defensive guard -- reject uncompiled MJML source
      if (isMjmlSource(html)) {
        logger.error({ campaignId }, 'OPS-04: Received uncompiled MJML source in bulk-send worker');
        await decrementCounter(redis, db, campaignId);
        return { skipped: true, reason: 'uncompiled_mjml' };
      }

      // OPS-05: Convert relative URLs to absolute
      html = assertAbsoluteUrls(html, campaignId);

      // BUG-02: Idempotency check -- skip if already sent for this campaign/contact
      const skipSend = await shouldSkipSend(db, campaignId, contactId);
      if (skipSend) {
        await decrementCounter(redis, db, campaignId);
        return { skipped: true, reason: 'already_sent' };
      }

      // Create message record (status=QUEUED)
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

      // DATA-07: Once a message record exists we MUST decrement the Redis counter,
      // regardless of whether the send succeeds or fails.
      let shouldDecrementOnError = true;

      try {
        // Process merge tags on subject and HTML
        html = processMergeTags(html, contact, messageId);
        subject = processMergeTags(subject, contact, messageId);

        // Inject tracking pixel (unless disabled)
        let linkMap: Record<string, string> = {};
        if (campaign.open_tracking !== false) {
          html = injectTrackingPixel(html, messageId);
        }

        // Rewrite links for click tracking (unless disabled)
        if (campaign.click_tracking !== false) {
          const linkResult = rewriteLinks(html, messageId);
          html = linkResult.html;
          linkMap = linkResult.linkMap;
        }

        // Inject preview text if present
        if (previewText) {
          previewText = processMergeTags(previewText, contact, messageId);
          html = injectPreviewText(html, previewText);
        }

        // Get unsubscribe headers (RFC 8058)
        const headers = getUnsubscribeHeaders(messageId);
        headers['X-SES-CONFIGURATION-SET'] = SES_CONFIG_SET;

        // Build from address using sending subdomain for reputation isolation
        const sendingDomain = (campaign as Record<string, unknown>).sending_domain as string || 'news';
        const fromUser = campaign.from_email?.split('@')[0] ?? 'info';
        const fromDomain = sendingDomain === 'root' ? 'thirdwavebbq.com.au' : `${sendingDomain}.thirdwavebbq.com.au`;
        const fromEmail = `${fromUser}@${fromDomain}`;
        const fromAddress = campaign.from_name
          ? `${campaign.from_name} <${fromEmail}>`
          : fromEmail;

        // Send via SES
        const sesMessageId = await sendEmail({
          from: fromAddress,
          to: contact.email,
          subject,
          html,
          replyTo: campaign.reply_to ?? campaign.from_email ?? undefined,
          configurationSet: SES_CONFIG_SET,
          headers,
          messageId,
        });

        // Update message status to SENT
        await db
          .updateTable('messages')
          .set({
            status: MessageStatus.SENT,
            ses_message_id: sesMessageId ?? undefined,
            sent_at: new Date(),
          })
          .where('id', '=', messageId)
          .execute();

        // Create SENT event with link_map metadata
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

        // Increment campaign.total_sent
        await db
          .updateTable('campaigns')
          .set((eb: ExpressionBuilder<Database, 'campaigns'>) => ({
            total_sent: eb('total_sent', '+', 1),
          }))
          .where('id', '=', campaignId)
          .execute();

        // If variant, also increment variant.total_sent
        if (variantId) {
          await db
            .updateTable('campaign_variants')
            .set((eb: ExpressionBuilder<Database, 'campaign_variants'>) => ({
              total_sent: eb('total_sent', '+', 1),
            }))
            .where('id', '=', variantId)
            .execute();
        }

        // BUG-04: Atomic decrement-and-check via Lua script
        const shouldComplete = (await redis.eval(
          DECR_AND_CHECK_LUA,
          1,
          `twmail:remaining:${campaignId}`,
        )) as number;

        // Counter was decremented on the success path
        shouldDecrementOnError = false;

        if (shouldComplete === 1) {
          const updatedCampaign = await db
            .updateTable('campaigns')
            .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
            .where('id', '=', campaignId)
            .where('status', '=', CampaignStatus.SENDING)
            .returningAll()
            .executeTakeFirst();

          logger.info({ campaignId }, 'Campaign send complete');

          // BUG-06: Trigger resend-to-non-openers if enabled
          if (updatedCampaign?.resend_enabled && updatedCampaign?.resend_config) {
            const config = updatedCampaign.resend_config as { wait_hours?: number };
            const waitHours = config.wait_hours ?? 72;
            const resendQueue = new Queue('resend', {
              connection: redis as unknown as ConnectionOptions,
            });
            await resendQueue.add(
              'evaluate',
              { campaignId },
              { delay: waitHours * 3600 * 1000 },
            );
            await resendQueue.close();
            logger.info(
              { campaignId, waitHours },
              'Scheduled resend-to-non-openers evaluation',
            );
          }
        }

        return { sent: true, messageId, sesMessageId };
      } finally {
        // DATA-07: If the success path did not decrement the counter (error occurred),
        // decrement now so the campaign completion is not blocked by a failed job.
        if (shouldDecrementOnError) {
          try {
            const shouldComplete = (await redis.eval(
              DECR_AND_CHECK_LUA,
              1,
              `twmail:remaining:${campaignId}`,
            )) as number;
            if (shouldComplete === 1) {
              await db
                .updateTable('campaigns')
                .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
                .where('id', '=', campaignId)
                .where('status', '=', CampaignStatus.SENDING)
                .execute();
              logger.info({ campaignId }, 'Campaign completed (final job errored but counter hit zero)');
            }
          } catch (finallyErr) {
            logger.error(
              { err: finallyErr, campaignId, contactId },
              'Failed to decrement counter in finally block',
            );
          }
        }
      }
    },
    {
      connection: redis as unknown as ConnectionOptions,
      concurrency: 10,
      limiter: {
        max: 14,
        duration: 1000, // 14 emails/sec (SES rate limit)
      },
    },
  );

  worker.on('failed', (job, err) => {
    const data = job?.data;
    logger.error(
      { jobId: job?.id, campaignId: data?.campaignId, contactId: data?.contactId, err },
      'Bulk send job failed',
    );
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Bulk send worker error');
  });

  return worker;
}

/**
 * Helper: decrement the Redis counter for a skipped job.
 * This is called on early-exit paths where no message record was created.
 */
async function decrementCounter(
  redis: ReturnType<typeof getRedis>,
  db: ReturnType<typeof getDb>,
  campaignId: number,
): Promise<void> {
  try {
    const shouldComplete = (await redis.eval(
      DECR_AND_CHECK_LUA,
      1,
      `twmail:remaining:${campaignId}`,
    )) as number;
    if (shouldComplete === 1) {
      await db
        .updateTable('campaigns')
        .set({ status: CampaignStatus.SENT, send_completed_at: new Date() })
        .where('id', '=', campaignId)
        .where('status', '=', CampaignStatus.SENDING)
        .execute();
      logger.info({ campaignId }, 'Campaign completed (all remaining jobs skipped)');
    }
  } catch (err) {
    logger.error({ err, campaignId }, 'Failed to decrement counter for skipped job');
  }
}

/**
 * Inject hidden preview text after <body> tag.
 * This text appears in inbox previews but is invisible in the email body.
 */
function injectPreviewText(html: string, previewText: string): string {
  const previewHtml = `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${previewText}</div>`;

  if (html.includes('<body')) {
    return html.replace(/(<body[^>]*>)/i, `$1${previewHtml}`);
  }
  return previewHtml + html;
}
