'use client';

import type WaveSurfer from 'wavesurfer.js';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

export interface CallWaveformHandle {
  seekToSeconds(seconds: number): void;
}

type Props = {
  audioUrl: string;
  onReady?: () => void;
};

export const CallWaveformPlayer = forwardRef<CallWaveformHandle, Props>(
  function CallWaveformPlayer({ audioUrl, onReady }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const instanceRef = useRef<WaveSurfer | null>(null);

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
      },
    }));

    useEffect(() => {
      const el = containerRef.current;
      if (!el) {
        return undefined;
      }
      let disposed = false;
      const subscriptions: Array<() => void> = [];

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
              onReady?.();
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
    }, [audioUrl, onReady]);

    return (
      <div
        ref={containerRef}
        className="w-full rounded-md border border-border bg-muted/20 p-2"
      />
    );
  },
);
