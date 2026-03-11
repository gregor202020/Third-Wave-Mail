'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Pencil, UserX, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, formatDateTime } from '@/lib/utils';
import { TopBar } from '@/components/layout/top-bar';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { TableSkeleton } from '@/components/shared/loading-skeleton';
import { ActivityTimeline } from '@/components/contacts/activity-timeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import type { Contact, List } from '@/types';

interface ContactWithLists extends Contact {
  lists?: List[];
}

export default function ContactDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const contactId = Number(params.id);

  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<Contact>>({});

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.contacts.detail(contactId),
    queryFn: () =>
      api.get<{ data: ContactWithLists }>(`/contacts/${contactId}`).then((r) => r.data),
    enabled: !!contactId,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: queryKeys.contacts.messages(contactId),
    queryFn: () =>
      api.get<{ data: Array<{ id: number; campaign_name: string; subject: string; status: number; sent_at: string }> }>(
        `/contacts/${contactId}/messages`
      ).then((r) => r.data),
    enabled: !!contactId,
  });

  const updateMutation = useMutation({
    mutationFn: (body: Partial<Contact>) =>
      api.patch<{ data: Contact }>(`/contacts/${contactId}`, body),
    onSuccess: () => {
      toast.success('Contact updated');
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(contactId) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to update contact');
    },
  });

  const unsubscribeMutation = useMutation({
    mutationFn: () =>
      api.patch<{ data: Contact }>(`/contacts/${contactId}`, { status: 2 }),
    onSuccess: () => {
      toast.success('Contact unsubscribed');
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(contactId) });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to unsubscribe contact');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/contacts/${contactId}`),
    onSuccess: () => {
      toast.success('Contact deleted');
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      router.push('/contacts');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to delete contact');
    },
  });

  const contact = data;

  const startEditing = () => {
    if (!contact) return;
    setEditData({
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone: contact.phone,
      company: contact.company,
      city: contact.city,
      country: contact.country,
    });
    setEditing(true);
  };

  const saveEdits = () => {
    updateMutation.mutate(editData);
  };

  return (
    <>
      <TopBar
        action={
          <Link href="/contacts" className="flex items-center gap-1 text-xs text-text-muted hover:text-text-primary transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Contacts
          </Link>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[900px] mx-auto">
          {isLoading ? (
            <TableSkeleton rows={6} cols={3} />
          ) : !contact ? (
            <p className="text-sm text-text-muted text-center py-12">Contact not found.</p>
          ) : (
            <>
              {/* Header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-semibold text-text-primary tracking-tight">
                    {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed'}
                  </h2>
                  <p className="text-sm text-text-muted mt-0.5">{contact.email}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <StatusBadge type="contact" status={contact.status} />
                    <span className="text-xs text-text-muted">
                      Added {formatDate(contact.created_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                      <Button
                        className="bg-tw-blue hover:bg-tw-blue-dark"
                        size="sm"
                        onClick={saveEdits}
                        disabled={updateMutation.isPending}
                      >
                        Save
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button variant="outline" size="sm" onClick={startEditing}>
                        <Pencil className="w-3 h-3" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => unsubscribeMutation.mutate()}
                        disabled={contact.status === 2}
                      >
                        <UserX className="w-3 h-3" />
                        Unsubscribe
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <Tabs defaultValue="overview">
                <TabsList variant="line">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="activity">Activity</TabsTrigger>
                  <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="pt-5">
                  <div className="bg-card border border-card-border rounded-[14px] p-5">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                      {editing ? (
                        <>
                          <div className="space-y-1.5">
                            <Label>First Name</Label>
                            <Input
                              value={editData.first_name ?? ''}
                              onChange={(e) => setEditData({ ...editData, first_name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Last Name</Label>
                            <Input
                              value={editData.last_name ?? ''}
                              onChange={(e) => setEditData({ ...editData, last_name: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Phone</Label>
                            <Input
                              value={editData.phone ?? ''}
                              onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Company</Label>
                            <Input
                              value={editData.company ?? ''}
                              onChange={(e) => setEditData({ ...editData, company: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>City</Label>
                            <Input
                              value={editData.city ?? ''}
                              onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Country</Label>
                            <Input
                              value={editData.country ?? ''}
                              onChange={(e) => setEditData({ ...editData, country: e.target.value })}
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <FieldRow label="Email" value={contact.email} />
                          <FieldRow label="Phone" value={contact.phone} />
                          <FieldRow label="Company" value={contact.company} />
                          <FieldRow label="City" value={contact.city} />
                          <FieldRow label="Country" value={contact.country} />
                          <FieldRow label="Timezone" value={contact.timezone} />
                          <FieldRow label="Source" value={contact.source} />
                          <FieldRow
                            label="Engagement Score"
                            value={contact.engagement_score?.toString()}
                          />
                          <FieldRow
                            label="Subscribed"
                            value={contact.subscribed_at ? formatDate(contact.subscribed_at) : null}
                          />
                          <FieldRow
                            label="Last Open"
                            value={contact.last_open_at ? formatDateTime(contact.last_open_at) : null}
                          />
                          <FieldRow
                            label="Last Click"
                            value={contact.last_click_at ? formatDateTime(contact.last_click_at) : null}
                          />
                        </>
                      )}
                    </div>

                    {/* Lists */}
                    {!editing && contact.lists && contact.lists.length > 0 && (
                      <div className="mt-6 pt-4 border-t border-card-border">
                        <h4 className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
                          Lists
                        </h4>
                        <div className="flex flex-wrap gap-1.5">
                          {contact.lists.map((list) => (
                            <Badge key={list.id} variant="secondary">
                              {list.name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="activity" className="pt-5">
                  <div className="bg-card border border-card-border rounded-[14px] p-5">
                    <ActivityTimeline contactId={contactId} />
                  </div>
                </TabsContent>

                <TabsContent value="campaigns" className="pt-5">
                  <div className="bg-card border border-card-border rounded-[14px] p-5">
                    {messagesLoading ? (
                      <TableSkeleton rows={3} cols={3} />
                    ) : !messages || messages.length === 0 ? (
                      <p className="text-xs text-text-muted text-center py-8">
                        No campaigns sent to this contact yet.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className="flex items-center gap-3 px-3 py-2.5 bg-surface rounded-lg"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-text-primary truncate">
                                {msg.campaign_name || msg.subject}
                              </p>
                              {msg.subject && msg.campaign_name && (
                                <p className="text-[11px] text-text-muted truncate">
                                  {msg.subject}
                                </p>
                              )}
                            </div>
                            <StatusBadge type="campaign" status={msg.status} />
                            <span className="text-[10px] text-text-muted shrink-0">
                              {msg.sent_at ? formatDate(msg.sent_at) : '--'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title="Delete Contact"
                description="This will permanently delete this contact and all associated data. This action cannot be undone."
                confirmLabel="Delete"
                destructive
                onConfirm={() => deleteMutation.mutate()}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-text-muted font-medium mb-0.5">
        {label}
      </p>
      <p className="text-xs text-text-primary">{value || '--'}</p>
    </div>
  );
}
