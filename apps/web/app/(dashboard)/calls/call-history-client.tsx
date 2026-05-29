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
import { ChevronRight, ChevronLeft, Filter, X, Phone } from 'lucide-react';
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
import { CustomSelect } from '@/components/ui/custom-select';
import { Skeleton } from '@/components/ui/skeleton';
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
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [unfilteredTotal, setUnfilteredTotal] = useState<number | null>(null);
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

  const filtersApplied = useMemo(() => {
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

  useEffect(() => {
    if (!activeOrgId) {
      setLoading(false);
      setPayload(null);
      setHasLoadedOnce(false);
      setUnfilteredTotal(null);
      return undefined;
    }
    let cancelled = false;
    const requestHasFilters = filtersApplied;
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
        setHasLoadedOnce(true);
        if (!requestHasFilters) {
          setUnfilteredTotal(body.total);
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
  }, [activeOrgId, apiCall, filtersApplied, queryPath, page, reloadKey]);

  useEffect(() => {
    const handler = () => setReloadKey((k) => k + 1);
    window.addEventListener('awaaz:call-started', handler as EventListener);
    window.addEventListener('awaaz:call-ended', handler as EventListener);
    return () => {
      window.removeEventListener('awaaz:call-started', handler as EventListener);
      window.removeEventListener('awaaz:call-ended', handler as EventListener);
    };
  }, []);

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
    'rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring transition-colors';

  const rows = payload?.items ?? [];
  const isInitialLoading = loading && !hasLoadedOnce && payload === null;
  const isRefreshing = loading && hasLoadedOnce;
  const hasFilteredCalls = rows.length > 0;
  const hasCalls =
    (unfilteredTotal ?? (!filtersApplied ? payload?.total : null) ?? 0) > 0;
  const showFilterEmpty = filtersApplied && hasCalls;

  if (!activeOrgId && !loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Select an organization first.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight flex items-center gap-2.5">
          <Phone className="size-5 text-muted-foreground" />
          Calls
        </h1>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
          Review recent calls, test sessions, transcripts, and call outcomes.
        </p>
      </header>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : null}

      <div className="rounded-xl border border-border/50 bg-muted/[0.03] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="size-3" />
            Filters
          </span>
          {filtersApplied && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
              onClick={clearFilters}
            >
              <X className="size-3" />
              Clear
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[10rem] flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
            Agent
            <CustomSelect
              value={filters.agentId}
              ariaLabel="Filter by agent"
              placeholder="All agents"
              buttonClassName={fieldClass}
              options={[
                { value: '', label: 'All agents' },
                ...agents.map((a) => ({ value: a.id, label: a.name })),
              ]}
              onValueChange={(value) => {
                setPage(1);
                setFilters((f) => ({ ...f, agentId: value }));
              }}
            />
          </label>
          <label className="flex min-w-[8rem] flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
            Direction
            <CustomSelect
              value={filters.direction}
              ariaLabel="Filter by direction"
              placeholder="Any"
              buttonClassName={fieldClass}
              options={[
                { value: '', label: 'Any' },
                ...CALL_DIRECTIONS.map((d) => ({
                  value: d,
                  label: formatEnumLabel(d),
                })),
              ]}
              onValueChange={(value) => {
                setPage(1);
                setFilters((f) => ({
                  ...f,
                  direction: value as FilterState['direction'],
                }));
              }}
            />
          </label>
          <label className="flex min-w-[9rem] flex-col gap-1 text-muted-foreground text-xs uppercase tracking-wide">
            Status
            <CustomSelect
              value={filters.status}
              ariaLabel="Filter by status"
              placeholder="Any"
              buttonClassName={fieldClass}
              options={[
                { value: '', label: 'Any' },
                ...CALL_STATUSES.map((s) => ({
                  value: s,
                  label: formatEnumLabel(s),
                })),
              ]}
              onValueChange={(value) => {
                setPage(1);
                setFilters((f) => ({
                  ...f,
                  status: value as FilterState['status'],
                }));
              }}
            />
          </label>
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
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-4">
          <div>
            <CardTitle>Recent calls</CardTitle>
            <CardDescription>Open any row to review transcript and recording.</CardDescription>
          </div>
          {payload !== null ? (
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
          {isInitialLoading ? (
            <CallsLoadingState />
          ) : !hasFilteredCalls ? (
            <CallsEmptyState
              filtersApplied={showFilterEmpty}
              onClearFilters={clearFilters}
              onGoToAgents={() => router.push('/agents')}
            />
          ) : (
            <div className="overflow-x-auto">
              {isRefreshing ? (
                <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
                  <span className="size-1.5 rounded-full bg-primary animate-pulse" />
                  Refreshing calls...
                </div>
              ) : null}
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

          {payload !== null && payload.total > 0 ? (
            <div className="mt-6 flex items-center justify-between gap-3 pt-5 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={payload.page <= 1}
                onClick={() =>
                  setPage((p) => Math.max(1, p - 1))
                }
              >
                <ChevronLeft className="size-3.5 mr-1" />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
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
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function CallsLoadingState() {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/[0.025] p-5">
      <div className="flex items-center justify-between gap-4 border-b border-border/40 pb-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-56" />
        </div>
        <Skeleton className="h-7 w-24 rounded-full" />
      </div>
      <div className="space-y-3 pt-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid gap-3 rounded-lg border border-border/40 bg-background/70 p-3 sm:grid-cols-[1.1fr_0.7fr_1fr_1fr_0.8fr]"
          >
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CallsEmptyState({
  filtersApplied,
  onClearFilters,
  onGoToAgents,
}: {
  filtersApplied: boolean;
  onClearFilters: () => void;
  onGoToAgents: () => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border/70 bg-muted/[0.02] px-6 py-14 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Phone className="size-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        {filtersApplied ? 'No calls match these filters' : 'No calls yet'}
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
        {filtersApplied
          ? 'Try changing the filters or clearing your search.'
          : 'Test an agent or connect a phone number to start seeing calls here.'}
      </p>
      <div className="mt-5">
        {filtersApplied ? (
          <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onGoToAgents}>
            Go to Agents
          </Button>
        )}
      </div>
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
      <Badge variant="outline" className="font-mono text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300">
        INBOUND
      </Badge>
    );
  }
  if (value === 'OUTBOUND') {
    return (
      <Badge variant="outline" className="font-mono text-[10px] border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
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
      <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
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
  if (value === 'IN_PROGRESS') {
    return (
      <Badge variant="outline" className="font-mono text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
        {value}
      </Badge>
    );
  }
  if (value === 'INITIATED') {
    return (
      <Badge variant="outline" className="font-mono text-[10px] border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
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
