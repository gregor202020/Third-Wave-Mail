'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Users } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatNumber, formatDate } from '@/lib/utils';
import { usePagination } from '@/hooks/use-pagination';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { StatCard } from '@/components/reports/stat-card';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { Button } from '@/components/ui/button';
import type { Segment, Contact, PaginationMeta } from '@/types';

export default function SegmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = Number(params.id);
  const { page, perPage, goToPage } = usePagination(1, 50);
  const [showDelete, setShowDelete] = useState(false);

  const { data: segment } = useQuery({
    queryKey: queryKeys.segments.detail(id),
    queryFn: () => api.get<{ data: Segment }>(`/segments/${id}`).then(r => r.data),
    enabled: !!id,
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery({
    queryKey: queryKeys.segments.contacts(id, page),
    queryFn: () =>
      api.get<{ data: Contact[]; meta: PaginationMeta }>(
        `/segments/${id}/contacts?page=${page}&per_page=${perPage}`
      ),
    enabled: !!id,
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/segments/${id}`),
    onSuccess: () => {
      toast.success('Segment deleted');
      queryClient.invalidateQueries({ queryKey: queryKeys.segments.all });
      router.push('/segments');
    },
    onError: () => {
      toast.error('Failed to delete segment');
    },
  });

  const contacts = contactsData?.data ?? [];
  const total = contactsData?.meta?.total ?? 0;

  const contactColumns: Column<Contact>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (c) => (
        <Link
          href={`/contacts/${c.id}`}
          className="text-xs font-medium text-text-primary hover:text-tw-blue transition-colors"
        >
          {[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email}
        </Link>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (c) => (
        <span className="text-xs text-text-secondary">{c.email}</span>
      ),
    },
    {
      key: 'created',
      header: 'Created',
      render: (c) => (
        <span className="text-xs text-text-muted">{formatDate(c.created_at)}</span>
      ),
    },
  ];

  return (
    <>
      <TopBar
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/segments/${id}/edit`)}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete
            </Button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto space-y-6">
          {segment && (
            <h2 className="text-lg font-semibold text-text-primary">{segment.name}</h2>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Matching Contacts"
              value={formatNumber(total)}
              variant="blue-gradient"
            />
          </div>

          {!contactsLoading && contacts.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No matching contacts"
              description="No contacts match the rules defined in this segment."
            />
          ) : (
            <DataTable
              columns={contactColumns}
              data={contacts}
              total={total}
              page={page}
              perPage={perPage}
              onPageChange={goToPage}
              isLoading={contactsLoading}
              getId={(c) => c.id}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Segment"
        description={`Are you sure you want to delete "${segment?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}
