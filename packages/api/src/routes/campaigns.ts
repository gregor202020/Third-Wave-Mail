import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getDb, getRedis, ErrorCode, CampaignStatus } from '@twmail/shared';
import { Queue, type ConnectionOptions } from 'bullmq';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../plugins/error-handler.js';

const createSchema = z.object({
  name: z.string().min(1).max(255),
  subject: z.string().max(500).optional(),
  preview_text: z.string().max(500).optional(),
  from_name: z.string().max(255).optional(),
  from_email: z.union([z.string().email(), z.literal('')]).optional(),
  reply_to: z.union([z.string().email(), z.literal('')]).optional(),
  template_id: z.number().optional().nullable(),
  content_html: z.string().optional().nullable(),
  content_json: z.record(z.unknown()).optional().nullable(),
  segment_id: z.number().optional().nullable(),
  list_id: z.number().optional().nullable(),
  ab_test_enabled: z.boolean().optional(),
  ab_test_config: z.record(z.unknown()).optional().nullable(),
  resend_enabled: z.boolean().optional(),
  resend_config: z.record(z.unknown()).optional().nullable(),
  tags: z.array(z.string()).optional(),
  utm_enabled: z.boolean().optional(),
  utm_source: z.string().max(255).optional(),
  utm_medium: z.string().max(255).optional(),
  utm_campaign: z.string().max(255).optional(),
  utm_content: z.string().max(255).optional(),
  ga_tracking: z.boolean().optional(),
  tracking_domain: z.string().max(255).optional(),
  send_time_optimization: z.boolean().optional(),
});

const updateSchema = createSchema.partial().strip();

const scheduleSchema = z.object({
  scheduled_at: z.string().datetime(),
  timezone: z.string().optional(),
});

const abTestSchema = z.object({
  variants: z
    .array(
      z.object({
        variant_name: z.string().min(1),
        subject: z.string().min(1),
        preview_text: z.string().optional().nullable(),
        content_html: z.string().optional().nullable(),
        content_json: z.record(z.unknown()).optional().nullable(),
        percentage: z.number().min(1).max(100),
      }),
    )
    .min(2)
    .max(4),
});

// Fields that come from the frontend but are not in the campaigns DB table
const FRONTEND_ONLY_FIELDS = new Set([
  'variants',
  'segment',
  'list',
  'template',
  'id',
  'created_at',
  'updated_at',
  'send_started_at',
  'send_completed_at',
  'total_sent',
  'total_delivered',
  'total_opens',
  'total_human_opens',
  'total_clicks',
  'total_human_clicks',
  'total_bounces',
  'total_complaints',
  'total_unsubscribes',
  'status',
]);

export const campaignRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', requireAuth);

  // GET /api/campaigns
  app.get<{
    Querystring: { page?: string; per_page?: string; status?: string };
  }>('/', async (request, reply) => {
    const db = getDb();
    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = Math.min(request.query.per_page ? Number(request.query.per_page) : 50, 200);
    const offset = (page - 1) * perPage;

    let query = db.selectFrom('campaigns').selectAll();
    let countQuery = db.selectFrom('campaigns').select(db.fn.countAll<number>().as('count'));

    if (request.query.status) {
      const statusVal = Number(request.query.status);
      query = query.where('status', '=', statusVal);
      countQuery = countQuery.where('status', '=', statusVal);
    }

    query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

    const [campaigns, countResult] = await Promise.all([
      query.execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    return reply.send({
      data: campaigns,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // POST /api/campaigns
  app.post('/', async (request, reply) => {
    const body = createSchema.parse(request.body);
    const db = getDb();

    const campaign = await db
      .insertInto('campaigns')
      .values({
        name: body.name,
        subject: body.subject,
        preview_text: body.preview_text,
        from_name: body.from_name,
        from_email: body.from_email,
        reply_to: body.reply_to,
        template_id: body.template_id ?? null,
        content_html: body.content_html,
        content_json: body.content_json ?? null,
        segment_id: body.segment_id ?? null,
        list_id: body.list_id ?? null,
        ab_test_enabled: body.ab_test_enabled ?? false,
        ab_test_config: body.ab_test_config ?? null,
        resend_enabled: body.resend_enabled ?? false,
        resend_config: body.resend_config ?? null,
        tags: body.tags ?? [],
        utm_enabled: body.utm_enabled ?? false,
        utm_source: body.utm_source,
        utm_medium: body.utm_medium,
        utm_campaign: body.utm_campaign,
        utm_content: body.utm_content,
        ga_tracking: body.ga_tracking ?? false,
        tracking_domain: body.tracking_domain,
        send_time_optimization: body.send_time_optimization ?? false,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: campaign });
  });

  // GET /api/campaigns/:id
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    // Include variants
    const variants = await db
      .selectFrom('campaign_variants')
      .selectAll()
      .where('campaign_id', '=', id)
      .orderBy('created_at', 'asc')
      .execute();

    return reply.send({ data: { ...campaign, variants } });
  });

  // PATCH /api/campaigns/:id
  app.patch<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const raw = request.body as Record<string, unknown>;

    // Strip frontend-only fields before validation
    const stripped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!FRONTEND_ONLY_FIELDS.has(key)) {
        stripped[key] = value;
      }
    }

    const body = updateSchema.parse(stripped);
    const db = getDb();
    const id = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only update draft campaigns');
    }

    // Coerce null to undefined for NOT NULL columns so Kysely skips them
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      updateData[key] = value === null ? undefined : value;
    }

    const result = await db
      .updateTable('campaigns')
      .set(updateData)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (!result) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    return reply.send({ data: result });
  });

  // DELETE /api/campaigns/:id
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only delete draft campaigns');
    }

    await db.deleteFrom('campaigns').where('id', '=', id).executeTakeFirst();

    return reply.status(204).send();
  });

  // POST /api/campaigns/:id/send
  app.post<{ Params: { id: string } }>('/:id/send', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

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
    const settings = await db
      .selectFrom('settings')
      .select('physical_address')
      .where('id', '=', 1)
      .executeTakeFirst();

    if (!settings?.physical_address?.trim()) {
      throw new AppError(
        400,
        ErrorCode.VALIDATION_ERROR,
        'A physical mailing address must be configured in Settings before sending campaigns',
      );
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
    const campaignSendQueue = new Queue('campaign-send', { connection: redis as unknown as ConnectionOptions });
    await campaignSendQueue.add('send', { campaignId: id });
    await campaignSendQueue.close();

    return reply.send({ data: result });
  });

  // POST /api/campaigns/:id/schedule
  app.post<{ Params: { id: string } }>('/:id/schedule', async (request, reply) => {
    const body = scheduleSchema.parse(request.body);
    const db = getDb();
    const id = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only schedule draft campaigns');
    }

    const scheduledAt = new Date(body.scheduled_at);
    if (scheduledAt <= new Date()) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Scheduled time must be in the future');
    }

    const result = await db
      .updateTable('campaigns')
      .set({
        status: CampaignStatus.SCHEDULED,
        scheduled_at: scheduledAt,
        timezone: body.timezone,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.send({ data: result });
  });

  // POST /api/campaigns/:id/pause
  app.post<{ Params: { id: string } }>('/:id/pause', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    if (campaign.status !== CampaignStatus.SENDING) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only pause a sending campaign');
    }

    const result = await db
      .updateTable('campaigns')
      .set({ status: CampaignStatus.PAUSED })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.send({ data: result });
  });

  // POST /api/campaigns/:id/cancel
  app.post<{ Params: { id: string } }>('/:id/cancel', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    if (
      campaign.status !== CampaignStatus.SCHEDULED &&
      campaign.status !== CampaignStatus.SENDING &&
      campaign.status !== CampaignStatus.PAUSED
    ) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only cancel scheduled, sending, or paused campaigns');
    }

    const result = await db
      .updateTable('campaigns')
      .set({ status: CampaignStatus.CANCELLED })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.send({ data: result });
  });

  // POST /api/campaigns/:id/duplicate
  app.post<{ Params: { id: string } }>('/:id/duplicate', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const original = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!original) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    const clone = await db
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
        tags: original.tags,
        utm_enabled: original.utm_enabled,
        utm_source: original.utm_source,
        utm_medium: original.utm_medium,
        utm_campaign: original.utm_campaign,
        utm_content: original.utm_content,
        ga_tracking: original.ga_tracking,
        tracking_domain: original.tracking_domain,
        send_time_optimization: original.send_time_optimization,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return reply.status(201).send({ data: clone });
  });

  // GET /api/campaigns/:id/report
  app.get<{ Params: { id: string } }>('/:id/report', async (request, reply) => {
    const db = getDb();
    const id = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    const variants = await db
      .selectFrom('campaign_variants')
      .selectAll()
      .where('campaign_id', '=', id)
      .orderBy('created_at', 'asc')
      .execute();

    const delivered = campaign.total_delivered || 1;
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
      click_to_open_rate:
        campaign.total_human_opens > 0
          ? Number(((campaign.total_human_clicks / campaign.total_human_opens) * 100).toFixed(2))
          : 0,
      total_bounces: campaign.total_bounces,
      bounce_rate: Number(((campaign.total_bounces / (campaign.total_sent || 1)) * 100).toFixed(2)),
      total_complaints: campaign.total_complaints,
      complaint_rate: Number(((campaign.total_complaints / delivered) * 100).toFixed(4)),
      total_unsubscribes: campaign.total_unsubscribes,
      unsubscribe_rate: Number(((campaign.total_unsubscribes / delivered) * 100).toFixed(2)),
    };

    return reply.send({ data: { campaign, variants, stats } });
  });

  // GET /api/campaigns/:id/recipients
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; per_page?: string; status?: string };
  }>('/:id/recipients', async (request, reply) => {
    const db = getDb();
    const campaignId = Number(request.params.id);

    // Verify campaign exists
    const campaign = await db
      .selectFrom('campaigns')
      .select('id')
      .where('id', '=', campaignId)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    const page = request.query.page ? Number(request.query.page) : 1;
    const perPage = Math.min(request.query.per_page ? Number(request.query.per_page) : 50, 200);
    const offset = (page - 1) * perPage;

    let query = db.selectFrom('messages').selectAll().where('campaign_id', '=', campaignId);
    let countQuery = db
      .selectFrom('messages')
      .select(db.fn.countAll<number>().as('count'))
      .where('campaign_id', '=', campaignId);

    if (request.query.status) {
      const statusVal = Number(request.query.status);
      query = query.where('status', '=', statusVal);
      countQuery = countQuery.where('status', '=', statusVal);
    }

    query = query.orderBy('created_at', 'desc').limit(perPage).offset(offset);

    const [messages, countResult] = await Promise.all([
      query.execute(),
      countQuery.executeTakeFirstOrThrow(),
    ]);

    const total = Number(countResult.count);

    return reply.send({
      data: messages,
      pagination: { page, per_page: perPage, total, total_pages: Math.ceil(total / perPage) },
    });
  });

  // POST /api/campaigns/:id/ab-test
  app.post<{ Params: { id: string } }>('/:id/ab-test', async (request, reply) => {
    const body = abTestSchema.parse(request.body);
    const db = getDb();
    const campaignId = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .selectAll()
      .where('id', '=', campaignId)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    if (campaign.status !== CampaignStatus.DRAFT) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Can only configure A/B test on draft campaigns');
    }

    const totalPercentage = body.variants.reduce((sum, v) => sum + v.percentage, 0);
    if (totalPercentage !== 100) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Variant percentages must sum to 100');
    }

    // Delete existing variants
    await db.deleteFrom('campaign_variants').where('campaign_id', '=', campaignId).execute();

    // Insert new variants
    const results = [];
    for (const variant of body.variants) {
      const result = await db
        .insertInto('campaign_variants')
        .values({
          campaign_id: campaignId,
          variant_name: variant.variant_name,
          subject: variant.subject,
          content_html: variant.content_html ?? undefined,
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

    return reply.status(201).send({ data: results });
  });

  // GET /api/campaigns/:id/ab-test
  app.get<{ Params: { id: string } }>('/:id/ab-test', async (request, reply) => {
    const db = getDb();
    const campaignId = Number(request.params.id);

    const campaign = await db
      .selectFrom('campaigns')
      .select('id')
      .where('id', '=', campaignId)
      .executeTakeFirst();

    if (!campaign) {
      throw new AppError(404, ErrorCode.NOT_FOUND, 'Campaign not found');
    }

    const variants = await db
      .selectFrom('campaign_variants')
      .selectAll()
      .where('campaign_id', '=', campaignId)
      .orderBy('created_at', 'asc')
      .execute();

    const winner = variants.find((v) => v.is_winner) ?? null;

    // Calculate win probability based on open rates
    const variantsWithProbability = variants.map((v) => {
      const openRate = v.total_sent > 0 ? v.total_human_opens / v.total_sent : 0;
      return { ...v, calculated_open_rate: openRate };
    });

    return reply.send({ data: { variants: variantsWithProbability, winner } });
  });
};
