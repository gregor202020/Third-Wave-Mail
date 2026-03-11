'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Send, Plus, MoreHorizontal, Pencil, Copy, Pause, XCircle, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, formatNumber, formatPercent } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { CampaignStatus } from '@twmail/shared/types';
import type { Campaign, PaginationMeta } from '@/types';
import { toast } from 'sonner';

export default function CampaignsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { page, perPage, goToPage } = usePagination(1, 50);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.campaigns.list({ page }),
    queryFn: () =>
      api.get<{ data: Campaign[]; meta: PaginationMeta }>(
        `/campaigns?page=${page}&per_page=${perPage}`
      ),
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<Campaign>('/campaigns', { name: 'Untitled Campaign' }),
    onSuccess: (campaign) => {
      router.push(`/campaigns/${campaign.id}/edit`);
    },
    onError: () => {
      toast.error('Failed to create campaign');
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: number) => api.post<Campaign>(`/campaigns/${id}/duplicate`),
    onSuccess: (campaign) => {
      toast.success('Campaign duplicated');
      router.push(`/campaigns/${campaign.id}/edit`);
    },
    onError: () => {
      toast.error('Failed to duplicate campaign');
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: number) => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => {
      toast.success('Campaign paused');
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
    onError: () => {
      toast.error('Failed to pause campaign');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => api.post(`/campaigns/${id}/cancel`),
    onSuccess: () => {
      toast.success('Campaign cancelled');
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
    onError: () => {
      toast.error('Failed to cancel campaign');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/campaigns/${id}`),
    onSuccess: () => {
      toast.success('Campaign deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.campaigns.all });
    },
    onError: () => {
      toast.error('Failed to delete campaign');
    },
  });

  const campaigns = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const openRate = (c: Campaign) => c.total_sent > 0 ? (c.total_opens / c.total_sent) * 100 : 0;
  const clickRate = (c: Campaign) => c.total_sent > 0 ? (c.total_clicks / c.total_sent) * 100 : 0;

  const columns: Column<Campaign>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (c) => (
        <Link
          href={`/campaigns/${c.id}/edit`}
          className="text-xs font-medium text-text-primary hover:text-tw-blue transition-colors"
        >
          {c.name}
        </Link>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <StatusBadge type="campaign" status={c.status} />,
    },
    {
      key: 'recipients',
      header: 'Recipients',
      render: (c) => (
        <span className="text-xs text-text-secondary">
          {c.total_sent > 0 ? formatNumber(c.total_sent) : '--'}
        </span>
      ),
    },
    {
      key: 'open_rate',
      header: 'Open Rate',
      render: (c) => (
        <span className="text-xs text-text-secondary">
          {c.total_sent > 0 ? formatPercent(openRate(c)) : '--'}
        </span>
      ),
    },
    {
      key: 'click_rate',
      header: 'Click Rate',
      render: (c) => (
        <span className="text-xs text-text-secondary">
          {c.total_sent > 0 ? formatPercent(clickRate(c)) : '--'}
        </span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (c) => (
        <span className="text-xs text-text-muted">{formatDate(c.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-surface transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-text-muted" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push(`/campaigns/${c.id}/edit`)}>
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => duplicateMutation.mutate(c.id)}>
              <Copy className="w-3.5 h-3.5" />
              Duplicate
            </DropdownMenuItem>
            {c.status === CampaignStatus.SENDING && (
              <DropdownMenuItem onClick={() => pauseMutation.mutate(c.id)}>
                <Pause className="w-3.5 h-3.5" />
                Pause
              </DropdownMenuItem>
            )}
            {(c.status === CampaignStatus.SCHEDULED || c.status === CampaignStatus.SENDING) && (
              <DropdownMenuItem onClick={() => cancelMutation.mutate(c.id)}>
                <XCircle className="w-3.5 h-3.5" />
                Cancel
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(c)}>
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <TopBar
        action={
          <Button
            className="bg-tw-red hover:bg-tw-red-dark"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            <Plus className="w-3.5 h-3.5" />
            New Campaign
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          {!isLoading && campaigns.length === 0 ? (
            <EmptyState
              icon={Send}
              title="No campaigns yet"
              description="Create your first campaign to start reaching your audience."
              actionLabel="New Campaign"
              onAction={() => createMutation.mutate()}
            />
          ) : (
            <DataTable
              columns={columns}
              data={campaigns}
              total={total}
              page={page}
              perPage={perPage}
              onPageChange={goToPage}
              isLoading={isLoading}
              getId={(c) => c.id}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Campaign"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}
