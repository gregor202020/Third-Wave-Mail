'use client';
import { use } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { TopBar } from '@/components/layout/top-bar';
import { CampaignAccordion } from '@/components/campaigns/campaign-accordion';
import { TableSkeleton } from '@/components/shared/loading-skeleton';
import { Button } from '@/components/ui/button';
import type { Campaign } from '@/types';
import { toast } from 'sonner';

export default function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const campaignId = Number(id);
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: campaign, isLoading } = useQuery({
    queryKey: queryKeys.campaigns.detail(campaignId),
    queryFn: () => api.get<Campaign>(`/campaigns/${campaignId}`),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api.patch<Campaign>(`/campaigns/${campaignId}`, data),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.campaigns.detail(campaignId), updated);
    },
    onError: () => {
      toast.error('Failed to save campaign');
    },
  });

  const sendMutation = useMutation({
    mutationFn: () => api.post(`/campaigns/${campaignId}/send`),
    onSuccess: () => {
      toast.success('Campaign is sending!');
      router.push(`/campaigns/${campaignId}/report`);
    },
    onError: () => {
      toast.error('Failed to send campaign');
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: (data: { scheduled_at: string; timezone: string }) =>
      api.post(`/campaigns/${campaignId}/schedule`, data),
    onSuccess: () => {
      toast.success('Campaign scheduled');
      router.push(`/campaigns/${campaignId}/report`);
    },
    onError: () => {
      toast.error('Failed to schedule campaign');
    },
  });

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
        <div className="max-w-[800px] mx-auto">
          {isLoading || !campaign ? (
            <TableSkeleton rows={6} cols={1} />
          ) : (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-text-primary tracking-tight">
                  {campaign.name}
                </h2>
                <p className="text-xs text-text-muted mt-1">Configure and send your campaign</p>
              </div>
              <CampaignAccordion
                campaign={campaign}
                onSave={(data) => saveMutation.mutate(data as Record<string, unknown>)}
                onSend={() => sendMutation.mutate()}
                onSchedule={(scheduledAt, timezone) =>
                  scheduleMutation.mutate({ scheduled_at: scheduledAt, timezone })
                }
                isSaving={saveMutation.isPending}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
