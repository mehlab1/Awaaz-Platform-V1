'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import { format } from 'date-fns';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useOrgContext } from '@/components/org-context';
import { cn } from '@/lib/utils';

interface AgentListRow {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  currentVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  assignedPhoneNumbers: string[];
  callsLast7Days: number;
  currentVersion: {
    id: string;
    voiceId: string;
    versionNumber: number;
    isLive: boolean;
    publishedAt: string | null;
  } | null;
}

export default function AgentsPage() {
  const { activeOrgId, apiCall } = useOrgContext();
  const [agents, setAgents] = useState<AgentListRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeOrgId) {
      setAgents([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await apiCall('/api/v1/agents', { method: 'GET' });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || res.statusText);
        }
        const data = (await res.json()) as AgentListRow[];
        if (!cancelled) {
          setAgents(data);
        }
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, apiCall]);

  const formatPhones = (nums: string[]) => {
    if (nums.length === 0) {
      return '—';
    }
    if (nums.length === 1) {
      return nums[0];
    }
    return `${nums[0]} (+${nums.length - 1})`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="mt-1 max-w-xl text-muted-foreground text-sm">
            Organization{' '}
            <span className="font-mono text-xs">{activeOrgId ?? '—'}</span>.
            Switch org in the sidebar to refresh tenant data.
          </p>
        </div>
        <Button
          type="button"
          variant="default"
          disabled
          title="Agent builder ships in Phase 6.4"
        >
          New Agent
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {!activeOrgId ? (
        <p className="text-sm text-muted-foreground">
          Select an organization to load agents.
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading agents…</p>
      ) : null}

      {!loading && activeOrgId && agents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No agents found. Seed the Sirius agent (`pnpm prisma db seed` from the
          API package) or create one via the API (BUILDER role).
        </p>
      ) : null}

      {!loading && agents.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Voice</TableHead>
              <TableHead>Phone number</TableHead>
              <TableHead>Last edited</TableHead>
              <TableHead className="text-right">Calls (7d)</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {agents.map((row) => {
              const edited = safeParseDate(row.updatedAt);
              const voiceLabel = row.currentVersion?.voiceId ?? '—';

              return (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell>
                    <Badge
                      variant={row.isActive ? 'outline' : 'secondary'}
                      className={
                        row.isActive
                          ? 'border-emerald-600/50 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300'
                          : 'text-muted-foreground'
                      }
                    >
                      {row.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{voiceLabel}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {formatPhones(row.assignedPhoneNumbers)}
                  </TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">
                    {edited
                      ? format(edited, 'MMM d, yyyy h:mm a')
                      : row.updatedAt}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.callsLast7Days}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/agents/${row.id}`}
                      className={cn(
                        buttonVariants({ variant: 'outline', size: 'sm' }),
                      )}
                    >
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}
    </div>
  );
}

function safeParseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
