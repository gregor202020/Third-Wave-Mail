'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, MoreHorizontal, KeyRound, Trash2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { queryKeys } from '@/lib/query-keys';
import { formatDate, timeAgo } from '@/lib/utils';
import { UserRole } from '@twmail/shared/types';
import { TopBar } from '@/components/layout/top-bar';
import { DataTable, type Column } from '@/components/shared/data-table';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePagination } from '@/hooks/use-pagination';

interface UserRow {
  id: number;
  name: string;
  email: string;
  role: number;
  last_login_at: string | null;
  created_at: string;
}

// --- Invite User Schema ---
const inviteSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'Name is required').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.coerce.number().refine((r) => [UserRole.ADMIN as number, UserRole.EDITOR as number, UserRole.VIEWER as number].includes(r)),
});
type InviteForm = z.infer<typeof inviteSchema>;

// --- Reset Password Schema ---
const resetSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
type ResetForm = z.infer<typeof resetSchema>;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { page, goToPage } = usePagination();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  // --- Fetch users ---
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.users.list({ page }),
    queryFn: () =>
      api.get<{ data: UserRow[]; meta: { page: number; per_page: number; total: number; total_pages: number } }>(
        `/users?page=${page}&per_page=50`
      ),
  });

  const users = data?.data ?? [];
  const meta = data?.meta ?? { page: 1, per_page: 50, total: 0, total_pages: 1 };

  // --- Create user mutation ---
  const createMutation = useMutation({
    mutationFn: (values: InviteForm) => api.post('/users', values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      setInviteOpen(false);
      toast.success('User created successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Update role mutation ---
  const updateRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: number; role: number }) =>
      api.patch(`/users/${id}`, { role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      toast.success('Role updated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Reset password mutation ---
  const resetMutation = useMutation({
    mutationFn: ({ id, password }: { id: number; password: string }) =>
      api.post(`/users/${id}/reset-password`, { password }),
    onSuccess: () => {
      setResetOpen(false);
      setSelectedUser(null);
      toast.success('Password reset successfully');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Delete mutation ---
  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      setDeleteOpen(false);
      setSelectedUser(null);
      toast.success('User deleted');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- Table columns ---
  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <div>
          <span className="text-xs font-medium text-text-primary">{u.name}</span>
          <div className="text-[10px] text-text-muted">{u.email}</div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => (
        <Select
          value={String(u.role)}
          onValueChange={(val) => updateRoleMutation.mutate({ id: u.id, role: Number(val) })}
        >
          <SelectTrigger className="w-28 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={String(UserRole.ADMIN)}>Admin</SelectItem>
            <SelectItem value={String(UserRole.EDITOR)}>Editor</SelectItem>
            <SelectItem value={String(UserRole.VIEWER)}>Viewer</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: 'last_login_at',
      header: 'Last Login',
      render: (u) => (
        <span className="text-xs text-text-muted">
          {u.last_login_at ? timeAgo(u.last_login_at) : 'Never'}
        </span>
      ),
    },
    {
      key: 'created_at',
      header: 'Created',
      render: (u) => (
        <span className="text-xs text-text-muted">{formatDate(u.created_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-10',
      render: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" size="icon" className="h-7 w-7">
              <MoreHorizontal className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { setSelectedUser(u); setResetOpen(true); }}>
              <KeyRound className="w-3.5 h-3.5 mr-2" /> Reset Password
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-status-danger focus:text-status-danger"
              onClick={() => { setSelectedUser(u); setDeleteOpen(true); }}
            >
              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <>
      <TopBar
        action={
          <Button
            className="bg-tw-blue hover:bg-tw-blue-dark"
            size="sm"
            onClick={() => setInviteOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Add User
          </Button>
        }
      />
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          <DataTable
            columns={columns}
            data={users}
            total={meta.total}
            page={meta.page}
            perPage={meta.per_page}
            onPageChange={goToPage}
            isLoading={isLoading}
            getId={(u) => u.id}
          />
        </div>
      </div>

      {/* Invite / Add User Sheet */}
      <InviteUserSheet
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onSubmit={(values) => createMutation.mutate(values)}
        isPending={createMutation.isPending}
      />

      {/* Reset Password Sheet */}
      <ResetPasswordSheet
        open={resetOpen}
        onOpenChange={(open) => { setResetOpen(open); if (!open) setSelectedUser(null); }}
        user={selectedUser}
        onSubmit={(password) => {
          if (selectedUser) resetMutation.mutate({ id: selectedUser.id, password });
        }}
        isPending={resetMutation.isPending}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={(open) => { setDeleteOpen(open); if (!open) setSelectedUser(null); }}
        title="Delete User"
        description={`Are you sure you want to delete ${selectedUser?.name ?? 'this user'}? This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { if (selectedUser) deleteMutation.mutate(selectedUser.id); }}
      />
    </>
  );
}

// --- Invite User Sheet ---
function InviteUserSheet({
  open, onOpenChange, onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: InviteForm) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, formState: { errors }, reset, setValue, watch } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: UserRole.VIEWER },
  });

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add User</SheetTitle>
          <SheetDescription>Create a new user account with a role and temporary password.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
          <div>
            <Label className="text-xs">Name</Label>
            <Input {...register('name')} placeholder="John Doe" className="mt-1" />
            {errors.name && <p className="text-xs text-status-danger mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <Label className="text-xs">Email</Label>
            <Input {...register('email')} type="email" placeholder="john@example.com" className="mt-1" />
            {errors.email && <p className="text-xs text-status-danger mt-1">{errors.email.message}</p>}
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input {...register('password')} type="password" placeholder="Min 8 characters" className="mt-1" />
            {errors.password && <p className="text-xs text-status-danger mt-1">{errors.password.message}</p>}
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select
              value={String(watch('role'))}
              onValueChange={(val) => setValue('role', Number(val))}
            >
              <SelectTrigger className="w-full mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={String(UserRole.ADMIN)}>
                  <div className="flex items-center gap-2">
                    <Shield className="w-3 h-3" /> Admin
                  </div>
                </SelectItem>
                <SelectItem value={String(UserRole.EDITOR)}>Editor</SelectItem>
                <SelectItem value={String(UserRole.VIEWER)}>Viewer</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-text-muted mt-1">
              {watch('role') === UserRole.ADMIN && 'Full access to all settings and user management.'}
              {watch('role') === UserRole.EDITOR && 'Can create and manage campaigns, contacts, and templates.'}
              {watch('role') === UserRole.VIEWER && 'Read-only access to reports and dashboards.'}
            </p>
          </div>
          <SheetFooter>
            <Button type="submit" className="bg-tw-blue hover:bg-tw-blue-dark" size="sm" disabled={isPending}>
              {isPending ? 'Creating...' : 'Create User'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// --- Reset Password Sheet ---
function ResetPasswordSheet({
  open, onOpenChange, user, onSubmit, isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRow | null;
  onSubmit: (password: string) => void;
  isPending: boolean;
}) {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
  });

  const handleClose = (open: boolean) => {
    if (!open) reset();
    onOpenChange(open);
  };

  return (
    <Sheet open={open} onOpenChange={handleClose}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Reset Password</SheetTitle>
          <SheetDescription>
            Set a new password for {user?.name ?? 'this user'}.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit((v) => onSubmit(v.password))} className="space-y-4 mt-4">
          <div>
            <Label className="text-xs">New Password</Label>
            <Input {...register('password')} type="password" placeholder="Min 8 characters" className="mt-1" />
            {errors.password && <p className="text-xs text-status-danger mt-1">{errors.password.message}</p>}
          </div>
          <SheetFooter>
            <Button type="submit" className="bg-tw-blue hover:bg-tw-blue-dark" size="sm" disabled={isPending}>
              {isPending ? 'Resetting...' : 'Reset Password'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
