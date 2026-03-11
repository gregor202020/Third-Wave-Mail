'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { Sparkline } from '@/components/reports/sparkline';

interface CampaignReport {
  id: number;
  name: string;
  sent_at: string;
  recipients: number;
  open_rate: number;
  click_rate: number;
  bounce_rate: number;
  open_trend?: number[];
  click_trend?: number[];
}

export default function CampaignComparisonPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.reports.campaigns,
    queryFn: () => api.get<{ data: CampaignReport[] }>('/reports/campaigns'),
  });

  const campaigns = data?.data ?? [];

  const columns: Column<CampaignReport>[] = [
    {
      key: 'name',
      header: 'Name',
      sortable: true,
      render: (c) => (
        <span className="text-xs font-medium text-text-primary">{c.name}</span>
      ),
    },
    {
      key: 'sent_at',
      header: 'Sent Date',
      sortable: true,
      render: (c) => (
        <span className="text-xs text-text-muted">{formatDate(c.sent_at)}</span>
      ),
    },
    {
      key: 'recipients',
      header: 'Recipients',
      sortable: true,
      render: (c) => (
        <span className="text-xs text-text-secondary">{formatNumber(c.recipients)}</span>
      ),
    },
    {
      key: 'open_rate',
      header: 'Open Rate',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">{formatPercent(c.open_rate)}</span>
          {c.open_trend && c.open_trend.length > 0 && (
            <Sparkline data={c.open_trend} color="#0170B9" />
          )}
        </div>
      ),
    },
    {
      key: 'click_rate',
      header: 'Click Rate',
      sortable: true,
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">{formatPercent(c.click_rate)}</span>
          {c.click_trend && c.click_trend.length > 0 && (
            <Sparkline data={c.click_trend} color="#22c55e" />
          )}
        </div>
      ),
    },
    {
      key: 'bounce_rate',
      header: 'Bounce Rate',
      sortable: true,
      render: (c) => (
        <span className="text-xs text-text-secondary">{formatPercent(c.bounce_rate)}</span>
      ),
    },
  ];

  return (
    <>
      <TopBar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          <DataTable
            columns={columns}
            data={campaigns}
            total={campaigns.length}
            page={1}
            perPage={50}
            onPageChange={() => {}}
            isLoading={isLoading}
            getId={(c) => c.id}
          />
        </div>
      </div>
    </>
  );
}
