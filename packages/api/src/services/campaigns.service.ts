import { getDb, getRedis, ErrorCode, CampaignStatus, ContactStatus } from '@twmail/shared';
import { Queue } from 'bullmq';
import type {
  PaginationParams,
  PaginatedResponse,
  Campaign,
  CampaignVariant,
  Message,
} from '@twmail/shared';
import { AppError } from '../plugins/error-handler.js';

export async function listCampaigns(
  params: PaginationParams & { status?: number },
): Promise<PaginatedResponse<Campaign>> {
  const db = getDb();
  const page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  let query = db.selectFrom('campaigns').selectAll();
  let countQuery = db.selectFrom('campaigns').select(db.fn.countAll<number>().as('count'));

  if (params.status) {
    query = query.where('status', '=', params.status);
    countQuery = countQuery.where('status', '=', params.status);
  }

  query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

  const [campaigns, countResult] = await Promise.all([
    query.execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: campaigns,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

export async function getCampaign(id: number): Promise<Campaign> {
  const db = getDb();

  const campaign = await db
    .selectFrom('campaigns')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!campaign) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
  }

  return campaign;
}

export async function createCampaign(data: {
  name: string;
  subject?: string | null;
  preview_text?: string | null;
  from_name?: string;
  from_email?: string;
  reply_to?: string | null;
  template_id?: number | null;
  content_html?: string | null;
  content_json?: Record<string, unknown> | null;
  segment_id?: number | null;
  list_id?: number | null;
  ab_test_enabled?: boolean;
  ab_test_config?: Record<string, unknown> | null;
  resend_enabled?: boolean;
  resend_config?: Record<string, unknown> | null;
}): Promise<Campaign> {
  const db = getDb();

  return db
    .insertInto('campaigns')
    .values({
      name: data.name,
      subject: data.subject ?? null,
      preview_text: data.preview_text ?? null,
      from_name: data.from_name,
      from_email: data.from_email,
      reply_to: data.reply_to ?? null,
      template_id: data.template_id ?? null,
      content_html: data.content_html ?? null,
      content_json: data.content_json ?? null,
      segment_id: data.segment_id ?? null,
      list_id: data.list_id ?? null,
      ab_test_enabled: data.ab_test_enabled ?? false,
      ab_test_config: data.ab_test_config ?? null,
      resend_enabled: data.resend_enabled ?? false,
      resend_config: data.resend_config ?? null,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateCampaign(
  id: number,
  data: {
    name?: string;
    subject?: string | null;
    preview_text?: string | null;
    from_name?: string;
    from_email?: string;
    reply_to?: string | null;
    template_id?: number | null;
    content_html?: string | null;
    content_json?: Record<string, unknown> | null;
    segment_id?: number | null;
    list_id?: number | null;
    ab_test_enabled?: boolean;
    ab_test_config?: Record<string, unknown> | null;
    resend_enabled?: boolean;
    resend_config?: Record<string, unknown> | null;
  },
): Promise<Campaign> {
  const db = getDb();

  const campaign = await getCampaign(id);
  if (campaign.status !== CampaignStatus.DRAFT) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only update draft campaigns');
  }

  const result = await db
    .updateTable('campaigns')
    .set(data)
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();

  if (!result) {
    throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
  }

  return result;
}

export async function deleteCampaign(id: number): Promise<void> {
  const db = getDb();

  const campaign = await getCampaign(id);
  if (campaign.status !== CampaignStatus.DRAFT) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only delete draft campaigns');
  }

  await db.deleteFrom('campaigns').where('id', '=', id).executeTakeFirst();
}

export async function sendCampaign(id: number): Promise<Campaign> {
  const db = getDb();
  const campaign = await getCampaign(id);

  if (campaign.status !== CampaignStatus.DRAFT && campaign.status !== CampaignStatus.SCHEDULED) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Campaign must be in draft or scheduled status to send');
  }

  if (!campaign.subject) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Campaign must have a subject line');
  }

  if (!campaign.content_html && !campaign.template_id) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Campaign must have content or a template');
  }

  if (!campaign.segment_id && !campaign.list_id) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Campaign must target a segment or list');
  }

  // COMP-06: Physical mailing address required (CAN-SPAM, CASL)
  const settings = await db.selectFrom('settings').select('physical_address').where('id', '=', 1).executeTakeFirst();
  if (!settings?.physical_address?.trim()) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'A physical mailing address must be configured in Settings before sending campaigns');
  }

  // Update status to sending
  const result = await db
    .updateTable('campaigns')
    .set({ status: CampaignStatus.SENDING, send_started_at: new Date() })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  // Enqueue the campaign for sending via BullMQ
  const redis = getRedis();
  const campaignSendQueue = new Queue('campaign-send', { connection: redis.duplicate() });
  await campaignSendQueue.add('send', { campaignId: id });
  await campaignSendQueue.close();

  return result;
}

export async function scheduleCampaign(
  id: number,
  data: { scheduled_at: string; timezone?: string },
): Promise<Campaign> {
  const db = getDb();
  const campaign = await getCampaign(id);

  if (campaign.status !== CampaignStatus.DRAFT) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only schedule draft campaigns');
  }

  if (!campaign.subject) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Campaign must have a subject line');
  }

  const scheduledAt = new Date(data.scheduled_at);
  if (scheduledAt <= new Date()) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Scheduled time must be in the future');
  }

  const result = await db
    .updateTable('campaigns')
    .set({
      status: CampaignStatus.SCHEDULED,
      scheduled_at: scheduledAt,
      timezone: data.timezone,
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return result;
}

export async function pauseCampaign(id: number): Promise<Campaign> {
  const db = getDb();
  const campaign = await getCampaign(id);

  if (campaign.status !== CampaignStatus.SENDING) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only pause a sending campaign');
  }

  const result = await db
    .updateTable('campaigns')
    .set({ status: CampaignStatus.PAUSED })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return result;
}

export async function cancelCampaign(id: number): Promise<Campaign> {
  const db = getDb();
  const campaign = await getCampaign(id);

  if (campaign.status !== CampaignStatus.SCHEDULED && campaign.status !== CampaignStatus.SENDING && campaign.status !== CampaignStatus.PAUSED) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only cancel scheduled, sending, or paused campaigns');
  }

  const result = await db
    .updateTable('campaigns')
    .set({ status: CampaignStatus.CANCELLED })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  return result;
}

export async function duplicateCampaign(id: number): Promise<Campaign> {
  const original = await getCampaign(id);
  const db = getDb();

  return db
    .insertInto('campaigns')
    .values({
      name: `${original.name} (Copy)`,
      subject: original.subject,
      preview_text: original.preview_text,
      from_name: original.from_name,
      from_email: original.from_email,
      reply_to: original.reply_to,
      template_id: original.template_id,
      content_html: original.content_html,
      content_json: original.content_json,
      segment_id: original.segment_id,
      list_id: original.list_id,
      ab_test_enabled: original.ab_test_enabled,
      ab_test_config: original.ab_test_config,
      resend_enabled: original.resend_enabled,
      resend_config: original.resend_config,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

// Campaign report
export async function getCampaignReport(id: number): Promise<{
  campaign: Campaign;
  variants: CampaignVariant[];
  stats: Record<string, number>;
}> {
  const db = getDb();
  const campaign = await getCampaign(id);

  const variants = await db
    .selectFrom('campaign_variants')
    .selectAll()
    .where('campaign_id', '=', id)
    .orderBy('created_at', 'asc')
    .execute();

  const delivered = campaign.total_delivered || 1; // avoid division by zero
  const stats = {
    total_sent: campaign.total_sent,
    total_delivered: campaign.total_delivered,
    delivery_rate: Number(((campaign.total_delivered / (campaign.total_sent || 1)) * 100).toFixed(2)),
    total_opens: campaign.total_opens,
    total_human_opens: campaign.total_human_opens,
    open_rate: Number(((campaign.total_human_opens / delivered) * 100).toFixed(2)),
    total_clicks: campaign.total_clicks,
    total_human_clicks: campaign.total_human_clicks,
    click_rate: Number(((campaign.total_human_clicks / delivered) * 100).toFixed(2)),
    click_to_open_rate: campaign.total_human_opens > 0
      ? Number(((campaign.total_human_clicks / campaign.total_human_opens) * 100).toFixed(2))
      : 0,
    total_bounces: campaign.total_bounces,
    bounce_rate: Number(((campaign.total_bounces / (campaign.total_sent || 1)) * 100).toFixed(2)),
    total_complaints: campaign.total_complaints,
    complaint_rate: Number(((campaign.total_complaints / delivered) * 100).toFixed(4)),
    total_unsubscribes: campaign.total_unsubscribes,
    unsubscribe_rate: Number(((campaign.total_unsubscribes / delivered) * 100).toFixed(2)),
  };

  return { campaign, variants, stats };
}

// Campaign recipients
export async function getCampaignRecipients(
  campaignId: number,
  params: PaginationParams & { status?: number },
): Promise<PaginatedResponse<Message>> {
  const db = getDb();
  await getCampaign(campaignId); // verify exists

  const page = params.page ?? 1;
  const perPage = Math.min(params.per_page ?? 50, 200);
  const offset = (page - 1) * perPage;

  let query = db.selectFrom('messages').selectAll().where('campaign_id', '=', campaignId);
  let countQuery = db
    .selectFrom('messages')
    .select(db.fn.countAll<number>().as('count'))
    .where('campaign_id', '=', campaignId);

  if (params.status) {
    query = query.where('status', '=', params.status);
    countQuery = countQuery.where('status', '=', params.status);
  }

  query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

  const [messages, countResult] = await Promise.all([
    query.execute(),
    countQuery.executeTakeFirstOrThrow(),
  ]);

  const total = Number(countResult.count);

  return {
    data: messages,
    meta: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
  };
}

// A/B test configuration
export async function configureAbTest(
  campaignId: number,
  variants: Array<{
    variant_name: string;
    subject: string;
    preview_text?: string | null;
    content_html?: string | null;
    content_json?: Record<string, unknown> | null;
    percentage: number;
  }>,
): Promise<CampaignVariant[]> {
  const db = getDb();
  const campaign = await getCampaign(campaignId);

  if (campaign.status !== CampaignStatus.DRAFT) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only configure A/B test on draft campaigns');
  }

  const totalPercentage = variants.reduce((sum, v) => sum + v.percentage, 0);
  if (totalPercentage > 100) {
    throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Variant percentages must not exceed 100');
  }

  // Delete existing variants
  await db.deleteFrom('campaign_variants').where('campaign_id', '=', campaignId).execute();

  // Insert new variants
  const results: CampaignVariant[] = [];
  for (const variant of variants) {
    const result = await db
      .insertInto('campaign_variants')
      .values({
        campaign_id: campaignId,
        variant_name: variant.variant_name,
        subject: variant.subject,
        preview_text: variant.preview_text ?? null,
        content_html: variant.content_html ?? null,
        content_json: variant.content_json ?? null,
        percentage: variant.percentage,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    results.push(result);
  }

  // Update campaign to enable A/B testing
  await db
    .updateTable('campaigns')
    .set({ ab_test_enabled: true })
    .where('id', '=', campaignId)
    .execute();

  return results;
}

export async function getAbResults(campaignId: number): Promise<{
  variants: CampaignVariant[];
  winner: CampaignVariant | null;
}> {
  const db = getDb();
  await getCampaign(campaignId);

  const variants = await db
    .selectFrom('campaign_variants')
    .selectAll()
    .where('campaign_id', '=', campaignId)
    .orderBy('created_at', 'asc')
    .execute();

  const winner = variants.find((v) => v.is_winner) ?? null;

  return { variants, winner };
}
