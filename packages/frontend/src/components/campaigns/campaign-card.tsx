import Link from 'next/link';
import { CampaignStatusDot } from '@/components/shared/status-badge';
import { formatDate, formatPercent } from '@/lib/utils';
import type { Campaign } from '@/types';

interface CampaignCardProps {
  campaign: Campaign;
}

export function CampaignCard({ campaign }: CampaignCardProps) {
  const openRate = campaign.total_sent > 0
    ? (campaign.total_opens / campaign.total_sent) * 100
    : 0;
  const clickRate = campaign.total_sent > 0
    ? (campaign.total_clicks / campaign.total_sent) * 100
    : 0;

  return (
    <Link
      href={`/campaigns/${campaign.id}/edit`}
      className="block bg-card border border-card-border rounded-[14px] p-5 hover:border-tw-blue/30 transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <CampaignStatusDot status={campaign.status} />
        <h3 className="text-sm font-medium text-text-primary truncate">{campaign.name}</h3>
      </div>
      <div className="text-[11px] text-text-muted mb-3">
        {formatDate(campaign.created_at)}
      </div>
      {campaign.total_sent > 0 && (
        <div className="flex items-center gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Opens</div>
            <div className="text-sm font-semibold text-text-primary">{formatPercent(openRate)}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-text-muted">Clicks</div>
            <div className="text-sm font-semibold text-text-primary">{formatPercent(clickRate)}</div>
          </div>
        </div>
      )}
    </Link>
  );
}
