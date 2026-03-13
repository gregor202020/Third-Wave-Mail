import { Queue, type ConnectionOptions } from 'bullmq';
import { getDb, getRedis, CampaignStatus } from '@twmail/shared';

/** Campaigns stuck in SENDING longer than this are re-enqueued by the scheduler. */
export const STALE_SENDING_THRESHOLD_MS = 10 * 60 * 1000; // 600_000 ms = 10 minutes

/**
 * BUG-05: Scheduled campaign trigger.
 * Polls every 60 seconds for campaigns with status=SCHEDULED and scheduled_at <= NOW().
 * Transitions them to SENDING and enqueues a campaign-send job.
 *
 * Race-safe: The UPDATE uses WHERE status = SCHEDULED as a guard.
 * If two worker replicas poll simultaneously, only one will successfully
 * update the row (PostgreSQL row-level locking). The other gets 0 rows
 * and skips.
 *
 * Also detects campaigns stuck in SENDING for longer than STALE_SENDING_THRESHOLD_MS
 * and re-enqueues them without changing status. The campaign-send worker handles
 * re-resolution of unsent contacts idempotently (shouldSkipSend dedup).
 */
export async function startScheduler(): Promise<{ interval: NodeJS.Timeout; queue: Queue }> {
  const db = getDb();
  const redis = getRedis();
  const campaignSendQueue = new Queue('campaign-send', { connection: redis as unknown as ConnectionOptions });

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

      // SENDING stall recovery: re-enqueue campaigns stuck in SENDING > 10 minutes
      const staleThreshold = new Date(Date.now() - STALE_SENDING_THRESHOLD_MS);
      const stuck = await db
        .selectFrom('campaigns')
        .select(['id'])
        .where('status', '=', CampaignStatus.SENDING)
        .where('send_started_at', '<=', staleThreshold)
        .execute();

      for (const campaign of stuck) {
        await campaignSendQueue.add('send', { campaignId: campaign.id });
        console.log(`Scheduler: re-enqueued stuck campaign ${campaign.id} (SENDING > 10min)`);
      }
    } catch (err) {
      console.error('Scheduler poll error:', err);
    }
  };

  // Run immediately on start, then every 60 seconds
  await poll();
  const interval = setInterval(() => void poll(), 60_000);

  console.log('Scheduler: polling every 60s for SCHEDULED campaigns');

  return { interval, queue: campaignSendQueue };
}
