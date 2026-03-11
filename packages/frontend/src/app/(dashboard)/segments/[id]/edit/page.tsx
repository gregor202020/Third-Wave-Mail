'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RuleBuilder } from '@/components/segments/rule-builder';
import type { Segment, SegmentRuleGroup, SegmentRule } from '@/types';

export default function EditSegmentPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = Number(params.id);

  const [name, setName] = useState('');
  const [groups, setGroups] = useState<SegmentRuleGroup[]>([]);
  const [initialized, setInitialized] = useState(false);

  const { data: segment } = useQuery({
    queryKey: queryKeys.segments.detail(id),
    queryFn: () => api.get<Segment & { rules?: SegmentRuleGroup[] }>(`/segments/${id}`),
    enabled: !!id,
  });

  // One-time form initialization from server data
  useEffect(() => {
    if (segment && !initialized) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time form init from fetched data
      setName(segment.name);
       
      setGroups(
        segment.rules && segment.rules.length > 0
          ? segment.rules
          : [{ logic: 'and', rules: [{ field: 'email', operator: 'eq', value: '' } as SegmentRule] }]
      );
      setInitialized(true);
    }
  }, [segment, initialized]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch<Segment>(`/segments/${id}`, { name, rules: groups }),
    onSuccess: () => {
      toast.success('Segment updated');
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.detail(id) });
      router.push(`/segments/${id}`);
    },
    onError: () => {
      toast.error('Failed to update segment');
    },
  });

  return (
    <>
      <TopBar
        action={
          <Link
            href={`/segments/${id}`}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Segment
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[800px] mx-auto space-y-6">
          <div>
            <Label htmlFor="segment-name" className="text-xs text-text-muted mb-1.5">
              Segment Name
            </Label>
            <Input
              id="segment-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Active Subscribers"
              className="max-w-md"
            />
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text-primary mb-3">Rules</h3>
            <RuleBuilder groups={groups} onChange={setGroups} segmentId={id} />
          </div>

          <div className="flex justify-end pt-4 border-t border-card-border">
            <Button
              className="bg-tw-blue hover:bg-tw-blue-dark"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Segment'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
