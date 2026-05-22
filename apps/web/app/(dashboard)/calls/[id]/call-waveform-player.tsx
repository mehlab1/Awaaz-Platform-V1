'use client';

import type WaveSurfer from 'wavesurfer.js';
import { Pause, Play } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { Button } from '@/components/ui/button';

export interface CallWaveformHandle {
  seekToSeconds(seconds: number): void;
}

type Props = {
  audioUrl: string;
  onReady?: () => void;
  onError?: (message: string) => void;
};

export const CallWaveformPlayer = forwardRef<CallWaveformHandle, Props>(
  function CallWaveformPlayer({ audioUrl, onReady, onError }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<WaveSurfer | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    useImperativeHandle(ref, () => ({
      seekToSeconds(seconds: number): void {
        const ws = instanceRef.current;
        if (!ws) {
          return;
        }
        const duration = ws.getDuration();
        if (!duration || duration <= 0) {
          return;
        }
        const clamped = Math.max(0, Math.min(seconds, duration - 0.01));
        ws.setTime(clamped);
        setCurrentTime(clamped);
      },
    }));

    const togglePlayback = useCallback(() => {
      const ws = instanceRef.current;
      if (!ws || !isReady) {
        return;
      }
      void ws.playPause();
    }, [isReady]);

    useEffect(() => {
      const el = containerRef.current;
      if (!el) {
        return undefined;
      }
      let disposed = false;
      const subscriptions: Array<() => void> = [];
      setIsReady(false);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      void (async () => {
        const { default: WaveSurfer } = await import('wavesurfer.js');
        if (disposed || !containerRef.current) {
          return;
        }
        const ws = WaveSurfer.create({
          container: containerRef.current,
          height: 88,
          url: audioUrl,
          waveColor: 'rgba(148,163,184,0.45)',
          progressColor: 'rgb(59 130 246)',
          cursorColor: 'rgb(59 130 246)',
          cursorWidth: 2,
          barWidth: 2,
          barGap: 1,
          normalize: true,
          dragToSeek: true,
        });
        subscriptions.push(
          ws.on('ready', () => {
            if (!disposed) {
              setIsReady(true);
              setDuration(ws.getDuration());
              onReady?.();
            }
          }),
          ws.on('timeupdate', (seconds: number) => {
            if (!disposed) {
              setCurrentTime(seconds);
            }
          }),
          ws.on('audioprocess', (seconds: number) => {
            if (!disposed) {
              setCurrentTime(seconds);
            }
          }),
          ws.on('play', () => {
            if (!disposed) {
              setIsPlaying(true);
            }
          }),
          ws.on('pause', () => {
            if (!disposed) {
              setIsPlaying(false);
            }
          }),
          ws.on('finish', () => {
            if (!disposed) {
              setIsPlaying(false);
              setCurrentTime(ws.getDuration());
            }
          }),
          ws.on('error', (error: Error) => {
            if (!disposed) {
              onError?.(error.message || 'Waveform audio could not be decoded.');
            }
          }),
        );
        instanceRef.current = ws;
      })();

      return () => {
        disposed = true;
        subscriptions.forEach((unsubscribe) => unsubscribe());
        instanceRef.current?.destroy();
        instanceRef.current = null;
      };
    }, [audioUrl, onError, onReady]);

    return (
      <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
        <div ref={containerRef} className="w-full" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={togglePlayback}
            disabled={!isReady}
            className="gap-2"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" aria-hidden />
            ) : (
              <Play className="h-4 w-4" aria-hidden />
            )}
            {isPlaying ? 'Pause' : 'Play'}
          </Button>
          <p className="font-mono text-muted-foreground text-xs tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </p>
        </div>
      </div>
    );
  },
);

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}
