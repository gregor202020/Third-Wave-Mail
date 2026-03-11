# TWMail Frontend Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Next.js 15 frontend dashboard for TWMail email marketing platform

**Architecture:** Next.js 15 App Router with route groups for auth and dashboard layouts. TanStack Query for server state, shadcn/ui components styled with Tailwind CSS using Third Wave BBQ brand colors. GrapeJS email editor loaded dynamically.

**Tech Stack:** Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query v5, React Hook Form, Zod, Recharts, GrapeJS + grapesjs-mjml

**Spec:** `docs/superpowers/specs/2026-03-11-frontend-design.md`

---

## File Structure

```
packages/frontend/
  src/
    app/
      layout.tsx                          # Root layout: fonts, QueryProvider, Toaster
      providers.tsx                       # Client-side providers wrapper
      (auth)/
        layout.tsx                        # Centered minimal layout
        login/page.tsx                    # Login form
      (dashboard)/
        layout.tsx                        # Sidebar + TopBar + content
        dashboard/page.tsx                # Dashboard with stats, charts
        contacts/
          page.tsx                        # Contact list + add drawer
          [id]/page.tsx                   # Contact detail with tabs
          import/page.tsx                 # Import flow
        campaigns/
          page.tsx                        # Campaign list
          new/page.tsx                    # Create campaign (accordion)
          [id]/
            edit/page.tsx                 # Edit campaign (accordion)
            report/page.tsx               # Campaign report
        templates/
          page.tsx                        # Template grid
          new/edit/page.tsx               # New template editor
          [id]/edit/page.tsx              # Edit template editor
        segments/
          page.tsx                        # Segment list
          new/edit/page.tsx               # New segment builder
          [id]/page.tsx                   # Segment detail (contacts)
          [id]/edit/page.tsx              # Edit segment builder
        reports/
          page.tsx                        # Reports overview
          campaigns/page.tsx              # Campaign comparison
          deliverability/page.tsx         # Deliverability
        settings/
          page.tsx                        # General settings
          webhooks/page.tsx               # Webhook management
          api-keys/page.tsx               # API keys (placeholder)
          users/page.tsx                  # Users (placeholder)
          domain/page.tsx                 # Domain (placeholder)
      api/
        auth/
          login/route.ts                  # Proxy: sets httpOnly cookie
          logout/route.ts                 # Proxy: clears cookie
          refresh/route.ts                # Proxy: refreshes token
          me/route.ts                     # Proxy: get current user
    components/
      ui/                                 # shadcn/ui primitives (auto-generated)
      layout/
        sidebar.tsx                       # Dark icon sidebar
        top-bar.tsx                       # Context bar with tabs
        nav-config.ts                     # Navigation items config
      shared/
        data-table.tsx                    # Reusable server-paginated table
        status-badge.tsx                  # Color-coded status pills
        empty-state.tsx                   # Empty list placeholder
        confirm-dialog.tsx                # Destructive action confirmation
        page-header.tsx                   # Title + action button pattern
        loading-skeleton.tsx              # Animated placeholders
      campaigns/
        campaign-accordion.tsx            # 7-section campaign form
        campaign-card.tsx                 # Campaign list card
        delivery-funnel.tsx               # Visual delivery funnel
        ab-results.tsx                    # A/B test results table
      contacts/
        contact-profile.tsx               # Contact header + info
        activity-timeline.tsx             # Event timeline
        import-mapper.tsx                 # Column mapping UI
        add-contact-drawer.tsx            # Slide-out create form
      editor/
        grapes-editor.tsx                 # GrapeJS React wrapper (dynamic)
        template-picker.tsx               # Template selection modal
      segments/
        rule-builder.tsx                  # Segment rule builder
        rule-group.tsx                    # AND/OR rule group
        rule-row.tsx                      # Single rule row
      reports/
        stat-card.tsx                     # Dashboard stat card
        bar-chart-widget.tsx              # Bar chart wrapper
        line-chart-widget.tsx             # Line chart wrapper
        donut-chart-widget.tsx            # Donut chart wrapper
        sparkline.tsx                     # Inline sparkline
    lib/
      api-client.ts                       # Fetch wrapper with auth
      query-keys.ts                       # TanStack Query key factory
      utils.ts                            # cn(), formatters
      constants.ts                        # Status colors/labels
    hooks/
      use-auth.ts                         # Auth state hook
      use-debounce.ts                     # Debounced value hook
      use-pagination.ts                   # Pagination state hook
      use-confirm.ts                      # Confirmation dialog hook
    types/
      index.ts                            # Re-exports + frontend types
  public/
    logo.svg
  tailwind.config.ts
  next.config.ts
  package.json
  tsconfig.json
```

---

## Chunk 1: Project Setup & Foundation

### Task 1: Initialize Next.js Project

**Files:**
- Create: `packages/frontend/` (via create-next-app)
- Modify: `package.json` (root workspace)

- [ ] **Step 1: Create Next.js app**

```bash
cd packages
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-turbopack
```

- [ ] **Step 2: Update root package.json workspaces**

In root `package.json`, ensure workspaces includes frontend:
```json
"workspaces": ["packages/shared", "packages/api", "packages/workers", "packages/frontend"]
```

- [ ] **Step 3: Add @twmail/shared dependency**

```bash
cd packages/frontend
npm install @twmail/shared@* --workspace=packages/frontend
```

Or add to packages/frontend/package.json dependencies: `"@twmail/shared": "*"`

- [ ] **Step 4: Create .env.local**

Create `packages/frontend/.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:3000
API_URL=http://localhost:3000
```

- [ ] **Step 5: Update tsconfig.json**

In `packages/frontend/tsconfig.json`, add reference to shared:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 6: Verify it builds**

```bash
cd packages/frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend package.json package-lock.json
git commit -m "feat: initialize Next.js 15 frontend package"
```

---

### Task 2: Install Dependencies

**Files:**
- Modify: `packages/frontend/package.json`

- [ ] **Step 1: Install core dependencies**

```bash
cd packages/frontend
npm install @tanstack/react-query @tanstack/react-query-devtools
npm install react-hook-form @hookform/resolvers zod
npm install recharts
npm install lucide-react
npm install sonner
npm install clsx tailwind-merge
```

- [ ] **Step 2: Install shadcn/ui**

```bash
cd packages/frontend
npx shadcn@latest init
```

When prompted:
- Style: New York
- Base color: Neutral
- CSS variables: Yes

- [ ] **Step 3: Add shadcn components we'll need**

```bash
npx shadcn@latest add button input label card table dialog alert-dialog dropdown-menu tabs badge separator skeleton sheet select checkbox radio-group switch slider popover command calendar form toast textarea tooltip avatar scroll-area
```

- [ ] **Step 4: Install GrapeJS (for later)**

```bash
npm install grapesjs grapesjs-mjml @grapesjs/react
```

- [ ] **Step 5: Verify build still works**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add -A packages/frontend
git commit -m "feat: install frontend dependencies and shadcn/ui"
```

---

### Task 3: Configure Tailwind with Brand Colors

**Files:**
- Modify: `packages/frontend/tailwind.config.ts`
- Modify: `packages/frontend/src/app/globals.css`

- [ ] **Step 1: Update tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Third Wave BBQ brand
        tw: {
          blue: "#0170B9",
          "blue-dark": "#015A94",
          "blue-light": "rgba(1,112,185,0.08)",
          "blue-tint": "rgba(1,112,185,0.15)",
          red: "#C41E2A",
          "red-dark": "#A01520",
          black: "#0A0A0A",
        },
        // Semantic
        surface: "#FAFAFA",
        card: {
          DEFAULT: "#FFFFFF",
          border: "#E8E8E8",
        },
        text: {
          primary: "#1A1A1A",
          secondary: "#4B4F58",
          muted: "#999999",
        },
        status: {
          success: "#22C55E",
          warning: "#F59E0B",
          danger: "#EF4444",
        },
        // shadcn/ui tokens (keep defaults from init)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/tailwind.config.ts packages/frontend/src/app/globals.css
git commit -m "feat: configure Tailwind with Third Wave brand colors"
```

---

### Task 4: Create Foundation Files

**Files:**
- Create: `packages/frontend/src/lib/api-client.ts`
- Create: `packages/frontend/src/lib/query-keys.ts`
- Create: `packages/frontend/src/lib/utils.ts`
- Create: `packages/frontend/src/lib/constants.ts`
- Create: `packages/frontend/src/types/index.ts`
- Create: `packages/frontend/src/hooks/use-debounce.ts`
- Create: `packages/frontend/src/hooks/use-pagination.ts`
- Create: `packages/frontend/src/app/providers.tsx`
- Modify: `packages/frontend/src/app/layout.tsx`

- [ ] **Step 1: Create lib/api-client.ts**

```typescript
type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

class ApiError extends Error {
  code: string;
  status: number;
  details?: Array<{ field: string; message: string }>;

  constructor(status: number, code: string, message: string, details?: Array<{ field: string; message: string }>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;

  const config: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  };

  if (body) {
    config.body = JSON.stringify(body);
  }

  const baseUrl = typeof window === 'undefined'
    ? process.env.API_URL || 'http://localhost:3000'
    : '';

  // Client-side calls go through Next.js proxy at /api/proxy/*
  // Server-side calls go directly to the API
  const url = typeof window === 'undefined'
    ? `${baseUrl}${endpoint}`
    : `/api/proxy${endpoint}`;

  const res = await fetch(url, config);

  if (res.status === 204) return undefined as T;

  const json = await res.json();

  if (!res.ok) {
    const error = json.error || {};
    throw new ApiError(
      res.status,
      error.code || 'UNKNOWN',
      error.message || 'An error occurred',
      error.details
    );
  }

  return json;
}

// Convenience methods
export const api = {
  get: <T>(endpoint: string) => apiClient<T>(endpoint),
  post: <T>(endpoint: string, body?: unknown) => apiClient<T>(endpoint, { method: 'POST', body }),
  patch: <T>(endpoint: string, body?: unknown) => apiClient<T>(endpoint, { method: 'PATCH', body }),
  delete: <T>(endpoint: string) => apiClient<T>(endpoint, { method: 'DELETE' }),
  upload: async <T>(endpoint: string, formData: FormData): Promise<T> => {
    const res = await fetch(`/api/proxy${endpoint}`, {
      method: 'POST',
      body: formData,
      credentials: 'include',
    });
    const json = await res.json();
    if (!res.ok) {
      const error = json.error || {};
      throw new ApiError(res.status, error.code || 'UNKNOWN', error.message || 'Upload failed', error.details);
    }
    return json;
  },
};

export { ApiError };
```

- [ ] **Step 2: Create lib/query-keys.ts**

```typescript
export const queryKeys = {
  auth: {
    me: ['auth', 'me'] as const,
  },
  contacts: {
    all: ['contacts'] as const,
    list: (filters: Record<string, unknown>) => ['contacts', 'list', filters] as const,
    detail: (id: number) => ['contacts', 'detail', id] as const,
    timeline: (id: number) => ['contacts', 'timeline', id] as const,
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
  apiKeys: {
    list: ['api-keys', 'list'] as const,
  },
};
```

- [ ] **Step 3: Create lib/utils.ts**

```typescript
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatPercent(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  }).format(new Date(date));
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date));
}

export function timeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return formatDate(date);
}
```

- [ ] **Step 4: Create lib/constants.ts**

```typescript
import { CampaignStatus, ContactStatus, MessageStatus, UserRole } from '@twmail/shared';

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
```

- [ ] **Step 5: Create types/index.ts**

```typescript
// Re-export shared types for frontend use
export type {
  User, Contact, Campaign, Template, Segment,
  Asset, Import, Event, Message,
  CampaignVariant, WebhookEndpoint, WebhookDelivery,
  List, ApiKey,
  PaginatedResponse, PaginationParams, PaginationMeta,
  SegmentRule, SegmentRuleGroup,
} from '@twmail/shared';

export {
  CampaignStatus, ContactStatus, MessageStatus, EventType,
  UserRole, ImportStatus, ImportType, SegmentType, StorageType,
  WebhookDeliveryStatus, ErrorCode,
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

export interface ApiListResponse<T> {
  data: T[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}
```

- [ ] **Step 6: Create hooks/use-debounce.ts**

```typescript
'use client';
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}
```

- [ ] **Step 7: Create hooks/use-pagination.ts**

```typescript
'use client';
import { useState, useCallback } from 'react';

export function usePagination(initialPage = 1, initialPerPage = 50) {
  const [page, setPage] = useState(initialPage);
  const [perPage, setPerPage] = useState(initialPerPage);

  const nextPage = useCallback(() => setPage(p => p + 1), []);
  const prevPage = useCallback(() => setPage(p => Math.max(1, p - 1)), []);
  const goToPage = useCallback((p: number) => setPage(p), []);
  const reset = useCallback(() => setPage(1), []);

  return { page, perPage, setPerPage, nextPage, prevPage, goToPage, reset };
}
```

- [ ] **Step 8: Create app/providers.tsx**

```typescript
'use client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 9: Update app/layout.tsx**

```typescript
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "TWMail",
  description: "Email marketing platform for Third Wave BBQ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Providers>
          {children}
          <Toaster position="bottom-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 10: Verify build**

```bash
cd packages/frontend && npm run build
```

- [ ] **Step 11: Commit**

```bash
git add packages/frontend/src
git commit -m "feat: add foundation files - api client, query keys, utils, providers"
```

---

## Chunk 2: Layout & Auth

### Task 5: Layout Components

**Files:**
- Create: `packages/frontend/src/components/layout/nav-config.ts`
- Create: `packages/frontend/src/components/layout/sidebar.tsx`
- Create: `packages/frontend/src/components/layout/top-bar.tsx`
- Create: `packages/frontend/src/app/(dashboard)/layout.tsx`
- Create: `packages/frontend/src/app/(auth)/layout.tsx`

- [ ] **Step 1: Create nav-config.ts**

```typescript
import {
  LayoutDashboard, Users, Send, FileText, Filter, BarChart3, Settings,
} from 'lucide-react';

export const navItems = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' },
  { icon: Users, label: 'Contacts', href: '/contacts' },
  { icon: Send, label: 'Campaigns', href: '/campaigns' },
  { icon: FileText, label: 'Templates', href: '/templates' },
  { icon: Filter, label: 'Segments', href: '/segments' },
  { icon: BarChart3, label: 'Reports', href: '/reports' },
] as const;

export const bottomNavItems = [
  { icon: Settings, label: 'Settings', href: '/settings' },
] as const;

// Sub-tabs per section
export const sectionTabs: Record<string, Array<{ label: string; href: string }>> = {
  '/campaigns': [
    { label: 'All', href: '/campaigns' },
    { label: 'Drafts', href: '/campaigns?status=1' },
    { label: 'Scheduled', href: '/campaigns?status=2' },
    { label: 'Sent', href: '/campaigns?status=4' },
  ],
  '/contacts': [
    { label: 'All', href: '/contacts' },
    { label: 'Active', href: '/contacts?status=1' },
    { label: 'Unsubscribed', href: '/contacts?status=2' },
    { label: 'Bounced', href: '/contacts?status=3' },
  ],
  '/reports': [
    { label: 'Overview', href: '/reports' },
    { label: 'Campaigns', href: '/reports/campaigns' },
    { label: 'Deliverability', href: '/reports/deliverability' },
  ],
  '/settings': [
    { label: 'General', href: '/settings' },
    { label: 'Webhooks', href: '/settings/webhooks' },
    { label: 'API Keys', href: '/settings/api-keys' },
    { label: 'Users', href: '/settings/users' },
    { label: 'Domain', href: '/settings/domain' },
  ],
};
```

- [ ] **Step 2: Create sidebar.tsx**

```typescript
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems, bottomNavItems } from './nav-config';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export function Sidebar() {
  const pathname = usePathname();

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="w-[68px] bg-tw-black flex flex-col items-center py-4 gap-1.5 shrink-0 border-r border-white/5">
        {/* Logo */}
        <Link href="/dashboard" className="mb-4">
          <div className="w-10 h-10 bg-gradient-to-br from-tw-red to-tw-red-dark rounded-xl flex items-center justify-center text-white text-sm font-extrabold shadow-lg shadow-tw-red/30">
            TW
          </div>
        </Link>

        {/* Main nav */}
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  href={item.href}
                  className={cn(
                    'relative w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
                    isActive
                      ? 'bg-tw-blue-tint text-tw-blue'
                      : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                  )}
                >
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-tw-blue rounded-r" />
                  )}
                  <item.icon className="w-[18px] h-[18px]" strokeWidth={2} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="mt-auto flex flex-col items-center gap-1.5">
          {/* Settings */}
          {bottomNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      'w-10 h-10 rounded-[10px] flex items-center justify-center transition-colors',
                      isActive
                        ? 'bg-tw-blue-tint text-tw-blue'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    )}
                  >
                    <item.icon className="w-[18px] h-[18px]" strokeWidth={2} />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* User avatar */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-7 h-7 bg-white/10 rounded-full flex items-center justify-center text-[11px] text-white/60 font-semibold hover:bg-white/20 transition-colors">
                G
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-40">
              <DropdownMenuItem asChild>
                <Link href="/settings">Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem className="text-status-danger">
                <LogOut className="w-4 h-4 mr-2" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>
    </TooltipProvider>
  );
}
```

- [ ] **Step 3: Create top-bar.tsx**

```typescript
'use client';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { navItems, sectionTabs } from './nav-config';
import { Input } from '@/components/ui/input';

interface TopBarProps {
  action?: React.ReactNode;
}

export function TopBar({ action }: TopBarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Find current section
  const currentSection = navItems.find(item => pathname.startsWith(item.href));
  const sectionPath = currentSection?.href || pathname;
  const tabs = sectionTabs[sectionPath] || [];
  const title = currentSection?.label || 'TWMail';

  return (
    <header className="h-[52px] bg-white border-b border-card-border flex items-center px-7 shrink-0">
      <h1 className="text-sm font-semibold text-text-primary tracking-tight">{title}</h1>

      {tabs.length > 0 && (
        <nav className="flex items-center gap-5 ml-8">
          {tabs.map((tab) => {
            const isActive = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '') === tab.href
              || (tab.href === sectionPath && pathname === sectionPath && !searchParams.toString());
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  'text-xs transition-colors',
                  isActive
                    ? 'text-tw-blue font-medium bg-tw-blue-light px-2.5 py-0.5 rounded-full'
                    : 'text-text-muted hover:text-text-secondary'
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      <div className="ml-auto flex items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted" />
          <Input
            placeholder="Search..."
            className="w-48 h-8 pl-9 text-xs bg-surface border-card-border"
          />
        </div>
        {action}
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Create dashboard layout**

```typescript
// packages/frontend/src/app/(dashboard)/layout.tsx
import { Sidebar } from '@/components/layout/sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-surface">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create auth layout**

```typescript
// packages/frontend/src/app/(auth)/layout.tsx
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="w-12 h-12 bg-gradient-to-br from-tw-red to-tw-red-dark rounded-xl flex items-center justify-center text-white text-lg font-extrabold shadow-lg shadow-tw-red/30">
            TW
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
cd packages/frontend && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/components/layout packages/frontend/src/app
git commit -m "feat: add sidebar, top bar, and layout components"
```

---

### Task 6: Auth System

**Files:**
- Create: `packages/frontend/src/hooks/use-auth.ts`
- Create: `packages/frontend/src/app/api/proxy/[...path]/route.ts`
- Create: `packages/frontend/src/app/(auth)/login/page.tsx`
- Modify: `packages/frontend/next.config.ts`

- [ ] **Step 1: Create API proxy route**

This single catch-all route proxies all `/api/proxy/*` requests to the backend, attaching the auth token from the httpOnly cookie.

```typescript
// packages/frontend/src/app/api/proxy/[...path]/route.ts
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function proxyRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const targetPath = `/api/${path.join('/')}`;
  const url = new URL(targetPath, API_URL);

  // Forward query params
  req.nextUrl.searchParams.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  const cookieStore = await cookies();
  const token = cookieStore.get('twmail_token')?.value;

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    headers['Content-Type'] = 'application/json';
  }

  let body: BodyInit | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    if (contentType.includes('multipart/form-data')) {
      body = await req.blob();
      // Let fetch set the content-type with boundary
    } else {
      body = await req.text();
    }
  }

  const res = await fetch(url.toString(), {
    method: req.method,
    headers,
    body,
  });

  const responseData = res.status === 204 ? null : await res.text();

  // Handle login: extract token and set cookie
  if (targetPath === '/api/auth/login' && res.ok && responseData) {
    const json = JSON.parse(responseData);
    const response = NextResponse.json(json);
    response.cookies.set('twmail_token', json.data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24h
    });
    if (json.data.refresh_token) {
      response.cookies.set('twmail_refresh', json.data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7d
      });
    }
    return response;
  }

  // Handle logout: clear cookies
  if (targetPath === '/api/auth/logout') {
    const response = res.status === 204
      ? new NextResponse(null, { status: 204 })
      : NextResponse.json(responseData ? JSON.parse(responseData) : {});
    response.cookies.delete('twmail_token');
    response.cookies.delete('twmail_refresh');
    return response;
  }

  if (res.status === 204) {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(responseData, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PATCH = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
```

- [ ] **Step 2: Create use-auth hook**

```typescript
'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import type { AuthUser, ApiResponse } from '@/types';

export function useAuth() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: queryKeys.auth.me,
    queryFn: () => api.get<ApiResponse<AuthUser>>('/auth/me').then(r => r.data),
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.post<ApiResponse<{ access_token: string }>>('/auth/login', credentials),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.auth.me });
      router.push('/dashboard');
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      router.push('/login');
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    loginError: loginMutation.error,
    loginPending: loginMutation.isPending,
    logout: logoutMutation.mutate,
  };
}
```

- [ ] **Step 3: Create login page**

```typescript
'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { login, loginError, loginPending } = useAuth();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      await login(data);
    } catch {
      // Error handled by loginError
    }
  };

  return (
    <Card className="border-card-border">
      <CardHeader className="text-center">
        <CardTitle className="text-xl font-semibold tracking-tight">Sign in to TWMail</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} placeholder="you@thirdwavebbq.com.au" />
            {errors.email && <p className="text-xs text-status-danger">{errors.email.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" {...register('password')} />
            {errors.password && <p className="text-xs text-status-danger">{errors.password.message}</p>}
          </div>
          {loginError && (
            <p className="text-xs text-status-danger text-center">Invalid email or password</p>
          )}
          <Button type="submit" className="w-full bg-tw-blue hover:bg-tw-blue-dark" disabled={loginPending}>
            {loginPending ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Add root redirect**

```typescript
// packages/frontend/src/app/page.tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/dashboard');
}
```

- [ ] **Step 5: Verify build**

```bash
cd packages/frontend && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add packages/frontend/src
git commit -m "feat: add auth system with login page and API proxy"
```

---

## Chunk 3: Shared Components

### Task 7: Shared UI Components

**Files:**
- Create: `packages/frontend/src/components/shared/page-header.tsx`
- Create: `packages/frontend/src/components/shared/status-badge.tsx`
- Create: `packages/frontend/src/components/shared/empty-state.tsx`
- Create: `packages/frontend/src/components/shared/confirm-dialog.tsx`
- Create: `packages/frontend/src/components/shared/loading-skeleton.tsx`
- Create: `packages/frontend/src/components/shared/data-table.tsx`

- [ ] **Step 1: Create page-header.tsx**

```typescript
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h2 className="text-xl font-semibold text-text-primary tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-text-muted mt-1">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
```

- [ ] **Step 2: Create status-badge.tsx**

```typescript
import { cn } from '@/lib/utils';
import { CAMPAIGN_STATUS_CONFIG, CONTACT_STATUS_CONFIG } from '@/lib/constants';

interface StatusBadgeProps {
  type: 'campaign' | 'contact';
  status: number;
}

export function StatusBadge({ type, status }: StatusBadgeProps) {
  const config = type === 'campaign'
    ? CAMPAIGN_STATUS_CONFIG[status]
    : CONTACT_STATUS_CONFIG[status];

  if (!config) return null;

  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium', config.color)}>
      {config.label}
    </span>
  );
}

interface StatusDotProps {
  status: number;
  className?: string;
}

export function CampaignStatusDot({ status, className }: StatusDotProps) {
  const config = CAMPAIGN_STATUS_CONFIG[status];
  if (!config) return null;
  return <div className={cn('w-2 h-2 rounded-full', config.dotClass, className)} />;
}
```

- [ ] **Step 3: Create empty-state.tsx**

```typescript
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-surface flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-text-muted" />
      </div>
      <h3 className="text-sm font-medium text-text-primary mb-1">{title}</h3>
      <p className="text-xs text-text-muted max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-4 bg-tw-blue hover:bg-tw-blue-dark" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create confirm-dialog.tsx**

```typescript
'use client';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirm', destructive, onConfirm,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? 'bg-status-danger hover:bg-red-600' : 'bg-tw-blue hover:bg-tw-blue-dark'}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 5: Create loading-skeleton.tsx**

```typescript
import { Skeleton } from '@/components/ui/skeleton';

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <Skeleton className="h-3 w-20 mb-2" />
      <Skeleton className="h-8 w-24 mb-2" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

export function ChartSkeleton() {
  return <Skeleton className="h-48 w-full rounded-[14px]" />;
}
```

- [ ] **Step 6: Create data-table.tsx**

```typescript
'use client';
import { useState } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { TableSkeleton } from './loading-skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total: number;
  page: number;
  perPage: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<number>;
  onSelectionChange?: (ids: Set<number>) => void;
  getId?: (item: T) => number;
  bulkActions?: React.ReactNode;
}

export function DataTable<T>({
  columns, data, total, page, perPage, onPageChange, isLoading,
  selectable, selectedIds = new Set(), onSelectionChange, getId,
  bulkActions,
}: DataTableProps<T>) {
  const totalPages = Math.ceil(total / perPage);

  if (isLoading) return <TableSkeleton rows={5} cols={columns.length} />;

  const allSelected = data.length > 0 && getId && data.every(item => selectedIds.has(getId(item)));

  const toggleAll = () => {
    if (!getId || !onSelectionChange) return;
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(data.map(item => getId(item))));
    }
  };

  const toggleOne = (id: number) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectionChange(next);
  };

  return (
    <div>
      {/* Bulk action bar */}
      {selectedIds.size > 0 && bulkActions && (
        <div className="mb-3 p-3 bg-tw-blue-light border border-tw-blue/20 rounded-lg flex items-center gap-3">
          <span className="text-xs text-tw-blue font-medium">{selectedIds.size} selected</span>
          {bulkActions}
        </div>
      )}

      <div className="border border-card-border rounded-[14px] bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
              )}
              {columns.map(col => (
                <TableHead key={col.key} className={col.className}>
                  <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
                    {col.header}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item, i) => {
              const id = getId?.(item);
              return (
                <TableRow key={id ?? i} className="hover:bg-surface/50">
                  {selectable && id !== undefined && (
                    <TableCell>
                      <Checkbox checked={selectedIds.has(id)} onCheckedChange={() => toggleOne(id)} />
                    </TableCell>
                  )}
                  {columns.map(col => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render(item)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-text-muted">
            Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs text-text-secondary px-2">Page {page} of {totalPages}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify build**

```bash
cd packages/frontend && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/components/shared
git commit -m "feat: add shared UI components - DataTable, StatusBadge, EmptyState, ConfirmDialog"
```

---

## Chunk 4: Dashboard & Report Components

### Task 8: Report Widget Components

**Files:**
- Create: `packages/frontend/src/components/reports/stat-card.tsx`
- Create: `packages/frontend/src/components/reports/bar-chart-widget.tsx`
- Create: `packages/frontend/src/components/reports/line-chart-widget.tsx`
- Create: `packages/frontend/src/components/reports/donut-chart-widget.tsx`
- Create: `packages/frontend/src/components/reports/sparkline.tsx`

- [ ] **Step 1: Create stat-card.tsx**

```typescript
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string;
  trend?: string;
  trendUp?: boolean;
  variant?: 'default' | 'blue-gradient';
  subtitle?: string;
}

export function StatCard({ label, value, trend, trendUp, variant = 'default', subtitle }: StatCardProps) {
  if (variant === 'blue-gradient') {
    return (
      <div className="bg-gradient-to-br from-tw-blue to-tw-blue-dark rounded-[14px] p-5 text-white relative overflow-hidden">
        <div className="absolute right-[-20px] top-[-20px] w-20 h-20 bg-white/10 rounded-full" />
        <div className="text-[10px] uppercase tracking-[1px] opacity-70">{label}</div>
        <div className="text-[32px] font-bold mt-1 tracking-tight">{value}</div>
        {subtitle && <div className="text-[11px] opacity-70 mt-1">{subtitle}</div>}
      </div>
    );
  }

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <div className="text-[10px] uppercase tracking-[1px] text-text-muted">{label}</div>
      <div className="text-[26px] font-bold text-text-primary mt-1 tracking-tight">{value}</div>
      {trend && (
        <div className="flex items-center gap-1 mt-1">
          <div className={cn('w-1.5 h-1.5 rounded-full', trendUp ? 'bg-status-success' : 'bg-status-danger')} />
          <span className={cn('text-[11px]', trendUp ? 'text-status-success' : 'text-status-danger')}>{trend}</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create bar-chart-widget.tsx**

```typescript
'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface BarChartWidgetProps {
  title: string;
  subtitle?: string;
  data: Array<{ label: string; value: number }>;
  highlightMax?: boolean;
}

export function BarChartWidget({ title, subtitle, data, highlightMax = true }: BarChartWidgetProps) {
  const maxValue = Math.max(...data.map(d => d.value));

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        {subtitle && <span className="text-[11px] text-text-muted">{subtitle}</span>}
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8e8e8' }}
            cursor={{ fill: 'rgba(0,0,0,0.02)' }}
          />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={highlightMax && entry.value === maxValue ? '#C41E2A' : '#0170B9'}
                fillOpacity={highlightMax && entry.value === maxValue ? 1 : 0.7}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 3: Create line-chart-widget.tsx, donut-chart-widget.tsx, sparkline.tsx**

```typescript
// line-chart-widget.tsx
'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface LineChartWidgetProps {
  title: string;
  subtitle?: string;
  data: Array<Record<string, unknown>>;
  lines: Array<{ dataKey: string; color: string; dashed?: boolean }>;
  xDataKey: string;
  height?: number;
}

export function LineChartWidget({ title, subtitle, data, lines, xDataKey, height = 200 }: LineChartWidgetProps) {
  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-semibold text-text-primary">{title}</span>
        <div className="flex items-center gap-3">
          {lines.map(l => (
            <span key={l.dataKey} className="flex items-center gap-1 text-[10px]" style={{ color: l.color }}>
              <span className="w-2 h-[3px] rounded-full inline-block" style={{ background: l.color }} />
              {l.dataKey}
            </span>
          ))}
          {subtitle && <span className="text-[11px] text-text-muted">{subtitle}</span>}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <XAxis dataKey={xDataKey} tick={{ fontSize: 10, fill: '#999' }} axisLine={false} tickLine={false} />
          <YAxis hide />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e8e8e8' }} />
          {lines.map(l => (
            <Line
              key={l.dataKey}
              type="monotone"
              dataKey={l.dataKey}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.dashed ? '4 3' : undefined}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

```typescript
// donut-chart-widget.tsx
'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DonutChartWidgetProps {
  title: string;
  data: Array<{ name: string; value: number; color: string }>;
}

export function DonutChartWidget({ title, data }: DonutChartWidgetProps) {
  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <span className="text-sm font-semibold text-text-primary">{title}</span>
      <div className="flex items-center gap-6 mt-4">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={data} innerRadius={35} outerRadius={55} dataKey="value" strokeWidth={0}>
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex flex-col gap-2">
          {data.map(d => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
              <span className="text-xs text-text-secondary">{d.name}</span>
              <span className="text-xs font-medium text-text-primary">{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

```typescript
// sparkline.tsx
'use client';
import { LineChart, Line, ResponsiveContainer } from 'recharts';

interface SparklineProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}

export function Sparkline({ data, color = '#0170B9', width = 80, height = 24 }: SparklineProps) {
  const chartData = data.map((value, i) => ({ i, value }));
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={chartData}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/reports
git commit -m "feat: add report widget components - stat cards, charts, sparklines"
```

---

### Task 9: Dashboard Page

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Create dashboard page**

```typescript
'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { TopBar } from '@/components/layout/top-bar';
import { StatCard } from '@/components/reports/stat-card';
import { BarChartWidget } from '@/components/reports/bar-chart-widget';
import { StatCardSkeleton, ChartSkeleton } from '@/components/shared/loading-skeleton';
import { CampaignStatusDot } from '@/components/shared/status-badge';
import { formatNumber, formatPercent, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Plus, Upload, BarChart3 } from 'lucide-react';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.reports.overview,
    queryFn: () => api.get<{ data: any }>('/reports/overview').then(r => r.data),
  });

  return (
    <>
      <TopBar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
            ) : (
              <>
                <StatCard
                  variant="blue-gradient"
                  label="Total Contacts"
                  value={formatNumber(data?.total_contacts ?? 0)}
                  subtitle={`+${formatNumber(data?.new_contacts_this_month ?? 0)} this month`}
                />
                <StatCard label="Open Rate" value={formatPercent(data?.avg_open_rate ?? 0)} trend="+3.2%" trendUp />
                <StatCard label="Click Rate" value={formatPercent(data?.avg_click_rate ?? 0)} trend="+1.1%" trendUp />
                <StatCard label="Bounce Rate" value={formatPercent(data?.avg_bounce_rate ?? 0)} trend="Healthy" trendUp />
              </>
            )}
          </div>

          <div className="grid grid-cols-5 gap-3">
            {/* Chart */}
            <div className="col-span-3">
              {isLoading ? <ChartSkeleton /> : (
                <BarChartWidget
                  title="Send Volume"
                  subtitle="Last 7 days"
                  data={data?.daily_sends?.map((d: any) => ({ label: d.day, value: d.count })) ?? []}
                />
              )}
            </div>

            {/* Recent + Quick Actions */}
            <div className="col-span-2 space-y-3">
              <div className="bg-card border border-card-border rounded-[14px] p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">Recent Campaigns</h3>
                <div className="space-y-3">
                  {data?.recent_campaigns?.slice(0, 4).map((c: any) => (
                    <Link key={c.id} href={`/campaigns/${c.id}/report`} className="flex items-center gap-3 group">
                      <CampaignStatusDot status={c.status} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary truncate group-hover:text-tw-blue transition-colors">{c.name}</div>
                        <div className="text-[10px] text-text-muted">{c.total_sent ? `${formatPercent(c.open_rate)} opened` : 'Draft'}</div>
                      </div>
                      <span className="text-[10px] text-text-muted">{timeAgo(c.created_at)}</span>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="bg-card border border-card-border rounded-[14px] p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <Link href="/campaigns/new" className="flex items-center gap-2 px-3 py-2.5 bg-surface rounded-lg text-xs text-text-primary font-medium hover:bg-tw-blue-light transition-colors">
                    <div className="w-1.5 h-1.5 bg-tw-blue rounded-sm" /> New Campaign
                  </Link>
                  <Link href="/contacts/import" className="flex items-center gap-2 px-3 py-2.5 bg-surface rounded-lg text-xs text-text-primary font-medium hover:bg-tw-blue-light transition-colors">
                    <div className="w-1.5 h-1.5 bg-tw-red rounded-sm" /> Import Contacts
                  </Link>
                  <Link href="/reports" className="flex items-center gap-2 px-3 py-2.5 bg-surface rounded-lg text-xs text-text-primary font-medium hover:bg-tw-blue-light transition-colors">
                    <div className="w-1.5 h-1.5 bg-text-primary rounded-sm" /> View Reports
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
cd packages/frontend && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/app
git commit -m "feat: add dashboard page with stats, charts, and quick actions"
```

---

## Chunk 5: Contacts Pages

### Task 10: Contacts List & Detail

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/contacts/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/contacts/[id]/page.tsx`
- Create: `packages/frontend/src/components/contacts/add-contact-drawer.tsx`
- Create: `packages/frontend/src/components/contacts/activity-timeline.tsx`

These pages follow the same pattern: useQuery for data, DataTable for lists, tabs for details. The implementing agent should build each following the established patterns from the dashboard page. Key points:

- [ ] **Step 1: Create contacts list page** — Uses DataTable with columns: Name, Email, Status (StatusBadge), Lists, Last Activity (timeAgo), Created (formatDate). Filter tabs from TopBar. Add contact button opens AddContactDrawer (shadcn Sheet with React Hook Form).

- [ ] **Step 2: Create add-contact-drawer.tsx** — Sheet component with form: email (required), first_name, last_name, phone, company. Uses `api.post('/contacts', data)` mutation. Invalidates contacts query on success. Toast on success/error.

- [ ] **Step 3: Create contact detail page** — Uses `useQuery` with `queryKeys.contacts.detail(id)`. Tabs component (shadcn Tabs): Overview (custom fields, lists), Activity (timeline), Campaigns (table of messages). Profile header with StatusBadge, Edit/Unsubscribe/Delete buttons.

- [ ] **Step 4: Create activity-timeline.tsx** — Fetches `GET /contacts/:id/timeline`. Maps EventType to labels and colors. Renders as vertical timeline with dots and lines.

- [ ] **Step 5: Verify build and commit**

```bash
git add packages/frontend/src/app/\(dashboard\)/contacts packages/frontend/src/components/contacts
git commit -m "feat: add contacts list, detail, and add contact drawer"
```

---

### Task 11: Contact Import

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/contacts/import/page.tsx`
- Create: `packages/frontend/src/components/contacts/import-mapper.tsx`

- [ ] **Step 1: Create import page** — Two-tab layout: Paste (textarea) or Upload (file input). On submit, calls `api.post('/contacts/import/paste', { text })` or uploads CSV via `api.upload('/contacts/import/csv', formData)`. Shows progress via polling `GET /imports/:id` every 2s. Shows completion summary + error table.

- [ ] **Step 2: Create import-mapper.tsx** — Column mapping UI: left side shows detected columns, right side shows dropdown of TWMail fields. Auto-maps common names. Save/load presets via `GET/POST /contacts/import/mappings`.

- [ ] **Step 3: Verify build and commit**

```bash
git commit -m "feat: add contact import flow with paste, CSV upload, and column mapping"
```

---

## Chunk 6: Campaigns

### Task 12: Campaign List

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/campaigns/page.tsx`
- Create: `packages/frontend/src/components/campaigns/campaign-card.tsx`

- [ ] **Step 1: Create campaign list page** — Status filter tabs (All/Draft/Scheduled/Sending/Sent/Paused/Cancelled) via TopBar. "New Campaign" button (red, `bg-tw-red`). DataTable or card view toggle. Each campaign: name, StatusBadge, recipients, open rate, date. Action dropdown: Edit, Duplicate, Pause, Cancel, Delete with ConfirmDialog.

- [ ] **Step 2: Implement mutations** — Duplicate → `api.post('/campaigns/:id/duplicate')` → redirect to new edit page. Pause → `api.post('/campaigns/:id/pause')`. Cancel → `api.post('/campaigns/:id/cancel')`. Delete → `api.delete('/campaigns/:id')`. All invalidate campaign list.

- [ ] **Step 3: Verify build and commit**

```bash
git commit -m "feat: add campaigns list page with actions"
```

---

### Task 13: Campaign Create/Edit Accordion

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/campaigns/new/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/campaigns/[id]/edit/page.tsx`
- Create: `packages/frontend/src/components/campaigns/campaign-accordion.tsx`

This is the most complex component. The accordion has 7 collapsible sections.

- [ ] **Step 1: Create campaign-accordion.tsx** — Uses shadcn Accordion or custom collapsible sections. Each section: numbered header with check/pending icon, content area. Sections: Setup, Recipients, Design, Scheduling, A/B Testing, Resend, Review & Send. Each section is a sub-component with its own form fields.

Key implementation details:
- Form state managed by a single React Hook Form instance wrapping all sections
- Section 1 (Setup): name, subject, preview_text, from_name, from_email inputs
- Section 2 (Recipients): segment/list picker (searchable Select), estimated count display, exclude segment
- Section 3 (Design): opens template picker modal → then GrapeJS editor (Task 15)
- Section 4 (Scheduling): radio group — Send Now / Schedule (with date+time+timezone pickers)
- Section 5 (A/B Testing): toggle Switch. When on: test variable select, variant inputs, test audience Slider, win criteria Select, auto-send toggle, duration Select
- Section 6 (Resend): toggle Switch. When on: delay Select, subject radio, engaged-only toggle, max resends radio
- Section 7 (Review): read-only summary of all fields, pre-send checklist (auto-validated), Send/Schedule button

- [ ] **Step 2: Create new campaign page** — Calls `api.post('/campaigns', { name: 'Untitled Campaign' })` to create draft, then redirects to edit page.

- [ ] **Step 3: Create edit campaign page** — Loads campaign via `useQuery`, passes to CampaignAccordion. Save: `api.patch('/campaigns/:id', data)`. Send: `api.post('/campaigns/:id/send')` → redirect to report. Schedule: `api.post('/campaigns/:id/schedule', { scheduled_at, timezone })` → redirect to report.

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat: add campaign create/edit with 7-section accordion"
```

---

### Task 14: Campaign Report

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/campaigns/[id]/report/page.tsx`
- Create: `packages/frontend/src/components/campaigns/delivery-funnel.tsx`
- Create: `packages/frontend/src/components/campaigns/ab-results.tsx`

- [ ] **Step 1: Create delivery-funnel.tsx** — Visual horizontal funnel: Sent → Delivered → Opened → Clicked. Each step shows count and percentage. CSS bars with decreasing widths. Blue to red gradient.

- [ ] **Step 2: Create ab-results.tsx** — Table comparing variants: name, sent, opens, open rate, clicks, click rate, win probability. Winner highlighted with badge. Only shown when campaign has A/B test enabled.

- [ ] **Step 3: Create report page** — Fetches campaign report via `GET /campaigns/:id/report`. Shows: delivery funnel, timeline LineChartWidget (opens/clicks over time with blue/red lines), A/B results (if applicable), recipient DataTable, bounce/complaint expandable section. Polls every 5s if campaign status is SENDING (progress bar).

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat: add campaign report page with funnel, charts, and A/B results"
```

---

## Chunk 7: Email Editor & Templates

### Task 15: GrapeJS Editor Integration

**Files:**
- Create: `packages/frontend/src/components/editor/grapes-editor.tsx`
- Create: `packages/frontend/src/components/editor/template-picker.tsx`

- [ ] **Step 1: Create grapes-editor.tsx** — Dynamic import (`next/dynamic` with `ssr: false`). Wraps `@grapesjs/react` GjsEditor component. Configures grapesjs-mjml plugin. Asset manager configured with `api.upload('/assets/upload')` and `api.get('/assets')`. Props: initialContent (HTML/JSON), onChange callback. Top bar: Save, Preview, Desktop/Mobile toggle. Exposes `getHtml()` and `getJson()` methods via ref.

- [ ] **Step 2: Create template-picker.tsx** — shadcn Dialog. Grid of template thumbnails from `GET /templates`. "Start from Blank" option. On select, loads template content into editor.

- [ ] **Step 3: Verify build and commit**

```bash
git commit -m "feat: add GrapeJS email editor integration with asset manager"
```

---

### Task 16: Templates Pages

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/templates/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/templates/new/edit/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/templates/[id]/edit/page.tsx`

- [ ] **Step 1: Create templates grid page** — 3-4 column grid of template cards. Each card: thumbnail, name, category badge. Hover: Edit, Clone, Use buttons. Filter by category. "New Template" button.

- [ ] **Step 2: Create template editor pages** — Full-screen layout (hides sidebar). Uses GrapesEditor component. Top bar: name (editable Input), Save button, Preview, Back. Save calls `api.patch('/templates/:id', { content_html, content_json, name })`. New template: `api.post('/templates', { name: 'Untitled' })` → redirect to edit.

- [ ] **Step 3: Verify build and commit**

```bash
git commit -m "feat: add template grid and editor pages"
```

---

## Chunk 8: Segments, Reports, Settings

### Task 17: Segments

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/segments/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/segments/new/edit/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/segments/[id]/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/segments/[id]/edit/page.tsx`
- Create: `packages/frontend/src/components/segments/rule-builder.tsx`
- Create: `packages/frontend/src/components/segments/rule-group.tsx`
- Create: `packages/frontend/src/components/segments/rule-row.tsx`

- [ ] **Step 1: Create rule-row.tsx** — Single rule: field Select (contact fields + custom), operator Select (equals, contains, gt, lt, before, after, is_set, is_not_set), value Input. Remove button.

- [ ] **Step 2: Create rule-group.tsx** — Container with AND/OR toggle between groups. Contains multiple rule-row components. "Add Rule" button.

- [ ] **Step 3: Create rule-builder.tsx** — Container for rule groups. "Add Group" button adds OR group. Live count preview (debounced 500ms call to `GET /segments/:id/count`). Manages the SegmentRuleGroup[] state.

- [ ] **Step 4: Create segment pages** — List: DataTable with name, contact count, rules summary, date. Detail: contact list (DataTable). Edit/New: rule-builder with name input and save.

- [ ] **Step 5: Verify build and commit**

```bash
git commit -m "feat: add segment pages with visual rule builder"
```

---

### Task 18: Reports Pages

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/reports/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/reports/campaigns/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/reports/deliverability/page.tsx`

- [ ] **Step 1: Create reports overview** — Stat cards (same as dashboard), growth AreaChart (30d/90d/1y toggle), engagement donut chart, deliverability trend LineChart.

- [ ] **Step 2: Create campaign comparison** — DataTable of last 50 sent campaigns. Columns: Name, Sent Date, Recipients, Open Rate (with Sparkline), Click Rate (with Sparkline), Bounce Rate. Sortable.

- [ ] **Step 3: Create deliverability page** — Bounce + complaint rate LineChart. Domain breakdown DataTable. Alert banner if thresholds exceeded.

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat: add reports overview, campaign comparison, and deliverability pages"
```

---

### Task 19: Settings Pages

**Files:**
- Create: `packages/frontend/src/app/(dashboard)/settings/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/settings/webhooks/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/settings/api-keys/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/settings/users/page.tsx`
- Create: `packages/frontend/src/app/(dashboard)/settings/domain/page.tsx`

- [ ] **Step 1: Create general settings page** — Form: org name, default sender, timezone. "Save" button. Note: backend routes needed — show placeholder state for now with the form UI ready.

- [ ] **Step 2: Create webhooks settings page** — Full implementation (backend exists). DataTable: URL, events badges, status, failure count. Create/Edit Dialog: URL input, event type checkboxes, active toggle. Secret display (masked, click to reveal). Test button. Delivery log per endpoint.

- [ ] **Step 3: Create placeholder settings pages** — API keys, Users, Domain: show the full UI design but with an info banner "Backend routes not yet connected — coming soon". This lets the UI be reviewed while backend catches up.

- [ ] **Step 4: Verify build and commit**

```bash
git commit -m "feat: add settings pages - webhooks (full) and placeholders for others"
```

---

## Chunk 9: Polish & Final Build

### Task 20: Final Integration

**Files:**
- Modify: `packages/frontend/src/app/(dashboard)/layout.tsx` (add auth guard)
- Create: `packages/frontend/src/middleware.ts` (Next.js middleware for auth redirect)

- [ ] **Step 1: Add Next.js middleware for auth**

```typescript
// packages/frontend/src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('twmail_token')?.value;
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');

  if (!token && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (token && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 2: Full build verification**

```bash
cd packages/frontend && npm run build
```

Fix any TypeScript or build errors.

- [ ] **Step 3: Dev server smoke test**

```bash
cd packages/frontend && npm run dev
```

Open http://localhost:3001 (or configured port). Verify:
- Redirects to /login when not authenticated
- Login page renders with TW branding
- After login, dashboard loads with sidebar and topbar
- Navigation between all pages works
- All pages render without errors (may show empty states if no data)

- [ ] **Step 4: Final commit**

```bash
git add -A packages/frontend
git commit -m "feat: add auth middleware and finalize frontend build"
```

- [ ] **Step 5: Push to GitHub**

```bash
git push origin master
```

---

## Summary

| Chunk | Tasks | What it builds |
|-------|-------|---------------|
| 1 | 1-4 | Project init, deps, Tailwind config, foundation files |
| 2 | 5-6 | Sidebar, TopBar, layouts, auth system, login page |
| 3 | 7 | Shared components (DataTable, StatusBadge, EmptyState, etc.) |
| 4 | 8-9 | Report widgets, Dashboard page |
| 5 | 10-11 | Contacts list, detail, import flow |
| 6 | 12-14 | Campaign list, accordion editor, report page |
| 7 | 15-16 | GrapeJS editor, template pages |
| 8 | 17-19 | Segments (rule builder), reports, settings |
| 9 | 20 | Auth middleware, final build, smoke test |

Each chunk produces a buildable, committable increment. The implementing agent should execute chunks sequentially, verifying the build passes after each.
