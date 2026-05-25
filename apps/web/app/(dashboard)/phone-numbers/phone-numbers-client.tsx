'use client';

import { useState } from 'react';

import { format } from 'date-fns';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Minus,
  Phone,
  RefreshCw,
} from 'lucide-react';

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
  'min-w-[12rem] appearance-none rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background transition-colors hover:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';

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
    <div className="space-y-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Phone className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Phone Numbers</h1>
              <p className="text-sm text-muted-foreground">
                Registered Twilio numbers and agent routing.
              </p>
            </div>
          </div>
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
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-4 space-y-0 pb-4">
          <div className="flex items-center gap-3">
            <div>
              <div className="flex items-center gap-2">
                <CardTitle>Numbers</CardTitle>
                <Badge variant="secondary" className="tabular-nums">
                  {rows.length.toLocaleString()}
                </Badge>
              </div>
              <CardDescription className="mt-1">
                Manage your registered phone numbers
              </CardDescription>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={phoneNumbers.isFetching}
            onClick={() => void phoneNumbers.refetch()}
            className="gap-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${phoneNumbers.isFetching ? 'animate-spin' : ''}`} />
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
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Phone className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-medium">No phone numbers registered</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Get started by adding your first Twilio phone number.
        </p>
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

function CopyButton({ text, field, copiedField, onCopy }: {
  text: string;
  field: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
}) {
  const isCopied = copiedField === field;
  return (
    <button
      type="button"
      onClick={() => onCopy(text, field)}
      className="ml-1.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      title="Copy to clipboard"
    >
      {isCopied ? (
        <Check className="h-3 w-3 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </button>
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
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const copyToClipboard = (text: string, field: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <TableRow className="hover:bg-muted/50 transition-colors">
      <TableCell>
        <div className="flex items-center gap-1">
          <span className="font-mono text-sm font-medium">{row.number}</span>
          <CopyButton
            text={row.number}
            field="number"
            copiedField={copiedField}
            onCopy={copyToClipboard}
          />
        </div>
      </TableCell>
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
      <TableCell>
        <div className="flex max-w-[12rem] items-center gap-1">
          <span className="truncate font-mono text-xs">{row.twilioSid ?? '—'}</span>
          {row.twilioSid && (
            <CopyButton
              text={row.twilioSid}
              field="sid"
              copiedField={copiedField}
              onCopy={copyToClipboard}
            />
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{formatDate(row.updatedAt)}</TableCell>
    </TableRow>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge
      variant={isActive ? 'outline' : 'secondary'}
      className={
        isActive
          ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-800 gap-1.5'
          : 'text-muted-foreground gap-1.5'
      }
    >
      {isActive ? (
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      )}
      {isActive ? 'Active' : 'Inactive'}
    </Badge>
  );
}

function DispatchBadge({ row }: { row: PhoneNumberRow }) {
  if (!row.agentId) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Minus className="h-3 w-3" />
        Unassigned
      </Badge>
    );
  }
  if (row.liveKitDispatchRuleId) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-600/50 bg-emerald-600/10 text-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Synced
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-amber-500/50 bg-amber-500/10 text-amber-700">
      <AlertTriangle className="h-3 w-3" />
      Needs sync
    </Badge>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return format(date, 'MMM d, yyyy h:mm a');
}
