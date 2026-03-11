'use client';
import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import type { Template } from '@/types';

export default function NewTemplatePage() {
  const router = useRouter();
  const createdRef = useRef(false);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Template>('/templates', { name: 'Untitled Template' }),
    onSuccess: (template) => {
      router.replace(`/templates/${template.id}/edit`);
    },
    onError: () => {
      toast.error('Failed to create template');
      router.push('/templates');
    },
  });

  useEffect(() => {
    if (createdRef.current) return;
    createdRef.current = true;
    createMutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-tw-blue border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-text-muted">Creating template...</p>
      </div>
    </div>
  );
}
