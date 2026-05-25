'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

import { format } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

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
import { useOrgContext } from '@/components/org-context';
import { cn } from '@/lib/utils';

const PAGE_LIMIT = 20;

const CALL_DIRECTIONS = ['INBOUND', 'OUTBOUND'] as const;

const CALL_STATUSES = [
  'INITIATED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'ABANDONED',
] as const;

type CallDirection = (typeof CALL_DIRECTIONS)[number];
type CallStatus = (typeof CALL_STATUSES)[number];

interface AgentOption {
  id: string;
  name: string;
}

interface CallListRow {
  id: string;
  status: CallStatus | string;
  direction: CallDirection | string;
  fromNumber: string | null;
  toNumber: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  metadata: unknown;
  totalCostUsd: number | null;
  createdAt: string;
  agent: { id: string; name: string } | null;
}

interface CallsListPayload {
  items: CallListRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface FilterState {
  agentId: string;
  direction: '' | CallDirection;
  status: '' | CallStatus;
  dateFrom: string;
  dateTo: string;
}

export function CallHistoryClient() {
  const { activeOrgId, apiCall } = useOrgContext();
  const router = useRouter();
  const [agents, setAgents] = useState<AgentOption[]>([]);

  const [filters, setFilters] = useState<FilterState>({
    agentId: '',
    direction: '',
    status: '',
    dateFrom: '',
    dateTo: '',
  });
  const [phoneDraft, setPhoneDraft] = useState('');
  const [phoneQuery, setPhoneQuery] = useState('');

  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [payload, setPayload] = useState<CallsListPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setPhoneQuery(phoneDraft.trim()), 400);
    return () => window.clearTimeout(id);
  }, [phoneDraft]);

  useEffect(() => {
    setPage(1);
  }, [phoneQuery]);

  useEffect(() => {
    if (!activeOrgId) {
      setAgents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiCall('/api/v1/agents', { method: 'GET' });
        if (!res.ok || cancelled) {
          return;
        }
        const data = (await res.json()) as AgentOption[];
        if (!cancelled) {
          setAgents(data.map((r) => ({ id: r.id, name: r.name })));
        }
      } catch {
        /* filter bar degrades gracefully without agent names */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeOrgId, apiCall]);

  const queryPath = useCallback(
    (p: number) => {
      const sp = new URLSearchParams();
      sp.set('page', String(Math.max(1, p)));
      sp.set('limit', String(PAGE_LIMIT));
      if (filters.agentId) {
        sp.set('agentId', filters.agentId);
      }
      if (filters.direction) {
        sp.set('direction', filters.direction);
      }
      if (filters.status) {
        sp.set('status', filters.status);
      }
      if (filters.dateFrom) {
        sp.set('dateFrom', filters.dateFrom);
      }
      if (filters.dateTo) {
        sp.set('dateTo', filters.dateTo);
      }
      if (phoneQuery) {
        sp.set('phone', phoneQuery);
      }
      return `/api/v1/calls?${sp.toString()}`;
    },
    [filters, phoneQuery],
  );

  useEffect(() => {
    if (!activeOrgId) {
      setLoading(false);
      setPayload(null);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await apiCall(queryPath(page), { method: 'GET' });
        if (cancelled) {
          return;
        }
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const body = (await res.json()) as CallsListPayload;
        setPayload(body);
        setPage(body.page);
      } catch (e) {
        if (!cancelled) {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
          setPayload(null);
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
  }, [activeOrgId, apiCall, queryPath, page, reloadKey]);

  useEffect(() => {
    const handler = () => setReloadKey((k) => k + 1);
    window.addEventListener('awaaz:call-started', handler as EventListener);
    window.addEventListener('awaaz:call-ended', handler as EventListener);
    return () => {
      window.removeEventListener('awaaz:call-started', handler as EventListener);
      window.removeEventListener('awaaz:call-ended', handler as EventListener);
    };
  }, []);

  const filterActive = useMemo(() => {
    return (
      Boolean(filters.agentId) ||
      Boolean(filters.direction) ||
      Boolean(filters.status) ||
      Boolean(filters.dateFrom) ||
      Boolean(filters.dateTo) ||
      Boolean(phoneQuery)
    );
  }, [
    filters.agentId,
    filters.direction,
    filters.status,
    filters.dateFrom,
    filters.dateTo,
    phoneQuery,
  ]);

  const clearFilters = (): void => {
    setPage(1);
    setFilters({
      agentId: '',
      direction: '',
      status: '',
      dateFrom: '',
      dateTo: '',
    });
    setPhoneDraft('');
    setPhoneQuery('');
  };

  const openCall = useCallback(
    (
      callId: string,
      event?: MouseEvent<HTMLTableRowElement> | KeyboardEvent<HTMLTableRowElement>,
    ) => {
      const href = `/calls/${callId}`;
      if (event?.metaKey || event?.ctrlKey) {
        window.open(href, '_blank', 'noopener,noreferrer');
        return;
      }
      router.push(href);
    },
    [router],
  );

  const openCallFromKeyboard = useCallback(
    (event: KeyboardEvent<HTMLTableRowElement>, callId: string) => {
      if (event.key !== 'Enter') {
        return;
      }
      event.preventDefault();
      openCall(callId, event);
    },
    [openCall],
  );

  const openCallFromMouse = useCallback(
    (event: MouseEvent<HTMLTableRowElement>, callId: string) => {
      if (event.button !== 0 && event.button !== 1) {
        return;
      }
      if (event.button === 1) {
        event.preventDefault();
        window.open(`/calls/${callId}`, '_blank', 'noopener,noreferrer');
        return;
      }
      openCall(callId, event);
    },
    [openCall],
  );

  const fieldClass =
    'rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring';

  const rows = payload?.items ?? [];

  if (!activeOrgId && !loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Select an organization first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-semibold text-2xl tracking-tight">Calls</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Review recent calls, test sessions, transcripts, and call outcomes.
        </p>
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription className="text-muted-foreground text-xs">
            Filter calls by agent, direction, status, date, or phone number.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex min-w-[10rem] flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
              Agent
              <select
                className={fieldClass}
                value={filters.agentId}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, agentId: e.target.value }));
                }}
              >
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[8rem] flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
              Direction
              <select
                className={fieldClass}
                value={filters.direction}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({
                    ...f,
                    direction: e.target.value as FilterState['direction'],
                  }));
                }}
              >
                <option value="">Any</option>
                {CALL_DIRECTIONS.map((d) => (
                  <option key={d} value={d}>
                    {formatEnumLabel(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-[9rem] flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
              Status
              <select
                className={fieldClass}
                value={filters.status}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({
                    ...f,
                    status: e.target.value as FilterState['status'],
                  }));
                }}
              >
                <option value="">Any</option>
                {CALL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatEnumLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
              From date
              <input
                type="date"
                className={fieldClass}
                value={filters.dateFrom}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, dateFrom: e.target.value }));
                }}
              />
            </label>
            <label className="flex flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
              To date
              <input
                type="date"
                className={fieldClass}
                value={filters.dateTo}
                onChange={(e) => {
                  setPage(1);
                  setFilters((f) => ({ ...f, dateTo: e.target.value }));
                }}
              />
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
              Phone number
              <input
                type="search"
                placeholder="Search from or to..."
                className={cn(fieldClass, 'font-mono text-xs')}
                value={phoneDraft}
                onChange={(e) => setPhoneDraft(e.target.value)}
              />
            </label>
          </div>
          {filterActive ? (
            <div>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
          <div>
            <CardTitle>Recent calls</CardTitle>
            <CardDescription>Open any row to review transcript and recording.</CardDescription>
          </div>
          {payload !== null && !loading ? (
            <p className="text-muted-foreground text-xs">
              Page {payload.page} of {payload.totalPages}
              {' · '}
              {payload.total.toLocaleString()} total
              {' · '}
              {PAGE_LIMIT} per page
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading calls…</p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-10 text-center text-muted-foreground text-sm">
              {filterActive
                ? 'No calls match these filters. Try widening the date range or broadening phone search.'
                : 'No recorded calls yet for this organization.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="text-muted-foreground">
                    <TableHead>Date / time</TableHead>
                    <TableHead>Direction</TableHead>
                    <TableHead>Caller</TableHead>
                    <TableHead>Callee</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Cost</TableHead>
                    <TableHead>Test</TableHead>
                    <TableHead className="w-10 text-right">
                      <span className="sr-only">Open call</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const test = isTestMeta(r.metadata);
                    const from = formatCallParty(r.fromNumber);
                    const to = formatCallParty(r.toNumber);
                    return (
                      <TableRow
                        key={r.id}
                        role="link"
                        tabIndex={0}
                        aria-label={`Open call from ${from.display} to ${to.display}`}
                        className="group cursor-pointer border-l-2 border-l-transparent transition hover:border-l-primary/40 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        onClick={(event) => openCallFromMouse(event, r.id)}
                        onAuxClick={(event) => openCallFromMouse(event, r.id)}
                        onKeyDown={(event) => openCallFromKeyboard(event, r.id)}
                      >
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatCreatedAt(r.createdAt)}
                        </TableCell>
                        <TableCell>
                          <DirectionBadge value={String(r.direction)} />
                        </TableCell>
                        <TableCell className="max-w-[140px] font-medium text-sm">
                          <span title={from.title}>
                            {from.display}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-[140px] text-muted-foreground text-sm">
                          <span title={to.title}>
                            {to.display}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">{r.agent?.name ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap font-medium tabular-nums">
                          {formatDuration(r.durationSeconds)}
                        </TableCell>
                        <TableCell>
                          <StatusBadge value={String(r.status)} />
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {formatCost(r.totalCostUsd)}
                        </TableCell>
                        <TableCell>
                          {test ? (
                            <Badge variant="secondary">Test</Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <ChevronRight
                            className="ml-auto size-4 text-muted-foreground transition group-hover:text-foreground"
                            aria-hidden
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {payload !== null && !loading && payload.total > 0 ? (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={payload.page <= 1}
                onClick={() =>
                  setPage((p) => Math.max(1, p - 1))
                }
              >
                Previous
              </Button>
              <span className="text-muted-foreground text-xs">
                Showing {(payload.page - 1) * payload.pageSize + 1}
                –
                {(payload.page - 1) * payload.pageSize + payload.items.length} of{' '}
                {payload.total}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={payload.page >= payload.totalPages}
                onClick={() =>
                  setPage((p) => p + 1)
                }
              >
                Next
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return format(d, 'MMM d yyyy HH:mm');
}

function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCallParty(value: string | null): { display: string; title: string } {
  if (value === null || value.trim() === '') {
    return { display: '—', title: 'No phone number' };
  }
  if (value === 'browser-preview') {
    return { display: 'Browser Preview', title: 'Browser Preview' };
  }
  const display = stringOrDash(value);
  return { display, title: display };
}

function stringOrDash(value: string | null): string {
  if (value === null || value.trim() === '') {
    return '—';
  }
  return value;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null || seconds < 0) {
    return '—';
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatCost(usd: number | null): string {
  if (usd === null || Number.isNaN(usd)) {
    return '—';
  }
  return `$${usd.toFixed(4)}`;
}

function isTestMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') {
    return false;
  }
  const rec = meta as Record<string, unknown>;
  return rec.isTest === true || rec.isTestCall === true;
}

function DirectionBadge({ value }: { value: string }) {
  if (value === 'INBOUND') {
    return (
      <Badge variant="default" className="font-mono text-[10px]">
        INBOUND
      </Badge>
    );
  }
  if (value === 'OUTBOUND') {
    return (
      <Badge variant="secondary" className="font-mono text-[10px]">
        OUTBOUND
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      {value}
    </Badge>
  );
}

function StatusBadge({ value }: { value: string }) {
  if (value === 'COMPLETED') {
    return (
      <Badge variant="default" className="font-mono text-[10px]">
        {value}
      </Badge>
    );
  }
  if (value === 'FAILED' || value === 'ABANDONED') {
    return (
      <Badge variant="destructive" className="font-mono text-[10px]">
        {value}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-mono text-[10px]">
      {value}
    </Badge>
  );
}
