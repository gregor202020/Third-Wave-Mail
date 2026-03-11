'use client';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber, formatPercent, formatDate } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { TopBar } from '@/components/layout/top-bar';
import { StatCard } from '@/components/reports/stat-card';
import { LineChartWidget } from '@/components/reports/line-chart-widget';
import { DeliveryFunnel } from '@/components/campaigns/delivery-funnel';
import { AbResults } from '@/components/campaigns/ab-results';
import { DataTable, type Column } from '@/components/shared/data-table';
import { StatCardSkeleton } from '@/components/shared/loading-skeleton';
import { CampaignStatus } from '@twmail/shared/types';
import type { Campaign, PaginationMeta } from '@/types';
import { useState } from 'react';

interface CampaignReport {
  campaign: Campaign;
  timeline: Array<{ date: string; opens: number; clicks: number }>;
  bounces: Array<{ email: string; type: string; reason: string; date: string }>;
  complaints: Array<{ email: string; date: string }>;
}

interface Recipient {
  id: number;
  email: string;
  status: string;
  opened_at: string | null;
  clicked_at: string | null;
}

export default function CampaignReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = Number(id);
  const { page, perPage, goToPage } = usePagination(1, 50);
  const [bouncesExpanded, setBouncesExpanded] = useState(false);

  const isSending = (c: Campaign) => c.status === CampaignStatus.SENDING;

  const { data: report, isLoading } = useQuery({
    queryKey: queryKeys.campaigns.report(campaignId),
    queryFn: () => api.get<CampaignReport>(`/campaigns/${campaignId}/report`),
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.campaign && isSending(data.campaign) ? 5000 : false;
    },
  });

  const { data: recipientsData, isLoading: recipientsLoading } = useQuery({
    queryKey: queryKeys.campaigns.recipients(campaignId, page),
    queryFn: () =>
      api.get<{ data: Recipient[]; meta: PaginationMeta }>(
        `/campaigns/${campaignId}/recipients?page=${page}&per_page=${perPage}`
      ),
  });

  const campaign = report?.campaign;
  const timeline = report?.timeline ?? [];
  const bounces = report?.bounces ?? [];
  const complaints = report?.complaints ?? [];
  const recipients = recipientsData?.data ?? [];
  const recipientsTotal = recipientsData?.meta?.total ?? 0;

  const deliveredRate = campaign && campaign.total_sent > 0
    ? (campaign.total_delivered / campaign.total_sent) * 100
    : 0;
  const openRate = campaign && campaign.total_sent > 0
    ? (campaign.total_opens / campaign.total_sent) * 100
    : 0;
  const clickRate = campaign && campaign.total_sent > 0
    ? (campaign.total_clicks / campaign.total_sent) * 100
    : 0;

  const recipientColumns: Column<Recipient>[] = [
    {
      key: 'email',
      header: 'Email',
      render: (r) => <span className="text-xs font-medium text-text-primary">{r.email}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <span className="text-xs text-text-secondary capitalize">{r.status}</span>
      ),
    },
    {
      key: 'opened',
      header: 'Opened',
      render: (r) => (
        <span className="text-xs text-text-muted">
          {r.opened_at ? formatDate(r.opened_at) : '--'}
        </span>
      ),
    },
    {
      key: 'clicked',
      header: 'Clicked',
      render: (r) => (
        <span className="text-xs text-text-muted">
          {r.clicked_at ? formatDate(r.clicked_at) : '--'}
        </span>
      ),
    },
  ];

  return (
    <>
      <TopBar
        action={
          <Link href="/campaigns" className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Campaigns
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto space-y-6">
          {/* Header */}
          <div>
            <h2 className="text-xl font-semibold text-text-primary tracking-tight">
              {campaign?.name ?? 'Campaign Report'}
            </h2>
            {campaign && isSending(campaign) && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full bg-tw-blue animate-pulse" />
                  <span className="text-xs text-tw-blue font-medium">Sending in progress...</span>
                </div>
                <div className="h-2 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-tw-blue rounded-full transition-all duration-500"
                    style={{
                      width: `${campaign.total_sent > 0 ? Math.min(100, (campaign.total_delivered / campaign.total_sent) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Stat Cards */}
          {isLoading || !campaign ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <StatCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <StatCard label="Sent" value={formatNumber(campaign.total_sent)} />
              <StatCard label="Delivered" value={formatNumber(campaign.total_delivered)} trend={`${formatPercent(deliveredRate)}`} trendUp={deliveredRate > 95} />
              <StatCard label="Opens" value={formatNumber(campaign.total_opens)} trend={formatPercent(openRate)} trendUp={openRate > 20} />
              <StatCard label="Clicks" value={formatNumber(campaign.total_clicks)} trend={formatPercent(clickRate)} trendUp={clickRate > 3} />
              <StatCard label="Bounces" value={formatNumber(campaign.total_bounces)} />
              <StatCard label="Complaints" value={formatNumber(campaign.total_complaints)} />
            </div>
          )}

          {/* Delivery Funnel */}
          {campaign && (
            <DeliveryFunnel
              sent={campaign.total_sent}
              delivered={campaign.total_delivered}
              opened={campaign.total_opens}
              clicked={campaign.total_clicks}
            />
          )}

          {/* Timeline Chart */}
          {timeline.length > 0 && (
            <LineChartWidget
              title="Engagement Over Time"
              data={timeline}
              xDataKey="date"
              lines={[
                { dataKey: 'opens', color: '#0170B9' },
                { dataKey: 'clicks', color: '#C41E2A' },
              ]}
            />
          )}

          {/* A/B Results */}
          {campaign?.ab_test_enabled && <AbResults campaignId={campaignId} />}

          {/* Recipients Table */}
          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-4">Recipients</h3>
            <DataTable
              columns={recipientColumns}
              data={recipients}
              total={recipientsTotal}
              page={page}
              perPage={perPage}
              onPageChange={goToPage}
              isLoading={recipientsLoading}
              getId={(r) => r.id}
            />
          </div>

          {/* Bounces & Complaints */}
          {(bounces.length > 0 || complaints.length > 0) && (
            <div className="bg-card border border-card-border rounded-[14px] overflow-hidden">
              <button
                type="button"
                onClick={() => setBouncesExpanded(!bouncesExpanded)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface/50 transition-colors"
              >
                <span className="text-sm font-semibold text-text-primary">
                  Bounces ({bounces.length}) & Complaints ({complaints.length})
                </span>
                <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${bouncesExpanded ? 'rotate-180' : ''}`} />
              </button>
              {bouncesExpanded && (
                <div className="px-5 pb-5 space-y-4">
                  {bounces.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Bounces</h4>
                      <div className="space-y-1">
                        {bounces.map((b, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-card-border last:border-0">
                            <span className="text-text-primary font-medium w-48 truncate">{b.email}</span>
                            <span className="text-text-muted capitalize">{b.type}</span>
                            <span className="text-text-muted flex-1 truncate">{b.reason}</span>
                            <span className="text-text-muted">{formatDate(b.date)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {complaints.length > 0 && (
                    <div>
                      <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Complaints</h4>
                      <div className="space-y-1">
                        {complaints.map((c, i) => (
                          <div key={i} className="flex items-center gap-3 text-xs py-1.5 border-b border-card-border last:border-0">
                            <span className="text-text-primary font-medium">{c.email}</span>
                            <span className="text-text-muted ml-auto">{formatDate(c.date)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
