export const queryKeys = {
  auth: { me: ['auth', 'me'] as const },
  contacts: {
    all: ['contacts'] as const,
    list: (filters: Record<string, unknown>) => ['contacts', 'list', filters] as const,
    detail: (id: number) => ['contacts', 'detail', id] as const,
    timeline: (id: number) => ['contacts', 'timeline', id] as const,
    messages: (id: number) => ['contacts', 'messages', id] as const,
  },
  campaigns: {
    all: ['campaigns'] as const,
    list: (filters: Record<string, unknown>) => ['campaigns', 'list', filters] as const,
    detail: (id: number) => ['campaigns', 'detail', id] as const,
    report: (id: number) => ['campaigns', 'report', id] as const,
    recipients: (id: number, page: number) => ['campaigns', 'recipients', id, page] as const,
    abResults: (id: number) => ['campaigns', 'ab-results', id] as const,
  },
  templates: {
    all: ['templates'] as const,
    list: (filters: Record<string, unknown>) => ['templates', 'list', filters] as const,
    detail: (id: number) => ['templates', 'detail', id] as const,
  },
  segments: {
    all: ['segments'] as const,
    list: () => ['segments', 'list'] as const,
    detail: (id: number) => ['segments', 'detail', id] as const,
    count: (id: number) => ['segments', 'count', id] as const,
    contacts: (id: number, page: number) => ['segments', 'contacts', id, page] as const,
  },
  lists: {
    all: ['lists'] as const,
    list: () => ['lists', 'list'] as const,
  },
  reports: {
    overview: ['reports', 'overview'] as const,
    growth: (range: string) => ['reports', 'growth', range] as const,
    engagement: ['reports', 'engagement'] as const,
    deliverability: (range: string) => ['reports', 'deliverability', range] as const,
    campaigns: ['reports', 'campaigns'] as const,
  },
  webhooks: {
    all: ['webhooks'] as const,
    list: () => ['webhooks', 'list'] as const,
    detail: (id: number) => ['webhooks', 'detail', id] as const,
    deliveries: (id: number) => ['webhooks', 'deliveries', id] as const,
  },
  assets: {
    all: ['assets'] as const,
    list: (campaignId?: number) => ['assets', 'list', campaignId] as const,
  },
  imports: {
    detail: (id: number) => ['imports', 'detail', id] as const,
    errors: (id: number) => ['imports', 'errors', id] as const,
    mappings: ['imports', 'mappings'] as const,
  },
  settings: { all: ['settings'] as const },
  apiKeys: { list: ['api-keys', 'list'] as const },
  users: {
    all: ['users'] as const,
    list: (filters: Record<string, unknown>) => ['users', 'list', filters] as const,
    detail: (id: number) => ['users', 'detail', id] as const,
  },
};
