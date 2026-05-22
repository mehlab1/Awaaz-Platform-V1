'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { format } from 'date-fns';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useOrgContext } from '@/components/org-context';
import { cn } from '@/lib/utils';

import {
  CallWaveformHandle,
  CallWaveformPlayer,
} from './call-waveform-player';

type TranscriptTurn = {
  speaker: string | null;
  text: string;
  startedAt: string | null;
  endedAt: string | null;
  latencyMs: number | null;
};

interface CallDetailPayload {
  id: string;
  organizationId?: string;
  status: string;
  direction: string;
  fromNumber: string | null;
  toNumber: string | null;
  durationSeconds: number | null;
  recordingUrl: string | null;
  costBreakdown: unknown;
  totalCostUsd: number | null;
  metadata: unknown;
  createdAt: string;
  endedAt: string | null;
  startedAt: string | null;
  agent: { id: string; name: string } | null;
  transcript: {
    id: string;
    content: unknown;
    assembledAt: string;
  } | null;
}

interface CostParts {
  sttUsd?: number;
  llmUsd?: number;
  ttsUsd?: number;
  telephonyUsd?: number;
  totalUsd?: number;
  durationMinutes?: number;
  llmTokens?: number;
  ttsCharacters?: number;
}

type RecordingState =
  | { phase: 'idle' | 'loading' }
  | { phase: 'ready'; audioUrl: string }
  | {
      phase: 'unavailable';
      reason: 'none' | 'storage' | 'error' | 'broken';
      detail?: string;
    };

export function CallDetailClient({ callId }: { callId: string }) {
  const { activeOrgId, apiCall } = useOrgContext();
  const waveformRef = useRef<CallWaveformHandle | null>(null);
  const detailRefreshAttempts = useRef(0);

  const [detail, setDetail] = useState<CallDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingState, setRecordingState] =
    useState<RecordingState>({ phase: 'idle' });
  const [isWaveformReady, setIsWaveformReady] = useState(false);

  useEffect(() => {
    if (!activeOrgId) {
      setDetail(null);
      setLoading(false);
      return undefined;
    }
    let aborted = false;
    setLoading(true);
    setError(null);
    setRecordingState({ phase: 'idle' });
    setIsWaveformReady(false);
    setDetail(null);

    void (async () => {
      try {
        const res = await apiCall(`/api/v1/calls/${callId}`, {
          method: 'GET',
        });
        if (aborted) {
          return;
        }
        if (res.status === 404) {
          setDetail(null);
          setError('Call not found.');
          return;
        }
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || res.statusText);
        }
        const body = (await res.json()) as CallDetailPayload;
        setDetail(body);
      } catch (e) {
        if (!aborted) {
          setDetail(null);
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      aborted = true;
    };
  }, [activeOrgId, apiCall, callId]);

  const detailId = detail?.id;

  useEffect(() => {
    detailRefreshAttempts.current = 0;
  }, [callId]);

  useEffect(() => {
    if (!activeOrgId || !detail) {
      return undefined;
    }
    const isCompletedBrowserTest =
      detail.status === 'COMPLETED' && testCallFromMeta(detail.metadata);
    const needsAsyncArtifacts =
      !detail.transcript || detail.costBreakdown == null || !detail.recordingUrl;
    if (
      !isCompletedBrowserTest ||
      !needsAsyncArtifacts ||
      detailRefreshAttempts.current >= 6
    ) {
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      detailRefreshAttempts.current += 1;
      void (async () => {
        try {
          const res = await apiCall(`/api/v1/calls/${callId}`, {
            method: 'GET',
          });
          if (!cancelled && res.ok) {
            setDetail((await res.json()) as CallDetailPayload);
          }
        } catch {
          /* keep showing the current snapshot */
        }
      })();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeOrgId, apiCall, callId, detail]);

  useEffect(() => {
    if (!activeOrgId || !detailId) {
      setRecordingState({ phase: 'idle' });
      setIsWaveformReady(false);
      return undefined;
    }
    let cancelled = false;

    async function probeRecording(): Promise<void> {
      setRecordingState({ phase: 'loading' });
      setIsWaveformReady(false);
      try {
        const res = await apiCall(`/api/v1/calls/${detailId}/recording`, {
          method: 'GET',
        });

        const textFallback = async (): Promise<void> => {
          if (cancelled) {
            return;
          }
          if (res.status === 404 || res.status === 400) {
            setRecordingState({ phase: 'unavailable', reason: 'none' });
            return;
          }
          if (res.status === 503) {
            const txt = await res.text();
            setRecordingState({
              phase: 'unavailable',
              reason: 'storage',
              detail: txt || undefined,
            });
            return;
          }
          const t = await res.text();
          throw new Error(t || res.statusText);
        };

        if (res.ok) {
          const body = (await res.json()) as { url?: string };
          const url =
            typeof body.url === 'string' && body.url.startsWith('http')
              ? body.url
              : null;
          if (!cancelled) {
            if (url) {
              setRecordingState({ phase: 'ready', audioUrl: url });
            } else {
              setRecordingState({ phase: 'unavailable', reason: 'broken' });
            }
          }
          return;
        }
        await textFallback();
      } catch (e: unknown) {
        if (cancelled) {
          return;
        }
        setRecordingState({
          phase: 'unavailable',
          reason: 'error',
          detail: e instanceof Error ? e.message : String(e),
        });
      }
    }

    void probeRecording();

    return () => {
      cancelled = true;
    };
  }, [activeOrgId, apiCall, detail?.recordingUrl, detailId]);

  const transcriptTurns = collectTranscriptTurns(detail?.transcript?.content);
  const callEpoch = parseEpoch(detail?.startedAt ?? detail?.createdAt);
  const costParts = coerceCostParts(detail?.costBreakdown);
  const latencyStats = summarizeLatencies(transcriptTurns);
  const handleWaveformReady = useCallback(() => {
    setIsWaveformReady(true);
  }, []);
  const handleWaveformError = useCallback((message: string) => {
    setIsWaveformReady(false);
    setRecordingState({
      phase: 'unavailable',
      reason: 'broken',
      detail: message,
    });
  }, []);

  const handleSeekFromTurn = useCallback(
    (turn: TranscriptTurn) => {
      if (
        recordingState.phase !== 'ready' ||
        !isWaveformReady ||
        waveformRef.current == null ||
        turn.startedAt == null
      ) {
        return;
      }
      const sec = secondsFromEpoch(turn.startedAt, callEpoch);
      if (sec === null) {
        return;
      }
      waveformRef.current.seekToSeconds(sec);
    },
    [callEpoch, isWaveformReady, recordingState.phase],
  );

  const testBadge = detail ? testCallFromMeta(detail.metadata) : false;

  if (!activeOrgId && !loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Select an organization first.
      </p>
    );
  }

  if (loading && !detail) {
    return <p className="text-muted-foreground text-sm">Loading call…</p>;
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link
          href="/calls"
          className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex')}
        >
          ← Call history
        </Link>
        <p className="text-destructive text-sm">
          {error ?? 'Unable to load this call.'}
        </p>
      </div>
    );
  }

  const sumParts =
    (costParts.sttUsd ?? 0) +
    (costParts.llmUsd ?? 0) +
    (costParts.ttsUsd ?? 0) +
    (costParts.telephonyUsd ?? 0);
  const totalStored = detail.totalCostUsd;
  const sumMatchesTotal =
    totalStored !== null &&
    totalStored !== undefined &&
    !Number.isNaN(sumParts) &&
    Math.abs(sumParts - totalStored) < 0.01;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/calls" className="text-muted-foreground text-sm hover:underline">
          ← Calls
        </Link>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-2xl">Call overview</CardTitle>
            <DirectionBadge dir={detail.direction} />
            <StatusBadge status={detail.status} />
            {testBadge ? <Badge variant="secondary">Test</Badge> : null}
          </div>
          <CardDescription className="font-mono text-xs">
            {detail.id}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-muted-foreground text-xs uppercase tracking-wide">
              Agent
            </h3>
            <p className="font-medium">{detail.agent?.name ?? '—'}</p>
          </div>
          <div>
            <h3 className="text-muted-foreground text-xs uppercase tracking-wide">
              Timing
            </h3>
            <p className="text-sm">
              Created&nbsp;
              <span className="font-medium">
                {formatWhen(detail.createdAt)}
              </span>
            </p>
            <p className="text-sm">
              Ended&nbsp;
              <span className="font-medium">{formatWhen(detail.endedAt)}</span>
            </p>
          </div>
          <div>
            <h3 className="text-muted-foreground text-xs uppercase tracking-wide">
              Numbers
            </h3>
            <p className="font-mono text-sm">
              {stringOrMdash(detail.fromNumber)} → {stringOrMdash(detail.toNumber)}
            </p>
          </div>
          <div>
            <h3 className="text-muted-foreground text-xs uppercase tracking-wide">
              Duration
            </h3>
            <p className="font-medium tabular-nums">
              {formatDuration(detail.durationSeconds)}
            </p>
          </div>
          <div>
            <h3 className="text-muted-foreground text-xs uppercase tracking-wide">
              Recording stored
            </h3>
            <p className="break-words font-mono text-xs">
              {detail.recordingUrl ? detail.recordingUrl : 'None (Phase 9 for PSTN + R2)'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recording</CardTitle>
          <CardDescription>
            WaveSurfer renders only after a playable presigned URL is returned.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {recordingState.phase === 'loading' || recordingState.phase === 'idle' ? (
            <p className="text-muted-foreground text-sm">Checking recording availability…</p>
          ) : null}
          {recordingState.phase === 'ready' ? (
            <CallWaveformPlayer
              ref={waveformRef}
              audioUrl={recordingState.audioUrl}
              onReady={handleWaveformReady}
              onError={handleWaveformError}
            />
          ) : null}
          {recordingState.phase === 'unavailable' ? (
            <UnavailableRecording state={recordingState} />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Transcript</CardTitle>
          <CardDescription>
            Timestamps derive from persisted turn spans. Selecting a timestamp seeks the
            player when waveform audio exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {transcriptTurns.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Transcript assembly runs after calls end via the transcript queue. Completed
              calls with speech events will populate here automatically.
            </p>
          ) : (
            <ul className="space-y-3">
              {transcriptTurns.map((row, idx) => {
                const rel = secondsFromEpoch(row.startedAt, callEpoch);
                const canSeek =
                  recordingState.phase === 'ready' &&
                  isWaveformReady &&
                  rel !== null;
                return (
                  <li
                    key={`${idx}-${String(row.startedAt)}`}
                    className="rounded-lg border border-border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {(row.speaker ?? 'speaker').toUpperCase()}
                        </Badge>
                        {rel !== null ? (
                          canSeek ? (
                            <button
                              type="button"
                              className={cn(
                                buttonVariants({ variant: 'ghost', size: 'sm' }),
                                'font-mono text-[11px]',
                              )}
                              onClick={() => handleSeekFromTurn(row)}
                            >
                              {formatMmSs(rel)}
                            </button>
                          ) : (
                            <span className="rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground text-[11px]">
                              {formatMmSs(rel)}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-[11px]">
                            Timestamp n/a
                          </span>
                        )}
                        {typeof row.latencyMs === 'number' ? (
                          <span className="text-muted-foreground text-[11px]">
                            Δ {row.latencyMs} ms
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                      {row.text || '…'}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <CostCard
          breakdown={costParts}
          totalStored={totalStored ?? null}
          sumParts={sumParts}
          sumMatchesTotal={sumMatchesTotal}
        />
        <LatencyCard stats={latencyStats} />
      </div>
    </div>
  );
}

function collectTranscriptTurns(content: unknown): TranscriptTurn[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const out: TranscriptTurn[] = [];
  for (const entry of content) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const e = entry as Record<string, unknown>;
    const text = typeof e.text === 'string' ? e.text : '';
    const speaker = typeof e.speaker === 'string' ? e.speaker : null;
    const startedAt = typeof e.startedAt === 'string' ? e.startedAt : null;
    const endedAt = typeof e.endedAt === 'string' ? e.endedAt : null;
    const latencyMs =
      typeof e.latencyMs === 'number' && !Number.isNaN(e.latencyMs)
        ? e.latencyMs
        : null;
    out.push({ speaker, text, startedAt, endedAt, latencyMs });
  }
  return out;
}

function summarizeLatencies(entries: TranscriptTurn[]) {
  const values = entries
    .map((e) => e.latencyMs)
    .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));
  if (values.length === 0) {
    return { values: [] as number[], avg: null as number | null, max: null as number | null };
  }
  const sum = values.reduce((acc, v) => acc + v, 0);
  return {
    values,
    avg: sum / values.length,
    max: Math.max(...values),
  };
}

function coerceCostParts(cb: unknown): CostParts {
  if (!cb || typeof cb !== 'object') {
    return {};
  }
  const r = cb as Record<string, unknown>;
  const n = (k: string): number | undefined =>
    typeof r[k] === 'number' && !Number.isNaN(Number(r[k]))
      ? (r[k] as number)
      : undefined;
  return {
    sttUsd: n('sttUsd'),
    llmUsd: n('llmUsd'),
    ttsUsd: n('ttsUsd'),
    telephonyUsd: n('telephonyUsd'),
    totalUsd: n('totalUsd'),
    durationMinutes: n('durationMinutes'),
    llmTokens:
      typeof r.llmTokens === 'number' ? (r.llmTokens as number) : undefined,
    ttsCharacters:
      typeof r.ttsCharacters === 'number'
        ? (r.ttsCharacters as number)
        : undefined,
  };
}

function parseEpoch(iso: string | null | undefined): number | null {
  if (!iso) {
    return null;
  }
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function secondsFromEpoch(turnStarted: string | null, callEpochMs: number | null) {
  if (!turnStarted) {
    return null;
  }
  const ms = Date.parse(turnStarted);
  if (Number.isNaN(ms)) {
    return null;
  }
  if (callEpochMs !== null && !Number.isNaN(callEpochMs)) {
    return Math.max(0, (ms - callEpochMs) / 1000);
  }
  return null;
}

function testCallFromMeta(meta: unknown): boolean {
  if (!meta || typeof meta !== 'object') {
    return false;
  }
  const rec = meta as Record<string, unknown>;
  return rec.isTest === true || rec.isTestCall === true;
}

function formatWhen(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return format(d, 'MMM d yyyy HH:mm');
}

function stringOrMdash(val: string | null): string {
  if (!val || val.trim() === '') {
    return '—';
  }
  return val;
}

function formatDuration(sec: number | null): string {
  if (sec === null || sec < 0) {
    return '—';
  }
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatMmSs(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function DirectionBadge({ dir }: { dir: string }) {
  if (dir === 'INBOUND') {
    return <Badge variant="default">INBOUND</Badge>;
  }
  if (dir === 'OUTBOUND') {
    return <Badge variant="secondary">OUTBOUND</Badge>;
  }
  return <Badge variant="outline">{dir}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return <Badge variant="default">{status}</Badge>;
    case 'FAILED':
    case 'ABANDONED':
      return <Badge variant="destructive">{status}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function CostCard(props: {
  breakdown: CostParts;
  totalStored: number | null;
  sumParts: number;
  sumMatchesTotal: boolean;
}) {
  const rows: { label: string; value?: number }[] = [
    { label: 'Speech-to-text', value: props.breakdown.sttUsd },
    { label: 'LLM', value: props.breakdown.llmUsd },
    { label: 'TTS', value: props.breakdown.ttsUsd },
    { label: 'Telephony (estimated)', value: props.breakdown.telephonyUsd },
  ];

  const hasAny = rows.some((r) => typeof r.value === 'number');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cost breakdown</CardTitle>
        <CardDescription>
          Mirrors `costBreakdown` persisted by transcript worker.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasAny && props.totalStored == null ? (
          <p className="text-muted-foreground text-sm">
            Costs are aggregated after transcripts finish assembling.
          </p>
        ) : (
          <>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-b border-border">
                    <td className="py-2 pr-4">{r.label}</td>
                    <td className="py-2 text-right tabular-nums">
                      {typeof r.value === 'number'
                        ? formatUsdCell(r.value)
                        : '—'}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 pr-4 font-medium">Stored total USD</td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {props.totalStored == null ? '—' : formatUsd(props.totalStored)}
                  </td>
                </tr>
              </tbody>
            </table>
            {props.totalStored != null ? (
              <p className="text-muted-foreground text-xs">
                Sum of line items (${formatUsd(props.sumParts)}){' '}
                {props.sumMatchesTotal ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    matches stored totalCostUsd
                  </span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">
                    differs from stored total by more than $0.01 — inspect JSON in DB
                  </span>
                )}
                .
              </p>
            ) : null}
            {props.breakdown.durationMinutes != null ? (
              <p className="text-muted-foreground text-xs">
                Modelled duration:&nbsp;
                <strong className="text-foreground">
                  {props.breakdown.durationMinutes.toFixed(4)} min
                </strong>
              </p>
            ) : null}
            {(props.breakdown.llmTokens != null ||
              props.breakdown.ttsCharacters != null) && (
              <p className="text-muted-foreground text-xs">
                LLM tokens:{' '}
                <strong>{props.breakdown.llmTokens ?? '—'}</strong>
                {' · '}
                TTS chars:&nbsp;
                <strong>{props.breakdown.ttsCharacters ?? '—'}</strong>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LatencyCard(props: {
  stats: { values: number[]; avg: number | null; max: number | null };
}) {
  const has = props.stats.values.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Latency</CardTitle>
        <CardDescription>
          Derived from transcript turn `latencyMs` when the worker attaches it from
          call events.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!has ? (
          <p className="text-muted-foreground text-sm">
            No per-turn latency tracked for this transcript yet — this is typical when the
            agent pipeline emits events without instrumentation.
          </p>
        ) : (
          <>
            <dl className="flex flex-wrap gap-6 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Samples
                </dt>
                <dd className="font-semibold tabular-nums">
                  {props.stats.values.length.toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Average
                </dt>
                <dd className="font-semibold tabular-nums">
                  {props.stats.avg != null
                    ? `${props.stats.avg.toFixed(0)} ms`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs uppercase tracking-wide">
                  Max
                </dt>
                <dd className="font-semibold tabular-nums">
                  {props.stats.max != null
                    ? `${props.stats.max} ms`
                    : '—'}
                </dd>
              </div>
            </dl>
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                View raw samples
              </summary>
              <pre className="mt-3 max-h-40 overflow-auto rounded bg-muted px-3 py-2 font-mono text-[11px]">
                {props.stats.values.join(', ')}
              </pre>
            </details>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function UnavailableRecording({ state }: { state: Exclude<RecordingState, { phase: 'idle' | 'loading' | 'ready' }> }) {
  const title =
    state.reason === 'none'
      ? 'Recording unavailable'
      : state.reason === 'storage'
        ? 'Recording storage not ready'
        : state.reason === 'broken'
          ? 'Recording response was invalid'
          : 'Playback could not initialize';

  return (
    <div className="rounded-lg border border-dashed border-muted-foreground/40 bg-muted/30 p-8 text-center text-sm space-y-2">
      <p className="font-medium text-base">{title}</p>
      <p className="text-muted-foreground">
        PSTN ingestion + R2 object upload land in Phase 9. Until then most browser/LiveKit
        calls leave `recordingUrl` empty — transcript and pricing still behave normally.
      </p>
      {state.detail ? (
        <p className="break-all font-mono text-muted-foreground text-xs">
          {state.detail}
        </p>
      ) : null}
    </div>
  );
}

function formatUsd(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

function formatUsdCell(n: number): string {
  return `$${formatUsd(n)}`;
}
