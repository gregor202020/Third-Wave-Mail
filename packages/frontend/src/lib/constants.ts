import { CampaignStatus, ContactStatus, UserRole } from '@twmail/shared';

export const CAMPAIGN_STATUS_CONFIG: Record<number, { label: string; color: string; dotClass: string }> = {
  [CampaignStatus.DRAFT]: { label: 'Draft', color: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' },
  [CampaignStatus.SCHEDULED]: { label: 'Scheduled', color: 'bg-amber-50 text-amber-700', dotClass: 'bg-status-warning' },
  [CampaignStatus.SENDING]: { label: 'Sending', color: 'bg-blue-50 text-tw-blue', dotClass: 'bg-tw-blue animate-pulse' },
  [CampaignStatus.SENT]: { label: 'Sent', color: 'bg-green-50 text-green-700', dotClass: 'bg-status-success' },
  [CampaignStatus.PAUSED]: { label: 'Paused', color: 'bg-amber-50 text-amber-700', dotClass: 'bg-status-warning' },
  [CampaignStatus.CANCELLED]: { label: 'Cancelled', color: 'bg-gray-100 text-gray-600', dotClass: 'bg-gray-400' },
};

export const CONTACT_STATUS_CONFIG: Record<number, { label: string; color: string }> = {
  [ContactStatus.ACTIVE]: { label: 'Active', color: 'bg-green-50 text-green-700' },
  [ContactStatus.UNSUBSCRIBED]: { label: 'Unsubscribed', color: 'bg-gray-100 text-gray-600' },
  [ContactStatus.BOUNCED]: { label: 'Bounced', color: 'bg-red-50 text-red-700' },
  [ContactStatus.COMPLAINED]: { label: 'Complained', color: 'bg-red-50 text-red-700' },
  [ContactStatus.CLEANED]: { label: 'Cleaned', color: 'bg-gray-100 text-gray-600' },
};

export const ROLE_LABELS: Record<number, string> = {
  [UserRole.ADMIN]: 'Admin',
  [UserRole.EDITOR]: 'Editor',
  [UserRole.VIEWER]: 'Viewer',
};
