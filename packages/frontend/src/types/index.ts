// ============================================================================
// Enums (matching smallint values in DB)
// ============================================================================

export const UserRole = { ADMIN: 1, EDITOR: 2, VIEWER: 3 } as const;
export type UserRoleType = (typeof UserRole)[keyof typeof UserRole];

export const ContactStatus = {
  ACTIVE: 1, UNSUBSCRIBED: 2, BOUNCED: 3, COMPLAINED: 4, CLEANED: 5,
} as const;
export type ContactStatusType = (typeof ContactStatus)[keyof typeof ContactStatus];

export const ListType = { PUBLIC: 1, PRIVATE: 2 } as const;
export const ContactListStatus = { CONFIRMED: 1, UNCONFIRMED: 2, UNSUBSCRIBED: 3 } as const;

export const SegmentType = { DYNAMIC: 1, STATIC: 2 } as const;

export const CampaignStatus = {
  DRAFT: 1, SCHEDULED: 2, SENDING: 3, SENT: 4, PAUSED: 5, CANCELLED: 6,
} as const;
export type CampaignStatusType = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const EventType = {
  SENT: 1, DELIVERED: 2, OPEN: 3, CLICK: 4,
  HARD_BOUNCE: 5, SOFT_BOUNCE: 6, COMPLAINT: 7, UNSUBSCRIBE: 8, MACHINE_OPEN: 9,
} as const;

export const MessageStatus = {
  QUEUED: 1, SENT: 2, DELIVERED: 3, OPENED: 4,
  CLICKED: 5, BOUNCED: 6, COMPLAINED: 7, UNSUBSCRIBED: 8,
} as const;

export const ImportType = { PASTE: 1, CSV: 2, API: 3 } as const;
export const ImportStatus = { PROCESSING: 1, COMPLETED: 2, FAILED: 3 } as const;
export const WebhookDeliveryStatus = { PENDING: 1, DELIVERED: 2, FAILED: 3 } as const;
export const ApiKeyScope = { READ: 'read', WRITE: 'write', ADMIN: 'admin' } as const;

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;

// ============================================================================
// Segment rules
// ============================================================================

export interface SegmentRule {
  field: string;
  operator: string;
  value: unknown;
}

export interface SegmentRuleGroup {
  conjunction?: 'and' | 'or';
  logic?: 'and' | 'or';
  rules: (SegmentRule | SegmentRuleGroup)[];
}

// ============================================================================
// Pagination
// ============================================================================

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ============================================================================
// Domain models
// ============================================================================

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: number;
}

export interface ApiResponse<T> {
  data: T;
}

export interface Contact {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  city: string | null;
  country: string | null;
  timezone: string | null;
  status: number;
  source: string | null;
  engagement_score: number | null;
  subscribed_at: string | null;
  last_open_at: string | null;
  last_click_at: string | null;
  last_activity_at: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  list_count?: number;
  lists?: List[];
}

export interface List {
  id: number;
  name: string;
  description: string | null;
  type: number;
  created_at: string;
  updated_at: string;
}

export interface Segment {
  id: number;
  name: string;
  type: number;
  description: string | null;
  rules: SegmentRuleGroup[] | null;
  contact_count?: number;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: number;
  name: string;
  subject: string | null;
  preview_text: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  status: number;
  template_id: number | null;
  content_html: string | null;
  content_json: Record<string, unknown> | null;
  segment_id: number | null;
  list_id: number | null;
  ab_test_enabled: boolean;
  ab_test_config: Record<string, unknown> | null;
  resend_enabled: boolean;
  resend_config: Record<string, unknown> | null;
  sending_domain: string;
  tags: string | null;
  utm_enabled: boolean;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  ga_tracking: boolean;
  tracking_domain: string | null;
  open_tracking: boolean;
  click_tracking: boolean;
  send_time_optimization: boolean;
  scheduled_at: string | null;
  timezone: string | null;
  send_started_at: string | null;
  send_completed_at: string | null;
  total_sent: number;
  total_delivered: number;
  total_opens: number;
  total_human_opens: number;
  total_clicks: number;
  total_human_clicks: number;
  total_bounces: number;
  total_complaints: number;
  total_unsubscribes: number;
  created_at: string;
  updated_at: string;
}

export interface Template {
  id: number;
  name: string;
  category: string | null;
  content_html: string | null;
  content_json: Record<string, unknown> | null;
  thumbnail_url: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface Import {
  id: number;
  type: number;
  status: number;
  total_rows: number;
  new_contacts: number;
  updated_contacts: number;
  skipped: number;
  error_count: number;
  created_at: string;
  updated_at: string;
}

export interface WebhookEndpoint {
  id: number;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  failure_count: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignVariant {
  id: number;
  campaign_id: number;
  variant_name: string;
  subject: string;
  preview_text: string | null;
  content_html: string | null;
  content_json: Record<string, unknown> | null;
  percentage: number;
  total_sent: number;
  total_opens: number;
  total_clicks: number;
  is_winner: boolean;
}
