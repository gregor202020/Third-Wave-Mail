'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber, formatPercent } from '@/lib/utils';
import { TopBar } from '@/components/layout/top-bar';
import { ChartSkeleton } from '@/components/shared/loading-skeleton';
import { LineChartWidget } from '@/components/reports/line-chart-widget';
import { DataTable, type Column } from '@/components/shared/data-table';

interface DeliverabilityTrend {
  date: string;
  bounceRate: number;
  complaintRate: number;
  [key: string]: unknown;
}

interface DomainBreakdown {
  domain: string;
  sent: number;
  bounceRate: number;
  complaintRate: number;
}

interface DeliverabilityData {
  trend: DeliverabilityTrend[];
  domains: DomainBreakdown[];
  overallBounceRate: number;
  overallComplaintRate: number;
}

export default function DeliverabilityPage() {
  const [range] = useState('30d');

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.reports.deliverability(range),
    queryFn: () => api.get<{ data: DeliverabilityData }>(`/reports/deliverability?range=${range}`).then(r => r.data),
  });

  const showBounceAlert = (data?.overallBounceRate ?? 0) > 5;
  const showComplaintAlert = (data?.overallComplaintRate ?? 0) > 0.5;

  const domainColumns: Column<DomainBreakdown>[] = [
    {
      key: 'domain',
      header: 'Domain',
      render: (d) => (
        <span className="text-xs font-medium text-text-primary">{d.domain}</span>
      ),
    },
    {
      key: 'sent',
      header: 'Sent',
      render: (d) => (
        <span className="text-xs text-text-secondary">{formatNumber(d.sent)}</span>
      ),
    },
    {
      key: 'bounceRate',
      header: 'Bounce Rate',
      render: (d) => (
        <span className={`text-xs ${d.bounceRate > 5 ? 'text-status-danger font-medium' : 'text-text-secondary'}`}>
          {formatPercent(d.bounceRate)}
        </span>
      ),
    },
    {
      key: 'complaintRate',
      header: 'Complaint Rate',
      render: (d) => (
        <span className={`text-xs ${d.complaintRate > 0.5 ? 'text-status-danger font-medium' : 'text-text-secondary'}`}>
          {formatPercent(d.complaintRate)}
        </span>
      ),
    },
  ];

  return (
    <>
      <TopBar />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto space-y-6">
          {(showBounceAlert || showComplaintAlert) && (
            <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-status-danger shrink-0 mt-0.5" />
              <div className="text-xs text-status-danger space-y-1">
                {showBounceAlert && (
                  <p>
                    <strong>High bounce rate:</strong> Your bounce rate ({formatPercent(data?.overallBounceRate ?? 0)})
                    exceeds the recommended 5% threshold. Review your list hygiene.
                  </p>
                )}
                {showComplaintAlert && (
                  <p>
                    <strong>High complaint rate:</strong> Your complaint rate ({formatPercent(data?.overallComplaintRate ?? 0)})
                    exceeds the recommended 0.5% threshold. Review your sending practices.
                  </p>
                )}
              </div>
            </div>
          )}

          {isLoading ? (
            <ChartSkeleton />
          ) : (
            <LineChartWidget
              title="Bounce & Complaint Rates"
              data={data?.trend ?? []}
              lines={[
                { dataKey: 'bounceRate', color: '#C41E2A' },
                { dataKey: 'complaintRate', color: '#f59e0b', dashed: true },
              ]}
              xDataKey="date"
              height={240}
            />
          )}

          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Domain Breakdown</h3>
            <DataTable
              columns={domainColumns}
              data={data?.domains ?? []}
              total={data?.domains?.length ?? 0}
              page={1}
              perPage={100}
              onPageChange={() => {}}
              isLoading={isLoading}
            />
          </div>
        </div>
      </div>
    </>
  );
}
