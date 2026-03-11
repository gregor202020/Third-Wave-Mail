'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber, formatPercent } from '@/lib/utils';
import { TopBar } from '@/components/layout/top-bar';
import { StatCardSkeleton, ChartSkeleton } from '@/components/shared/loading-skeleton';
import { StatCard } from '@/components/reports/stat-card';
import { LineChartWidget } from '@/components/reports/line-chart-widget';
import { DonutChartWidget } from '@/components/reports/donut-chart-widget';
import { Button } from '@/components/ui/button';

interface OverviewData {
  totalSent: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
}

interface GrowthPoint {
  date: string;
  contacts: number;
  [key: string]: unknown;
}

interface EngagementData {
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
}

interface DeliverabilityPoint {
  date: string;
  deliveredRate: number;
  [key: string]: unknown;
}

export default function ReportsOverviewPage() {
  const [growthRange, setGrowthRange] = useState('30d');

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: queryKeys.reports.overview,
    queryFn: () => api.get<{ data: OverviewData }>('/reports/overview').then(r => r.data),
  });

  const { data: growth, isLoading: growthLoading } = useQuery({
    queryKey: queryKeys.reports.growth(growthRange),
    queryFn: () => api.get<{ data: GrowthPoint[] }>(`/reports/growth?range=${growthRange}`).then(r => r.data),
  });

  const { data: engagement, isLoading: engagementLoading } = useQuery({
    queryKey: queryKeys.reports.engagement,
    queryFn: () => api.get<{ data: EngagementData }>('/reports/engagement').then(r => r.data),
  });

  const { data: deliverability, isLoading: deliverabilityLoading } = useQuery({
    queryKey: queryKeys.reports.deliverability('30d'),
    queryFn: () => api.get<{ data: DeliverabilityPoint[] }>('/reports/deliverability?range=30d').then(r => r.data),
  });

  const donutData = engagement
    ? [
        { name: 'Opened', value: engagement.opened, color: '#0170B9' },
        { name: 'Clicked', value: engagement.clicked, color: '#22c55e' },
        { name: 'Bounced', value: engagement.bounced, color: '#C41E2A' },
        { name: 'Unsubscribed', value: engagement.unsubscribed, color: '#f59e0b' },
      ]
    : [];

  const ranges = [
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
    { value: '1y', label: '1y' },
  ];

  return (
    <>
      <TopBar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {overviewLoading ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label="Total Sent"
                  value={overview ? formatNumber(overview.totalSent) : '--'}
                />
                <StatCard
                  label="Avg Open Rate"
                  value={overview ? formatPercent(overview.avgOpenRate) : '--'}
                />
                <StatCard
                  label="Avg Click Rate"
                  value={overview ? formatPercent(overview.avgClickRate) : '--'}
                />
                <StatCard
                  label="Avg Bounce Rate"
                  value={overview ? formatPercent(overview.avgBounceRate) : '--'}
                />
              </>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-text-primary">Contact Growth</span>
              <div className="flex gap-1">
                {ranges.map((r) => (
                  <Button
                    key={r.value}
                    variant={growthRange === r.value ? 'default' : 'outline'}
                    size="xs"
                    onClick={() => setGrowthRange(r.value)}
                    className={growthRange === r.value ? 'bg-tw-blue hover:bg-tw-blue-dark' : ''}
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
            </div>
            {growthLoading ? (
              <ChartSkeleton />
            ) : (
              <LineChartWidget
                title=""
                data={growth ?? []}
                lines={[{ dataKey: 'contacts', color: '#0170B9' }]}
                xDataKey="date"
                height={220}
              />
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {engagementLoading ? (
              <ChartSkeleton />
            ) : (
              <DonutChartWidget title="Engagement Breakdown" data={donutData} />
            )}
            {deliverabilityLoading ? (
              <ChartSkeleton />
            ) : (
              <LineChartWidget
                title="Deliverability Trend"
                data={deliverability ?? []}
                lines={[{ dataKey: 'deliveredRate', color: '#22c55e' }]}
                xDataKey="date"
                height={180}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
