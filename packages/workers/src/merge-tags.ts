import type { Contact } from '@twmail/shared';

const BASE_URL = process.env['BASE_URL'] ?? 'https://mail.thirdwavebbq.com.au';

// Merge tag pattern: {{field_name}} or {{field_name|"fallback"}}
const MERGE_TAG_REGEX = /\{\{(\w+(?:\.\w+)?)(?:\|"([^"]*)")?\}\}/g;

export function processMergeTags(
  html: string,
  contact: Contact,
  messageId: string,
): string {
  return html.replace(MERGE_TAG_REGEX, (_match, field: string, fallback: string | undefined) => {
    const value = resolveField(contact, field, messageId);
    if (value !== null && value !== undefined && value !== '') {
      return String(value);
    }
    return fallback ?? '';
  });
}

function resolveField(
  contact: Contact,
  field: string,
  messageId: string,
): string | null {
  // Special URL tags
  switch (field) {
    case 'unsubscribe_url':
      return `${BASE_URL}/t/u/${messageId}`;
    case 'preferences_url':
      return `${BASE_URL}/t/preferences/${messageId}`;
    case 'webview_url':
      return `${BASE_URL}/t/w/${messageId}`;
  }

  // Custom fields: custom.field_name
  if (field.startsWith('custom.')) {
    const customKey = field.slice(7);
    const val = contact.custom_fields?.[customKey];
    return val != null ? String(val) : null;
  }

  // Standard contact fields
  const standardFields: Record<string, unknown> = {
    first_name: contact.first_name,
    last_name: contact.last_name,
    email: contact.email,
    company: contact.company,
    phone: contact.phone,
    city: contact.city,
    country: contact.country,
  };

  const val = standardFields[field];
  return val != null ? String(val) : null;
}
