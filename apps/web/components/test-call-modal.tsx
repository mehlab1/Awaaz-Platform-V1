'use client';

import { useEffect, useMemo, useState } from 'react';

import '@livekit/components-styles';

import {
  LiveKitRoom,
  RoomAudioRenderer,
  StartAudio,
  useDisconnectButton,
  useLocalParticipant,
  useTrackVolume,
} from '@livekit/components-react';
import { Loader2, Mic, X } from 'lucide-react';
import { DisconnectReason, LocalAudioTrack } from 'livekit-client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
    active: 'Active',
    ended: 'Ended',
    fetch_error: 'Unavailable',
  };
  return labels[p];
}

function LocalMicPulse() {
  const { microphoneTrack } = useLocalParticipant();
  const audioTrack = microphoneTrack?.track;
  const usable =
    audioTrack instanceof LocalAudioTrack ? audioTrack : undefined;
  const vol = useTrackVolume(usable);
  const scale = Math.min(1.28, 1 + Math.max(0, vol) * Math.PI * 0.42);
  const pulse = Math.min(1, Math.max(0, vol * 9));

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="rounded-full bg-primary/90 p-4 text-primary-foreground transition-[transform] duration-75 ease-out"
        aria-label="Microphone level"
        role="status"
        style={{
          transform: `scale(${scale})`,
          boxShadow: `0 0 ${12 + pulse * 28}px hsl(var(--primary) / ${0.38 + pulse * 0.45})`,
        }}
      >
        <Mic className="h-10 w-10" aria-hidden />
      </div>
      <span className="text-muted-foreground text-xs uppercase tracking-wide">
        Your microphone
      </span>
    </div>
  );
}

function EndCallToolbar() {
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
      className={[rest.className, 'rounded-full px-12 py-6 text-lg'].join(' ')}
    >
      End call
    </Button>
  );
}

interface RoomChromeProps {
  showEndButton: boolean;
}

function BrowserTestRoomChrome({ showEndButton }: RoomChromeProps) {
  return (
    <div className="flex h-full flex-col items-center justify-between gap-10 py-16">
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-14">
        <StartAudio label="Tap to unlock agent playback if Chrome blocks audio." />
        <RoomAudioRenderer />
        <LocalMicPulse />
      </div>
      {showEndButton ? (
        <div className="pb-10">
          <EndCallToolbar />
        </div>
      ) : (
        <div className="h-24 shrink-0" aria-hidden />
      )}
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
        setSession(readSessionDto(dto));
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
      className="animate-in fade-in fixed inset-0 z-[260] flex flex-col bg-[hsl(var(--background))]/98 backdrop-blur-sm duration-150"
    >
      <header className="flex items-start justify-between border-b border-border px-8 py-5">
        <div>
          <h2 className="font-semibold text-xl tracking-tight">
            Test call · {agentName}
          </h2>
          <p className="mt-1 max-w-xl text-muted-foreground text-sm">
            Uses your microphone in the browser; LiveKit transports audio only —
            PSTN routing is intentionally bypassed here.
          </p>
          {session?.roomName ? (
            <p className="mt-3 font-mono text-muted-foreground text-xs">
              {session.roomName}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {headline ? (
            <Badge variant={badgeVariant}>
              <span data-testid="test-call-phase">{headline}</span>
            </Badge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Close modal"
            onClick={closeModal}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {fetchFailed ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="max-w-md text-destructive text-sm">{errorMessage}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Try again
          </Button>
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
          <BrowserTestRoomChrome showEndButton={rtcPhase === 'active'} />
        </LiveKitRoom>
      ) : session && rtcPhase === 'ended' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-muted-foreground text-lg">Call ended</p>
          <p className="max-w-lg text-muted-foreground text-sm">
            The preview room was disconnected. Test calls remain in Calls history with a{' '}
            <span className="font-semibold text-foreground">Test</span> badge.
          </p>
          <Mic className="h-14 w-14 text-muted-foreground/35" aria-hidden />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <Loader2 className="h-11 w-11 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground text-sm">
            Preparing a LiveKit preview room…
          </p>
        </div>
      )}

      {session !== null &&
      rtcPhase === 'connecting' &&
      !fetchFailed ? (
        <footer className="border-t border-border px-8 py-4 text-center text-muted-foreground text-xs">
          If prompted by the browser, allow microphone access.
        </footer>
      ) : null}

      {rtcPhase === 'ended' ? (
        <footer className="flex flex-wrap items-center justify-center gap-3 border-t border-border bg-muted/30 px-6 py-10">
          <p className="text-muted-foreground text-sm">
            Session ended cleanly. Calls with a{' '}
            <span className="font-semibold text-foreground">Test</span> badge
            appear under Calls history.
          </p>
          <Button type="button" variant="default" onClick={closeModal}>
            Close
          </Button>
        </footer>
      ) : null}
    </div>
  );
}
