'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { TopBar } from '@/components/layout/top-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RuleBuilder } from '@/components/segments/rule-builder';
import type { Segment, SegmentRuleGroup, SegmentRule } from '@/types';

function createEmptyGroup(): SegmentRuleGroup {
  return {
    logic: 'and',
    rules: [{ field: 'email', operator: 'eq', value: '' } as SegmentRule],
  };
}

export default function NewSegmentPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [groups, setGroups] = useState<SegmentRuleGroup[]>([createEmptyGroup()]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post<{ data: Segment }>('/segments', { name, rules: groups }),
    onSuccess: (res) => {
      toast.success('Segment created');
      router.push(`/segments/${res.data.id}`);
    },
    onError: () => {
      toast.error('Failed to create segment');
    },
  });

  return (
    <>
      <TopBar
        action={
          <Link
            href="/segments"
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Segments
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
            <RuleBuilder groups={groups} onChange={setGroups} />
          </div>

          <div className="flex justify-end pt-4 border-t border-card-border">
            <Button
              className="bg-tw-blue hover:bg-tw-blue-dark"
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving...' : 'Create Segment'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
