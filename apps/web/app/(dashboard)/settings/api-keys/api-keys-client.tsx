'use client';

import { useCallback, useState } from 'react';

import { format } from 'date-fns';
import { Check, Copy, KeyRound, Search, ShieldAlert } from 'lucide-react';

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
  type ApiKeyRow,
  type CreatedApiKey,
  useApiKeys,
} from '@/hooks/use-api-keys';

import { CreateApiKeyDialog } from './create-api-key-dialog';

export function ApiKeysClient() {
  const apiKeys = useApiKeys();
  const rows = apiKeys.apiKeys.data ?? [];
  const [searchQuery, setSearchQuery] = useState('');
  const resetCreateState = useCallback(() => {
    apiKeys.createApiKey.reset();
  }, [apiKeys.createApiKey]);

  if (!apiKeys.activeOrgId) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization first.
      </p>
    );
  }

  const createKey = (name: string): Promise<CreatedApiKey> => {
    return apiKeys.createApiKey.mutateAsync({ name });
  };

  const filteredRows = rows.filter((row) =>
    row.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Programmatic access keys for this organization.
          </p>
        </div>
        <CreateApiKeyDialog
          canCreate={apiKeys.canManageApiKeys}
          isBusy={apiKeys.createApiKey.isPending}
          onSubmit={createKey}
          onClosed={resetCreateState}
        />
      </header>

      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
        <ShieldAlert className="size-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Keep your API keys secure</p>
          <p className="text-xs text-muted-foreground">API keys grant full access to your organization&apos;s resources. Never share them in public repositories or client-side code.</p>
        </div>
      </div>

      <StatusLine error={firstError(apiKeys)} />

      {!apiKeys.canManageApiKeys ? (
        <p className="text-sm text-muted-foreground">
          API keys require an OWNER or ADMIN role.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Keys</CardTitle>
                <CardDescription>
                  {rows.length.toLocaleString()} created
                </CardDescription>
              </div>
              <div className="relative sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search keys by name..."
                  className="w-full rounded-lg border border-input bg-background pl-9 pr-3 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ApiKeysTable
              rows={filteredRows}
              isLoading={apiKeys.apiKeys.isLoading}
              revokingId={apiKeys.revokeApiKey.variables}
              onRevoke={(id) => apiKeys.revokeApiKey.mutate(id)}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusLine({ error }: { error: string | null }) {
  if (!error) {
    return null;
  }
  return <p className="text-sm text-destructive">{error}</p>;
}

function ApiKeysTable({
  rows,
  isLoading,
  revokingId,
  onRevoke,
}: {
  rows: ApiKeyRow[];
  isLoading: boolean;
  revokingId: string | undefined;
  onRevoke: (id: string) => void;
}) {
  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading keys...</p>;
  }
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <KeyRound className="mx-auto size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium text-foreground">No API keys yet</p>
        <p className="mt-1 text-xs text-muted-foreground">Create your first key to start integrating with the API.</p>
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Prefix</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Last used</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <ApiKeyTableRow
            key={row.id}
            row={row}
            isRevoking={revokingId === row.id}
            onRevoke={onRevoke}
          />
        ))}
      </TableBody>
    </Table>
  );
}

function ApiKeyTableRow({
  row,
  isRevoking,
  onRevoke,
}: {
  row: ApiKeyRow;
  isRevoking: boolean;
  onRevoke: (id: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{row.name}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <code className="rounded-md bg-muted px-2 py-1 text-xs font-mono">{row.keyPrefix}••••••</code>
          <button type="button" onClick={() => copyToClipboard(row.keyPrefix)} className="text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </button>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={row.isRevoked ? 'secondary' : 'outline'} className={row.isRevoked ? '' : 'border-emerald-500/30 text-emerald-700'}>
          {!row.isRevoked && (
            <span className="relative mr-1.5 flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
          )}
          {row.isRevoked ? 'Revoked' : 'Active'}
        </Badge>
      </TableCell>
      <TableCell>{formatDate(row.createdAt)}</TableCell>
      <TableCell>{row.lastUsedAt ? formatDate(row.lastUsedAt) : 'Never'}</TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-destructive hover:bg-destructive hover:text-destructive-foreground transition-all"
          disabled={row.isRevoked || isRevoking}
          onClick={() => onRevoke(row.id)}
        >
          {isRevoking ? 'Revoking...' : 'Revoke'}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return format(date, 'MMM d, yyyy h:mm a');
}

function firstError(api: ReturnType<typeof useApiKeys>): string | null {
  return (
    api.apiKeys.error?.message ??
    api.createApiKey.error?.message ??
    api.revokeApiKey.error?.message ??
    null
  );
}
