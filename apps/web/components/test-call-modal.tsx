'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import '@livekit/components-styles';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useDisconnectButton,
  useLocalParticipant,
  useTrackVolume,
  useTranscriptions,
  useVoiceAssistant,
} from '@livekit/components-react';
import {
  AlertCircle,
  AudioLines,
  Bot,
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
import { DisconnectReason, LocalAudioTrack } from 'livekit-client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** User-visible session states for the ribbon badge */
export type BrowserTestPhaseBadge =
  | 'connecting'
  | 'active'
  | 'ended'
  | 'fetch_error';

interface BrowserTestSession {
  serverUrl: string;
  participantToken: string;
  roomName: string;
}

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

type TranscriptMessage = {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timeLabel: string;
};

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
    orbClassName: 'border-border bg-muted text-muted-foreground',
    badgeClassName: 'border-border bg-muted text-muted-foreground',
  },
  listening: {
    label: 'Listening',
    description: 'Speak naturally. The agent is ready for your next turn.',
    Icon: Mic,
    orbClassName:
      'border-primary/30 bg-primary text-primary-foreground shadow-[0_0_42px_hsl(var(--primary)/0.28)]',
    badgeClassName: 'border-primary/25 bg-primary/10 text-primary',
  },
  thinking: {
    label: 'Thinking',
    description: 'The agent is preparing a response.',
    Icon: AudioLines,
    orbClassName: 'border-border bg-foreground text-background',
    badgeClassName: 'border-border bg-muted text-foreground',
  },
  speaking: {
    label: 'AI speaking',
    description: 'Audio is playing through the browser.',
    Icon: Volume2,
    orbClassName:
      'border-primary/30 bg-primary text-primary-foreground shadow-[0_0_54px_hsl(var(--primary)/0.34)]',
    badgeClassName: 'border-primary/25 bg-primary/10 text-primary',
  },
  idle: {
    label: 'Ready',
    description: 'The session is connected and waiting.',
    Icon: Mic,
    orbClassName: 'border-border bg-card text-foreground shadow-sm',
    badgeClassName: 'border-border bg-muted text-foreground',
  },
  muted: {
    label: 'Muted',
    description: 'Your microphone is off.',
    Icon: MicOff,
    orbClassName: 'border-border bg-muted text-muted-foreground',
    badgeClassName: 'border-border bg-muted text-muted-foreground',
  },
  failed: {
    label: 'Needs attention',
    description: 'The browser room connected, but the agent is not available.',
    Icon: AlertCircle,
    orbClassName: 'border-destructive/30 bg-destructive/10 text-destructive',
    badgeClassName: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
};

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
  if (typeof serverUrl !== 'string' || !participantToken || !serverUrl) {
    throw new Error('Unexpected test-call response.');
  }
  return { serverUrl, participantToken, roomName };
}

function phaseLabel(p: BrowserTestPhaseBadge): string {
  const labels: Record<BrowserTestPhaseBadge, string> = {
    connecting: 'Connecting',
    active: 'Live',
    ended: 'Ended',
    fetch_error: 'Unavailable',
  };
  return labels[p];
}

function formatTranscriptTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return '';
  }
  const normalized = timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
  return new Date(normalized).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function deriveVoiceMode(
  agentState: string,
  isMicrophoneEnabled: boolean,
): VoiceUiMode {
  if (agentState === 'failed') {
    return 'failed';
  }
  if (agentState === 'speaking') {
    return 'speaking';
  }
  if (!isMicrophoneEnabled) {
    return 'muted';
  }
  if (agentState === 'thinking') {
    return 'thinking';
  }
  if (agentState === 'listening') {
    return 'listening';
  }
  if (agentState === 'idle') {
    return 'idle';
  }
  return 'connecting';
}

function AudioLevelBars({
  active,
  volume,
}: {
  active: boolean;
  volume: number;
}) {
  const bars = [0.28, 0.52, 0.34, 0.68, 0.44, 0.82, 0.5, 0.66, 0.38];

  return (
    <div
      className="flex h-12 items-center justify-center gap-1.5"
      aria-hidden
    >
      {bars.map((base, index) => {
        const liveLevel = active ? Math.min(1, base + volume * 2.2) : base * 0.28;
        return (
          <span
            key={index}
            className={cn(
              'w-1.5 rounded-full bg-primary/70 transition-all duration-100',
              !active && 'bg-muted-foreground/25',
            )}
            style={{ height: `${10 + liveLevel * 34}px` }}
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
  const scale = Math.min(1.12, 1 + pulse * 0.08);

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="relative grid place-items-center">
        {isAnimated ? (
          <>
            <span
              className="absolute h-40 w-40 rounded-full border border-primary/20"
              style={{
                transform: `scale(${1 + pulse * 0.2})`,
                opacity: 0.24 + pulse * 0.3,
              }}
            />
            <span className="absolute h-52 w-52 animate-pulse rounded-full border border-primary/10" />
          </>
        ) : null}

        <button
          type="button"
          aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          onClick={onToggleMute}
          disabled={isBusy}
          className={cn(
            'relative grid h-32 w-32 place-items-center rounded-full border transition-all duration-150',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30',
            meta.orbClassName,
            isBusy && 'cursor-not-allowed opacity-70',
          )}
          style={{ transform: `scale(${scale})` }}
        >
          {isBusy ? (
            <Loader2 className="h-12 w-12 animate-spin" aria-hidden />
          ) : isMuted ? (
            <MicOff className="h-12 w-12" aria-hidden />
          ) : (
            <Mic className="h-12 w-12" aria-hidden />
          )}
        </button>
      </div>

      <div className="space-y-2">
        <div
          className={cn(
            'mx-auto inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium',
            meta.badgeClassName,
          )}
        >
          <StatusIcon
            className={cn('h-4 w-4', mode === 'connecting' && 'animate-spin')}
            aria-hidden
          />
          {meta.label}
        </div>
        <p className="mx-auto max-w-sm text-muted-foreground text-sm">
          {meta.description}
        </p>
      </div>
    </div>
  );
}

function EndCallToolbar({ className }: { className?: string }) {
  const { buttonProps } = useDisconnectButton({ stopTracks: true });
  const safeButtonProps = { ...buttonProps } as typeof buttonProps & {
    stopTracks?: unknown;
  };
  delete safeButtonProps.stopTracks;
  const { disabled, ...rest } = safeButtonProps;

  return (
    <Button
      type="button"
      variant="destructive"
      {...rest}
      disabled={!!disabled}
      className={cn(rest.className, 'gap-2 rounded-full px-6', className)}
    >
      <PhoneOff className="h-4 w-4" aria-hidden />
      End session
    </Button>
  );
}

function TranscriptPanel({
  messages,
}: {
  messages: TranscriptMessage[];
}) {
  const endRef = useRef<HTMLDivElement | null>(null);
  const lastMessageText =
    messages.length > 0 ? messages[messages.length - 1].text : '';

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, lastMessageText]);

  return (
    <section className="flex min-h-0 flex-col rounded-lg border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="font-semibold text-sm">Conversation</h3>
          <p className="text-muted-foreground text-xs">
            Live turns appear here as the call is transcribed.
          </p>
        </div>
        <Badge variant="outline">{messages.length} turns</Badge>
      </div>

      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.length === 0 ? (
          <div className="grid h-full min-h-64 place-items-center text-center">
            <div className="max-w-xs space-y-3">
              <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-muted text-muted-foreground">
                <Bot className="h-5 w-5" aria-hidden />
              </div>
              <div>
                <p className="font-medium text-sm">Waiting for the first turn</p>
                <p className="mt-1 text-muted-foreground text-xs">
                  Start speaking once the status changes to Listening.
                </p>
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start',
              )}
            >
              {message.role === 'agent' ? (
                <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                  <Bot className="h-4 w-4" aria-hidden />
                </div>
              ) : null}

              <div
                className={cn(
                  'max-w-[82%] rounded-lg px-4 py-3 text-sm leading-relaxed shadow-sm',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border bg-background text-foreground',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
                {message.timeLabel ? (
                  <p
                    className={cn(
                      'mt-2 text-[11px]',
                      message.role === 'user'
                        ? 'text-primary-foreground/70'
                        : 'text-muted-foreground',
                    )}
                  >
                    {message.timeLabel}
                  </p>
                ) : null}
              </div>

              {message.role === 'user' ? (
                <div className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <Mic className="h-4 w-4" aria-hidden />
                </div>
              ) : null}
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>
    </section>
  );
}

interface RoomChromeProps {
  showEndButton: boolean;
}

function BrowserTestRoomChrome({ showEndButton }: RoomChromeProps) {
  const {
    localParticipant,
    microphoneTrack,
    isMicrophoneEnabled,
    lastMicrophoneError,
  } = useLocalParticipant();
  const { agent, audioTrack: agentAudioTrack, state: agentState } =
    useVoiceAssistant();
  const transcriptions = useTranscriptions();
  const [muteBusy, setMuteBusy] = useState(false);

  const localAudioTrack =
    microphoneTrack?.track instanceof LocalAudioTrack
      ? microphoneTrack.track
      : undefined;
  const localVolume = useTrackVolume(localAudioTrack);
  const agentVolume = useTrackVolume(agentAudioTrack);
  const mode = deriveVoiceMode(agentState, isMicrophoneEnabled);
  const isAudioActive = mode === 'listening' || mode === 'speaking';
  const agentDisplayName = agent?.name || agent?.identity || 'Local agent';

  const messages = useMemo<TranscriptMessage[]>(() => {
    return transcriptions
      .map((item, index): TranscriptMessage & { order: number; index: number } => {
        const text = item.text.trim();
        const identity = item.participantInfo.identity;
        const role: TranscriptMessage['role'] =
          identity === localParticipant.identity ? 'user' : 'agent';
        return {
          id:
            item.streamInfo.id ||
            `${identity}:${item.streamInfo.timestamp}:${text.slice(0, 16)}`,
          role,
          text,
          timeLabel: formatTranscriptTime(item.streamInfo.timestamp),
          order:
            Number.isFinite(item.streamInfo.timestamp) &&
            item.streamInfo.timestamp > 0
              ? item.streamInfo.timestamp
              : index,
          index,
        };
      })
      .filter((message) => message.text.length > 0)
      .sort((a, b) => a.order - b.order || a.index - b.index)
      .map(({ order, index, ...message }) => {
        void order;
        void index;
        return message;
      });
  }, [localParticipant.identity, transcriptions]);

  const toggleMute = useCallback(async () => {
    setMuteBusy(true);
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } finally {
      setMuteBusy(false);
    }
  }, [isMicrophoneEnabled, localParticipant]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <StartAudio
        label="Enable agent audio"
        className={cn(
          'mx-auto mt-4 inline-flex items-center justify-center rounded-md border border-border bg-card px-4 py-2',
          'font-medium text-sm shadow-sm transition hover:bg-muted',
        )}
      />
      <RoomAudioRenderer />

      <div className="grid min-h-0 flex-1 gap-4 p-4 md:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
        <section className="flex min-h-[520px] flex-col rounded-lg border bg-card shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <Badge variant={agent ? 'default' : 'secondary'}>
                <Wifi className="h-3 w-3" aria-hidden />
                {agent ? 'Agent joined' : 'Waiting'}
              </Badge>
              <Badge
                variant={isMicrophoneEnabled ? 'outline' : 'destructive'}
              >
                {isMicrophoneEnabled ? (
                  <Mic className="h-3 w-3" aria-hidden />
                ) : (
                  <MicOff className="h-3 w-3" aria-hidden />
                )}
                {isMicrophoneEnabled ? 'Mic on' : 'Muted'}
              </Badge>
            </div>
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-8 px-5 py-8">
            <div className="text-center">
              <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Testing
              </p>
              <h3 className="mt-2 font-semibold text-2xl tracking-tight">
                {agentDisplayName}
              </h3>
            </div>

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
            />

            {lastMicrophoneError ? (
              <div className="flex max-w-md items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>{lastMicrophoneError.message}</p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 border-t bg-muted/30 px-4 py-4">
            <Button
              type="button"
              variant="outline"
              className="gap-2 rounded-full px-5"
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
            {showEndButton ? <EndCallToolbar /> : null}
          </div>
        </section>

        <TranscriptPanel messages={messages} />
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

  /** After LiveKit mounts: tracks WebRTC handshake + teardown */
  const [rtcPhase, setRtcPhase] = useState<
    'connecting' | 'active' | 'ended' | null
  >(null);

  useEffect(() => {
    if (!open) {
      setSession(null);
      setErrorMessage(null);
      setFetchFailed(false);
      setRtcPhase(null);
      return undefined;
    }

    let aborted = false;
    setSession(null);
    setErrorMessage(null);
    setFetchFailed(false);
    setRtcPhase(null);

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
        setRtcPhase('connecting');
      } catch (e) {
        if (aborted) {
          return;
        }
        const msg = e instanceof Error ? e.message : String(e);
        setErrorMessage(msg);
        setFetchFailed(true);
        setSession(null);
        setRtcPhase(null);
      }
    })();

    return () => {
      aborted = true;
    };
  }, [open, agentId, apiCall, reloadKey]);

  const badgePhase = useMemo((): BrowserTestPhaseBadge => {
    if (fetchFailed) {
      return 'fetch_error';
    }
    if (!session) {
      return 'connecting';
    }
    switch (rtcPhase) {
      case 'ended':
        return 'ended';
      case 'active':
        return 'active';
      case 'connecting':
      default:
        return 'connecting';
    }
  }, [fetchFailed, rtcPhase, session]);

  useEffect(() => {
    if (rtcPhase === 'ended') {
      try {
        window.dispatchEvent(new CustomEvent('awaaz:call-ended'));
      } catch {
        /* ignore */
      }
    }
  }, [rtcPhase]);

  const badgeVariant =
    badgePhase === 'active'
      ? 'default'
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
      className="animate-in fade-in fixed inset-0 z-[260] flex flex-col bg-background/98 backdrop-blur-sm duration-150"
    >
      <header className="flex items-center justify-between gap-4 border-b border-border bg-background/95 px-5 py-4 md:px-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              <Phone className="h-3 w-3" aria-hidden />
              Browser preview
            </Badge>
            {headline ? (
              <Badge variant={badgeVariant}>
                <span data-testid="test-call-phase">{headline}</span>
              </Badge>
            ) : null}
          </div>
          <h2 className="mt-3 truncate font-semibold text-xl tracking-tight">
            Test Agent: {agentName}
          </h2>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            Run a local voice check with browser audio before publishing changes.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Close modal"
          onClick={closeModal}
          className="shrink-0 rounded-full"
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {fetchFailed ? (
        <div className="grid flex-1 place-items-center px-6">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
              <AlertCircle className="h-6 w-6" aria-hidden />
            </div>
            <h3 className="mt-4 font-semibold text-lg">
              Voice preview is unavailable
            </h3>
            <p className="mt-2 text-destructive text-sm">{errorMessage}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-5 gap-2 rounded-full"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              Try again
            </Button>
          </div>
        </div>
      ) : session && rtcPhase !== 'ended' ? (
        <LiveKitRoom
          key={`${reloadKey}:${session.roomName}`}
          data-lk-theme="default"
          serverUrl={session.serverUrl}
          token={session.participantToken}
          connect
          audio
          video={false}
          options={{ adaptiveStream: true, dynacast: true }}
          onConnected={() => setRtcPhase('active')}
          onDisconnected={(reason?: DisconnectReason) => {
            void reason;
            setRtcPhase('ended');
          }}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <BrowserTestRoomChrome
            showEndButton={rtcPhase === 'active'}
          />
        </LiveKitRoom>
      ) : session && rtcPhase === 'ended' ? (
        <div className="grid flex-1 place-items-center px-6 text-center">
          <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-sm">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <PhoneOff className="h-7 w-7" aria-hidden />
            </div>
            <h3 className="mt-4 font-semibold text-lg">Session ended</h3>
            <p className="mt-2 text-muted-foreground text-sm">
              Test calls remain available in Calls history with a Test badge.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button
                type="button"
                variant="secondary"
                className="gap-2 rounded-full"
                onClick={() => setReloadKey((k) => k + 1)}
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Start again
              </Button>
              <Button
                type="button"
                variant="default"
                className="rounded-full"
                onClick={closeModal}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid flex-1 place-items-center px-6">
          <div className="rounded-lg border bg-card p-6 text-center shadow-sm">
            <Loader2 className="mx-auto h-11 w-11 animate-spin text-muted-foreground" />
            <p className="mt-4 text-muted-foreground text-sm">
              Preparing your voice session...
            </p>
          </div>
        </div>
      )}

      {session !== null && rtcPhase === 'connecting' && !fetchFailed ? (
        <footer className="border-t border-border bg-muted/30 px-8 py-3 text-center text-muted-foreground text-xs">
          Allow microphone access when the browser asks.
        </footer>
      ) : null}
      {/* rtcPhase changes are observed via effect to dispatch call-ended events */}
    </div>
  );
}
