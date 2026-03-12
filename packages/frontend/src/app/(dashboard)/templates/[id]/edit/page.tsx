'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { GrapesEditorRef } from '@/components/editor/grapes-editor';
import type { Template } from '@/types';

const GrapesEditor = dynamic(
  () =>
    import('@/components/editor/grapes-editor').then((mod) => ({
      default: mod.GrapesEditor,
    })),
  { ssr: false, loading: () => <Skeleton className="flex-1 min-h-[500px]" /> }
);

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = Number(params.id);

  const editorRef = useRef<GrapesEditorRef>(null);
  const [name, setName] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);

  const { data: template, isLoading } = useQuery({
    queryKey: queryKeys.templates.detail(id),
    queryFn: () => api.get<{ data: Template }>(`/templates/${id}`).then(r => r.data),
    enabled: !!id,
  });

  // Set name once loaded
  useEffect(() => {
    if (template && !nameLoaded) {
      setName(template.name);
      setNameLoaded(true);
    }
  }, [template, nameLoaded]);

  const saveMutation = useMutation({
    mutationFn: (payload: {
      name: string;
      content_html: string;
      content_json: string;
    }) => api.patch(`/templates/${id}`, payload),
    onSuccess: () => {
      toast.success('Template saved');
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.templates.detail(id),
      });
    },
    onError: () => {
      toast.error('Failed to save template');
    },
  });

  const handleSave = useCallback(() => {
    if (!editorRef.current) return;
    const content_html = editorRef.current.getHtml();
    const content_json = editorRef.current.getJson();
    saveMutation.mutate({ name, content_html, content_json });
  }, [name, saveMutation]);

  const initialContent =
    template?.content_json && Object.keys(template.content_json).length > 0
      ? JSON.stringify(template.content_json)
      : template?.content_html || undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Custom top bar */}
      <header className="h-[52px] bg-white border-b border-card-border flex items-center px-4 gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push('/templates')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-xs h-7 text-sm font-medium border-transparent hover:border-input focus-visible:border-ring"
            placeholder="Template name"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            className="bg-tw-blue hover:bg-tw-blue-dark"
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </header>

      {/* Editor area */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <Skeleton className="h-full w-full" />
        ) : (
          <GrapesEditor
            ref={editorRef}
            initialContent={initialContent}
            onSave={handleSave}
            saving={saveMutation.isPending}
          />
        )}
      </div>
    </div>
  );
}
