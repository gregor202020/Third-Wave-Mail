import { Queue } from 'bullmq';
import { getDb, getRedis, CampaignStatus } from '@twmail/shared';

/**
 * BUG-05: Scheduled campaign trigger.
 * Polls every 60 seconds for campaigns with status=SCHEDULED and scheduled_at <= NOW().
 * Transitions them to SENDING and enqueues a campaign-send job.
 *
 * Race-safe: The UPDATE uses WHERE status = SCHEDULED as a guard.
 * If two worker replicas poll simultaneously, only one will successfully
 * update the row (PostgreSQL row-level locking). The other gets 0 rows
 * and skips.
 */
export async function startScheduler(): Promise<{ interval: NodeJS.Timeout; queue: Queue }> {
  const db = getDb();
  const redis = getRedis();
  const campaignSendQueue = new Queue('campaign-send', { connection: redis as any });

  const poll = async () => {
    try {
      // Find all campaigns due to fire
      const due = await db
        .selectFrom('campaigns')
        .select(['id'])
        .where('status', '=', CampaignStatus.SCHEDULED)
        .where('scheduled_at', '<=', new Date())
        .execute();

      for (const campaign of due) {
        // Atomic transition: only SCHEDULED -> SENDING if still SCHEDULED
        const result = await db
          .updateTable('campaigns')
          .set({ status: CampaignStatus.SENDING, send_started_at: new Date() })
          .where('id', '=', campaign.id)
          .where('status', '=', CampaignStatus.SCHEDULED)
          .returningAll()
          .executeTakeFirst();

        if (result) {
          await campaignSendQueue.add('send', { campaignId: campaign.id });
          console.log(`Scheduler: campaign ${campaign.id} transitioned SCHEDULED -> SENDING`);
        }
      }
    } catch (err) {
      console.error('Scheduler poll error:', err);
    }
  };

  // Run immediately on start, then every 60 seconds
  await poll();
  const interval = setInterval(poll, 60_000);

  console.log('Scheduler: polling every 60s for SCHEDULED campaigns');

  return { interval, queue: campaignSendQueue };
}
