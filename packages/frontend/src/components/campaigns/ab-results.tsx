'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber, formatPercent } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { TableSkeleton } from '@/components/shared/loading-skeleton';
import type { CampaignVariant } from '@/types';

interface AbResultsProps {
  campaignId: number;
}

export function AbResults({ campaignId }: AbResultsProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.campaigns.abResults(campaignId),
    queryFn: () => api.get<{ data: CampaignVariant[] }>(`/campaigns/${campaignId}/ab-results`),
  });

  if (isLoading) return <TableSkeleton rows={3} cols={6} />;

  const variants = data?.data ?? [];
  if (variants.length === 0) return null;

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">A/B Test Results</h3>
      <div className="border border-card-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead><span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Variant</span></TableHead>
              <TableHead><span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Sent</span></TableHead>
              <TableHead><span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Opens</span></TableHead>
              <TableHead><span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Open Rate</span></TableHead>
              <TableHead><span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Clicks</span></TableHead>
              <TableHead><span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">Click Rate</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((v) => {
              const openRate = v.total_sent > 0 ? (v.total_opens / v.total_sent) * 100 : 0;
              const clickRate = v.total_sent > 0 ? (v.total_clicks / v.total_sent) * 100 : 0;
              return (
                <TableRow
                  key={v.id}
                  className={cn(v.is_winner && 'bg-green-50')}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-text-primary">{v.variant_name}</span>
                      {v.is_winner && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700">
                          Winner
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell><span className="text-xs text-text-secondary">{formatNumber(v.total_sent)}</span></TableCell>
                  <TableCell><span className="text-xs text-text-secondary">{formatNumber(v.total_opens)}</span></TableCell>
                  <TableCell><span className="text-xs text-text-secondary">{formatPercent(openRate)}</span></TableCell>
                  <TableCell><span className="text-xs text-text-secondary">{formatNumber(v.total_clicks)}</span></TableCell>
                  <TableCell><span className="text-xs text-text-secondary">{formatPercent(clickRate)}</span></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
