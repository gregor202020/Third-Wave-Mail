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
import Link from 'next/link';

interface DailySend {
  day: string;
  count: number;
}

interface RecentCampaign {
  id: number;
  name: string;
  status: number;
  total_sent: number;
  open_rate: number;
  created_at: string;
}

interface OverviewData {
  total_contacts: number;
  new_contacts_this_month: number;
  avg_open_rate: number;
  open_rate_trend: number;
  avg_click_rate: number;
  click_rate_trend: number;
  avg_bounce_rate: number;
  bounce_rate_healthy?: boolean;
  daily_sends: DailySend[];
  recent_campaigns: RecentCampaign[];
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.reports.overview,
    queryFn: () => api.get<{ data: OverviewData }>('/reports/overview').then(r => r.data),
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
                <StatCard label="Open Rate" value={formatPercent(data?.avg_open_rate ?? 0)} trend={data?.open_rate_trend ? `${data.open_rate_trend > 0 ? '+' : ''}${formatPercent(data.open_rate_trend)}` : undefined} trendUp={data?.open_rate_trend ? data.open_rate_trend > 0 : undefined} />
                <StatCard label="Click Rate" value={formatPercent(data?.avg_click_rate ?? 0)} trend={data?.click_rate_trend ? `${data.click_rate_trend > 0 ? '+' : ''}${formatPercent(data.click_rate_trend)}` : undefined} trendUp={data?.click_rate_trend ? data.click_rate_trend > 0 : undefined} />
                <StatCard label="Bounce Rate" value={formatPercent(data?.avg_bounce_rate ?? 0)} trend={data?.bounce_rate_healthy !== undefined ? (data.bounce_rate_healthy ? 'Healthy' : 'High') : undefined} trendUp={data?.bounce_rate_healthy} />
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
                  data={data?.daily_sends?.map((d: DailySend) => ({ label: d.day, value: d.count })) ?? []}
                />
              )}
            </div>

            {/* Recent + Quick Actions */}
            <div className="col-span-2 space-y-3">
              <div className="bg-card border border-card-border rounded-[14px] p-5">
                <h3 className="text-sm font-semibold text-text-primary mb-4">Recent Campaigns</h3>
                <div className="space-y-3">
                  {data?.recent_campaigns?.slice(0, 4).map((c: RecentCampaign) => (
                    <Link key={c.id} href={`/campaigns/${c.id}/report`} className="flex items-center gap-3 group">
                      <CampaignStatusDot status={c.status} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-text-primary truncate group-hover:text-tw-blue transition-colors">{c.name}</div>
                        <div className="text-[10px] text-text-muted">{c.total_sent ? `${formatPercent(c.open_rate)} opened` : 'Draft'}</div>
                      </div>
                      <span className="text-[10px] text-text-muted">{timeAgo(c.created_at)}</span>
                    </Link>
                  ))}
                  {(!data?.recent_campaigns || data.recent_campaigns.length === 0) && (
                    <p className="text-xs text-text-muted text-center py-4">No campaigns yet</p>
                  )}
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
