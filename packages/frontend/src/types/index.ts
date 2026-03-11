// Re-export enums and types from shared package
export {
  UserRole,
  ContactStatus,
  ListType,
  ContactListStatus,
  SegmentType,
  CampaignStatus,
  EventType,
  MessageStatus,
  AutomationType,
  AutomationAction,
  AutomationLogStatus,
  StorageType,
  ImportType,
  ImportStatus,
  WebhookDeliveryStatus,
  ApiKeyScope,
  ErrorCode,
} from '@twmail/shared';

export type {
  PaginationParams,
  PaginationMeta,
  PaginatedResponse,
  SegmentRule,
  SegmentRuleGroup,
  User,
  NewUser,
  UserUpdate,
  ApiKey,
  NewApiKey,
  ApiKeyUpdate,
  Contact,
  NewContact,
  ContactUpdate,
  List,
  NewList,
  ListUpdate,
  ContactList,
  NewContactList,
  Segment,
  NewSegment,
  SegmentUpdate,
  ContactSegment,
  NewContactSegment,
  Template,
  NewTemplate,
  TemplateUpdate,
  Campaign,
  NewCampaign,
  CampaignUpdate,
  CampaignVariant,
  NewCampaignVariant,
  CampaignVariantUpdate,
  Event,
  NewEvent,
  CampaignStatsDaily,
  NewCampaignStatsDaily,
  Message,
  NewMessage,
  MessageUpdate,
  Automation,
  NewAutomation,
  AutomationUpdate,
  AutomationStep,
  NewAutomationStep,
  AutomationLog,
  NewAutomationLog,
  Asset,
  NewAsset,
  Import,
  NewImport,
  ImportUpdate,
  WebhookEndpoint,
  NewWebhookEndpoint,
  WebhookEndpointUpdate,
  WebhookDelivery,
  NewWebhookDelivery,
} from '@twmail/shared';

// Frontend-specific types
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: number;
}

export interface ApiResponse<T> {
  data: T;
}
