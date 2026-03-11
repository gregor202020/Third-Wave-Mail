import { getDb, ContactStatus, CampaignStatus } from '@twmail/shared';
import { sql } from 'kysely';

export async function getOverview(): Promise<Record<string, unknown>> {
  const db = getDb();

  const [contactStats, campaignStats, recentCampaigns] = await Promise.all([
    // Contact counts
    db
      .selectFrom('contacts')
      .select([
        db.fn.countAll<number>().as('total'),
        db.fn.count<number>('id').filterWhere('status', '=', ContactStatus.ACTIVE).as('active'),
        db.fn.count<number>('id').filterWhere('status', '=', ContactStatus.UNSUBSCRIBED).as('unsubscribed'),
      ])
      .executeTakeFirstOrThrow(),

    // Campaign stats this month
    db
      .selectFrom('campaigns')
      .select([
        db.fn.countAll<number>().as('total'),
        db.fn.count<number>('id').filterWhere('status', '=', CampaignStatus.SENT).as('sent'),
      ])
      .where('created_at', '>=', sql<Date>`date_trunc('month', CURRENT_DATE)`)
      .executeTakeFirstOrThrow(),

    // Recent campaigns
    db
      .selectFrom('campaigns')
      .selectAll()
      .where('status', 'in', [CampaignStatus.SENT, CampaignStatus.SENDING])
      .orderBy('send_started_at', 'desc')
      .limit(10)
      .execute(),
  ]);

  return {
    contacts: {
      total: Number(contactStats.total),
      active: Number(contactStats.active),
      unsubscribed: Number(contactStats.unsubscribed),
    },
    campaigns_this_month: {
      total: Number(campaignStats.total),
      sent: Number(campaignStats.sent),
    },
    recent_campaigns: recentCampaigns,
  };
}

export async function getCampaignComparison(): Promise<unknown[]> {
  const db = getDb();

  const campaigns = await db
    .selectFrom('campaigns')
    .selectAll()
    .where('status', 'in', [CampaignStatus.SENT, CampaignStatus.SENDING])
    .orderBy('send_started_at', 'desc')
    .limit(50)
    .execute();

  return campaigns.map((c) => {
    const delivered = c.total_delivered || 1;
    return {
      id: c.id,
      name: c.name,
      sent_at: c.send_started_at,
      total_sent: c.total_sent,
      total_delivered: c.total_delivered,
      open_rate: Number(((c.total_human_opens / delivered) * 100).toFixed(2)),
      click_rate: Number(((c.total_human_clicks / delivered) * 100).toFixed(2)),
      bounce_rate: Number(((c.total_bounces / (c.total_sent || 1)) * 100).toFixed(2)),
      unsubscribe_rate: Number(((c.total_unsubscribes / delivered) * 100).toFixed(2)),
    };
  });
}

export async function getGrowthReport(days: number = 30): Promise<unknown[]> {
  const db = getDb();

  const result = await db
    .selectFrom('contacts')
    .select([
      sql<string>`date_trunc('day', created_at)::date`.as('date'),
      db.fn.countAll<number>().as('new_contacts'),
    ])
    .where('created_at', '>=', sql<Date>`CURRENT_DATE - ${sql.lit(days)} * INTERVAL '1 day'`)
    .groupBy(sql`date_trunc('day', created_at)::date`)
    .orderBy('date', 'asc')
    .execute();

  return result;
}

export async function getEngagementReport(): Promise<Record<string, unknown>> {
  const db = getDb();

  const tiers = await db
    .selectFrom('contacts')
    .select([
      'engagement_tier',
      db.fn.countAll<number>().as('count'),
    ])
    .where('status', '=', ContactStatus.ACTIVE)
    .groupBy('engagement_tier')
    .execute();

  return {
    tiers: tiers.map((t) => ({
      tier: t.engagement_tier,
      count: Number(t.count),
    })),
  };
}

export async function getDeliverabilityReport(days: number = 30): Promise<Record<string, unknown>> {
  const db = getDb();

  const campaigns = await db
    .selectFrom('campaigns')
    .select([
      'id',
      'name',
      'total_sent',
      'total_delivered',
      'total_bounces',
      'total_complaints',
      'send_started_at',
    ])
    .where('status', '=', CampaignStatus.SENT)
    .where('send_started_at', '>=', sql<Date>`CURRENT_DATE - ${sql.lit(days)} * INTERVAL '1 day'`)
    .orderBy('send_started_at', 'desc')
    .execute();

  const totals = campaigns.reduce(
    (acc, c) => ({
      sent: acc.sent + c.total_sent,
      delivered: acc.delivered + c.total_delivered,
      bounces: acc.bounces + c.total_bounces,
      complaints: acc.complaints + c.total_complaints,
    }),
    { sent: 0, delivered: 0, bounces: 0, complaints: 0 },
  );

  return {
    period_days: days,
    totals,
    bounce_rate: totals.sent > 0 ? Number(((totals.bounces / totals.sent) * 100).toFixed(2)) : 0,
    complaint_rate: totals.delivered > 0 ? Number(((totals.complaints / totals.delivered) * 100).toFixed(4)) : 0,
    campaigns: campaigns.map((c) => ({
      id: c.id,
      name: c.name,
      sent_at: c.send_started_at,
      bounce_rate: c.total_sent > 0 ? Number(((c.total_bounces / c.total_sent) * 100).toFixed(2)) : 0,
      complaint_rate: c.total_delivered > 0 ? Number(((c.total_complaints / c.total_delivered) * 100).toFixed(4)) : 0,
    })),
  };
}
