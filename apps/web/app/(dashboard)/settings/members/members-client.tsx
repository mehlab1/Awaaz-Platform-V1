'use client';

import { useState } from 'react';

import { format } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CustomSelect } from '@/components/ui/custom-select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  type InviteMemberInput,
  type MemberRole,
  type MemberRow,
  type PendingInvitationRow,
  useMembers,
} from '@/hooks/use-members';

import { InviteMemberDialog } from './invite-member-dialog';

const ROLES: MemberRole[] = ['OWNER', 'ADMIN', 'BUILDER', 'VIEWER'];
const SELECT_CLASS =
  'min-w-[9rem] rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm disabled:opacity-100';

export function MembersClient() {
  const membersApi = useMembers();
  const members = membersApi.members.data ?? [];
  const invitations = membersApi.invitations.data ?? [];
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!membersApi.activeOrgId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization first.
      </p>
    );
  }

  const invite = async (input: InviteMemberInput) => {
    await membersApi.inviteMember.mutateAsync(input);
    setFeedback(`Invitation sent to ${input.email.trim()}.`);
  };

  const resend = async (id: string) => {
    const pending = invitations.find((item) => item.id === id);
    await membersApi.resendInvitation.mutateAsync(id);
    setFeedback(
      pending
        ? `Invitation resent to ${pending.email}.`
        : 'Invitation resent.',
    );
  };

  const cancel = async (id: string) => {
    const pending = invitations.find((item) => item.id === id);
    await membersApi.cancelInvitation.mutateAsync(id);
    setFeedback(
      pending
        ? `Invitation canceled for ${pending.email}.`
        : 'Invitation canceled.',
    );
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Team members and outstanding invitations.
          </p>
        </div>
        <InviteMemberDialog
          canInvite={membersApi.canManageMembers}
          isBusy={membersApi.inviteMember.isPending}
          onSubmit={invite}
        />
      </header>

      <StatusLine error={firstError(membersApi)} message={feedback} />

      <MembersTable
        members={members}
        isLoading={membersApi.members.isLoading}
        isRefreshing={membersApi.members.isFetching && !membersApi.members.isLoading}
      />

      {membersApi.canManageMembers ? (
        <InvitationsTable
          invitations={invitations}
          isLoading={membersApi.invitations.isLoading}
          isRefreshing={
            membersApi.invitations.isFetching && !membersApi.invitations.isLoading
          }
          resendId={membersApi.resendInvitation.variables}
          cancelId={membersApi.cancelInvitation.variables}
          onResend={resend}
          onCancel={cancel}
        />
      ) : null}
    </div>
  );
}

function StatusLine({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  if (!error) {
    return message ? <p className="text-sm text-emerald-700">{message}</p> : null;
  }
  return <p className="text-sm text-destructive">{error}</p>;
}

function MembersTable({
  members,
  isLoading,
  isRefreshing,
}: {
  members: MemberRow[];
  isLoading: boolean;
  isRefreshing?: boolean;
}) {
  const initialLoading = isLoading && members.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active members</CardTitle>
        <CardDescription>{members.length.toLocaleString()} members</CardDescription>
      </CardHeader>
      <CardContent>
        {initialLoading ? (
          <MembersTableSkeleton />
        ) : members.length === 0 ? (
          <EmptyState label="No members found." />
        ) : (
          <div className="space-y-2">
            {isRefreshing ? (
              <p className="text-xs text-muted-foreground">Refreshing members...</p>
            ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>User ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <MemberTableRow key={member.membershipId} member={member} />
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MemberTableRow({ member }: { member: MemberRow }) {
  return (
    <TableRow>
      <TableCell>{displayName(member)}</TableCell>
      <TableCell>{member.email ?? '—'}</TableCell>
      <TableCell>
        <CustomSelect
          className="min-w-[9rem]"
          buttonClassName={SELECT_CLASS}
          value={member.role}
          ariaLabel={`Role for ${displayName(member)}`}
          disabled
          options={ROLES.map((role) => ({ value: role, label: role }))}
        />
      </TableCell>
      <TableCell className="font-mono text-xs">{member.userId}</TableCell>
    </TableRow>
  );
}

function InvitationsTable({
  invitations,
  isLoading,
  isRefreshing,
  resendId,
  cancelId,
  onResend,
  onCancel,
}: {
  invitations: PendingInvitationRow[];
  isLoading: boolean;
  isRefreshing: boolean;
  resendId: string | undefined;
  cancelId: string | undefined;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const initialLoading = isLoading && invitations.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
        <CardDescription>
          {invitations.length.toLocaleString()} pending
        </CardDescription>
      </CardHeader>
      <CardContent>
        {initialLoading ? (
          <InvitationsTableSkeleton />
        ) : invitations.length === 0 ? (
          <EmptyState label="No pending invitations." />
        ) : (
          <div className="space-y-2">
            {isRefreshing ? (
              <p className="text-xs text-muted-foreground">Refreshing invitations...</p>
            ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Invitation</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations.map((invitation) => (
                <InvitationTableRow
                  key={invitation.id}
                  invitation={invitation}
                  isResending={resendId === invitation.id}
                  isCancelling={cancelId === invitation.id}
                  onResend={onResend}
                  onCancel={onCancel}
                />
              ))}
            </TableBody>
          </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MembersTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="grid grid-cols-4 gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

function InvitationsTableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="grid grid-cols-6 gap-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  );
}

function InvitationTableRow({
  invitation,
  isResending,
  isCancelling,
  onResend,
  onCancel,
}: {
  invitation: PendingInvitationRow;
  isResending: boolean;
  isCancelling: boolean;
  onResend: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  return (
    <TableRow>
      <TableCell>{invitation.email}</TableCell>
      <TableCell>
        <Badge variant="outline">Pending</Badge>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{invitation.role}</Badge>
      </TableCell>
      <TableCell>{formatDate(invitation.createdAt)}</TableCell>
      <TableCell className="max-w-[12rem] truncate font-mono text-xs">
        {invitation.clerkInviteId ?? '—'}
      </TableCell>
      <TableCell className="space-x-2 text-right">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isResending || isCancelling}
          onClick={() => onResend(invitation.id)}
        >
          {isResending ? 'Resending...' : 'Resend'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isResending || isCancelling}
          onClick={() => onCancel(invitation.id)}
        >
          {isCancelling ? 'Canceling...' : 'Cancel'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function displayName(member: MemberRow): string {
  const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
  return name || '—';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return format(date, 'MMM d, yyyy h:mm a');
}

function firstError(api: ReturnType<typeof useMembers>): string | null {
  return (
    api.members.error?.message ??
    api.invitations.error?.message ??
    api.inviteMember.error?.message ??
    api.cancelInvitation.error?.message ??
    api.resendInvitation.error?.message ??
    null
  );
}
