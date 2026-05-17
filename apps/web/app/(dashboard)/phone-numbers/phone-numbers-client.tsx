'use client';

import { useState } from 'react';

import { format } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  type PhoneAgentOption,
  type PhoneNumberRow,
  type RegisterPhoneNumberInput,
  usePhoneNumbers,
} from '@/hooks/use-phone-numbers';

import { AddNumberDialog } from './add-number-dialog';

const SELECT_CLASS =
  'min-w-[12rem] rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

export function PhoneNumbersClient() {
  const {
    activeOrgId,
    phoneNumbers,
    agents,
    registerPhoneNumber,
    assignPhoneNumber,
  } = usePhoneNumbers();
  const [message, setMessage] = useState<string | null>(null);
  const rows = phoneNumbers.data ?? [];

  if (!activeOrgId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization first.
      </p>
    );
  }

  const addNumber = async (input: RegisterPhoneNumberInput) => {
    await registerPhoneNumber.mutateAsync(input);
    setMessage('Phone number added.');
  };

  const assignNumber = async (phoneNumberId: string, agentId: string) => {
    const nextAgentId = agentId.length > 0 ? agentId : null;
    setMessage(null);
    await assignPhoneNumber.mutateAsync({ phoneNumberId, agentId: nextAgentId });
    setMessage(nextAgentId ? 'Dispatch rule synced.' : 'Phone number unassigned.');
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Phone Numbers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Registered Twilio numbers and agent routing.
          </p>
        </div>
        <AddNumberDialog
          isBusy={registerPhoneNumber.isPending}
          onSubmit={addNumber}
        />
      </header>

      <StatusLine
        message={message}
        error={
          phoneNumbers.error?.message ??
          agents.error?.message ??
          registerPhoneNumber.error?.message ??
          assignPhoneNumber.error?.message ??
          null
        }
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Numbers</CardTitle>
            <CardDescription>
              {rows.length.toLocaleString()} registered
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={phoneNumbers.isFetching}
            onClick={() => void phoneNumbers.refetch()}
          >
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          <NumbersTable
            rows={rows}
            agents={agents.data ?? []}
            isLoading={phoneNumbers.isLoading || agents.isLoading}
            busyPhoneNumberId={assignPhoneNumber.variables?.phoneNumberId}
            isAssigning={assignPhoneNumber.isPending}
            onAssign={assignNumber}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function StatusLine({
  message,
  error,
}: {
  message: string | null;
  error: string | null;
}) {
  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (message) {
    return <p className="text-sm text-emerald-700">{message}</p>;
  }
  return null;
}

function NumbersTable({
  rows,
  agents,
  isLoading,
  busyPhoneNumberId,
  isAssigning,
  onAssign,
}: {
  rows: PhoneNumberRow[];
  agents: PhoneAgentOption[];
  isLoading: boolean;
  busyPhoneNumberId: string | undefined;
  isAssigning: boolean;
  onAssign: (phoneNumberId: string, agentId: string) => Promise<void>;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading numbers...</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No phone numbers registered.
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Number</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Assigned agent</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Dispatch</TableHead>
          <TableHead>Twilio SID</TableHead>
          <TableHead>Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <PhoneNumberTableRow
            key={row.id}
            row={row}
            agents={agents}
            isBusy={isAssigning && busyPhoneNumberId === row.id}
            onAssign={onAssign}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function PhoneNumberTableRow({
  row,
  agents,
  isBusy,
  onAssign,
}: {
  row: PhoneNumberRow;
  agents: PhoneAgentOption[];
  isBusy: boolean;
  onAssign: (phoneNumberId: string, agentId: string) => Promise<void>;
}) {
  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{row.number}</TableCell>
      <TableCell>{row.friendlyName ?? '—'}</TableCell>
      <TableCell>
        <select
          className={SELECT_CLASS}
          value={row.agentId ?? ''}
          disabled={isBusy}
          onChange={(event) => {
            void onAssign(row.id, event.target.value);
          }}
        >
          <option value="">Unassigned</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <StatusBadge isActive={row.isActive} />
      </TableCell>
      <TableCell>
        <DispatchBadge row={row} />
      </TableCell>
      <TableCell className="max-w-[12rem] truncate font-mono text-xs">
        {row.twilioSid ?? '—'}
      </TableCell>
      <TableCell>{formatDate(row.updatedAt)}</TableCell>
    </TableRow>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant={isActive ? 'outline' : 'secondary'}
      className={
        isActive
          ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-800'
          : 'text-muted-foreground'
      }
    >
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function DispatchBadge({ row }: { row: PhoneNumberRow }) {
  if (!row.agentId) {
    return <Badge variant="secondary">Unassigned</Badge>;
  }
  if (row.liveKitDispatchRuleId) {
    return <Badge variant="outline">Synced</Badge>;
  }
  return <Badge variant="destructive">Needs sync</Badge>;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return format(date, 'MMM d, yyyy h:mm a');
}
