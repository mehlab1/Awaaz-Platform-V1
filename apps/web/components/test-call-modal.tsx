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
  useDisconnectButton,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
  useTrackVolume,
  
  useVoiceAssistant,
} from '@livekit/components-react';
import {
  AlertCircle,
  AudioLines,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
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
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const browserAudioCaptureOptions: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  voiceIsolation: true,
};
const CLIENT_BARGE_IN_DUCK_VOLUME = 0.15;
const CLIENT_BARGE_IN_DUCK_START_VOLUME = 0.05;
const CLIENT_BARGE_IN_DUCK_END_VOLUME = 0.025;
const CLIENT_BARGE_IN_DUCK_RELEASE_MS = 250;
const CLIENT_BARGE_IN_AGENT_VOLUME_FLOOR = 0.012;

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



function deriveVoiceMode(
  input: {
    agentState: string;
    agentVolume: number;
    hasAgentParticipant: boolean;
    isMicrophoneEnabled: boolean;
    isMicrophonePublished: boolean;
    isRoomConnected: boolean;
  },
): VoiceUiMode {
  if (!input.isRoomConnected) {
    return 'connecting';
  }
  if (input.agentState === 'failed') {
    return 'failed';
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
  const { buttonProps } = useDisconnectButton({ stopTracks: true });
  const safeButtonProps = { ...buttonProps } as typeof buttonProps & {
    stopTracks?: unknown;
  };
  delete safeButtonProps.stopTracks;
  const { disabled, onClick, ...rest } = safeButtonProps;

  const handleClick = async (event: MouseEvent<HTMLButtonElement>): Promise<void> => {
    logTestCallDebug('call_end_requested', { source: 'frontend' });
    try {
      await onEndSession();
    } catch (error: unknown) {
      logTestCallDebug('call_end_frontend_fallback_disconnect', {
        message: error instanceof Error ? error.message : String(error),
      });
      onClick?.(event);
    }
  };

  return (
    <Button
      type="button"
      variant="destructive"
      {...rest}
      disabled={!!disabled || isEnding}
      onClick={(event) => void handleClick(event)}
      className={cn(rest.className, 'h-9 gap-2 rounded-full px-4 text-sm', className)}
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
  lifecycleNotice: string | null;
  onSessionActive: () => void;
  onSessionMode: (mode: VoiceUiMode) => void;
  onLifecycleState: (phase: BrowserSessionPhase, message?: string) => void;
  onRemoteEndRequested: () => void;
  onEndSession: () => Promise<void>;
}

function BrowserTestRoomChrome({
  showEndButton,
  isEnding,
  lifecycleNotice,
  onSessionActive,
  onSessionMode,
  onLifecycleState,
  onRemoteEndRequested,
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
  const autoMicAttemptRef = useRef(0);
  const readinessLoggedRef = useRef(false);
  const userMutedRef = useRef(false);
  const bargeInDuckedRef = useRef(false);
  const localNoiseFloorRef = useRef(0.006);
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
  const localVolume = useTrackVolume(localAudioTrack);
  const agentVolume = useTrackVolume(activeAgentAudioTrack);
  const mode = deriveVoiceMode({
    agentState,
    agentVolume,
    hasAgentParticipant: Boolean(detectedAgent),
    isMicrophoneEnabled,
    isMicrophonePublished,
    isRoomConnected,
  });
  const isAudioActive = mode === 'listening' || mode === 'speaking';
  const agentDisplayName =
    detectedAgent?.name || detectedAgent?.identity || 'Local agent';
  const agentAudioRenderVolume = agentAudioDucked
    ? CLIENT_BARGE_IN_DUCK_VOLUME
    : 1;

  

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

  useEffect(() => {
    const now = performance.now();
    const agentAudible =
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
      lastLocalSpeechAtRef.current = now;
      setBargeInDucked(true, 'local_speech_detected', threshold);
      return;
    }

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
    isMicrophoneEnabled,
    isMicrophonePublished,
    isRoomConnected,
    localAudioTrack,
    localVolume,
    mode,
    setBargeInDucked,
  ]);

  const toggleMute = useCallback(async () => {
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
  }, [isMicrophoneEnabled, localParticipant]);

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
        void participant;
        void kind;
        const message = decodeControlPayload(payload);
        if (topic === 'awaaz.call.control' && message?.type === 'end_call') {
          logTestCallDebug('call_end_frontend_synced', {
            source: 'livekit_data',
            reason: message.reason,
          });
          onRemoteEndRequested();
        }
        if (topic === 'awaaz.call.control' && message?.type === 'session_state') {
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
            onLifecycleState(phase, notice);
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
  }, [localParticipant, onLifecycleState, onRemoteEndRequested, room]);

  useEffect(() => {
    if (isRoomConnected && isMicrophonePublished) {
      if (!readinessLoggedRef.current) {
        logTestCallDebug('session_ready_detected', {
          connectionState,
          roomState: room.state,
          microphone: describePublication(localMicPublication),
          agent: detectedAgent ? describeParticipant(detectedAgent) : null,
        });
        readinessLoggedRef.current = true;
      }
      onSessionActive();
      return;
    }

    readinessLoggedRef.current = false;
  }, [
    connectionState,
    detectedAgent,
    isMicrophonePublished,
    isRoomConnected,
    localMicPublication,
    onSessionActive,
    room.state,
  ]);

  useEffect(() => {
    if (isMicrophoneEnabled) {
      autoMicAttemptRef.current = 0;
      return undefined;
    }
    if (
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
              <Badge variant={detectedAgent ? 'default' : 'secondary'} className="px-2 py-0.5 text-[10px]">
                <Wifi className="h-3 w-3 mr-1" aria-hidden />
                {detectedAgent ? 'Agent joined' : 'Waiting'}
              </Badge>
              <Badge
                className="px-2 py-0.5 text-[10px]"
                variant={
                  isMicrophoneEnabled && isMicrophonePublished
                    ? 'outline'
                    : 'destructive'
                }
              >
                {isMicrophoneEnabled && isMicrophonePublished ? (
                  <Mic className="h-3 w-3 mr-1" aria-hidden />
                ) : (
                  <MicOff className="h-3 w-3 mr-1" aria-hidden />
                )}
                {isMicrophoneEnabled && isMicrophonePublished
                  ? 'Mic on'
                  : 'Muted'}
              </Badge>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 place-items-center overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
            <div className="flex w-full max-w-lg flex-col items-center gap-4 sm:gap-5">
              <VoiceOrb
                mode={mode}
                isMuted={!isMicrophoneEnabled}
                isBusy={muteBusy}
                localVolume={localVolume}
                agentVolume={agentVolume}
                onToggleMute={toggleMute}
              />

              <AudioLevelBars
                active={isAudioActive}
                volume={mode === 'speaking' ? agentVolume : localVolume}
                mode={mode}
              />

              {lastMicrophoneError ? (
                <div className="flex w-full items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <p>{lastMicrophoneError.message}</p>
                </div>
              ) : null}
              {lifecycleNotice ? (
                <p className="max-w-full rounded-full border bg-muted/50 px-3 py-1 text-center text-xs text-muted-foreground sm:text-sm">
                  {lifecycleNotice}
                </p>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-border/40 bg-muted/15 px-3 py-3 sm:px-4">
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2 rounded-full px-4 text-sm"
              onClick={toggleMute}
              disabled={muteBusy}
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
                onEndSession={onEndSession}
              />
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

  /** Mirrored session state from backend end requests + LiveKit room events. */
  const [sessionPhase, setSessionPhase] =
    useState<BrowserSessionPhase | null>(null);
  const [lifecycleNotice, setLifecycleNotice] = useState<string | null>(null);

  const markRtcActive = useCallback(() => {
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
      if (mode === 'speaking') {
        return 'SPEAKING';
      }
      if (mode === 'listening') {
        return 'LISTENING';
      }
      return phase === null || phase === 'CONNECTING' ? 'LIVE' : phase;
    });
  }, []);

  const markLifecycleState = useCallback(
    (phase: BrowserSessionPhase, message?: string) => {
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
    setLifecycleNotice('Ending session...');
    setSessionPhase((phase) =>
      phase === 'DISCONNECTED' ? phase : 'ENDING',
    );
  }, []);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setErrorMessage(null);
      setFetchFailed(false);
      setSessionPhase(null);
      setLifecycleNotice(null);
      return undefined;
    }

    let aborted = false;
    setSession(null);
    setErrorMessage(null);
    setFetchFailed(false);
    setSessionPhase(null);
    setLifecycleNotice(null);

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

  const requestEndSession = useCallback(async (): Promise<void> => {
    if (!session) {
      return;
    }
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

  if (!open) {
    return null;
  }

  const closeModal = (): void => onOpenChange(false);
  const headline = phaseLabel(badgePhase);

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
            </div>
            <h2 className="mt-2 truncate text-base font-semibold tracking-tight sm:text-lg">
              Test Agent: {agentName}
            </h2>
            <p className="mt-0.5 max-w-2xl text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
              {lifecycleNotice ??
                (sessionPhase === 'ENDING'
                  ? 'Ending session...'
                  : 'Run a local voice check with browser audio.')}
            </p>
            <RuntimeCredentialStrip runtime={session?.runtime ?? null} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Close modal"
            onClick={closeModal}
            className="-mr-2 h-8 w-8 shrink-0 rounded-full transition-colors hover:bg-muted/50 hover:text-foreground sm:mr-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {fetchFailed ? (
          <div className="grid min-h-0 flex-1 place-items-center bg-card/30 px-4 sm:px-6">
            <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 text-center shadow-lg sm:p-6">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-5 w-5" aria-hidden />
              </div>
              <h3 className="mt-4 text-base font-semibold sm:text-lg">
                Voice preview is unavailable
              </h3>
              <p className="mt-2 text-destructive text-sm">{errorMessage}</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReloadKey((k) => k + 1)}
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
            onConnected={markRtcActive}
            onDisconnected={(reason?: DisconnectReason) => {
              logTestCallDebug('livekit_room_disconnected', { reason });
              logTestCallDebug('call_end_frontend_synced', {
                source: 'room_disconnected',
                reason,
              });
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
              showEndButton={sessionPhase !== 'CONNECTING'}
              isEnding={sessionPhase === 'ENDING'}
              lifecycleNotice={lifecycleNotice}
              onSessionActive={markRtcActive}
              onSessionMode={markSessionMode}
              onLifecycleState={markLifecycleState}
              onRemoteEndRequested={markRemoteEndRequested}
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
                Test calls remain available in Calls history with a Test badge.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  className="h-9 gap-2 rounded-full px-4 text-sm"
                  onClick={() => setReloadKey((k) => k + 1)}
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
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 place-items-center bg-card/30 px-4 sm:px-6">
            <div className="max-w-sm rounded-xl border border-border/85 bg-card p-5 text-center shadow-lg sm:p-6">
              <Loader2 className="mx-auto h-9 w-9 animate-spin text-muted-foreground" />
              <p className="mt-4 text-muted-foreground text-sm">
                Preparing your voice session...
              </p>
            </div>
          </div>
        )}

        {session !== null && sessionPhase === 'CONNECTING' && !fetchFailed ? (
          <footer className="shrink-0 border-t border-border bg-muted/20 px-4 py-2.5 text-center text-xs text-muted-foreground sm:px-8">
            Allow microphone access when the browser asks.
          </footer>
        ) : null}
      </div>
      {/* sessionPhase changes are observed via effect to dispatch call-ended events */}
    </div>
  );
}
