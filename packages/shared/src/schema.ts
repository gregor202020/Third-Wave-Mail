import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ============================================================================
// Helper column types
// ============================================================================

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;

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
  campaign_holdback_contacts: CampaignHoldbackContactsTable;
  messages: MessagesTable;
  events: EventsTable;
  campaign_stats_daily: CampaignStatsDailyTable;
  automations: AutomationsTable;
  automation_steps: AutomationStepsTable;
  automation_log: AutomationLogTable;
  assets: AssetsTable;
  imports: ImportsTable;
  webhook_endpoints: WebhookEndpointsTable;
  webhook_deliveries: WebhookDeliveriesTable;
  settings: SettingsTable;
}

// ============================================================================
// users
// ============================================================================

export interface UsersTable {
  id: Generated<number>;
  email: string;
  password_hash: Generated<string>;
  name: Generated<string>;
  role: Generated<number>;
  last_login_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  name: Generated<string>;
  key_prefix: Generated<string>;
  key_hash: Generated<string>;
  scopes: Generated<string[]>;
  expires_at: NullableTimestamp;
  last_used_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  first_name: Generated<string>;
  last_name: Generated<string>;
  phone: Generated<string>;
  company: Generated<string>;
  city: Generated<string>;
  country: Generated<string>;
  timezone: Generated<string>;
  status: Generated<number>;
  custom_fields: Generated<Record<string, unknown>>;
  source: Generated<string>;
  engagement_score: Generated<number>;
  engagement_tier: number | null;
  last_open_at: NullableTimestamp;
  last_click_at: NullableTimestamp;
  last_activity_at: NullableTimestamp;
  subscribed_at: NullableTimestamp;
  unsubscribed_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type Contact = Selectable<ContactsTable>;
export type NewContact = Insertable<ContactsTable>;
export type ContactUpdate = Updateable<ContactsTable>;

// ============================================================================
// lists
// ============================================================================

export interface ListsTable {
  id: Generated<number>;
  name: Generated<string>;
  description: Generated<string>;
  type: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  created_at: Timestamp;
}

export type ContactList = Selectable<ContactListsTable>;
export type NewContactList = Insertable<ContactListsTable>;

// ============================================================================
// segments
// ============================================================================

export interface SegmentsTable {
  id: Generated<number>;
  name: Generated<string>;
  description: Generated<string>;
  type: Generated<number>;
  rules: Generated<Record<string, unknown>>;
  cached_count: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  created_at: Timestamp;
}

export type ContactSegment = Selectable<ContactSegmentsTable>;
export type NewContactSegment = Insertable<ContactSegmentsTable>;

// ============================================================================
// templates
// ============================================================================

export interface TemplatesTable {
  id: Generated<number>;
  name: Generated<string>;
  category: Generated<string>;
  content_html: Generated<string>;
  content_json: Record<string, unknown> | null;
  thumbnail_url: Generated<string>;
  is_default: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type Template = Selectable<TemplatesTable>;
export type NewTemplate = Insertable<TemplatesTable>;
export type TemplateUpdate = Updateable<TemplatesTable>;

// ============================================================================
// campaigns
// ============================================================================

export interface CampaignsTable {
  id: Generated<number>;
  name: Generated<string>;
  status: Generated<number>;
  subject: Generated<string>;
  preview_text: Generated<string>;
  from_name: Generated<string>;
  from_email: Generated<string>;
  reply_to: Generated<string>;
  template_id: number | null;
  content_html: Generated<string>;
  content_json: Record<string, unknown> | null;
  segment_id: number | null;
  list_id: number | null;
  ab_test_enabled: Generated<boolean>;
  ab_test_config: Record<string, unknown> | null;
  resend_enabled: Generated<boolean>;
  resend_config: Record<string, unknown> | null;
  resend_of: number | null;
  sending_domain: Generated<string>;
  tags: Generated<string[]>;
  utm_enabled: Generated<boolean>;
  utm_source: Generated<string>;
  utm_medium: Generated<string>;
  utm_campaign: Generated<string>;
  utm_content: Generated<string>;
  ga_tracking: Generated<boolean>;
  tracking_domain: Generated<string>;
  open_tracking: Generated<boolean>;
  click_tracking: Generated<boolean>;
  send_time_optimization: Generated<boolean>;
  total_sent: Generated<number>;
  total_delivered: Generated<number>;
  total_opens: Generated<number>;
  total_human_opens: Generated<number>;
  total_clicks: Generated<number>;
  total_human_clicks: Generated<number>;
  total_bounces: Generated<number>;
  total_complaints: Generated<number>;
  total_unsubscribes: Generated<number>;
  scheduled_at: NullableTimestamp;
  timezone: Generated<string>;
  send_started_at: NullableTimestamp;
  send_completed_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  variant_name: Generated<string>;
  subject: Generated<string>;
  content_html: Generated<string>;
  content_json: Record<string, unknown> | null;
  percentage: Generated<number>;
  is_winner: Generated<boolean>;
  win_probability: number | null;
  total_sent: Generated<number>;
  total_delivered: Generated<number>;
  total_opens: Generated<number>;
  total_human_opens: Generated<number>;
  total_clicks: Generated<number>;
  total_human_clicks: Generated<number>;
  total_bounces: Generated<number>;
  total_complaints: Generated<number>;
  total_unsubscribes: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type CampaignVariant = Selectable<CampaignVariantsTable>;
export type NewCampaignVariant = Insertable<CampaignVariantsTable>;
export type CampaignVariantUpdate = Updateable<CampaignVariantsTable>;

// ============================================================================
// campaign_holdback_contacts
// ============================================================================

export interface CampaignHoldbackContactsTable {
  campaign_id: number;
  contact_id: number;
}

export type CampaignHoldbackContact = Selectable<CampaignHoldbackContactsTable>;
export type NewCampaignHoldbackContact = Insertable<CampaignHoldbackContactsTable>;

// ============================================================================
// messages
// ============================================================================

export interface MessagesTable {
  id: Generated<string>;
  campaign_id: number;
  variant_id: number | null;
  contact_id: number;
  status: Generated<number>;
  ses_message_id: Generated<string>;
  sent_at: NullableTimestamp;
  delivered_at: NullableTimestamp;
  first_open_at: NullableTimestamp;
  first_click_at: NullableTimestamp;
  is_machine_open: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type Message = Selectable<MessagesTable>;
export type NewMessage = Insertable<MessagesTable>;
export type MessageUpdate = Updateable<MessagesTable>;

// ============================================================================
// events (partitioned by event_time)
// ============================================================================

export interface EventsTable {
  id: Generated<number>;
  event_type: number;
  contact_id: number | null;
  campaign_id: number | null;
  variant_id: number | null;
  message_id: string | null;
  event_time: ColumnType<Date, Date | string | undefined, Date | string>;
  metadata: Record<string, unknown> | null;
}

export type Event = Selectable<EventsTable>;
export type NewEvent = Insertable<EventsTable>;

// ============================================================================
// campaign_stats_daily
// ============================================================================

export interface CampaignStatsDailyTable {
  id: Generated<number>;
  campaign_id: number;
  variant_id: number | null;
  event_type: number;
  event_date: ColumnType<Date, Date | string, Date | string>;
  total_count: Generated<number>;
  unique_contacts: Generated<number>;
}

export type CampaignStatsDaily = Selectable<CampaignStatsDailyTable>;
export type NewCampaignStatsDaily = Insertable<CampaignStatsDailyTable>;

// ============================================================================
// automations
// ============================================================================

export interface AutomationsTable {
  id: Generated<number>;
  name: Generated<string>;
  type: number;
  trigger_config: Generated<Record<string, unknown>>;
  enabled: Generated<boolean>;
  last_run_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  step_order: Generated<number>;
  action: number;
  config: Generated<Record<string, unknown>>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type AutomationStep = Selectable<AutomationStepsTable>;
export type NewAutomationStep = Insertable<AutomationStepsTable>;
export type AutomationStepUpdate = Updateable<AutomationStepsTable>;

// ============================================================================
// automation_log (partitioned by executed_at)
// ============================================================================

export interface AutomationLogTable {
  id: Generated<number>;
  automation_id: number | null;
  step_id: number | null;
  contact_id: number | null;
  status: Generated<number>;
  result: Record<string, unknown> | null;
  executed_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export type AutomationLog = Selectable<AutomationLogTable>;
export type NewAutomationLog = Insertable<AutomationLogTable>;

// ============================================================================
// assets
// ============================================================================

export interface AssetsTable {
  id: Generated<number>;
  filename: Generated<string>;
  original_name: Generated<string>;
  mime_type: Generated<string>;
  size_bytes: Generated<number>;
  storage_type: Generated<number>;
  url: Generated<string>;
  thumbnail_url: Generated<string>;
  campaign_id: number | null;
  created_at: Timestamp;
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
  errors: Generated<Record<string, unknown>[]>;
  list_id: number | null;
  update_existing: Generated<boolean>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type Import = Selectable<ImportsTable>;
export type NewImport = Insertable<ImportsTable>;
export type ImportUpdate = Updateable<ImportsTable>;

// ============================================================================
// webhook_endpoints
// ============================================================================

export interface WebhookEndpointsTable {
  id: Generated<number>;
  url: Generated<string>;
  secret: Generated<string>;
  events: Generated<string[]>;
  active: Generated<boolean>;
  last_triggered_at: NullableTimestamp;
  failure_count: Generated<number>;
  created_at: Timestamp;
  updated_at: Timestamp;
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
  event_type: Generated<string>;
  payload: Generated<Record<string, unknown>>;
  status: Generated<number>;
  response_code: number | null;
  response_body: Generated<string>;
  attempts: Generated<number>;
  next_retry_at: NullableTimestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type WebhookDelivery = Selectable<WebhookDeliveriesTable>;
export type NewWebhookDelivery = Insertable<WebhookDeliveriesTable>;
export type WebhookDeliveryUpdate = Updateable<WebhookDeliveriesTable>;

// ============================================================================
// settings (singleton row, id always 1)
// ============================================================================

export interface SettingsTable {
  id: Generated<number>;
  organization_name: Generated<string>;
  default_sender_email: Generated<string>;
  default_sender_name: Generated<string>;
  timezone: Generated<string>;
  physical_address: Generated<string>;
  created_at: Timestamp;
  updated_at: Timestamp;
}

export type Settings = Selectable<SettingsTable>;
export type SettingsUpdate = Updateable<SettingsTable>;
