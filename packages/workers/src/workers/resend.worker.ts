import { Worker, Queue, type Job } from 'bullmq';
import { getDb, getRedis, CampaignStatus, ContactStatus, EventType } from '@twmail/shared';
import { sql } from 'kysely';

export interface ResendJobData {
  campaignId: number;
}

export function createResendWorker(): Worker {
  const redis = getRedis();

  const worker = new Worker<ResendJobData>(
    'resend',
    async (job: Job<ResendJobData>) => {
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

      if (!campaign.resend_enabled || !campaign.resend_config) {
        return { skipped: true, reason: 'resend_not_enabled' };
      }

      const config = campaign.resend_config as {
        trigger?: string;
        new_subject?: string;
        new_preview_text?: string;
        content_mode?: string;
        only_engaged_days?: number;
      };

      const trigger = config.trigger ?? 'non_open';
      const engagedDays = config.only_engaged_days ?? 90;

      // Find non-openers (or non-clickers)
      let nonEngagedQuery = db
        .selectFrom('messages')
        .select('contact_id')
        .where('campaign_id', '=', campaignId)
        .where('status', '>=', 2); // at least sent

      if (trigger === 'non_open') {
        // No open event (excluding machine opens)
        nonEngagedQuery = nonEngagedQuery.where('first_open_at', 'is', null);
      } else if (trigger === 'non_click') {
        // Opened but didn't click
        nonEngagedQuery = nonEngagedQuery
          .where('first_open_at', 'is not', null)
          .where('first_click_at', 'is', null);
      }

      const nonEngaged = await nonEngagedQuery.execute();
      const contactIds = nonEngaged.map((m) => m.contact_id);

      if (contactIds.length === 0) {
        return { sent: 0 };
      }

      // Filter to active contacts with recent activity
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - engagedDays);

      const eligibleContacts = await db
        .selectFrom('contacts')
        .select('id')
        .where('id', 'in', contactIds)
        .where('status', '=', ContactStatus.ACTIVE)
        .where((eb) =>
          eb.or([
            eb('last_activity_at', '>=', cutoffDate),
            eb('last_activity_at', 'is', null), // new contacts
          ]),
        )
        .execute();

      const eligibleIds = eligibleContacts.map((c) => c.id);

      if (eligibleIds.length === 0) {
        return { sent: 0 };
      }

      // Create resend campaign
      const resendCampaign = await db
        .insertInto('campaigns')
        .values({
          name: `${campaign.name} (Resend)`,
          subject: config.new_subject ?? campaign.subject,
          preview_text: config.new_preview_text ?? campaign.preview_text,
          from_name: campaign.from_name,
          from_email: campaign.from_email,
          reply_to: campaign.reply_to,
          template_id: campaign.template_id,
          content_html: campaign.content_html,
          content_json: campaign.content_json,
          resend_of: campaignId,
          status: CampaignStatus.SENDING,
          send_started_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Queue sends
      const bulkSendQueue = new Queue('bulk-send', { connection: redis as any });
      for (const contactId of eligibleIds) {
        await bulkSendQueue.add('send', {
          contactId,
          campaignId: resendCampaign.id,
        });
      }
      await bulkSendQueue.close();

      return { resendCampaignId: resendCampaign.id, queued: eligibleIds.length };
    },
    {
      connection: redis as any,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Resend job ${job?.id} failed:`, err.message);
  });

  return worker;
}
