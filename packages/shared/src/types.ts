// ============================================================================
// Enums as const objects (matching smallint values in DB)
// ============================================================================

export const UserRole = {
  ADMIN: 1,
  EDITOR: 2,
  VIEWER: 3,
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const ContactStatus = {
  ACTIVE: 1,
  UNSUBSCRIBED: 2,
  BOUNCED: 3,
  COMPLAINED: 4,
  CLEANED: 5,
} as const;
export type ContactStatus = (typeof ContactStatus)[keyof typeof ContactStatus];

export const ListType = {
  PUBLIC: 1,
  PRIVATE: 2,
} as const;
export type ListType = (typeof ListType)[keyof typeof ListType];

export const ContactListStatus = {
  CONFIRMED: 1,
  UNCONFIRMED: 2,
  UNSUBSCRIBED: 3,
} as const;
export type ContactListStatus = (typeof ContactListStatus)[keyof typeof ContactListStatus];

export const SegmentType = {
  DYNAMIC: 1,
  STATIC: 2,
} as const;
export type SegmentType = (typeof SegmentType)[keyof typeof SegmentType];

export const CampaignStatus = {
  DRAFT: 1,
  SCHEDULED: 2,
  SENDING: 3,
  SENT: 4,
  PAUSED: 5,
  CANCELLED: 6,
} as const;
export type CampaignStatus = (typeof CampaignStatus)[keyof typeof CampaignStatus];

export const EventType = {
  SENT: 1,
  DELIVERED: 2,
  OPEN: 3,
  CLICK: 4,
  HARD_BOUNCE: 5,
  SOFT_BOUNCE: 6,
  COMPLAINT: 7,
  UNSUBSCRIBE: 8,
  MACHINE_OPEN: 9,
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];

export const MessageStatus = {
  QUEUED: 1,
  SENT: 2,
  DELIVERED: 3,
  OPENED: 4,
  CLICKED: 5,
  BOUNCED: 6,
  COMPLAINED: 7,
  UNSUBSCRIBED: 8,
} as const;
export type MessageStatus = (typeof MessageStatus)[keyof typeof MessageStatus];

export const AutomationType = {
  RESEND_NON_OPENERS: 1,
  DRIP_SEQUENCE: 2,
  ENGAGEMENT_TRIGGER: 3,
} as const;
export type AutomationType = (typeof AutomationType)[keyof typeof AutomationType];

export const AutomationAction = {
  SEND_EMAIL: 1,
  WAIT: 2,
  CONDITION: 3,
  UPDATE_CONTACT: 4,
} as const;
export type AutomationAction = (typeof AutomationAction)[keyof typeof AutomationAction];

export const AutomationLogStatus = {
  STARTED: 1,
  COMPLETED: 2,
  FAILED: 3,
  SKIPPED: 4,
} as const;
export type AutomationLogStatus = (typeof AutomationLogStatus)[keyof typeof AutomationLogStatus];

export const StorageType = {
  LOCAL: 1,
  S3: 2,
} as const;
export type StorageType = (typeof StorageType)[keyof typeof StorageType];

export const ImportType = {
  PASTE: 1,
  CSV: 2,
  API: 3,
} as const;
export type ImportType = (typeof ImportType)[keyof typeof ImportType];

export const ImportStatus = {
  PROCESSING: 1,
  COMPLETED: 2,
  FAILED: 3,
} as const;
export type ImportStatus = (typeof ImportStatus)[keyof typeof ImportStatus];

export const WebhookDeliveryStatus = {
  PENDING: 1,
  DELIVERED: 2,
  FAILED: 3,
} as const;
export type WebhookDeliveryStatus = (typeof WebhookDeliveryStatus)[keyof typeof WebhookDeliveryStatus];

// ============================================================================
// API key scopes
// ============================================================================

export const ApiKeyScope = {
  READ: 'read',
  WRITE: 'write',
  ADMIN: 'admin',
} as const;
export type ApiKeyScope = (typeof ApiKeyScope)[keyof typeof ApiKeyScope];

// ============================================================================
// Pagination
// ============================================================================

export interface PaginationParams {
  page?: number;
  per_page?: number;
}

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
// API error codes
// ============================================================================

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================================================
// Segment rule types
// ============================================================================

export interface SegmentRule {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'is_set' | 'is_not_set' | 'in' | 'not_in' | 'between' | 'before' | 'after' | 'within_days';
  value?: string | number | boolean | string[] | number[];
}

export interface SegmentRuleGroup {
  logic: 'and' | 'or';
  rules: (SegmentRule | SegmentRuleGroup)[];
}
