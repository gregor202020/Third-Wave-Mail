'use client';
import { useQuery } from '@tanstack/react-query';
import { FileText, Plus } from 'lucide-react';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import type { Template } from '@/types';

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (
    template: {
      id: number;
      content_html: string;
      content_json?: string;
    } | null
  ) => void;
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
}: TemplatePickerProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.templates.list({}),
    queryFn: () => api.get<{ data: Template[] }>('/templates'),
    enabled: open,
  });

  const templates = data?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Choose a Template</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
          {/* Blank template option */}
          <button
            onClick={() => {
              onSelect(null);
              onOpenChange(false);
            }}
            className="group flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-card-border p-6 text-text-muted hover:border-tw-blue hover:text-tw-blue transition-colors cursor-pointer"
          >
            <Plus className="w-8 h-8" />
            <span className="text-xs font-medium">Start from Blank</span>
          </button>

          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-lg" />
            ))}

          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => {
                onSelect({
                  id: template.id,
                  content_html: template.content_html || '',
                  content_json: template.content_json
                    ? JSON.stringify(template.content_json)
                    : undefined,
                });
                onOpenChange(false);
              }}
              className="group flex flex-col rounded-lg border border-card-border overflow-hidden hover:border-tw-blue hover:ring-1 hover:ring-tw-blue transition-all cursor-pointer"
            >
              <div className="flex-1 flex items-center justify-center bg-surface p-4 min-h-[80px]">
                {template.thumbnail_url ? (
                  <img
                    src={template.thumbnail_url}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FileText className="w-8 h-8 text-text-muted group-hover:text-tw-blue transition-colors" />
                )}
              </div>
              <div className="px-3 py-2 border-t border-card-border">
                <span className="text-xs font-medium text-text-primary truncate block">
                  {template.name}
                </span>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
