import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ============================================================================
// Database interface — all tables
// ============================================================================

export interface Database {
  users: UsersTable;
  api_keys: ApiKeysTable;
  contacts: ContactsTable;
  lists: ListsTable;
  contact_lists: ContactListsTable;
  segments: SegmentsTable;
  contact_segments: ContactSegmentsTable;
  templates: TemplatesTable;
  campaigns: CampaignsTable;
  campaign_variants: CampaignVariantsTable;
  events: EventsTable;
  campaign_stats_daily: CampaignStatsDailyTable;
  messages: MessagesTable;
  automations: AutomationsTable;
  automation_steps: AutomationStepsTable;
  automation_log: AutomationLogTable;
  assets: AssetsTable;
  imports: ImportsTable;
  webhook_endpoints: WebhookEndpointsTable;
  webhook_deliveries: WebhookDeliveriesTable;
}

// ============================================================================
// users
// ============================================================================

export interface UsersTable {
  id: Generated<number>;
  email: string;
  password_hash: string;
  name: string;
  role: number;
  last_login_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type UserUpdate = Updateable<UsersTable>;

// ============================================================================
// api_keys
// ============================================================================

export interface ApiKeysTable {
  id: Generated<number>;
  user_id: number;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  last_used_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  expires_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
}

export type ApiKey = Selectable<ApiKeysTable>;
export type NewApiKey = Insertable<ApiKeysTable>;
export type ApiKeyUpdate = Updateable<ApiKeysTable>;

// ============================================================================
// contacts
// ============================================================================

export interface ContactsTable {
  id: Generated<number>;
  email: string;
  status: Generated<number>;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  custom_fields: Generated<Record<string, unknown>>;
  source: string | null;
  engagement_score: Generated<number>;
  engagement_tier: Generated<number>;
  last_open_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  last_click_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  last_activity_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  subscribed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  unsubscribed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type Contact = Selectable<ContactsTable>;
export type NewContact = Insertable<ContactsTable>;
export type ContactUpdate = Updateable<ContactsTable>;

// ============================================================================
// lists
// ============================================================================

export interface ListsTable {
  id: Generated<number>;
  name: string;
  description: string | null;
  type: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type List = Selectable<ListsTable>;
export type NewList = Insertable<ListsTable>;
export type ListUpdate = Updateable<ListsTable>;

// ============================================================================
// contact_lists
// ============================================================================

export interface ContactListsTable {
  contact_id: number;
  list_id: number;
  status: Generated<number>;
  created_at: Generated<Date>;
}

export type ContactList = Selectable<ContactListsTable>;
export type NewContactList = Insertable<ContactListsTable>;

// ============================================================================
// segments
// ============================================================================

export interface SegmentsTable {
  id: Generated<number>;
  name: string;
  type: Generated<number>;
  rules: Record<string, unknown> | null;
  description: string | null;
  cached_count: number | null;
  cached_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type Segment = Selectable<SegmentsTable>;
export type NewSegment = Insertable<SegmentsTable>;
export type SegmentUpdate = Updateable<SegmentsTable>;

// ============================================================================
// contact_segments
// ============================================================================

export interface ContactSegmentsTable {
  contact_id: number;
  segment_id: number;
  created_at: Generated<Date>;
}

export type ContactSegment = Selectable<ContactSegmentsTable>;
export type NewContactSegment = Insertable<ContactSegmentsTable>;

// ============================================================================
// templates
// ============================================================================

export interface TemplatesTable {
  id: Generated<number>;
  name: string;
  category: string | null;
  content_html: string | null;
  content_json: Generated<Record<string, unknown>>;
  thumbnail_url: string | null;
  is_default: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type Template = Selectable<TemplatesTable>;
export type NewTemplate = Insertable<TemplatesTable>;
export type TemplateUpdate = Updateable<TemplatesTable>;

// ============================================================================
// campaigns
// ============================================================================

export interface CampaignsTable {
  id: Generated<number>;
  name: string;
  status: Generated<number>;
  subject: string | null;
  preview_text: string | null;
  from_name: Generated<string>;
  from_email: Generated<string>;
  reply_to: string | null;
  template_id: number | null;
  content_html: string | null;
  content_json: Record<string, unknown> | null;
  segment_id: number | null;
  list_id: number | null;
  scheduled_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  timezone: Generated<string>;
  send_started_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  send_completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  ab_test_enabled: Generated<boolean>;
  ab_test_config: Record<string, unknown> | null;
  resend_enabled: Generated<boolean>;
  resend_config: Record<string, unknown> | null;
  resend_of: number | null;
  total_sent: Generated<number>;
  total_delivered: Generated<number>;
  total_opens: Generated<number>;
  total_human_opens: Generated<number>;
  total_clicks: Generated<number>;
  total_human_clicks: Generated<number>;
  total_bounces: Generated<number>;
  total_complaints: Generated<number>;
  total_unsubscribes: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type Campaign = Selectable<CampaignsTable>;
export type NewCampaign = Insertable<CampaignsTable>;
export type CampaignUpdate = Updateable<CampaignsTable>;

// ============================================================================
// campaign_variants
// ============================================================================

export interface CampaignVariantsTable {
  id: Generated<number>;
  campaign_id: number;
  variant_name: string;
  subject: string;
  preview_text: string | null;
  content_html: string | null;
  content_json: Record<string, unknown> | null;
  percentage: number;
  is_winner: Generated<boolean>;
  win_probability: number | null;
  total_sent: Generated<number>;
  total_opens: Generated<number>;
  total_human_opens: Generated<number>;
  total_clicks: Generated<number>;
  total_human_clicks: Generated<number>;
  unique_clicks: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type CampaignVariant = Selectable<CampaignVariantsTable>;
export type NewCampaignVariant = Insertable<CampaignVariantsTable>;
export type CampaignVariantUpdate = Updateable<CampaignVariantsTable>;

// ============================================================================
// events
// ============================================================================

export interface EventsTable {
  id: Generated<number>;
  event_type: number;
  contact_id: number;
  campaign_id: number | null;
  variant_id: number | null;
  message_id: string | null;
  event_time: ColumnType<Date, Date | string, Date | string>;
  metadata: Record<string, unknown> | null;
  created_at: Generated<Date>;
}

export type Event = Selectable<EventsTable>;
export type NewEvent = Insertable<EventsTable>;

// ============================================================================
// campaign_stats_daily
// ============================================================================

export interface CampaignStatsDailyTable {
  campaign_id: number;
  variant_id: Generated<number>;
  event_type: number;
  event_date: ColumnType<Date, Date | string, Date | string>;
  total_count: Generated<number>;
  unique_contacts: Generated<number>;
}

export type CampaignStatsDaily = Selectable<CampaignStatsDailyTable>;
export type NewCampaignStatsDaily = Insertable<CampaignStatsDailyTable>;

// ============================================================================
// messages
// ============================================================================

export interface MessagesTable {
  id: Generated<string>;
  campaign_id: number;
  variant_id: number | null;
  contact_id: number;
  status: Generated<number>;
  ses_message_id: string | null;
  sent_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  delivered_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  first_open_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  first_click_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  is_machine_open: Generated<boolean>;
  created_at: Generated<Date>;
}

export type Message = Selectable<MessagesTable>;
export type NewMessage = Insertable<MessagesTable>;
export type MessageUpdate = Updateable<MessagesTable>;

// ============================================================================
// automations
// ============================================================================

export interface AutomationsTable {
  id: Generated<number>;
  name: string;
  type: number;
  trigger_config: Record<string, unknown>;
  enabled: Generated<boolean>;
  last_run_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export type Automation = Selectable<AutomationsTable>;
export type NewAutomation = Insertable<AutomationsTable>;
export type AutomationUpdate = Updateable<AutomationsTable>;

// ============================================================================
// automation_steps
// ============================================================================

export interface AutomationStepsTable {
  id: Generated<number>;
  automation_id: number;
  step_order: number;
  action: number;
  config: Record<string, unknown>;
  created_at: Generated<Date>;
}

export type AutomationStep = Selectable<AutomationStepsTable>;
export type NewAutomationStep = Insertable<AutomationStepsTable>;

// ============================================================================
// automation_log
// ============================================================================

export interface AutomationLogTable {
  id: Generated<number>;
  automation_id: number;
  contact_id: number;
  step_id: number | null;
  status: number;
  metadata: Record<string, unknown> | null;
  created_at: Generated<Date>;
}

export type AutomationLog = Selectable<AutomationLogTable>;
export type NewAutomationLog = Insertable<AutomationLogTable>;

// ============================================================================
// assets
// ============================================================================

export interface AssetsTable {
  id: Generated<number>;
  filename: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_type: Generated<number>;
  url: string;
  thumbnail_url: string | null;
  campaign_id: number | null;
  created_at: Generated<Date>;
}

export type Asset = Selectable<AssetsTable>;
export type NewAsset = Insertable<AssetsTable>;

// ============================================================================
// imports
// ============================================================================

export interface ImportsTable {
  id: Generated<number>;
  type: number;
  status: Generated<number>;
  total_rows: Generated<number>;
  new_contacts: Generated<number>;
  updated_contacts: Generated<number>;
  skipped: Generated<number>;
  mapping_config: Record<string, unknown> | null;
  mapping_preset: string | null;
  errors: Record<string, unknown> | null;
  created_at: Generated<Date>;
  completed_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
}

export type Import = Selectable<ImportsTable>;
export type NewImport = Insertable<ImportsTable>;
export type ImportUpdate = Updateable<ImportsTable>;

// ============================================================================
// webhook_endpoints
// ============================================================================

export interface WebhookEndpointsTable {
  id: Generated<number>;
  url: string;
  secret: string;
  events: string[];
  active: Generated<boolean>;
  last_triggered_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  failure_count: Generated<number>;
  created_at: Generated<Date>;
}

export type WebhookEndpoint = Selectable<WebhookEndpointsTable>;
export type NewWebhookEndpoint = Insertable<WebhookEndpointsTable>;
export type WebhookEndpointUpdate = Updateable<WebhookEndpointsTable>;

// ============================================================================
// webhook_deliveries
// ============================================================================

export interface WebhookDeliveriesTable {
  id: Generated<number>;
  endpoint_id: number;
  event_type: string;
  payload: Record<string, unknown>;
  status: Generated<number>;
  response_code: number | null;
  response_body: string | null;
  attempts: Generated<number>;
  next_retry_at: ColumnType<Date | null, Date | string | null, Date | string | null>;
  created_at: Generated<Date>;
}

export type WebhookDelivery = Selectable<WebhookDeliveriesTable>;
export type NewWebhookDelivery = Insertable<WebhookDeliveriesTable>;
