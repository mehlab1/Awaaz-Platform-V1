'use client';

import { useCallback } from 'react';

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
  type ApiKeyRow,
  type CreatedApiKey,
  useApiKeys,
} from '@/hooks/use-api-keys';

import { CreateApiKeyDialog } from './create-api-key-dialog';

export function ApiKeysClient() {
  const apiKeys = useApiKeys();
  const rows = apiKeys.apiKeys.data ?? [];
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

      <StatusLine error={firstError(apiKeys)} />

      {!apiKeys.canManageApiKeys ? (
        <p className="text-sm text-muted-foreground">
          API keys require an OWNER or ADMIN role.
        </p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Keys</CardTitle>
            <CardDescription>
              {rows.length.toLocaleString()} created
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApiKeysTable
              rows={rows}
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
      <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        No API keys created.
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
  return (
    <TableRow>
      <TableCell>{row.name}</TableCell>
      <TableCell className="font-mono text-xs">{row.keyPrefix}</TableCell>
      <TableCell>
        <Badge variant={row.isRevoked ? 'secondary' : 'outline'}>
          {row.isRevoked ? 'Revoked' : 'Active'}
        </Badge>
      </TableCell>
      <TableCell>{formatDate(row.createdAt)}</TableCell>
      <TableCell>{row.lastUsedAt ? formatDate(row.lastUsedAt) : 'Never'}</TableCell>
      <TableCell className="text-right">
        <Button
          type="button"
          variant="destructive"
          size="sm"
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
