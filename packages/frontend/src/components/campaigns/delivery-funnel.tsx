import { formatNumber, formatPercent } from '@/lib/utils';

interface DeliveryFunnelProps {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}

const STEPS = [
  { key: 'sent', label: 'Sent', color: 'bg-tw-blue' },
  { key: 'delivered', label: 'Delivered', color: 'bg-[#3b82f6]' },
  { key: 'opened', label: 'Opened', color: 'bg-[#a855f7]' },
  { key: 'clicked', label: 'Clicked', color: 'bg-tw-red' },
] as const;

export function DeliveryFunnel({ sent, delivered, opened, clicked }: DeliveryFunnelProps) {
  const values: Record<string, number> = { sent, delivered, opened, clicked };
  const maxVal = Math.max(sent, 1);

  return (
    <div className="bg-card border border-card-border rounded-[14px] p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-5">Delivery Funnel</h3>
      <div className="space-y-4">
        {STEPS.map((step) => {
          const value = values[step.key];
          const pct = sent > 0 ? (value / sent) * 100 : 0;
          const barWidth = Math.max((value / maxVal) * 100, 2);

          return (
            <div key={step.key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-text-primary">{step.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-text-primary">{formatNumber(value)}</span>
                  <span className="text-xs text-text-muted">{formatPercent(pct)}</span>
                </div>
              </div>
              <div className="h-3 bg-surface rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${step.color} transition-all duration-500`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
