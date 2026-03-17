'use client';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import type { Campaign } from '@/types';

export default function NewCampaignPage() {
  const router = useRouter();
  const creating = useRef(false);

  useEffect(() => {
    if (creating.current) return;
    creating.current = true;

    api.post<{ data: Campaign }>('/campaigns', { name: 'Untitled Campaign' })
      .then((res) => {
        router.replace(`/campaigns/${res.data.id}/edit`);
      })
      .catch(() => {
        router.replace('/campaigns');
      });
  }, [router]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-tw-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-text-muted">Creating campaign...</p>
      </div>
    </div>
  );
}
