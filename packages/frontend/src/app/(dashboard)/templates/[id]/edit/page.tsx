'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, Save, Check } from 'lucide-react';
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
  { ssr: false, loading: () => <div className="flex-1 bg-[#1a1a2e] flex items-center justify-center"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div> }
);

export default function TemplateEditorPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = Number(params.id);

  const editorRef = useRef<GrapesEditorRef>(null);
  const [name, setName] = useState('');
  const [nameLoaded, setNameLoaded] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const { data: template, isLoading } = useQuery({
    queryKey: queryKeys.templates.detail(id),
    queryFn: () => api.get<{ data: Template }>(`/templates/${id}`).then(r => r.data),
    enabled: !!id,
  });

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
      setLastSaved(new Date());
      toast.success('Template saved');
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.detail(id) });
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

  // Keyboard shortcut: Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave]);

  const initialContent =
    template?.content_json && Object.keys(template.content_json).length > 0
      ? JSON.stringify(template.content_json)
      : template?.content_html || undefined;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <header className="h-[48px] bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => router.push('/templates')}
          title="Back to Templates"
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        {isLoading ? (
          <Skeleton className="h-7 w-48" />
        ) : (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-[280px] h-7 text-sm font-medium border-transparent hover:border-gray-300 focus-visible:border-blue-500 bg-transparent"
            placeholder="Template name"
          />
        )}

        <div className="ml-auto flex items-center gap-2">
          {lastSaved && (
            <span className="text-[11px] text-gray-400 flex items-center gap-1">
              <Check className="w-3 h-3 text-green-500" />
              Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <Button
            className="bg-blue-600 hover:bg-blue-700"
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
          >
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </header>

      {/* Editor fills remaining space */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="flex-1 bg-[#1a1a2e] flex items-center justify-center h-full">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
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
