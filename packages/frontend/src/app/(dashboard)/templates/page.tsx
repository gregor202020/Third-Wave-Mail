'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, Pencil, Copy, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate } from '@/lib/utils';
import { TopBar } from '@/components/layout/top-bar';
import { EmptyState } from '@/components/shared/empty-state';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { Template } from '@/types';

export default function TemplatesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.templates.list({}),
    queryFn: () => api.get<{ data: Template[] }>('/templates'),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: number) => api.post<{ data: Template }>(`/templates/${id}/clone`),
    onSuccess: (res) => {
      toast.success('Template cloned');
      router.push(`/templates/${res.data.id}/edit`);
    },
    onError: () => {
      toast.error('Failed to clone template');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/templates/${id}`),
    onSuccess: () => {
      toast.success('Template deleted');
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all });
    },
    onError: () => {
      toast.error('Failed to delete template');
    },
  });

  const templates = data?.data ?? [];

  return (
    <>
      <TopBar
        action={
          <Button
            className="bg-tw-blue hover:bg-tw-blue-dark"
            size="sm"
            onClick={() => router.push('/templates/new/edit')}
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No templates yet"
              description="Create your first email template to get started."
              actionLabel="New Template"
              onAction={() => router.push('/templates/new/edit')}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="group relative bg-card border border-card-border rounded-xl overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Preview area */}
                  <div className="h-32 bg-surface flex items-center justify-center">
                    {template.thumbnail_url ? (
                      <img
                        src={template.thumbnail_url}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <FileText className="w-10 h-10 text-text-muted/40" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3 border-t border-card-border">
                    <h3 className="text-xs font-medium text-text-primary truncate">
                      {template.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5">
                      {template.category && (
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          {template.category}
                        </Badge>
                      )}
                      <span className="text-[10px] text-text-muted">
                        {formatDate(template.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Hover overlay with actions */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={() => router.push(`/templates/${template.id}/edit`)}
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      onClick={() => cloneMutation.mutate(template.id)}
                      disabled={cloneMutation.isPending}
                      title="Clone"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="icon-sm"
                      onClick={() => setDeleteTarget(template)}
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Template"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </>
  );
}
