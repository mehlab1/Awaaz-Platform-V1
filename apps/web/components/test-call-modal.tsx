'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';

import '@livekit/components-styles';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useConnectionState,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
  useTrackVolume,
  
  useVoiceAssistant,
} from '@livekit/components-react';
import {
  Activity,
  AlertCircle,
  AudioLines,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Gauge,
  Info,
  Loader2,
  Mic,
  MicOff,
  MessageSquareText,
  Radio,
  Phone,
  PhoneOff,
  RefreshCw,
  UserRound,
  Volume2,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  ConnectionState,
  DisconnectReason,
  LocalAudioTrack,
  ParticipantEvent,
  RoomEvent,
  Track,
  type AudioCaptureOptions,
} from 'livekit-client';

import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { dispatchOnboardingTestInteractionCompleted } from '@/components/onboarding/onboarding-provider';
import { cn } from '@/lib/utils';

const browserAudioCaptureOptions: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceIsolation: true,
};
const CLIENT_BARGE_IN_DUCK_VOLUME = 0.65;
const CLIENT_BARGE_IN_DUCK_START_VOLUME = 0.09;
const CLIENT_BARGE_IN_DUCK_END_VOLUME = 0.045;
const CLIENT_BARGE_IN_DUCK_HOLD_MS = 180;
const CLIENT_BARGE_IN_DUCK_RELEASE_MS = 450;
const CLIENT_BARGE_IN_AGENT_VOLUME_FLOOR = 0.012;
const NO_AGENT_TIMEOUT_MS = 20_000;
const CONTROL_TOPIC = 'awaaz.call.control';
const TRANSCRIPT_TOPIC = 'awaaz.call.transcript';

function logTestCallDebug(event: string, detail?: Record<string, unknown>) {
  console.info('[awaaz:test-call]', event, detail ?? {});
}

function describeParticipant(participant: unknown): Record<string, unknown> {
  const p = participant as {
    identity?: string;
    sid?: string;
    kind?: unknown;
    name?: string;
  } | null;
  return {
    identity: p?.identity,
    sid: p?.sid,
    kind: p?.kind ? String(p.kind) : undefined,
    name: p?.name,
  };
}

function describePublication(publication: unknown): Record<string, unknown> {
  const p = publication as {
    source?: unknown;
    kind?: unknown;
    trackSid?: string;
    sid?: string;
    isMuted?: boolean;
    muted?: boolean;
    isSubscribed?: boolean;
    subscribed?: boolean;
    isEnabled?: boolean;
    track?: unknown;
  } | null;
  return {
    source: p?.source ? String(p.source) : undefined,
    kind: p?.kind ? String(p.kind) : undefined,
    sid: p?.trackSid ?? p?.sid,
    muted: p?.isMuted ?? p?.muted,
    subscribed: p?.isSubscribed ?? p?.subscribed,
    enabled: p?.isEnabled,
    hasTrack: Boolean(p?.track),
  };
}

function hasPublishedTrack(publication: unknown): boolean {
  const p = publication as {
    trackSid?: string;
    sid?: string;
    track?: unknown;
  } | null;
  return Boolean(p?.trackSid ?? p?.sid ?? p?.track);
}

function isAgentLikeParticipant(participant: unknown): boolean {
  const p = participant as {
    identity?: string;
    kind?: unknown;
    name?: string;
  } | null;
  const identity = p?.identity?.toLowerCase() ?? '';
  const kind = p?.kind ? String(p.kind).toLowerCase() : '';
  const name = p?.name?.toLowerCase() ?? '';

  return (
    kind.includes('agent') ||
    identity.includes('agent') ||
    name.includes('agent')
  );
}

function addEventLogger(
  target: unknown,
  event: string,
  handler: (...args: unknown[]) => void,
): () => void {
  const emitter = target as {
    on?: (event: string, handler: (...args: unknown[]) => void) => void;
    off?: (event: string, handler: (...args: unknown[]) => void) => void;
  } | null;
  emitter?.on?.(event, handler);
  return () => emitter?.off?.(event, handler);
}

function decodeControlPayload(payload: unknown): Record<string, unknown> | null {
  try {
    const text =
      payload instanceof Uint8Array
        ? new TextDecoder().decode(payload)
        : typeof payload === 'string'
          ? payload
          : '';
    if (!text) {
      return null;
    }
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** User-visible session states for the ribbon badge */
export type BrowserTestPhaseBadge =
  | 'connecting'
  | 'active'
  | 'idle'
  | 'ending'
  | 'ended'
  | 'fetch_error';

interface BrowserTestSession {
  callId: string;
  serverUrl: string;
  participantToken: string;
  roomName: string;
  runtime: BrowserTestRuntimeSummary | null;
}

type CredentialMode = 'BYOK' | 'FINOVA_MANAGED';

interface BrowserTestRuntimeProvider {
  providerId: string;
  credentialMode: CredentialMode;
  model?: string | null;
  voiceId?: string | null;
}

interface BrowserTestRuntimeSummary {
  versionNumber?: number | null;
  tts?: BrowserTestRuntimeProvider | null;
  llm?: BrowserTestRuntimeProvider | null;
  stt?: BrowserTestRuntimeProvider | null;
}

type LiveTranscriptSpeaker = 'user' | 'agent' | 'system';
type LiveTranscriptStatus = 'interim' | 'final' | 'interrupted';

interface LiveTranscriptEntry {
  id: string;
  speaker: LiveTranscriptSpeaker;
  status: LiveTranscriptStatus;
  text: string;
  timestamp: string;
  receivedAt: number;
  turnId: number | null;
  responseId: number | null;
  source: string | null;
  interrupted: boolean;
  latencyMs: number | null;
  metrics: LiveTranscriptMetrics;
  participantIdentity: string | null;
}

interface LiveTranscriptEvent {
  event: string;
  speaker: LiveTranscriptSpeaker | null;
  timestamp: string;
  receivedAt: number;
  turnId: number | null;
}

interface LiveTokenUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  estimatedOutputTokens: number | null;
  source: string | null;
}

interface LiveTtsChunkMetrics {
  textChunkCount: number | null;
  textChunkChars: number | null;
  firstChunkChars: number | null;
  maxChunkChars: number | null;
  audioPacketCount: number | null;
  audioChunkCount: number | null;
  audioFrameCount: number | null;
  audioBytes: number | null;
  generatedAudioMs: number | null;
  providerFirstAudioMs: number | null;
  cancelledChunkCount: number | null;
  chunkCharSizes: number[];
  providerId: string | null;
  modelId: string | null;
  voiceId: string | null;
}

interface LiveStageWaterfallItem {
  stage: string;
  label: string;
  durationMs: number;
  startedAt: string | null;
  endedAt: string | null;
}

interface LiveTranscriptMetrics {
  firstAudioLatencyMs: number | null;
  playbackDurationMs: number | null;
  totalResponseMs: number | null;
  totalTurnMs: number | null;
  sttLatencyMs: number | null;
  llmFirstTokenLatencyMs: number | null;
  llmTotalMs: number | null;
  ttsTextTotalMs: number | null;
  ttsFirstAudioLatencyMs: number | null;
  interruptionToSilenceMs: number | null;
  tokenUsage: LiveTokenUsage | null;
  ttsChunks: LiveTtsChunkMetrics | null;
  stageWaterfall: LiveStageWaterfallItem[];
}

interface LiveDataChannelEvent {
  id: string;
  topic: string;
  kind: 'status' | 'transcript' | 'control';
  label: string;
  detail: string | null;
  timestamp: string;
  receivedAt: number;
  phase: string | null;
}

interface PostCallSummary {
  totalTurns: number;
  userTurns: number;
  agentTurns: number;
  interruptedTurns: number;
  transcriptChars: number;
  dataChannelEvents: number;
  avgAgentLatencyMs: number | null;
  lastAgentLatencyMs: number | null;
  totalLlmTokens: number | null;
  tokenUsageSource: string | null;
  totalTtsTextChunks: number;
  totalTtsAudioFrames: number;
  avgTtsChunkChars: number | null;
  latestWaterfall: LiveStageWaterfallItem[];
}

type BrowserSessionPhase =
  | 'CONNECTING'
  | 'LIVE'
  | 'LISTENING'
  | 'SPEAKING'
  | 'IDLE'
  | 'ENDING'
  | 'DISCONNECTED';

export interface TestCallModalProps {
  agentId: string;
  agentName: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  apiCall: (path: string, init?: RequestInit) => Promise<Response>;
}

type VoiceUiMode =
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'idle'
  | 'muted'
  | 'failed';



const voiceModeMeta: Record<
  VoiceUiMode,
  {
    label: string;
    description: string;
    Icon: LucideIcon;
    orbClassName: string;
    badgeClassName: string;
  }
> = {
  connecting: {
    label: 'Connecting',
    description: 'Opening the voice session and waiting for the local agent.',
    Icon: Loader2,
    orbClassName: 'border-border bg-muted/30 text-muted-foreground backdrop-blur-sm',
    badgeClassName: 'border-border bg-muted/40 text-muted-foreground',
  },
  listening: {
    label: 'Listening',
    description: 'Speak naturally. The agent is ready for your next turn.',
    Icon: Mic,
    orbClassName:
      'border-primary/25 bg-primary/10 text-primary shadow-sm hover:border-primary/40',
    badgeClassName: 'border-primary/25 bg-primary/10 text-primary',
  },
  thinking: {
    label: 'Thinking',
    description: 'The agent is preparing a response.',
    Icon: AudioLines,
    orbClassName: 'border-amber-500/30 bg-amber-500/10 text-amber-700 shadow-sm dark:text-amber-300',
    badgeClassName: 'border-orange-500/20 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  },
  speaking: {
    label: 'AI speaking',
    description: 'Audio is playing through the browser.',
    Icon: Volume2,
    orbClassName:
      'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 shadow-sm dark:text-emerald-300',
    badgeClassName: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  idle: {
    label: 'Ready',
    description: 'The session is connected and waiting.',
    Icon: Mic,
    orbClassName: 'border-border bg-card/65 text-foreground shadow-md backdrop-blur-sm hover:border-primary/20',
    badgeClassName: 'border-border bg-muted/40 text-foreground',
  },
  muted: {
    label: 'Muted',
    description: 'Your microphone is off.',
    Icon: MicOff,
    orbClassName: 'border-border bg-muted/30 text-muted-foreground backdrop-blur-sm',
    badgeClassName: 'border-border bg-muted/40 text-muted-foreground',
  },
  failed: {
    label: 'Needs attention',
    description: 'The browser room connected, but the agent is not available.',
    Icon: AlertCircle,
    orbClassName: 'border-destructive/30 bg-destructive/10 text-destructive shadow-sm',
    badgeClassName: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
};

function readCredentialMode(value: unknown): CredentialMode {
  return value === 'BYOK' ? 'BYOK' : 'FINOVA_MANAGED';
}

function readRuntimeProvider(value: unknown): BrowserTestRuntimeProvider | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const providerId = typeof record.providerId === 'string' ? record.providerId : '';
  if (!providerId.trim()) {
    return null;
  }
  return {
    providerId,
    credentialMode: readCredentialMode(record.credentialMode),
    model: typeof record.model === 'string' ? record.model : null,
    voiceId: typeof record.voiceId === 'string' ? record.voiceId : null,
  };
}

function readRuntimeSummary(value: unknown): BrowserTestRuntimeSummary | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const versionNumber =
    typeof record.versionNumber === 'number' ? record.versionNumber : null;
  return {
    versionNumber,
    tts: readRuntimeProvider(record.tts),
    llm: readRuntimeProvider(record.llm),
    stt: readRuntimeProvider(record.stt),
  };
}

function readSessionDto(body: unknown): BrowserTestSession {
  const o = body as Record<string, unknown>;
  const serverUrl = o.serverUrl;
  const participantToken =
    typeof o.participantToken === 'string'
      ? o.participantToken
      : typeof o.token === 'string'
        ? o.token
        : '';
  const roomName = typeof o.roomName === 'string' ? o.roomName : '';
  const callId = typeof o.callId === 'string' ? o.callId : '';
  if (typeof serverUrl !== 'string' || !participantToken || !serverUrl || !callId) {
    throw new Error('Unexpected test-call response.');
  }
  return { callId, serverUrl, participantToken, roomName, runtime: readRuntimeSummary(o.runtime) };
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function readOptionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map(readOptionalNumber)
    .filter((item): item is number => item !== null)
    .slice(0, 24);
}

function readTokenUsage(value: unknown): LiveTokenUsage | null {
  const record = readOptionalRecord(value);
  if (!record) {
    return null;
  }
  const usage: LiveTokenUsage = {
    promptTokens: readOptionalNumber(record.promptTokens),
    completionTokens: readOptionalNumber(record.completionTokens),
    totalTokens: readOptionalNumber(record.totalTokens),
    estimatedOutputTokens: readOptionalNumber(record.estimatedOutputTokens),
    source: readOptionalString(record.source),
  };
  return usage.promptTokens !== null ||
    usage.completionTokens !== null ||
    usage.totalTokens !== null ||
    usage.estimatedOutputTokens !== null ||
    usage.source !== null
    ? usage
    : null;
}

function readTtsChunkMetrics(value: unknown): LiveTtsChunkMetrics | null {
  const record = readOptionalRecord(value);
  if (!record) {
    return null;
  }
  const metrics: LiveTtsChunkMetrics = {
    textChunkCount: readOptionalNumber(record.textChunkCount),
    textChunkChars: readOptionalNumber(record.textChunkChars),
    firstChunkChars: readOptionalNumber(record.firstChunkChars),
    maxChunkChars: readOptionalNumber(record.maxChunkChars),
    audioPacketCount: readOptionalNumber(record.audioPacketCount),
    audioChunkCount: readOptionalNumber(record.audioChunkCount),
    audioFrameCount: readOptionalNumber(record.audioFrameCount),
    audioBytes: readOptionalNumber(record.audioBytes),
    generatedAudioMs: readOptionalNumber(record.generatedAudioMs),
    providerFirstAudioMs: readOptionalNumber(record.providerFirstAudioMs),
    cancelledChunkCount: readOptionalNumber(record.cancelledChunkCount),
    chunkCharSizes: readNumberArray(record.chunkCharSizes),
    providerId: readOptionalString(record.providerId),
    modelId: readOptionalString(record.modelId),
    voiceId: readOptionalString(record.voiceId),
  };
  return Object.entries(metrics).some(([key, value]) =>
    key === 'chunkCharSizes' ? metrics.chunkCharSizes.length > 0 : value !== null,
  )
    ? metrics
    : null;
}

function readStageWaterfall(value: unknown): LiveStageWaterfallItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): LiveStageWaterfallItem | null => {
      const record = readOptionalRecord(item);
      const durationMs = readOptionalNumber(record?.durationMs);
      const stage = readOptionalString(record?.stage);
      if (!record || durationMs === null || !stage) {
        return null;
      }
      return {
        stage,
        label: readOptionalString(record.label) ?? stage.replaceAll('_', ' '),
        durationMs,
        startedAt: readOptionalString(record.startedAt),
        endedAt: readOptionalString(record.endedAt),
      };
    })
    .filter((item): item is LiveStageWaterfallItem => item !== null)
    .slice(0, 12);
}

function normalizeTranscriptSpeaker(value: unknown): LiveTranscriptSpeaker {
  return value === 'agent' || value === 'system' ? value : 'user';
}

function normalizeTranscriptStatus(value: unknown): LiveTranscriptStatus {
  if (value === 'interrupted') {
    return 'interrupted';
  }
  return value === 'interim' ? 'interim' : 'final';
}

function participantIdentity(participant: unknown): string | null {
  const p = participant as { identity?: unknown } | null;
  return typeof p?.identity === 'string' && p.identity.trim()
    ? p.identity
    : null;
}

function readLiveTranscriptMetrics(value: unknown): LiveTranscriptMetrics {
  const record = readOptionalRecord(value);
  return {
    firstAudioLatencyMs: readOptionalNumber(record?.firstAudioLatencyMs),
    playbackDurationMs: readOptionalNumber(record?.playbackDurationMs),
    totalResponseMs: readOptionalNumber(record?.totalResponseMs),
    totalTurnMs: readOptionalNumber(record?.totalTurnMs),
    sttLatencyMs: readOptionalNumber(record?.sttLatencyMs),
    llmFirstTokenLatencyMs: readOptionalNumber(record?.llmFirstTokenLatencyMs),
    llmTotalMs: readOptionalNumber(record?.llmTotalMs),
    ttsTextTotalMs: readOptionalNumber(record?.ttsTextTotalMs),
    ttsFirstAudioLatencyMs: readOptionalNumber(record?.ttsFirstAudioLatencyMs),
    interruptionToSilenceMs: readOptionalNumber(record?.interruptionToSilenceMs),
    tokenUsage: readTokenUsage(record?.llmTokenUsage ?? record?.tokenUsage),
    ttsChunks: readTtsChunkMetrics(record?.ttsChunks),
    stageWaterfall: readStageWaterfall(record?.stageWaterfall),
  };
}

function parseLiveTranscriptMessage(
  message: Record<string, unknown>,
  participant: unknown,
): { entry: LiveTranscriptEntry; event: null } | { entry: null; event: LiveTranscriptEvent } | null {
  const receivedAt = Date.now();
  const timestamp = readOptionalString(message.timestamp) ?? new Date(receivedAt).toISOString();
  const participantId = participantIdentity(participant);

  if (message.type === 'transcript_event') {
    const event = readOptionalString(message.event);
    if (!event) {
      return null;
    }
    return {
      entry: null,
      event: {
        event,
        speaker:
          message.speaker === 'user' || message.speaker === 'agent' || message.speaker === 'system'
            ? message.speaker
            : null,
        timestamp,
        receivedAt,
        turnId: readOptionalNumber(message.turnId),
      },
    };
  }

  if (message.type !== 'transcript_entry') {
    return null;
  }

  const text = readOptionalString(message.text);
  if (!text) {
    return null;
  }

  const speaker = normalizeTranscriptSpeaker(message.speaker);
  const turnId = readOptionalNumber(message.turnId);
  const responseId = readOptionalNumber(message.responseId);
  const fallbackId = `${speaker}:${responseId ?? turnId ?? receivedAt}`;
  return {
    entry: {
      id: readOptionalString(message.id) ?? fallbackId,
      speaker,
      status: normalizeTranscriptStatus(message.status),
      text,
      timestamp,
      receivedAt,
      turnId,
      responseId,
      source: readOptionalString(message.source),
      interrupted: Boolean(message.interrupted),
      latencyMs: readOptionalNumber(message.latencyMs),
      metrics: readLiveTranscriptMetrics(message.metrics),
      participantIdentity: participantId,
    },
    event: null,
  };
}

function upsertLiveTranscriptEntry(
  entries: LiveTranscriptEntry[],
  incoming: LiveTranscriptEntry,
): LiveTranscriptEntry[] {
  const next = [...entries];
  const existingIndex = next.findIndex((entry) => entry.id === incoming.id);
  if (existingIndex >= 0) {
    next[existingIndex] = {
      ...next[existingIndex],
      ...incoming,
      receivedAt: incoming.receivedAt,
    };
  } else {
    next.push(incoming);
  }
  return next.slice(-80);
}

function compactDurationMs(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`;
  }
  return `${Math.round(value)}ms`;
}

function compactCount(value: number | null): string | null {
  if (value === null) {
    return null;
  }
  return value.toLocaleString();
}

function tokenUsageLabel(usage: LiveTokenUsage | null): string | null {
  if (!usage) {
    return null;
  }
  const total = usage.totalTokens ?? usage.estimatedOutputTokens;
  if (total === null) {
    return usage.source;
  }
  return `${total.toLocaleString()} ${usage.source === 'estimated' ? 'est.' : 'tokens'}`;
}

function summarizeLiveTranscript(
  entries: LiveTranscriptEntry[],
  dataChannelEvents: LiveDataChannelEvent[],
): PostCallSummary {
  const finalEntries = entries.filter((entry) => entry.status !== 'interim');
  const agentLatencies = finalEntries
    .filter((entry) => entry.speaker === 'agent')
    .map((entry) => entry.latencyMs ?? entry.metrics.firstAudioLatencyMs)
    .filter((value): value is number => value !== null);
  const avgAgentLatencyMs =
    agentLatencies.length === 0
      ? null
      : Math.round(agentLatencies.reduce((sum, value) => sum + value, 0) / agentLatencies.length);
  const tokenUsages = finalEntries
    .filter((entry) => entry.speaker === 'agent')
    .map((entry) => entry.metrics.tokenUsage)
    .filter((usage): usage is LiveTokenUsage => usage !== null);
  const providerTokenUsages = tokenUsages.filter(
    (usage) => usage.source !== 'estimated' && usage.totalTokens !== null,
  );
  const totalLlmTokens =
    tokenUsages.length === 0
      ? null
      : tokenUsages.reduce(
          (sum, usage) =>
            sum + (usage.totalTokens ?? usage.estimatedOutputTokens ?? 0),
          0,
        );
  const ttsMetrics = finalEntries
    .filter((entry) => entry.speaker === 'agent')
    .map((entry) => entry.metrics.ttsChunks)
    .filter((metrics): metrics is LiveTtsChunkMetrics => metrics !== null);
  const chunkSizes = ttsMetrics.flatMap((metrics) => metrics.chunkCharSizes);
  const latestWaterfall =
    [...finalEntries]
      .reverse()
      .find((entry) => entry.metrics.stageWaterfall.length > 0)
      ?.metrics.stageWaterfall ?? [];
  return {
    totalTurns: finalEntries.length,
    userTurns: finalEntries.filter((entry) => entry.speaker === 'user').length,
    agentTurns: finalEntries.filter((entry) => entry.speaker === 'agent').length,
    interruptedTurns: finalEntries.filter((entry) => entry.interrupted || entry.status === 'interrupted').length,
    transcriptChars: finalEntries.reduce((sum, entry) => sum + entry.text.length, 0),
    dataChannelEvents: dataChannelEvents.length,
    avgAgentLatencyMs,
    lastAgentLatencyMs: agentLatencies.at(-1) ?? null,
    totalLlmTokens,
    tokenUsageSource:
      providerTokenUsages.length > 0
        ? 'provider'
        : tokenUsages.length > 0
          ? 'estimated'
          : null,
    totalTtsTextChunks: ttsMetrics.reduce(
      (sum, metrics) => sum + (metrics.textChunkCount ?? 0),
      0,
    ),
    totalTtsAudioFrames: ttsMetrics.reduce(
      (sum, metrics) => sum + (metrics.audioFrameCount ?? 0),
      0,
    ),
    avgTtsChunkChars:
      chunkSizes.length === 0
        ? null
        : Math.round(chunkSizes.reduce((sum, value) => sum + value, 0) / chunkSizes.length),
    latestWaterfall,
  };
}

function phaseLabel(p: BrowserTestPhaseBadge): string {
  const labels: Record<BrowserTestPhaseBadge, string> = {
    connecting: 'Connecting',
    active: 'Live',
    idle: 'Idle',
    ending: 'Ending',
    ended: 'Ended',
    fetch_error: 'Unavailable',
  };
  return labels[p];
}

function credentialModeLabel(mode: CredentialMode): string {
  return mode === 'BYOK' ? 'BYOK' : 'Finova Managed';
}

function formatSessionDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDebugTime(value: number | null): string {
  return value === null ? 'Not available' : new Date(value).toLocaleTimeString();
}

type ConnectionStepStatus = 'complete' | 'current' | 'waiting' | 'issue';

interface ConnectionStep {
  label: string;
  description: string;
  status: ConnectionStepStatus;
}

function ConnectionProgress({ steps }: { steps: ConnectionStep[] }) {
  const statusMeta: Record<
    ConnectionStepStatus,
    { label: string; className: string; dotClassName: string }
  > = {
    complete: {
      label: 'Done',
      className: 'border-emerald-500/20 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300',
      dotClassName: 'bg-emerald-500',
    },
    current: {
      label: 'Now',
      className: 'border-primary/25 bg-primary/5 text-primary',
      dotClassName: 'bg-primary',
    },
    waiting: {
      label: 'Waiting',
      className: 'border-border/60 bg-muted/25 text-muted-foreground',
      dotClassName: 'bg-muted-foreground/35',
    },
    issue: {
      label: 'Needs attention',
      className: 'border-destructive/25 bg-destructive/5 text-destructive',
      dotClassName: 'bg-destructive',
    },
  };

  return (
    <div className="grid gap-2 sm:grid-cols-4">
      {steps.map((step) => {
        const meta = statusMeta[step.status];
        return (
          <div
            key={step.label}
            aria-current={step.status === 'current' ? 'step' : undefined}
            className={cn('rounded-lg border px-3 py-2 text-left', meta.className)}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold">{step.label}</span>
              {step.status === 'complete' ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : step.status === 'current' ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
              ) : step.status === 'issue' ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : (
                <span className={cn('h-2 w-2 shrink-0 rounded-full', meta.dotClassName)} aria-hidden />
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-[10px] leading-snug opacity-80">
              {step.description}
            </p>
            <span className="sr-only">{meta.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function RuntimeCredentialStrip({
  runtime,
}: {
  runtime: BrowserTestRuntimeSummary | null;
}) {
  if (!runtime) {
    return null;
  }
  const items = [
    { label: 'TTS', provider: runtime.tts },
    { label: 'LLM', provider: runtime.llm },
    { label: 'STT', provider: runtime.stt },
  ].filter((item): item is { label: string; provider: BrowserTestRuntimeProvider } =>
    Boolean(item.provider),
  );
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {items.map((item) => (
        <Badge
          key={item.label}
          variant="outline"
          className="border-border/60 bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground"
        >
          Using {credentialModeLabel(item.provider.credentialMode)} for {item.label}
        </Badge>
      ))}
      {runtime.versionNumber ? (
        <span className="text-[10px] text-muted-foreground/75">
          Live V{runtime.versionNumber}
        </span>
      ) : null}
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 rounded-md border border-border/50 bg-background/60 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-mono text-[11px] text-foreground" title={value ?? undefined}>
        {value?.trim() ? value : 'Not available'}
      </dd>
    </div>
  );
}

function RuntimeProviderDebugRows({
  label,
  provider,
}: {
  label: string;
  provider: BrowserTestRuntimeProvider | null | undefined;
}) {
  if (!provider) {
    return (
      <DebugRow
        label={`${label} runtime`}
        value="Not returned by test-call response"
      />
    );
  }

  return (
    <>
      <DebugRow label={`${label} provider`} value={provider.providerId} />
      <DebugRow label={`${label} model`} value={provider.model ?? null} />
      {provider.voiceId ? (
        <DebugRow label={`${label} voice`} value={provider.voiceId} />
      ) : null}
      <DebugRow
        label={`${label} credential`}
        value={credentialModeLabel(provider.credentialMode)}
      />
    </>
  );
}

function SessionDebugDrawer({
  agentId,
  agentName,
  session,
  sessionPhase,
  badgePhase,
  durationLabel,
  connectedAtMs,
  endedAtMs,
  errorMessage,
  summary,
}: {
  agentId: string;
  agentName: string;
  session: BrowserTestSession | null;
  sessionPhase: BrowserSessionPhase | null;
  badgePhase: BrowserTestPhaseBadge;
  durationLabel: string;
  connectedAtMs: number | null;
  endedAtMs: number | null;
  errorMessage: string | null;
  summary: PostCallSummary;
}) {
  return (
    <section className="max-h-[min(16rem,45dvh)] shrink-0 overflow-y-auto border-t border-border/50 bg-muted/15 px-4 py-3 sm:px-5">
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <p>
          Debug details use existing runtime and live data-channel payloads. Provider
          secrets are intentionally not shown here.
        </p>
      </div>
      <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DebugRow label="Agent" value={agentName} />
        <DebugRow label="Agent ID" value={agentId} />
        <DebugRow label="UI phase" value={phaseLabel(badgePhase)} />
        <DebugRow label="Session phase" value={sessionPhase ?? 'Preparing'} />
        <DebugRow label="Duration" value={durationLabel} />
        <DebugRow label="Ready at" value={formatDebugTime(connectedAtMs)} />
        <DebugRow label="Ended at" value={formatDebugTime(endedAtMs)} />
        <DebugRow label="Call ID" value={session?.callId} />
        <DebugRow label="Room name" value={session?.roomName} />
        <DebugRow label="Transcript turns" value={String(summary.totalTurns)} />
        <DebugRow label="Data channel events" value={String(summary.dataChannelEvents)} />
        <DebugRow label="Avg agent latency" value={compactDurationMs(summary.avgAgentLatencyMs)} />
        <DebugRow label="Last agent latency" value={compactDurationMs(summary.lastAgentLatencyMs)} />
        <DebugRow label="LLM tokens" value={compactCount(summary.totalLlmTokens)} />
        <DebugRow label="Token source" value={summary.tokenUsageSource} />
        <DebugRow label="TTS text chunks" value={String(summary.totalTtsTextChunks)} />
        <DebugRow label="TTS audio frames" value={String(summary.totalTtsAudioFrames)} />
        <DebugRow label="Avg TTS chunk" value={summary.avgTtsChunkChars === null ? null : `${summary.avgTtsChunkChars} chars`} />
        <DebugRow label="Live version" value={session?.runtime?.versionNumber ? `V${session.runtime.versionNumber}` : null} />
        <DebugRow label="Server URL" value={session?.serverUrl} />
        <DebugRow label="Launch error" value={errorMessage} />
        <RuntimeProviderDebugRows label="TTS" provider={session?.runtime?.tts} />
        <RuntimeProviderDebugRows label="LLM" provider={session?.runtime?.llm} />
        <RuntimeProviderDebugRows label="STT" provider={session?.runtime?.stt} />
      </dl>
      {summary.latestWaterfall.length > 0 ? (
        <div className="mt-3 rounded-md border border-border/50 bg-background/60 px-3 py-2">
          <p className="text-[10px] font-medium uppercase text-muted-foreground">
            Latest stage waterfall
          </p>
          <div className="mt-2">
            <StageWaterfallStrip stages={summary.latestWaterfall} limit={9} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function formatTranscriptTime(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return '';
  }
  return new Date(parsed).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function transcriptEventLabel(event: LiveTranscriptEvent | null): string | null {
  if (!event) {
    return null;
  }
  const labels: Record<string, string> = {
    user_speech_start: 'User speech started',
    user_speech_end: 'User speech ended',
    agent_speech_start: 'Agent response started',
    agent_speech_end: 'Agent response ended',
  };
  return labels[event.event] ?? event.event.replaceAll('_', ' ');
}

function transcriptSpeakerMeta(speaker: LiveTranscriptSpeaker): {
  label: string;
  Icon: LucideIcon;
  className: string;
  badgeClassName: string;
} {
  if (speaker === 'agent') {
    return {
      label: 'Agent',
      Icon: Bot,
      className: 'border-emerald-500/20 bg-emerald-500/5',
      badgeClassName: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    };
  }
  if (speaker === 'system') {
    return {
      label: 'System',
      Icon: Info,
      className: 'border-border/70 bg-muted/30',
      badgeClassName: 'bg-muted text-muted-foreground',
    };
  }
  return {
    label: 'You',
    Icon: UserRound,
    className: 'border-primary/20 bg-primary/5',
    badgeClassName: 'bg-primary/10 text-primary',
  };
}

function LatencyBadge({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  const formatted = compactDurationMs(value);
  if (!formatted) {
    return null;
  }
  return (
    <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[10px]">
      <Gauge className="h-3 w-3" aria-hidden />
      {label}: {formatted}
    </Badge>
  );
}

function DebugMetricBadge({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) {
    return null;
  }
  return (
    <Badge variant="outline" className="gap-1 px-2 py-0.5 text-[10px]">
      <Gauge className="h-3 w-3" aria-hidden />
      {label}: {value}
    </Badge>
  );
}

function StageWaterfallStrip({
  stages,
  limit = 6,
}: {
  stages: LiveStageWaterfallItem[];
  limit?: number;
}) {
  const visibleStages = stages
    .filter((stage) => stage.stage !== 'total_turn')
    .slice(0, limit);
  if (visibleStages.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {visibleStages.map((stage) => (
        <Badge
          key={`${stage.stage}:${stage.durationMs}`}
          variant="secondary"
          className="px-2 py-0.5 text-[10px] font-normal"
          title={`${stage.label}: ${stage.durationMs}ms`}
        >
          {stage.label}: {compactDurationMs(stage.durationMs)}
        </Badge>
      ))}
    </div>
  );
}

function LiveTranscriptPanel({
  entries,
  lastEvent,
  isRoomConnected,
}: {
  entries: LiveTranscriptEntry[];
  lastEvent: LiveTranscriptEvent | null;
  isRoomConnected: boolean;
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const transcriptChars = entries.reduce((total, entry) => total + entry.text.length, 0);
  const lastEventLabel = transcriptEventLabel(lastEvent);
  const latestAgentEntry =
    [...entries]
      .reverse()
      .find((entry) => entry.speaker === 'agent' && entry.status !== 'interim') ?? null;
  const latestFirstAudioMs =
    latestAgentEntry?.latencyMs ?? latestAgentEntry?.metrics.firstAudioLatencyMs ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries, lastEvent]);

  return (
    <aside
      aria-label="Live transcript"
      className="flex min-h-[18rem] min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background/85 shadow-sm"
    >
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/50 bg-card/35 px-3 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" aria-hidden />
            <h3 className="truncate text-sm font-semibold">Live transcript</h3>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {entries.length > 0
              ? `${entries.length} turn${entries.length === 1 ? '' : 's'} · ${transcriptChars} chars`
              : isRoomConnected
                ? 'Waiting for speech events'
                : 'Starts after room connect'}
          </p>
        </div>
        <Badge
          variant={isRoomConnected ? 'outline' : 'secondary'}
          className="shrink-0 px-2 py-0.5 text-[10px]"
        >
          <Radio
            className={cn('h-3 w-3 mr-1', isRoomConnected ? 'text-emerald-500' : 'text-muted-foreground')}
            aria-hidden
          />
          {isRoomConnected ? 'Live' : 'Waiting'}
        </Badge>
      </div>

      {latestAgentEntry ? (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border/40 bg-muted/10 px-3 py-2">
          <LatencyBadge label="First audio" value={latestFirstAudioMs} />
          <LatencyBadge label="Total turn" value={latestAgentEntry.metrics.totalTurnMs} />
          <LatencyBadge label="LLM token" value={latestAgentEntry.metrics.llmFirstTokenLatencyMs} />
          <LatencyBadge label="TTS audio" value={latestAgentEntry.metrics.ttsFirstAudioLatencyMs} />
          <DebugMetricBadge label="Tokens" value={tokenUsageLabel(latestAgentEntry.metrics.tokenUsage)} />
          <DebugMetricBadge
            label="TTS chunks"
            value={compactCount(latestAgentEntry.metrics.ttsChunks?.textChunkCount ?? null)}
          />
        </div>
      ) : null}

      {lastEventLabel ? (
        <div className="shrink-0 border-b border-border/40 bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          {lastEventLabel}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3" aria-live="polite">
        {entries.length === 0 ? (
          <div className="grid min-h-full place-items-center text-center">
            <div className="max-w-xs">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <MessageSquareText className="h-5 w-5" aria-hidden />
              </div>
              <p className="mt-3 text-sm font-medium">
                {isRoomConnected ? 'No transcript yet' : 'Transcript not connected yet'}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {isRoomConnected
                  ? 'Speak into the microphone. Interim STT and agent turns appear here when the worker publishes them.'
                  : 'The panel will listen for transcript events once the LiveKit room opens.'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => {
              const meta = transcriptSpeakerMeta(entry.speaker);
              const StatusIcon = meta.Icon;
              return (
                <article
                  key={entry.id}
                  className={cn('rounded-lg border px-3 py-2 text-left', meta.className)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-full', meta.badgeClassName)}>
                        <StatusIcon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold">{meta.label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {formatTranscriptTime(entry.timestamp)}
                          {entry.latencyMs !== null ? ` · ${entry.latencyMs}ms` : ''}
                        </p>
                      </div>
                    </div>
                    <Badge
                      variant={entry.status === 'interrupted' ? 'destructive' : 'outline'}
                      className="shrink-0 px-2 py-0.5 text-[10px]"
                    >
                      {entry.status === 'interim'
                        ? 'Interim'
                        : entry.status === 'interrupted'
                          ? 'Interrupted'
                          : 'Final'}
                    </Badge>
                  </div>
                  <p
                    className={cn(
                      'mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed',
                      entry.status === 'interim' ? 'text-muted-foreground italic' : 'text-foreground',
                    )}
                  >
                    {entry.text}
                  </p>
                  {entry.speaker === 'agent' ? (
                    <>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <LatencyBadge
                          label="First audio"
                          value={entry.latencyMs ?? entry.metrics.firstAudioLatencyMs}
                        />
                        <LatencyBadge label="LLM first token" value={entry.metrics.llmFirstTokenLatencyMs} />
                        <LatencyBadge label="TTS first audio" value={entry.metrics.ttsFirstAudioLatencyMs} />
                        <LatencyBadge label="Playback" value={entry.metrics.playbackDurationMs} />
                        <LatencyBadge label="Total" value={entry.metrics.totalResponseMs} />
                        <LatencyBadge
                          label="Interrupt"
                          value={entry.metrics.interruptionToSilenceMs}
                        />
                        <DebugMetricBadge label="Tokens" value={tokenUsageLabel(entry.metrics.tokenUsage)} />
                        <DebugMetricBadge
                          label="Text chunks"
                          value={compactCount(entry.metrics.ttsChunks?.textChunkCount ?? null)}
                        />
                        <DebugMetricBadge
                          label="Audio frames"
                          value={compactCount(entry.metrics.ttsChunks?.audioFrameCount ?? null)}
                        />
                      </div>
                      {entry.metrics.stageWaterfall.length > 0 ? (
                        <div className="mt-2">
                          <StageWaterfallStrip stages={entry.metrics.stageWaterfall} />
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <LatencyBadge label="STT" value={entry.metrics.sttLatencyMs} />
                    </div>
                  )}
                </article>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>
    </aside>
  );
}

function LiveDataChannelPanel({
  events,
}: {
  events: LiveDataChannelEvent[];
}) {
  const visibleEvents = events.slice(-12).reverse();
  return (
    <aside
      aria-label="Live data channel events"
      className="flex min-h-[10rem] min-w-0 flex-col overflow-hidden rounded-lg border border-border/70 bg-background/85 shadow-sm"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/50 bg-card/35 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="truncate text-sm font-semibold">Data channel</h3>
        </div>
        <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
          {events.length} event{events.length === 1 ? '' : 's'}
        </Badge>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {visibleEvents.length === 0 ? (
          <div className="grid min-h-full place-items-center text-center">
            <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
              Transcript and status data-channel events will appear here as they arrive.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {visibleEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-left"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-xs font-medium">{event.label}</p>
                  <Badge
                    variant={event.kind === 'status' ? 'secondary' : 'outline'}
                    className="shrink-0 px-1.5 py-0 text-[9px]"
                  >
                    {event.kind}
                  </Badge>
                </div>
                {event.detail ? (
                  <p className="mt-1 line-clamp-2 break-words text-[10px] text-muted-foreground">
                    {event.detail}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function CallDetailLink({
  callId,
  variant = 'outline',
}: {
  callId: string | null | undefined;
  variant?: 'default' | 'outline' | 'secondary';
}) {
  if (!callId) {
    return null;
  }
  return (
    <a
      href={`/calls/${encodeURIComponent(callId)}`}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ variant, size: 'sm' }), 'gap-1.5 rounded-full')}
    >
      <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      Call detail
    </a>
  );
}

function PostCallSummaryPanel({
  summary,
  durationLabel,
}: {
  summary: PostCallSummary;
  durationLabel: string;
}) {
  const cells = [
    { label: 'Duration', value: durationLabel },
    { label: 'Turns', value: String(summary.totalTurns) },
    { label: 'User / Agent', value: `${summary.userTurns} / ${summary.agentTurns}` },
    { label: 'Interrupted', value: String(summary.interruptedTurns) },
    { label: 'Characters', value: String(summary.transcriptChars) },
    { label: 'Data events', value: String(summary.dataChannelEvents) },
    {
      label: 'Avg latency',
      value: compactDurationMs(summary.avgAgentLatencyMs) ?? 'Not available',
    },
    {
      label: 'Last latency',
      value: compactDurationMs(summary.lastAgentLatencyMs) ?? 'Not available',
    },
    {
      label: 'LLM tokens',
      value:
        summary.totalLlmTokens === null
          ? 'Not available'
          : `${summary.totalLlmTokens.toLocaleString()} (${summary.tokenUsageSource ?? 'unknown'})`,
    },
    { label: 'TTS chunks', value: String(summary.totalTtsTextChunks) },
    {
      label: 'Avg chunk',
      value:
        summary.avgTtsChunkChars === null
          ? 'Not available'
          : `${summary.avgTtsChunkChars} chars`,
    },
  ];

  return (
    <div className="mt-4 grid gap-2 rounded-lg border border-border/70 bg-muted/25 p-3 text-left text-xs text-muted-foreground sm:grid-cols-2">
      {cells.map((cell) => (
        <div key={cell.label}>
          <span className="font-medium text-foreground">{cell.label}</span>
          <p className="mt-0.5 truncate font-mono" title={cell.value}>
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}



function deriveVoiceMode(
  input: {
    agentState: string;
    agentVolume: number;
    hasAgentParticipant: boolean;
    isMicrophoneEnabled: boolean;
    isMicrophonePublished: boolean;
    isRoomConnected: boolean;
    hasCompletedReadiness: boolean;
  },
): VoiceUiMode {
  if (!input.isRoomConnected) {
    return 'connecting';
  }
  if (input.agentState === 'failed') {
    return 'failed';
  }
  if (!input.hasCompletedReadiness) {
    return 'connecting';
  }
  if (input.agentState === 'speaking' || input.agentVolume > 0.012) {
    return 'speaking';
  }
  if (!input.isMicrophoneEnabled || !input.isMicrophonePublished) {
    return 'muted';
  }
  if (input.agentState === 'thinking') {
    return 'thinking';
  }
  if (input.agentState === 'listening' || input.hasAgentParticipant) {
    return 'listening';
  }

  if (
    input.agentState === 'idle' ||
    input.agentState === 'initializing' ||
    input.agentState === 'pre-connect-buffering' ||
    input.agentState === 'connecting'
  ) {
    return 'listening';
  }

  return 'idle';
}

function AudioLevelBars({
  active,
  volume,
  mode,
}: {
  active: boolean;
  volume: number;
  mode: VoiceUiMode;
}) {
  const bars = [0.28, 0.52, 0.34, 0.68, 0.44, 0.82, 0.5, 0.66, 0.38];

  const getBarColorClass = () => {
    if (!active) return 'bg-muted-foreground/20';
    if (mode === 'speaking') return 'bg-emerald-500/75';
    if (mode === 'listening') return 'bg-primary/75';
    return 'bg-primary/70';
  };

  return (
    <div
      className="flex h-9 items-center justify-center gap-1"
      aria-hidden
    >
      {bars.map((base, index) => {
        const liveLevel = active ? Math.min(1, base + volume * 2.2) : base * 0.28;
        return (
          <span
            key={index}
            className={cn(
              'w-1.5 rounded-full transition-all duration-100',
              getBarColorClass(),
            )}
            style={{ height: `${8 + liveLevel * 24}px` }}
          />
        );
      })}
    </div>
  );
}

function VoiceOrb({
  mode,
  isMuted,
  isBusy,
  localVolume,
  agentVolume,
  onToggleMute,
}: {
  mode: VoiceUiMode;
  isMuted: boolean;
  isBusy: boolean;
  localVolume: number;
  agentVolume: number;
  onToggleMute: () => void;
}) {
  const meta = voiceModeMeta[mode];
  const StatusIcon = meta.Icon;
  const visualVolume = mode === 'speaking' ? agentVolume : localVolume;
  const isAnimated = mode === 'listening' || mode === 'speaking';
  const pulse = Math.min(1, Math.max(0, visualVolume * 7));
  const scale = Math.min(1.08, 1 + pulse * 0.05);

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="relative grid place-items-center">
        {isAnimated ? (
          <>
            <span
              className={cn(
                'absolute h-24 w-24 rounded-full border transition-all duration-300 sm:h-28 sm:w-28',
                mode === 'speaking' ? 'border-emerald-500/25' : 'border-primary/25',
              )}
              style={{
                transform: `scale(${1 + pulse * 0.2})`,
                opacity: 0.18 + pulse * 0.28,
              }}
            />
            <span className={cn(
              'absolute h-32 w-32 animate-pulse rounded-full border sm:h-36 sm:w-36',
              mode === 'speaking' ? 'border-emerald-500/10' : 'border-primary/10',
            )} />
          </>
        ) : null}

        <button
          type="button"
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          onClick={onToggleMute}
          disabled={isBusy}
          className={cn(
            'relative grid h-20 w-20 place-items-center rounded-full border transition-all duration-150 sm:h-24 sm:w-24',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30',
            meta.orbClassName,
            isBusy && 'cursor-not-allowed opacity-70',
          )}
          style={{ transform: `scale(${scale})` }}
        >
          {isBusy ? (
            <Loader2 className="h-8 w-8 animate-spin sm:h-9 sm:w-9" aria-hidden />
          ) : isMuted ? (
            <MicOff className="h-8 w-8 sm:h-9 sm:w-9" aria-hidden />
          ) : (
            <StatusIcon className="h-8 w-8 sm:h-9 sm:w-9" aria-hidden />
          )}
        </button>
      </div>

      <div className="space-y-1.5">
        <div
          className={cn(
            'mx-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
            meta.badgeClassName,
          )}
        >
          <StatusIcon
            className={cn('h-4 w-4', mode === 'connecting' && 'animate-spin')}
            aria-hidden
          />
          {meta.label}
        </div>
        <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {meta.description}
        </p>
      </div>
    </div>
  );
}

function EndCallToolbar({
  className,
  isEnding,
  onEndSession,
}: {
  className?: string;
  isEnding: boolean;
  onEndSession: () => Promise<void>;
}) {
  const handleClick = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    event.preventDefault();
    logTestCallDebug('call_end_requested', { source: 'frontend' });
    await onEndSession();
  };

  return (
    <Button
      type="button"
      variant="destructive"
      disabled={isEnding}
      onClick={(event) => void handleClick(event)}
      className={cn('h-9 gap-2 rounded-full px-4 text-sm', className)}
    >
      {isEnding ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <PhoneOff className="h-4 w-4" aria-hidden />
      )}
      {isEnding ? 'Ending...' : 'End session'}
    </Button>
  );
}



interface RoomChromeProps {
  showEndButton: boolean;
  isEnding: boolean;
  elapsedLabel: string;
  lifecycleNotice: string | null;
  transcriptEntries: LiveTranscriptEntry[];
  lastTranscriptEvent: LiveTranscriptEvent | null;
  dataChannelEvents: LiveDataChannelEvent[];
  onSessionActive: () => void;
  onSessionMode: (mode: VoiceUiMode) => void;
  onLifecycleState: (phase: BrowserSessionPhase, message?: string) => void;
  onTranscriptEntry: (entry: LiveTranscriptEntry) => void;
  onTranscriptEvent: (event: LiveTranscriptEvent) => void;
  onDataChannelEvent: (event: LiveDataChannelEvent) => void;
  onRemoteEndRequested: () => void;
  onClientDisconnected: () => void;
  onEndSession: () => Promise<void>;
}

function BrowserTestRoomChrome({
  showEndButton,
  isEnding,
  elapsedLabel,
  lifecycleNotice,
  transcriptEntries,
  lastTranscriptEvent,
  dataChannelEvents,
  onSessionActive,
  onSessionMode,
  onLifecycleState,
  onTranscriptEntry,
  onTranscriptEvent,
  onDataChannelEvent,
  onRemoteEndRequested,
  onClientDisconnected,
  onEndSession,
}: RoomChromeProps) {
  const room = useRoomContext();
  const {
    localParticipant,
    microphoneTrack,
    isMicrophoneEnabled,
    lastMicrophoneError,
  } = useLocalParticipant();
  const { agent, audioTrack: agentAudioTrack, state: agentState } =
    useVoiceAssistant();
  const remoteParticipants = useRemoteParticipants();
  const remoteMicTracks = useTracks([Track.Source.Microphone], {
    onlySubscribed: true,
  });
  const connectionState = useConnectionState();
  
  const [muteBusy, setMuteBusy] = useState(false);
  const [agentAudioDucked, setAgentAudioDucked] = useState(false);
  const [agentWaitTimedOut, setAgentWaitTimedOut] = useState(false);
  const [hasCompletedReadiness, setHasCompletedReadiness] = useState(false);
  const autoMicAttemptRef = useRef(0);
  const readinessLoggedRef = useRef(false);
  const userMutedRef = useRef(false);
  const bargeInDuckedRef = useRef(false);
  const localNoiseFloorRef = useRef(0.006);
  const localSpeechStartedAtRef = useRef<number | null>(null);
  const lastLocalSpeechAtRef = useRef(0);

  const localMicPublication = localParticipant.getTrackPublication(
    Track.Source.Microphone,
  );
  const localAudioTrack =
    microphoneTrack?.track instanceof LocalAudioTrack
      ? microphoneTrack.track
      : undefined;
  const isMicrophonePublished =
    hasPublishedTrack(microphoneTrack) ||
    hasPublishedTrack(localMicPublication) ||
    Boolean(localAudioTrack);
  const detectedAgent = useMemo(
    () =>
      agent ??
      remoteParticipants.find(isAgentLikeParticipant) ??
      remoteParticipants[0],
    [agent, remoteParticipants],
  );
  const fallbackAgentAudioTrack = useMemo(
    () =>
      remoteMicTracks.find(
        (track) =>
          track.participant.identity !== localParticipant.identity &&
          (!detectedAgent ||
            track.participant.identity === detectedAgent.identity),
      ) ??
      remoteMicTracks.find(
        (track) => track.participant.identity !== localParticipant.identity,
      ),
    [detectedAgent, localParticipant.identity, remoteMicTracks],
  );
  const activeAgentAudioTrack = agentAudioTrack ?? fallbackAgentAudioTrack;
  const isRoomConnected =
    connectionState === ConnectionState.Connected ||
    room.state === ConnectionState.Connected;
  const isReconnecting =
    String(connectionState).toLowerCase() === 'reconnecting' ||
    String(room.state).toLowerCase() === 'reconnecting';
  const localVolume = useTrackVolume(localAudioTrack);
  const agentVolume = useTrackVolume(activeAgentAudioTrack);
  const derivedMode = deriveVoiceMode({
    agentState,
    agentVolume,
    hasAgentParticipant: Boolean(detectedAgent),
    hasCompletedReadiness,
    isMicrophoneEnabled,
    isMicrophonePublished,
    isRoomConnected,
  });
  const mode = agentWaitTimedOut ? 'failed' : derivedMode;
  const isAudioActive =
    hasCompletedReadiness && (mode === 'listening' || mode === 'speaking');
  const agentDisplayName =
    detectedAgent?.name || detectedAgent?.identity || 'Local agent';
  const agentAudioRenderVolume = agentAudioDucked
    ? CLIENT_BARGE_IN_DUCK_VOLUME
    : 1;
  const microphoneReady = isMicrophoneEnabled && isMicrophonePublished;
  const shouldShowMutedGuidance =
    isRoomConnected &&
    !microphoneReady &&
    !lastMicrophoneError &&
    !userMutedRef.current;
  const microphoneErrorMessage = lastMicrophoneError?.message ?? '';
  const microphonePermissionLikelyBlocked =
    /permission|denied|notallowed|not allowed|blocked/i.test(
      microphoneErrorMessage,
    );
  const activeAgentAudioTrackReady = Boolean(activeAgentAudioTrack);
  const sessionFullyReady =
    isRoomConnected &&
    microphoneReady &&
    Boolean(detectedAgent) &&
    activeAgentAudioTrackReady;
  const connectionSteps = useMemo<ConnectionStep[]>(
    () => [
      {
        label: 'Room',
        description: isReconnecting
          ? 'Reconnecting to LiveKit.'
          : isRoomConnected
            ? 'Browser joined the room.'
            : 'Joining the browser room.',
        status: isRoomConnected ? 'complete' : isReconnecting ? 'issue' : 'current',
      },
      {
        label: 'Mic',
        description: lastMicrophoneError
          ? 'Browser microphone needs attention.'
          : microphoneReady
            ? 'Microphone is publishing audio.'
            : 'Waiting for microphone access.',
        status: lastMicrophoneError
          ? 'issue'
          : microphoneReady
            ? 'complete'
            : isRoomConnected
              ? 'current'
              : 'waiting',
      },
      {
        label: 'Agent',
        description: agentWaitTimedOut
          ? 'No agent participant joined yet.'
          : detectedAgent
            ? 'Agent participant joined.'
            : 'Waiting for the worker agent.',
        status: agentWaitTimedOut
          ? 'issue'
          : detectedAgent
            ? 'complete'
            : isRoomConnected
              ? 'current'
              : 'waiting',
      },
      {
        label: 'Audio',
        description: activeAgentAudioTrackReady
          ? 'Subscribed to agent audio.'
          : detectedAgent
            ? 'Waiting for the agent audio track.'
            : 'Audio appears after the agent joins.',
        status: activeAgentAudioTrackReady
          ? 'complete'
          : detectedAgent
            ? 'current'
            : 'waiting',
      },
    ],
    [
      activeAgentAudioTrackReady,
      agentWaitTimedOut,
      detectedAgent,
      isReconnecting,
      isRoomConnected,
      lastMicrophoneError,
      microphoneReady,
    ],
  );

  

  const setBargeInDucked = useCallback(
    (nextDucked: boolean, reason: string, threshold: number) => {
      if (bargeInDuckedRef.current === nextDucked) {
        return;
      }

      bargeInDuckedRef.current = nextDucked;
      setAgentAudioDucked(nextDucked);
      logTestCallDebug(
        nextDucked ? 'client_barge_in_duck_started' : 'client_barge_in_duck_ended',
        {
          reason,
          localVolume: Number(localVolume.toFixed(4)),
          agentVolume: Number(agentVolume.toFixed(4)),
          threshold: Number(threshold.toFixed(4)),
          renderVolume: nextDucked ? CLIENT_BARGE_IN_DUCK_VOLUME : 1,
        },
      );
    },
    [agentVolume, localVolume],
  );

  const endSessionAndDisconnect = useCallback(async (): Promise<void> => {
    let apiError: unknown = null;
    try {
      await onEndSession();
    } catch (error: unknown) {
      apiError = error;
      logTestCallDebug('call_end_api_request_failed_before_local_disconnect', {
        message: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await room.disconnect(true);
      logTestCallDebug('call_end_local_disconnect_completed');
    } catch (error: unknown) {
      logTestCallDebug('call_end_local_disconnect_failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      onClientDisconnected();
    }

    if (apiError) {
      logTestCallDebug('call_end_completed_with_api_error', {
        message: apiError instanceof Error ? apiError.message : String(apiError),
      });
    }
  }, [onClientDisconnected, onEndSession, room]);

  useEffect(() => {
    if (isEnding || !isRoomConnected || detectedAgent) {
      setAgentWaitTimedOut(false);
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setAgentWaitTimedOut(true);
      logTestCallDebug('agent_join_timeout', {
        timeoutMs: NO_AGENT_TIMEOUT_MS,
        connectionState,
        roomState: room.state,
      });
    }, NO_AGENT_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [connectionState, detectedAgent, isEnding, isRoomConnected, room.state]);

  useEffect(() => {
    const now = performance.now();
    const agentAudible =
      !isEnding &&
      hasCompletedReadiness &&
      isRoomConnected &&
      (agentState === 'speaking' ||
        mode === 'speaking' ||
        agentVolume > CLIENT_BARGE_IN_AGENT_VOLUME_FLOOR);
    const canDuck =
      agentAudible &&
      isMicrophoneEnabled &&
      isMicrophonePublished &&
      Boolean(localAudioTrack);
    const floor = localNoiseFloorRef.current;

    if (!canDuck) {
      localNoiseFloorRef.current = floor * 0.92 + localVolume * 0.08;
      localSpeechStartedAtRef.current = null;
      lastLocalSpeechAtRef.current = 0;
      setBargeInDucked(
        false,
        agentAudible ? 'mic_unavailable' : 'agent_not_speaking',
        CLIENT_BARGE_IN_DUCK_END_VOLUME,
      );
      return;
    }

    const startThreshold = Math.max(
      CLIENT_BARGE_IN_DUCK_START_VOLUME,
      floor * 2.5 + 0.012,
    );
    const endThreshold = Math.max(
      CLIENT_BARGE_IN_DUCK_END_VOLUME,
      floor * 1.4 + 0.006,
    );
    const threshold = bargeInDuckedRef.current ? endThreshold : startThreshold;

    if (localVolume >= threshold) {
      localSpeechStartedAtRef.current ??= now;
      lastLocalSpeechAtRef.current = now;
      if (
        bargeInDuckedRef.current ||
        now - localSpeechStartedAtRef.current >= CLIENT_BARGE_IN_DUCK_HOLD_MS
      ) {
        setBargeInDucked(true, 'local_speech_detected', threshold);
      }
      return;
    }

    localSpeechStartedAtRef.current = null;

    if (!bargeInDuckedRef.current) {
      localNoiseFloorRef.current = floor * 0.95 + localVolume * 0.05;
      return;
    }

    if (now - lastLocalSpeechAtRef.current >= CLIENT_BARGE_IN_DUCK_RELEASE_MS) {
      localNoiseFloorRef.current = Math.max(floor, localVolume * 0.8);
      setBargeInDucked(false, 'local_speech_released', threshold);
    }
  }, [
    agentState,
    agentVolume,
    hasCompletedReadiness,
    isEnding,
    isMicrophoneEnabled,
    isMicrophonePublished,
    isRoomConnected,
    localAudioTrack,
    localVolume,
    mode,
    setBargeInDucked,
  ]);

  const toggleMute = useCallback(async () => {
    if (isEnding || !isRoomConnected) {
      return;
    }
    const nextEnabled = !isMicrophoneEnabled;
    userMutedRef.current = !nextEnabled;
    logTestCallDebug('mic_toggle_requested', {
      nextEnabled,
      identity: localParticipant.identity,
    });
    setMuteBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(
        nextEnabled,
        nextEnabled ? browserAudioCaptureOptions : undefined,
      );
      logTestCallDebug('mic_toggle_completed', { nextEnabled });
    } catch (error: unknown) {
      logTestCallDebug('mic_toggle_failed', {
        nextEnabled,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setMuteBusy(false);
    }
  }, [isEnding, isMicrophoneEnabled, isRoomConnected, localParticipant]);

  useEffect(() => {
    const localMicPublication = localParticipant.getTrackPublication(
      Track.Source.Microphone,
    );
    logTestCallDebug('room_state_snapshot', {
      connectionState,
      roomState: room.state,
      agentState,
      agent: detectedAgent ? describeParticipant(detectedAgent) : null,
      voiceAssistantAgent: agent ? describeParticipant(agent) : null,
      local: describeParticipant(localParticipant),
      microphone: describePublication(localMicPublication),
      isMicrophoneEnabled,
      isMicrophonePublished,
      remoteParticipantCount: remoteParticipants.length,
    });
  }, [
    agent,
    agentState,
    connectionState,
    detectedAgent,
    isMicrophoneEnabled,
    isMicrophonePublished,
    localParticipant,
    localMicPublication,
    microphoneTrack,
    remoteParticipants.length,
    room.state,
  ]);

  useEffect(() => {
    logTestCallDebug(
      detectedAgent ? 'agent_participant_detected' : 'agent_participant_missing',
      {
        agent: detectedAgent ? describeParticipant(detectedAgent) : null,
        voiceAssistantAgent: agent ? describeParticipant(agent) : null,
        remoteParticipants: remoteParticipants.map(describeParticipant),
      },
    );
  }, [agent, detectedAgent, remoteParticipants]);

  useEffect(() => {
    onSessionMode(mode);
  }, [mode, onSessionMode]);

  useEffect(() => {
    logTestCallDebug(
      isMicrophonePublished
        ? 'microphone_publish_ready'
        : 'microphone_publish_not_ready',
      {
        isMicrophoneEnabled,
        microphone: describePublication(localMicPublication),
      },
    );
  }, [isMicrophoneEnabled, isMicrophonePublished, localMicPublication]);

  useEffect(() => {
    if (!lastMicrophoneError) {
      return;
    }
    logTestCallDebug('microphone_publish_failed', {
      message: lastMicrophoneError.message,
    });
  }, [lastMicrophoneError]);

  useEffect(() => {
    const cleanups = [
      addEventLogger(room, RoomEvent.ConnectionStateChanged, (state) => {
        logTestCallDebug('room_connection_state_changed', { state });
      }),
      addEventLogger(room, RoomEvent.Connected, () => {
        logTestCallDebug('room_connected', {
          local: describeParticipant(localParticipant),
        });
      }),
      addEventLogger(room, RoomEvent.Reconnecting, () => {
        logTestCallDebug('room_reconnecting');
      }),
      addEventLogger(room, RoomEvent.Reconnected, () => {
        logTestCallDebug('room_reconnected');
      }),
      addEventLogger(room, RoomEvent.Disconnected, (reason) => {
        logTestCallDebug('room_disconnected', { reason });
      }),
      addEventLogger(room, RoomEvent.DataReceived, (payload, participant, kind, topic) => {
        void kind;
        const message = decodeControlPayload(payload);
        const receivedAt = Date.now();
        if (topic === TRANSCRIPT_TOPIC && message) {
          const parsed = parseLiveTranscriptMessage(message, participant);
          if (parsed?.entry) {
            onTranscriptEntry(parsed.entry);
            onDataChannelEvent({
              id: `${receivedAt}:transcript:${parsed.entry.id}`,
              topic: TRANSCRIPT_TOPIC,
              kind: 'transcript',
              label: `${parsed.entry.speaker === 'agent' ? 'Agent' : 'User'} transcript ${parsed.entry.status}`,
              detail: [
                `${parsed.entry.text.length} chars`,
                parsed.entry.latencyMs !== null ? `${parsed.entry.latencyMs}ms` : null,
                parsed.entry.metrics.tokenUsage?.totalTokens
                  ? `${parsed.entry.metrics.tokenUsage.totalTokens} tokens`
                  : null,
                parsed.entry.metrics.ttsChunks?.textChunkCount
                  ? `${parsed.entry.metrics.ttsChunks.textChunkCount} chunks`
                  : null,
              ]
                .filter(Boolean)
                .join(', '),
              timestamp: parsed.entry.timestamp,
              receivedAt,
              phase: null,
            });
            logTestCallDebug('live_transcript_entry_received', {
              id: parsed.entry.id,
              speaker: parsed.entry.speaker,
              status: parsed.entry.status,
              chars: parsed.entry.text.length,
            });
          } else if (parsed?.event) {
            onTranscriptEvent(parsed.event);
            onDataChannelEvent({
              id: `${receivedAt}:transcript-event:${parsed.event.event}:${parsed.event.turnId ?? 'none'}`,
              topic: TRANSCRIPT_TOPIC,
              kind: 'transcript',
              label: transcriptEventLabel(parsed.event) ?? parsed.event.event,
              detail: parsed.event.turnId === null ? null : `Turn ${parsed.event.turnId}`,
              timestamp: parsed.event.timestamp,
              receivedAt,
              phase: null,
            });
            logTestCallDebug('live_transcript_event_received', {
              event: parsed.event.event,
              speaker: parsed.event.speaker,
            });
          }
          return;
        }
        if (topic === CONTROL_TOPIC && message?.type === 'end_call') {
          onDataChannelEvent({
            id: `${receivedAt}:control:end_call`,
            topic: CONTROL_TOPIC,
            kind: 'control',
            label: 'End call requested',
            detail: typeof message.reason === 'string' ? message.reason : null,
            timestamp: new Date(receivedAt).toISOString(),
            receivedAt,
            phase: 'ENDING',
          });
          logTestCallDebug('call_end_frontend_synced', {
            source: 'livekit_data',
            reason: message.reason,
          });
          onRemoteEndRequested();
        }
        if (topic === CONTROL_TOPIC && message?.type === 'session_state') {
          const phase = typeof message.phase === 'string' ? message.phase : '';
          const notice = typeof message.message === 'string' ? message.message : undefined;
          if (
            phase === 'LIVE' ||
            phase === 'IDLE' ||
            phase === 'ENDING' ||
            phase === 'DISCONNECTED'
          ) {
            logTestCallDebug('session_state_received', {
              phase,
              message: notice,
              reason: message.reason,
            });
            onDataChannelEvent({
              id: `${receivedAt}:status:${phase}:${message.reason ?? 'none'}`,
              topic: CONTROL_TOPIC,
              kind: 'status',
              label: `Status: ${phase}`,
              detail: notice ?? (typeof message.reason === 'string' ? message.reason : null),
              timestamp: new Date(receivedAt).toISOString(),
              receivedAt,
              phase,
            });
            if (phase !== 'LIVE' || hasCompletedReadiness) {
              onLifecycleState(phase, notice);
            }
          }
        }
      }),
      addEventLogger(room, RoomEvent.ParticipantConnected, (participant) => {
        logTestCallDebug('participant_connected', describeParticipant(participant));
      }),
      addEventLogger(room, RoomEvent.ParticipantDisconnected, (participant) => {
        logTestCallDebug(
          'participant_disconnected',
          describeParticipant(participant),
        );
      }),
      addEventLogger(room, RoomEvent.TrackPublished, (publication, participant) => {
        logTestCallDebug('remote_track_published', {
          participant: describeParticipant(participant),
          publication: describePublication(publication),
        });
      }),
      addEventLogger(
        room,
        RoomEvent.TrackUnpublished,
        (publication, participant) => {
          logTestCallDebug('remote_track_unpublished', {
            participant: describeParticipant(participant),
            publication: describePublication(publication),
          });
        },
      ),
      addEventLogger(room, RoomEvent.TrackSubscribed, (track, publication, participant) => {
        void track;
        logTestCallDebug('remote_track_subscribed', {
          participant: describeParticipant(participant),
          publication: describePublication(publication),
        });
      }),
      addEventLogger(
        localParticipant,
        ParticipantEvent.LocalTrackPublished,
        (publication) => {
          logTestCallDebug('local_track_published', {
            publication: describePublication(publication),
          });
        },
      ),
      addEventLogger(
        localParticipant,
        ParticipantEvent.LocalTrackUnpublished,
        (publication) => {
          logTestCallDebug('local_track_unpublished', {
            publication: describePublication(publication),
          });
        },
      ),
      addEventLogger(localParticipant, ParticipantEvent.TrackMuted, (publication) => {
        logTestCallDebug('local_track_muted', {
          publication: describePublication(publication),
        });
      }),
      addEventLogger(localParticipant, ParticipantEvent.TrackUnmuted, (publication) => {
        logTestCallDebug('local_track_unmuted', {
          publication: describePublication(publication),
        });
      }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [
    localParticipant,
    hasCompletedReadiness,
    onDataChannelEvent,
    onLifecycleState,
    onRemoteEndRequested,
    onTranscriptEntry,
    onTranscriptEvent,
    room,
  ]);

  useEffect(() => {
    if (isEnding) {
      return;
    }

    if (sessionFullyReady) {
      setHasCompletedReadiness(true);
      if (!readinessLoggedRef.current) {
        logTestCallDebug('session_ready_detected', {
          connectionState,
          roomState: room.state,
          microphone: describePublication(localMicPublication),
          agent: detectedAgent ? describeParticipant(detectedAgent) : null,
          agentAudioReady: activeAgentAudioTrackReady,
        });
        readinessLoggedRef.current = true;
      }
      onSessionActive();
      return;
    }

    if (!hasCompletedReadiness) {
      readinessLoggedRef.current = false;
    }
  }, [
    activeAgentAudioTrackReady,
    connectionState,
    detectedAgent,
    hasCompletedReadiness,
    isEnding,
    localMicPublication,
    onSessionActive,
    room.state,
    sessionFullyReady,
  ]);

  useEffect(() => {
    if (isMicrophoneEnabled) {
      autoMicAttemptRef.current = 0;
      return undefined;
    }
    if (
      isEnding ||
      connectionState !== ConnectionState.Connected ||
      userMutedRef.current ||
      autoMicAttemptRef.current >= 4 ||
      lastMicrophoneError
    ) {
      return undefined;
    }

    let cancelled = false;
    const attempt = autoMicAttemptRef.current + 1;
    autoMicAttemptRef.current = attempt;
    const timer = window.setTimeout(() => {
      if (cancelled) {
        return;
      }
      logTestCallDebug('mic_auto_publish_attempt', { attempt });
      setMuteBusy(true);
      localParticipant
        .setMicrophoneEnabled(true, browserAudioCaptureOptions)
        .then(() => {
          logTestCallDebug('mic_auto_publish_completed', { attempt });
        })
        .catch((error: unknown) => {
          logTestCallDebug('mic_auto_publish_failed', {
            attempt,
            message: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (!cancelled) {
            setMuteBusy(false);
          }
        });
    }, attempt === 1 ? 0 : 600);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    connectionState,
    isEnding,
    isMicrophoneEnabled,
    lastMicrophoneError,
    localParticipant,
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/10">
      <StartAudio
        label="Enable agent audio"
        className={cn(
          'mx-auto mt-3 inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5',
          'text-xs font-medium shadow-sm transition hover:bg-muted',
        )}
      />
      <RoomAudioRenderer volume={agentAudioRenderVolume} />

      <div className="flex min-h-0 flex-1 p-3 sm:p-5">
        <section className="flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-border/70 bg-background shadow-sm">
          <div className="flex shrink-0 flex-col gap-3 border-b border-border/40 bg-card/35 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                Browser preview
              </p>
              <h3 className="mt-1 truncate text-base font-semibold tracking-tight sm:text-lg">
                {agentDisplayName}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="px-2 py-0.5 text-[10px]">
                <Clock className="h-3 w-3 mr-1" aria-hidden />
                {elapsedLabel}
              </Badge>
              {isReconnecting ? (
                <Badge variant="destructive" className="px-2 py-0.5 text-[10px]">
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" aria-hidden />
                  Reconnecting
                </Badge>
              ) : null}
              <Badge variant={detectedAgent ? 'default' : 'secondary'} className="px-2 py-0.5 text-[10px]">
                <Wifi className="h-3 w-3 mr-1" aria-hidden />
                {agentWaitTimedOut
                  ? 'Agent delayed'
                  : detectedAgent
                    ? 'Agent joined'
                    : 'Waiting'}
              </Badge>
              <Badge
                className="px-2 py-0.5 text-[10px]"
                variant={
                  microphoneReady
                    ? 'outline'
                    : 'destructive'
                }
              >
                {microphoneReady ? (
                  <Mic className="h-3 w-3 mr-1" aria-hidden />
                ) : (
                  <MicOff className="h-3 w-3 mr-1" aria-hidden />
                )}
                {microphoneReady ? 'Mic on' : 'Mic not ready'}
              </Badge>
            </div>
          </div>

          <div className="shrink-0 border-b border-border/40 bg-muted/10 px-3 py-3 sm:px-4">
            <ConnectionProgress steps={connectionSteps} />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="mx-auto grid min-h-full w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]">
              <div className="flex min-w-0 flex-col items-center justify-center gap-4 sm:gap-5">
                <VoiceOrb
                  mode={mode}
                  isMuted={!isMicrophoneEnabled}
                  isBusy={muteBusy || isEnding || !isRoomConnected}
                  localVolume={localVolume}
                  agentVolume={agentVolume}
                  onToggleMute={toggleMute}
                />

                <AudioLevelBars
                  active={isAudioActive}
                  volume={mode === 'speaking' ? agentVolume : localVolume}
                  mode={mode}
                />

                {isReconnecting ? (
                  <div className="flex w-full max-w-lg items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
                    <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    <div className="space-y-1 text-left">
                      <p className="font-medium">Connection is recovering</p>
                      <p className="text-xs leading-relaxed opacity-80">
                        Keep this window open while the browser reconnects. If it does not
                        recover, end this session and start a fresh test.
                      </p>
                    </div>
                  </div>
                ) : null}

                {agentWaitTimedOut ? (
                  <div className="flex w-full max-w-lg items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div className="space-y-1 text-left">
                      <p className="font-medium">Agent has not joined yet</p>
                      <p className="text-xs leading-relaxed">
                        The browser room is open, but no worker agent participant was
                        detected after {Math.round(NO_AGENT_TIMEOUT_MS / 1000)} seconds.
                        Use End session, then Start again after checking the worker.
                      </p>
                    </div>
                  </div>
                ) : null}

                {lastMicrophoneError ? (
                  <div className="flex w-full max-w-lg items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div className="space-y-1 text-left">
                      <p className="font-medium">
                        {microphonePermissionLikelyBlocked
                          ? 'Microphone access is blocked'
                          : 'Microphone is not available'}
                      </p>
                      <p className="text-xs leading-relaxed">
                        {microphonePermissionLikelyBlocked
                          ? 'Allow microphone access for this site in your browser settings, then click Unmute.'
                          : 'Check that a microphone is connected and not being used exclusively by another app, then click Unmute.'}
                      </p>
                      <p className="break-words font-mono text-[10px] opacity-80">
                        Browser message: {lastMicrophoneError.message}
                      </p>
                    </div>
                  </div>
                ) : null}
                {shouldShowMutedGuidance ? (
                  <div className="flex w-full max-w-lg items-start gap-2 rounded-lg border border-border/70 bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
                    <MicOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <div className="space-y-1 text-left">
                      <p className="font-medium text-foreground">Microphone is not sending audio</p>
                      <p className="text-xs leading-relaxed">
                        Allow microphone access when prompted. If the prompt already passed,
                        click Unmute to publish your microphone.
                      </p>
                    </div>
                  </div>
                ) : null}
                {lifecycleNotice ? (
                  <p className="max-w-full rounded-full border bg-muted/50 px-3 py-1 text-center text-xs text-muted-foreground sm:text-sm">
                    {lifecycleNotice}
                  </p>
                ) : null}
              </div>

              <div className="flex min-h-0 min-w-0 flex-col gap-3">
                <LiveTranscriptPanel
                  entries={transcriptEntries}
                  lastEvent={lastTranscriptEvent}
                  isRoomConnected={isRoomConnected}
                />
                <LiveDataChannelPanel events={dataChannelEvents} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-border/40 bg-muted/15 px-3 py-3 sm:px-4">
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2 rounded-full px-4 text-sm"
              onClick={toggleMute}
              disabled={muteBusy || isEnding || !isRoomConnected}
            >
              {muteBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : isMicrophoneEnabled ? (
                <MicOff className="h-4 w-4" aria-hidden />
              ) : (
                <Mic className="h-4 w-4" aria-hidden />
              )}
              {isMicrophoneEnabled ? 'Mute' : 'Unmute'}
            </Button>
            {showEndButton ? (
              <EndCallToolbar
                isEnding={isEnding}
                onEndSession={endSessionAndDisconnect}
              />
            ) : null}
            {showEndButton ? (
              <p className="basis-full text-center text-[11px] text-muted-foreground">
                Close only dismisses this window. End session sends the stop request.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

export function TestCallModal(props: TestCallModalProps) {
  const { agentId, agentName, open, onOpenChange, apiCall } = props;

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const [session, setSession] = useState<BrowserTestSession | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [debugOpen, setDebugOpen] = useState(false);
  const [sessionConnectedAtMs, setSessionConnectedAtMs] = useState<number | null>(null);
  const [sessionEndedAtMs, setSessionEndedAtMs] = useState<number | null>(null);
  const [clockNowMs, setClockNowMs] = useState(() => Date.now());
  const [liveTranscriptEntries, setLiveTranscriptEntries] = useState<LiveTranscriptEntry[]>([]);
  const [lastLiveTranscriptEvent, setLastLiveTranscriptEvent] =
    useState<LiveTranscriptEvent | null>(null);
  const [dataChannelEvents, setDataChannelEvents] = useState<LiveDataChannelEvent[]>([]);
  const testInteractionCompletedRef = useRef(false);

  /** Mirrored session state from backend end requests + LiveKit room events. */
  const [sessionPhase, setSessionPhase] =
    useState<BrowserSessionPhase | null>(null);
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);

  const markRtcActive = useCallback(() => {
    setSessionConnectedAtMs((current) => current ?? Date.now());
    setSessionEndedAtMs(null);
    setSessionPhase((phase) =>
      phase === 'ENDING' || phase === 'DISCONNECTED' || phase === 'IDLE'
        ? phase
        : 'LIVE',
    );
  }, []);

  const markSessionMode = useCallback((mode: VoiceUiMode) => {
    setSessionPhase((phase) => {
      if (phase === 'ENDING' || phase === 'DISCONNECTED') {
        return phase;
      }
      if (phase === 'IDLE') {
        return phase;
      }
      if (mode === 'connecting' || mode === 'failed') {
        return phase ?? 'CONNECTING';
      }
      if (mode === 'speaking') {
        return 'SPEAKING';
      }
      if (mode === 'listening') {
        return 'LISTENING';
      }
      if (mode === 'muted') {
        return phase ?? 'CONNECTING';
      }
      return phase === null || phase === 'CONNECTING' ? 'LIVE' : phase;
    });
  }, []);

  const markLifecycleState = useCallback(
    (phase: BrowserSessionPhase, message?: string) => {
      if (phase === 'ENDING' || phase === 'DISCONNECTED') {
        setSessionEndedAtMs((current) => current ?? Date.now());
      }
      setLifecycleNotice(() => {
        if (phase === 'IDLE') {
          return message ?? 'Waiting for response...';
        }
        if (phase === 'ENDING') {
          return message ?? 'Ending session...';
        }
        return null;
      });
      setSessionPhase((current) => {
        if (current === 'DISCONNECTED') {
          return current;
        }
        if (phase === 'ENDING' || phase === 'DISCONNECTED' || phase === 'IDLE') {
          return phase;
        }
        if (current === 'ENDING') {
          return current;
        }
        return phase;
      });
    },
    [],
  );

  const markRemoteEndRequested = useCallback(() => {
    setSessionEndedAtMs((current) => current ?? Date.now());
    setLifecycleNotice('Ending session...');
    setSessionPhase((phase) =>
      phase === 'DISCONNECTED' ? phase : 'ENDING',
    );
  }, []);

  const markClientDisconnected = useCallback(() => {
    setLifecycleNotice(null);
    setSessionEndedAtMs((current) => current ?? Date.now());
    setSessionPhase('DISCONNECTED');
  }, []);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setErrorMessage(null);
      setFetchFailed(false);
      setSessionPhase(null);
      setLifecycleNotice(null);
      setSessionConnectedAtMs(null);
      setSessionEndedAtMs(null);
      setDebugOpen(false);
      setLiveTranscriptEntries([]);
      setLastLiveTranscriptEvent(null);
      setDataChannelEvents([]);
      testInteractionCompletedRef.current = false;
      return undefined;
    }

    let aborted = false;
    setSession(null);
    setErrorMessage(null);
    setFetchFailed(false);
    setSessionPhase(null);
    setLifecycleNotice(null);
    setSessionConnectedAtMs(null);
    setSessionEndedAtMs(null);
    setLiveTranscriptEntries([]);
    setLastLiveTranscriptEvent(null);
    setDataChannelEvents([]);

    void (async () => {
      try {
        const res = await apiCall(`/api/v1/agents/${agentId}/test-call`, {
          method: 'POST',
        });
        if (aborted) {
          return;
        }
        if (!res.ok) {
          const body = await res.text();
          throw new Error(
            body.trim() ||
              `${res.status === 503 ? 'LiveKit is not configured' : res.statusText}`,
          );
        }
        const dto = await res.json();
        const sessionDto = readSessionDto(dto);
        setSession(sessionDto);
        try {
          window.dispatchEvent(
            new CustomEvent('awaaz:call-started', {
              detail: { roomName: sessionDto.roomName },
            }),
          );
        } catch {
          /* ignore */
        }
        setSessionPhase('CONNECTING');
      } catch (e) {
        if (aborted) {
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMessage(msg);
        setFetchFailed(true);
        setSession(null);
        setSessionPhase(null);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [open, agentId, apiCall, reloadKey]);

  useEffect(() => {
    if (
      !open ||
      !session ||
      sessionPhase === 'DISCONNECTED' ||
      sessionPhase === null ||
      sessionEndedAtMs !== null
    ) {
      setClockNowMs(Date.now());
      return undefined;
    }

    const timer = window.setInterval(() => setClockNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [open, session, sessionEndedAtMs, sessionPhase]);

  useEffect(() => {
    if (
      testInteractionCompletedRef.current ||
      (sessionPhase !== 'SPEAKING' && sessionPhase !== 'LISTENING')
    ) {
      return;
    }
    testInteractionCompletedRef.current = true;
    dispatchOnboardingTestInteractionCompleted();
  }, [sessionPhase]);

  const requestEndSession = useCallback(async (): Promise<void> => {
    if (!session) {
      return;
    }
    setSessionEndedAtMs((current) => current ?? Date.now());
    setSessionPhase((phase) =>
      phase === 'DISCONNECTED' ? phase : 'ENDING',
    );
    setLifecycleNotice('Ending session...');
    const res = await apiCall(
      `/api/v1/agents/${agentId}/test-call/${session.callId}/end`,
      { method: 'POST' },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text.trim() || res.statusText);
    }
    logTestCallDebug('call_end_frontend_synced', {
      source: 'api',
      callId: session.callId,
    });
  }, [agentId, apiCall, session]);

  const recordTranscriptEntry = useCallback((entry: LiveTranscriptEntry): void => {
    setLiveTranscriptEntries((current) => upsertLiveTranscriptEntry(current, entry));
  }, []);

  const recordTranscriptEvent = useCallback((event: LiveTranscriptEvent): void => {
    setLastLiveTranscriptEvent(event);
  }, []);

  const recordDataChannelEvent = useCallback((event: LiveDataChannelEvent): void => {
    setDataChannelEvents((current) => [...current, event].slice(-80));
  }, []);

  const badgePhase = useMemo((): BrowserTestPhaseBadge => {
    if (fetchFailed) {
      return 'fetch_error';
    }
    if (!session) {
      return 'connecting';
    }
    switch (sessionPhase) {
      case 'DISCONNECTED':
        return 'ended';
      case 'ENDING':
        return 'ending';
      case 'IDLE':
        return 'idle';
      case 'LIVE':
      case 'LISTENING':
      case 'SPEAKING':
        return 'active';
      case 'CONNECTING':
      default:
        return 'connecting';
    }
  }, [fetchFailed, sessionPhase, session]);

  useEffect(() => {
    if (sessionPhase === 'DISCONNECTED') {
      setLifecycleNotice(null);
      setSessionEndedAtMs((current) => current ?? Date.now());
      try {
        window.dispatchEvent(new CustomEvent('awaaz:call-ended'));
      } catch {
        /* ignore */
      }
    }
  }, [sessionPhase]);

  const badgeVariant =
    badgePhase === 'active'
      ? 'default'
      : badgePhase === 'idle'
        ? 'secondary'
      : badgePhase === 'fetch_error'
        ? 'destructive'
      : 'secondary';

  const elapsedSeconds =
    sessionConnectedAtMs === null
      ? 0
      : Math.floor(((sessionEndedAtMs ?? clockNowMs) - sessionConnectedAtMs) / 1000);
  const durationLabel = formatSessionDuration(elapsedSeconds);
  const postCallSummary = summarizeLiveTranscript(liveTranscriptEntries, dataChannelEvents);
  const launchSteps: ConnectionStep[] = [
    {
      label: 'Session',
      description: fetchFailed
        ? 'The browser test session was not created.'
        : session
          ? 'Session token was created.'
          : 'Requesting a browser test session.',
      status: fetchFailed ? 'issue' : session ? 'complete' : 'current',
    },
    {
      label: 'Ready',
      description: sessionConnectedAtMs
        ? 'Room, mic, agent, and audio are ready.'
        : session
          ? 'Waiting for room, mic, agent, and agent audio.'
          : 'Waiting for session details.',
      status: sessionConnectedAtMs ? 'complete' : session ? 'current' : 'waiting',
    },
    {
      label: 'Mic',
      description: 'Browser microphone permission happens after room connect.',
      status: 'waiting',
    },
    {
      label: 'Agent',
      description: 'Worker agent joins the room after dispatch.',
      status: 'waiting',
    },
  ];
  const startNewSession = (): void => {
    setSessionConnectedAtMs(null);
    setSessionEndedAtMs(null);
    setLifecycleNotice(null);
    setLiveTranscriptEntries([]);
    setLastLiveTranscriptEvent(null);
    setDataChannelEvents([]);
    setReloadKey((k) => k + 1);
  };

  if (!open) {
    return null;
  }

  const closeModal = (): void => {
    logTestCallDebug('modal_close_requested', {
      callId: session?.callId,
      roomName: session?.roomName,
      sessionPhase,
      sendsEndRequest: false,
    });
    onOpenChange(false);
  };
  const headline = phaseLabel(badgePhase);
  const headerDescription =
    lifecycleNotice ??
    (sessionPhase === 'ENDING'
      ? 'Ending session...'
      : session && sessionPhase !== 'DISCONNECTED'
        ? 'Close dismisses this window. Use End session to stop the test call.'
        : 'Run a local voice check with browser audio.');

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Browser agent test call"
      className="animate-in fade-in fixed inset-0 z-[260] flex items-stretch justify-center bg-black/60 p-2 backdrop-blur-md duration-200 sm:items-center sm:p-4"
    >
      <div className="relative flex h-[calc(100dvh-1rem)] w-full max-w-4xl animate-in zoom-in-95 flex-col overflow-hidden rounded-2xl border border-border/80 bg-background shadow-2xl duration-200 sm:h-[calc(100dvh-2rem)] sm:max-h-[760px]">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border/40 bg-card/45 px-4 py-3 sm:items-center sm:gap-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary text-[10px] px-2 py-0.5">
                <Phone className="h-3 w-3 mr-1" aria-hidden />
                Browser preview
              </Badge>
              {headline ? (
                <Badge variant={badgeVariant} className="text-[10px] px-2 py-0.5">
                  <span data-testid="test-call-phase">{headline}</span>
                </Badge>
              ) : null}
              {session ? (
                <Badge variant="outline" className="text-[10px] px-2 py-0.5">
                  <Clock className="h-3 w-3 mr-1" aria-hidden />
                  {durationLabel}
                </Badge>
              ) : null}
            </div>
            <h2 className="mt-2 truncate text-base font-semibold tracking-tight sm:text-lg">
              Test Agent: {agentName}
            </h2>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
              {headerDescription}
            </p>
            <RuntimeCredentialStrip runtime={session?.runtime ?? null} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <CallDetailLink callId={session?.callId} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={debugOpen}
              onClick={() => setDebugOpen((open) => !open)}
              className="h-8 gap-1.5 rounded-full px-3 text-xs"
            >
              Debug
              {debugOpen ? (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close modal without sending an end-session request"
              title="Close modal without sending an end-session request"
              onClick={closeModal}
              className="-mr-2 h-8 w-8 shrink-0 rounded-full transition-colors hover:bg-muted/50 hover:text-foreground sm:mr-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {fetchFailed ? (
          <div className="grid min-h-0 flex-1 place-items-center bg-card/30 px-4 sm:px-6">
            <div className="w-full max-w-lg rounded-xl border border-border/80 bg-card p-5 text-center shadow-lg sm:p-6">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold sm:text-lg">
                Voice preview is unavailable
              </h3>
              <p className="mt-2 text-sm text-muted-foreground">
                The test-call session could not be prepared. Check the agent setup,
                selected providers, and provider credentials before retrying.
              </p>
              {errorMessage ? (
                <p className="mt-3 break-words rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-left font-mono text-[11px] text-destructive">
                  {errorMessage}
                </p>
              ) : null}
              <div className="mt-5">
                <ConnectionProgress steps={launchSteps} />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={startNewSession}
                className="mt-5 h-9 gap-2 rounded-full px-4 text-sm"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Try again
              </Button>
            </div>
          </div>
        ) : session && sessionPhase !== 'DISCONNECTED' ? (
          <LiveKitRoom
            key={`${reloadKey}:${session.roomName}`}
            data-lk-theme="default"
            serverUrl={session.serverUrl}
            token={session.participantToken}
            connect
            audio={browserAudioCaptureOptions}
            video={false}
            options={{ adaptiveStream: true, dynacast: true }}
            onConnected={() => {
              logTestCallDebug('livekit_room_connected_waiting_for_readiness');
            }}
            onDisconnected={(reason?: DisconnectReason) => {
              logTestCallDebug('livekit_room_disconnected', { reason });
              logTestCallDebug('call_end_frontend_synced', {
                source: 'room_disconnected',
                reason,
              });
              setSessionEndedAtMs((current) => current ?? Date.now());
              setSessionPhase('DISCONNECTED');
            }}
            onError={(error) => {
              logTestCallDebug('livekit_room_error', { message: error.message });
            }}
            onMediaDeviceFailure={(failure, kind) => {
              logTestCallDebug('media_device_failure', { failure, kind });
            }}
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <BrowserTestRoomChrome
              showEndButton
              isEnding={sessionPhase === 'ENDING'}
              elapsedLabel={durationLabel}
              lifecycleNotice={lifecycleNotice}
              transcriptEntries={liveTranscriptEntries}
              lastTranscriptEvent={lastLiveTranscriptEvent}
              dataChannelEvents={dataChannelEvents}
              onSessionActive={markRtcActive}
              onSessionMode={markSessionMode}
              onLifecycleState={markLifecycleState}
              onTranscriptEntry={recordTranscriptEntry}
              onTranscriptEvent={recordTranscriptEvent}
              onDataChannelEvent={recordDataChannelEvent}
              onRemoteEndRequested={markRemoteEndRequested}
              onClientDisconnected={markClientDisconnected}
              onEndSession={requestEndSession}
            />
          </LiveKitRoom>
        ) : session && sessionPhase === 'DISCONNECTED' ? (
          <div className="grid min-h-0 flex-1 place-items-center bg-card/30 px-4 text-center sm:px-6">
            <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 shadow-lg sm:p-6">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <PhoneOff className="h-6 w-6" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold sm:text-lg">Session ended</h3>
              <p className="mt-2 text-muted-foreground text-sm">
                This browser session has stopped. Test calls remain available in
                Calls history with a Test badge.
              </p>
              <PostCallSummaryPanel
                summary={postCallSummary}
                durationLabel={durationLabel}
              />
              <div className="mt-3 rounded-lg border border-border/70 bg-background/70 p-3 text-left text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Call ID</span>
                <p className="mt-0.5 truncate font-mono" title={session.callId}>
                  {session.callId}
                </p>
              </div>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <CallDetailLink callId={session.callId} variant="default" />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 gap-2 rounded-full px-4 text-sm"
                  onClick={startNewSession}
                >
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  Start again
                </Button>
                <Button
                  type="button"
                  variant="default"
                  className="h-9 rounded-full px-4 text-sm"
                  onClick={closeModal}
                >
                  Close
                </Button>
              </div>
              <p className="mt-4 text-xs text-muted-foreground">
                Start again creates a new test session. Close only dismisses this modal.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center bg-card/30 px-4 sm:px-6">
            <div className="w-full max-w-lg rounded-xl border border-border/85 bg-card p-5 text-center shadow-lg sm:p-6">
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-muted-foreground" />
              <h3 className="mt-4 text-base font-semibold">Preparing voice session</h3>
              <p className="mt-2 text-muted-foreground text-sm">
                Creating a browser test-call session for this agent. The room will ask
                for microphone access after the session is ready.
              </p>
              <div className="mt-5">
                <ConnectionProgress steps={launchSteps} />
              </div>
            </div>
          </div>
        )}

        {debugOpen ? (
          <SessionDebugDrawer
            agentId={agentId}
            agentName={agentName}
            session={session}
            sessionPhase={sessionPhase}
            badgePhase={badgePhase}
            durationLabel={durationLabel}
            connectedAtMs={sessionConnectedAtMs}
            endedAtMs={sessionEndedAtMs}
            errorMessage={errorMessage}
            summary={postCallSummary}
          />
        ) : null}

        {session !== null && sessionPhase === 'CONNECTING' && !fetchFailed ? (
          <footer className="shrink-0 border-t border-border bg-muted/20 px-4 py-2.5 text-center text-xs text-muted-foreground sm:px-8">
            Preparing browser audio. Allow microphone access when the browser asks;
            closing the modal does not send the End session request.
          </footer>
        ) : null}
      </div>
      {/* sessionPhase changes are observed via effect to dispatch call-ended events */}
    </div>
  );
}
