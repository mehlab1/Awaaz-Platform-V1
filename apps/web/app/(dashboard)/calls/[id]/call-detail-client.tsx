'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { format } from 'date-fns';
import {
  Activity,
  Bot,
  Calendar,
  ChevronLeft,
  Clock,
  Cpu,
  DollarSign,
  Loader2,
  Mic,
  Phone,
  PhoneCall,
  Play,
  Sparkles,
  Timer,
  User,
  Volume2,
} from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useOrgContext } from '@/components/org-context';
import { Skeleton } from '@/components/ui/skeleton';
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
  firstAudioLatencyMs: number | null;
  playbackDurationMs: number | null;
  totalResponseMs: number | null;
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

interface MetricSummary {
  values: number[];
  avg: number | null;
  max: number | null;
}

interface LatencyStats {
  firstAudio: MetricSummary;
  playback: MetricSummary;
  total: MetricSummary;
  usedLegacyLatency: boolean;
}

type RecordingState =
  | { phase: 'idle' | 'loading' }
  | { phase: 'processing'; attempt: number; detail?: string }
  | { phase: 'ready'; audioUrl: string }
  | {
      phase: 'unavailable';
      reason: 'none' | 'storage' | 'error' | 'broken' | 'not_ready';
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
    const recordingExpected =
      detail.status === 'COMPLETED' &&
      Boolean(
        detail.recordingUrl?.trim() ||
          recordingObjectKeyFromMeta(detail.metadata),
      );
    const needsAsyncArtifacts =
      !detail.transcript ||
      detail.costBreakdown == null ||
      (recordingExpected && !detail.recordingUrl?.trim());
    if (!needsAsyncArtifacts || detailRefreshAttempts.current >= 6) {
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

  const recordingCandidate =
    detail?.recordingUrl?.trim() || recordingObjectKeyFromMeta(detail?.metadata);

  useEffect(() => {
    if (!activeOrgId || !detailId) {
      setRecordingState({ phase: 'idle' });
      setIsWaveformReady(false);
      return undefined;
    }
    if (!recordingCandidate) {
      setRecordingState({ phase: 'unavailable', reason: 'none' });
      setIsWaveformReady(false);
      return undefined;
    }

    let cancelled = false;
    let retryTimer: number | undefined;
    const maxAttempts = 6;

    async function probeRecording(attempt: number): Promise<void> {
      setRecordingState(
        attempt === 0
          ? { phase: 'loading' }
          : { phase: 'processing', attempt },
      );
      setIsWaveformReady(false);
      try {
        const res = await apiCall(`/api/v1/calls/${detailId}/recording`, {
          method: 'GET',
        });

        const retryOrFallback = async (): Promise<void> => {
          if (cancelled) {
            return;
          }
          if (res.status === 404 || res.status === 400) {
            const responseDetail = sanitizeRecordingMessage(await res.text());
            if (attempt < maxAttempts) {
              setRecordingState({
                phase: 'processing',
                attempt: attempt + 1,
                detail: responseDetail || 'Recording not ready yet.',
              });
              retryTimer = window.setTimeout(() => {
                void probeRecording(attempt + 1);
              }, 2000);
              return;
            }
            setRecordingState({
              phase: 'unavailable',
              reason: 'not_ready',
              detail: responseDetail || 'Recording is still processing.',
            });
            return;
          }
          if (res.status === 503) {
            const txt = sanitizeRecordingMessage(await res.text());
            setRecordingState({
              phase: 'unavailable',
              reason: 'storage',
              detail: txt || undefined,
            });
            return;
          }
          const t = sanitizeRecordingMessage(await res.text());
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
        await retryOrFallback();
      } catch (e: unknown) {
        if (cancelled) {
          return;
        }
        setRecordingState({
          phase: 'unavailable',
          reason: 'error',
          detail: sanitizeRecordingMessage(
            e instanceof Error ? e.message : String(e),
          ),
        });
      }
    }

    void probeRecording(0);

    return () => {
      cancelled = true;
      if (retryTimer !== undefined) {
        window.clearTimeout(retryTimer);
      }
    };
  }, [activeOrgId, apiCall, detailId, recordingCandidate]);

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
  const hasRecordingOnFile = Boolean(recordingCandidate);
  const recordingSavedBadge =
    hasRecordingOnFile &&
    (recordingState.phase === 'ready' ||
      recordingState.phase === 'processing' ||
      recordingState.phase === 'loading');
  const refreshingArtifacts =
    detail != null &&
    detailRefreshAttempts.current > 0 &&
    detailRefreshAttempts.current < 6 &&
    (detail.transcript == null ||
      detail.costBreakdown == null ||
      (detail.status === 'COMPLETED' && !detail.recordingUrl?.trim()));

  if (!activeOrgId && !loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Select an organization first.
      </p>
    );
  }

  if (loading && !detail) {
    return <CallDetailSkeleton />;
  }

  if (error || !detail) {
    return (
      <div className="space-y-4">
        <Link
          href="/calls"
          className={cn(buttonVariants({ variant: 'outline' }), 'inline-flex gap-2 rounded-xl')}
        >
          <ChevronLeft className="size-4" />
          Call history
        </Link>
        <p className="text-destructive text-sm font-medium">
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

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/40 pb-5">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Link
              href="/calls"
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon' }),
                'h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg transition-colors'
              )}
            >
              <ChevronLeft className="size-4" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <PhoneCall className="size-5 text-muted-foreground shrink-0" />
              Call Session
            </h1>
          </div>
          {refreshingArtifacts ? (
            <div className="inline-flex items-center gap-2 rounded-md border border-border/50 bg-muted/30 px-2.5 py-1 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Refreshing call artifacts...
            </div>
          ) : null}
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground pl-10">
            <span>ID:</span>
            <span className="bg-muted px-1.5 py-0.5 rounded select-all">{detail.id}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 pl-10 sm:pl-0">
          <DirectionBadge dir={detail.direction} />
          <StatusBadge status={detail.status} />
          {testBadge ? (
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary font-mono text-[10px]">
              TEST
            </Badge>
          ) : null}
        </div>
      </div>

      {/* 2. Call Overview Grid */}
      <Card className="overflow-hidden border-border/50 shadow-sm bg-card/[0.6] backdrop-blur-sm">
        <CardContent className="p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {/* Agent Info */}
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 shrink-0">
                <Bot className="size-5" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Agent</span>
                <p className="font-semibold text-foreground text-sm leading-none">{detail.agent?.name ?? '—'}</p>
              </div>
            </div>

            {/* Numbers Info */}
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">
                <Phone className="size-5" />
              </div>
              <div className="space-y-1 min-w-0">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Routing</span>
                <p className="font-mono text-xs text-foreground truncate leading-normal" title={`${stringOrMdash(detail.fromNumber)} → ${stringOrMdash(detail.toNumber)}`}>
                  {stringOrMdash(detail.fromNumber)} <span className="text-muted-foreground/60 mx-1">→</span> {stringOrMdash(detail.toNumber)}
                </p>
              </div>
            </div>

            {/* Duration Info */}
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Clock className="size-5" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Duration</span>
                <p className="font-semibold text-foreground text-sm tabular-nums leading-none">
                  {formatDuration(detail.durationSeconds)}
                </p>
              </div>
            </div>

            {/* Timing Info */}
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                <Calendar className="size-5" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Date &amp; Time</span>
                <p className="font-semibold text-foreground text-sm leading-none" title={detail.startedAt ?? detail.createdAt}>
                  {formatWhen(detail.startedAt ?? detail.createdAt)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 3. Audio Player */}
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/[0.03]">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <Volume2 className="size-4.5 text-muted-foreground" />
                Call Recording
              </CardTitle>
              <CardDescription>
                Play, seek, and download call audio once processing completes.
              </CardDescription>
            </div>
            {recordingSavedBadge ? (
              <Badge variant="outline" className="text-xs border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400">
                Recording saved
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {recordingState.phase === 'loading' ||
          recordingState.phase === 'idle' ? (
            <RecordingProcessingState message="Checking recording availability…" />
          ) : null}
          {recordingState.phase === 'processing' ? (
            <RecordingProcessingState
              message={
                recordingState.detail ??
                'Recording is still processing. Trying again...'
              }
              attempt={recordingState.attempt}
            />
          ) : null}
          {recordingState.phase === 'ready' ? (
            <CallWaveformPlayer
              ref={waveformRef}
              audioUrl={recordingState.audioUrl}
              downloadFileName={`call-${detail.id.slice(0, 8)}-recording.mp3`}
              onReady={handleWaveformReady}
              onError={handleWaveformError}
            />
          ) : null}
          {recordingState.phase === 'unavailable' ? (
            <UnavailableRecording state={recordingState} />
          ) : null}
        </CardContent>
      </Card>

      {/* 4. Transcript */}
      <Card className="border-border/50 shadow-sm overflow-hidden">
        <CardHeader className="pb-4 border-b border-border/40 bg-muted/[0.03]">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg">Call Transcript</CardTitle>
              <CardDescription>
                Click a timestamp to jump to that moment in the recording.
              </CardDescription>
            </div>
            {transcriptTurns.length > 0 ? (
              <Badge variant="secondary" className="font-mono text-xs">
                {transcriptTurns.length} turns
              </Badge>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {transcriptTurns.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border/60 rounded-xl space-y-2">
              <Phone className="size-8 text-muted-foreground/45 mx-auto" />
              <p className="font-medium text-foreground text-sm">No transcript turns available</p>
              <p className="text-muted-foreground text-xs max-w-sm mx-auto">
                The transcript will appear here after the call finishes and speech is processed.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {transcriptTurns.map((row, idx) => {
                const rel = secondsFromEpoch(row.startedAt, callEpoch);
                const canSeek =
                  recordingState.phase === 'ready' &&
                  isWaveformReady &&
                  rel !== null;
                const isAgent = (row.speaker ?? '').toLowerCase() === 'agent';

                return (
                  <li
                    key={`${idx}-${String(row.startedAt)}`}
                    className={cn(
                      "rounded-xl border p-4.5 transition-all",
                      isAgent
                        ? "bg-primary/[0.015] border-primary/15 hover:border-primary/25"
                        : "bg-muted/[0.02] border-border/60 hover:border-border"
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border/40 mb-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div className={cn(
                            "p-1 rounded-full shrink-0",
                            isAgent ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                          )}>
                            {isAgent ? <Sparkles className="size-3" /> : <User className="size-3" />}
                          </div>
                          <span className={cn(
                            "text-xs font-semibold tracking-wide uppercase",
                            isAgent ? "text-primary" : "text-foreground"
                          )}>
                            {row.speaker ?? 'Customer'}
                          </span>
                        </div>
                        {rel !== null ? (
                          canSeek ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-6 rounded-full px-2.5 font-mono text-[10px] gap-1 transition-all hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                              onClick={() => handleSeekFromTurn(row)}
                            >
                              <Play className="size-2.5 fill-current shrink-0" />
                              {formatMmSs(rel)}
                            </Button>
                          ) : (
                            <span className="inline-flex h-6 items-center rounded-full bg-muted px-2.5 font-mono text-[10px] text-muted-foreground">
                              {formatMmSs(rel)}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-[10px] font-mono">
                            Timestamp n/a
                          </span>
                        )}
                      </div>
                      <TurnTimingChips turn={row} />
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90 pl-1">
                      {row.text || '…'}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* 5. Metrics & latency cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        <CostCard
          breakdown={costParts}
          totalStored={totalStored ?? null}
          sumParts={sumParts}
        />
        <LatencyCard stats={latencyStats} />
      </div>
    </div>
  );
}

function CallDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between border-b border-border/40 pb-5">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      <Card className="border-border/50">
        <CardContent className="p-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-5 w-28" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/50">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
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
    const firstAudioLatencyMs = numericField(e.firstAudioLatencyMs);
    const playbackDurationMs = numericField(e.playbackDurationMs);
    const totalResponseMs = numericField(e.totalResponseMs);
    out.push({
      speaker,
      text,
      startedAt,
      endedAt,
      latencyMs,
      firstAudioLatencyMs,
      playbackDurationMs,
      totalResponseMs,
    });
  }
  return out;
}

function numericField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function summarizeLatencies(entries: TranscriptTurn[]): LatencyStats {
  const firstAudioValues = entries
    .map((entry) => entry.firstAudioLatencyMs ?? entry.latencyMs)
    .filter(isNumber);
  const playbackValues = entries
    .map((entry) => entry.playbackDurationMs)
    .filter(isNumber);
  const totalValues = entries
    .map((entry) => entry.totalResponseMs)
    .filter(isNumber);
  return {
    firstAudio: summarizeNumbers(firstAudioValues),
    playback: summarizeNumbers(playbackValues),
    total: summarizeNumbers(totalValues),
    usedLegacyLatency: entries.some(
      (entry) => entry.firstAudioLatencyMs == null && entry.latencyMs != null,
    ),
  };
}

function summarizeNumbers(values: number[]): MetricSummary {
  if (values.length === 0) {
    return { values, avg: null, max: null };
  }
  const sum = values.reduce((acc, value) => acc + value, 0);
  return { values, avg: sum / values.length, max: Math.max(...values) };
}

function isNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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

function recordingObjectKeyFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') {
    return null;
  }
  const record = meta as Record<string, unknown>;
  const nested = record.recording;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const nestedRecord = nested as Record<string, unknown>;
    const objectKey = nestedRecord.objectKey;
    if (typeof objectKey === 'string' && objectKey.trim()) {
      return objectKey.trim();
    }
  }
  const topLevel = record.recordingObjectKey;
  if (typeof topLevel === 'string' && topLevel.trim()) {
    return topLevel.trim();
  }
  return null;
}

function formatWhen(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return format(d, 'MMM d, yyyy h:mm a');
}

function stringOrMdash(val: string | null): string {
  if (!val || val.trim() === '') {
    return '—';
  }
  if (val === 'browser-preview') {
    return 'Browser Preview';
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

function formatMs(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(ms >= 10_000 ? 0 : 1)} s`;
  }
  return `${Math.round(ms)} ms`;
}

function DirectionBadge({ dir }: { dir: string }) {
  if (dir === 'INBOUND') {
    return (
      <Badge variant="outline" className="font-mono text-[10px] border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300">
        INBOUND
      </Badge>
    );
  }
  if (dir === 'OUTBOUND') {
    return (
      <Badge variant="outline" className="font-mono text-[10px] border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300">
        OUTBOUND
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-mono text-[10px]">
      {dir}
    </Badge>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'COMPLETED':
      return (
        <Badge variant="outline" className="font-mono text-[10px] border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
          {status}
        </Badge>
      );
    case 'FAILED':
    case 'ABANDONED':
      return (
        <Badge variant="destructive" className="font-mono text-[10px]">
          {status}
        </Badge>
      );
    case 'IN_PROGRESS':
      return (
        <Badge variant="outline" className="font-mono text-[10px] border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300">
          {status}
        </Badge>
      );
    case 'INITIATED':
      return (
        <Badge variant="outline" className="font-mono text-[10px] border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300">
          {status}
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="font-mono text-[10px]">
          {status}
        </Badge>
      );
  }
}

function TurnTimingChips({ turn }: { turn: TranscriptTurn }) {
  if ((turn.speaker ?? '').toLowerCase() !== 'agent') {
    return null;
  }

  const firstAudio = turn.firstAudioLatencyMs ?? turn.latencyMs;
  const chips = [
    firstAudio != null
      ? { label: 'First audio', value: formatMs(firstAudio), color: 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10 border-emerald-500/20' }
      : null,
    turn.playbackDurationMs != null
      ? { label: 'Playback', value: formatMs(turn.playbackDurationMs), color: 'text-blue-700 bg-blue-50 dark:text-blue-400 dark:bg-blue-500/10 border-blue-500/20' }
      : null,
    turn.totalResponseMs != null
      ? { label: 'Total', value: formatMs(turn.totalResponseMs), color: 'text-violet-700 bg-violet-50 dark:text-violet-400 dark:bg-violet-500/10 border-violet-500/20' }
      : null,
  ].filter((chip): chip is { label: string; value: string; color: string } => chip !== null);

  if (chips.length === 0) {
    return (
      <span className="text-muted-foreground text-[10px] font-mono opacity-80">
        Timing unavailable
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.label}
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-mono font-medium tracking-tight",
            chip.color
          )}
        >
          {chip.label}: {chip.value}
        </span>
      ))}
    </div>
  );
}

function CostCard(props: {
  breakdown: CostParts;
  totalStored: number | null;
  sumParts: number;
}) {
  const rows: { label: string; value?: number }[] = [
    { label: 'Speech-to-text', value: props.breakdown.sttUsd },
    { label: 'Language model', value: props.breakdown.llmUsd },
    { label: 'Voice generation', value: props.breakdown.ttsUsd },
    { label: 'Telephony (estimated)', value: props.breakdown.telephonyUsd },
  ];

  const hasAny = rows.some((r) => typeof r.value === 'number');

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/40 bg-muted/[0.03]">
        <CardTitle className="text-lg flex items-center gap-2">
          <DollarSign className="size-4.5 text-muted-foreground" />
          Cost Breakdown
        </CardTitle>
        <CardDescription>
          Cost details appear as they become available.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {!hasAny && props.totalStored == null ? (
          <p className="text-muted-foreground text-sm">
            Cost details are still being calculated.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border/50 overflow-hidden bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="py-2.5 px-4 text-left font-medium text-xs text-muted-foreground uppercase tracking-wider">Service</th>
                    <th className="py-2.5 px-4 text-right font-medium text-xs text-muted-foreground uppercase tracking-wider">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {rows.map((r, idx) => {
                    const Icon = [Mic, Cpu, Volume2, PhoneCall][idx];
                    return (
                      <tr key={r.label} className="hover:bg-muted/10 transition-colors">
                        <td className="py-3 px-4 flex items-center gap-2">
                          {Icon && <Icon className="size-4 text-muted-foreground" />}
                          <span className="font-medium text-foreground">{r.label}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-sm tabular-nums">
                          {typeof r.value === 'number' ? formatUsdCell(r.value) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-emerald-500/[0.02] font-semibold border-t border-border">
                    <td className="py-3.5 px-4 flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
                      <DollarSign className="size-4" />
                      <span>Total Session Cost</span>
                    </td>
                    <td className="py-3.5 px-4 text-right text-emerald-800 dark:text-emerald-400 font-mono text-base tabular-nums">
                      {props.totalStored == null ? '—' : formatUsdCell(props.totalStored)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="space-y-1.5 pt-1.5">
              {props.totalStored != null ? (
                <p className="text-muted-foreground text-[11px] flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  Line items total ${formatUsd(props.sumParts)} before rounding.
                </p>
              ) : null}
              {props.breakdown.durationMinutes != null ? (
                <p className="text-muted-foreground text-[11px] flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  Estimated duration:&nbsp;
                  <strong className="text-foreground">
                    {props.breakdown.durationMinutes.toFixed(4)} min
                  </strong>
                </p>
              ) : null}
              {(props.breakdown.llmTokens != null ||
                props.breakdown.ttsCharacters != null) && (
                <p className="text-muted-foreground text-[11px] flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                  Tokens:&nbsp;
                  <strong className="text-foreground">{props.breakdown.llmTokens ?? '—'}</strong>
                  <span className="mx-1.5 text-muted-foreground/40">•</span>
                  Voice characters:&nbsp;
                  <strong className="text-foreground">{props.breakdown.ttsCharacters ?? '—'}</strong>
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LatencyCard(props: { stats: LatencyStats }) {
  const has =
    props.stats.firstAudio.values.length > 0 ||
    props.stats.playback.values.length > 0 ||
    props.stats.total.values.length > 0;

  return (
    <Card className="border-border/50 shadow-sm overflow-hidden">
      <CardHeader className="pb-4 border-b border-border/40 bg-muted/[0.03]">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="size-4.5 text-muted-foreground" />
          Voice Responsiveness
        </CardTitle>
        <CardDescription>
          First audio measures perceived latency. Playback and total turn time are
          shown separately so long answers do not look like slow responses.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        {!has ? (
          <p className="text-muted-foreground text-sm">
            Voice timing is not available for this transcript yet.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <TimingSummary
                label="First audio"
                summary={props.stats.firstAudio}
                empty="Missing"
                icon={Activity}
                color="border-emerald-500/20 bg-emerald-500/[0.01]"
              />
              <TimingSummary
                label="Playback"
                summary={props.stats.playback}
                empty="Missing"
                icon={Volume2}
                color="border-blue-500/20 bg-blue-500/[0.01]"
              />
              <TimingSummary
                label="Turn total"
                summary={props.stats.total}
                empty="Missing"
                icon={Timer}
                color="border-violet-500/20 bg-violet-500/[0.01]"
              />
            </div>

            <div className="space-y-3">
              {props.stats.usedLegacyLatency ? (
                <p className="text-muted-foreground text-[11px] flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-amber-500/60 shrink-0" />
                  Some older turns only include basic timing, so first-audio detail
                  may be approximate.
                </p>
              ) : null}
              <details className="text-xs group border border-border/40 rounded-lg overflow-hidden">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium p-2.5 bg-muted/20 select-none flex items-center justify-between transition-colors">
                  <span>View raw timing samples (ms)</span>
                  <span className="text-[10px] text-muted-foreground/60 font-mono">click to expand</span>
                </summary>
                <div className="p-3 bg-muted/40 border-t border-border/40 max-h-40 overflow-auto font-mono text-[11px] text-muted-foreground leading-relaxed break-all">
                  {props.stats.firstAudio.values.join(', ')}
                </div>
              </details>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TimingSummary({
  label,
  summary,
  empty,
  icon: Icon,
  color,
}: {
  label: string;
  summary: MetricSummary;
  empty: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}) {
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col justify-between gap-3 shadow-sm transition-all hover:shadow-md", color)}>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        {Icon && <Icon className="size-4 text-muted-foreground/75" />}
      </div>
      {summary.values.length === 0 ? (
        <div className="text-muted-foreground text-sm font-medium">{empty}</div>
      ) : (
        <div className="space-y-1">
          <div className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
            Avg {summary.avg != null ? formatMs(summary.avg) : '—'}
          </div>
          <div className="text-[10px] text-muted-foreground/80 font-mono flex items-center gap-1.5 tabular-nums">
            <span>Max: {summary.max != null ? formatMs(summary.max) : '—'}</span>
            <span>•</span>
            <span>{summary.values.length} sample{summary.values.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function UnavailableRecording({
  state,
}: {
  state: Extract<RecordingState, { phase: 'unavailable' }>;
}) {
  const title =
    state.reason === 'none'
      ? 'No recording for this call'
      : state.reason === 'storage'
        ? 'Recording unavailable'
        : state.reason === 'broken'
          ? 'Recording could not be played'
          : state.reason === 'not_ready'
            ? 'Recording still processing'
            : 'Playback unavailable';

  const body =
    state.reason === 'none'
      ? 'This call does not have a recording. Transcript and cost data may still be available.'
      : state.reason === 'not_ready'
        ? 'The recording may still be processing. Refresh the page in a moment.'
        : state.reason === 'storage'
          ? 'Recording playback is temporarily unavailable.'
          : 'Try refreshing the page in a moment.';

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-muted-foreground/30 bg-muted/15 p-8 text-center text-sm">
      <p className="font-semibold text-base text-foreground">{title}</p>
      <p className="text-muted-foreground text-xs">{body}</p>
      {state.detail ? (
        <p className="text-muted-foreground/80 text-[11px] font-mono mt-1 bg-muted/40 inline-block px-2 py-0.5 rounded border border-border/40">{state.detail}</p>
      ) : null}
    </div>
  );
}

function RecordingProcessingState(props: {
  message: string;
  attempt?: number;
}) {
  return (
    <div
      className="flex items-center gap-3.5 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-6 text-sm"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
      <div className="space-y-1 text-left">
        <p className="font-medium text-foreground">{props.message}</p>
        {props.attempt != null && props.attempt > 0 ? (
          <p className="text-muted-foreground text-xs font-mono">
            Retry {props.attempt} of 6
          </p>
        ) : null}
      </div>
    </div>
  );
}

function sanitizeRecordingMessage(raw: string | undefined | null): string {
  const text = raw?.trim() ?? '';
  if (!text) {
    return '';
  }
  if (
    text.includes('recordings/') ||
    text.includes('browser-preview/') ||
    /^[a-z0-9/_-]+\.(mp3|wav|m4a)$/i.test(text)
  ) {
    return 'Recording not ready yet.';
  }
  if (text === 'NO_RECORDING') {
    return 'No recording is attached to this call yet.';
  }
  if (text === 'RECORDING_NOT_READY') {
    return 'Recording not ready yet.';
  }
  if (
    /object storage|bucket|r2|s3|presign|signed url|blob|storage/i.test(text)
  ) {
    return 'Recording playback is temporarily unavailable.';
  }
  return text;
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
