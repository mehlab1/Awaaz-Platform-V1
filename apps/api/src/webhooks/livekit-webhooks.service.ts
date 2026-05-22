import type { IncomingHttpHeaders } from 'http';

import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { WebhookReceiver, type WebhookEvent } from 'livekit-server-sdk';

import { LiveKitEgressService } from '../livekit/livekit-egress.service';
import { TRANSCRIPT_QUEUE } from '../queues/queue.constants';
import {
  TranscriptAssemblyService,
  type TranscriptJobData,
} from '../queues/transcript-assembly.service';

export interface LiveKitWebhookResult {
  ok: true;
  event: string;
  queued: boolean;
  recordingPersisted?: boolean;
}

@Injectable()
export class LiveKitWebhooksService {
  private readonly logger = new Logger(LiveKitWebhooksService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly egress: LiveKitEgressService,
    private readonly transcriptAssembly: TranscriptAssemblyService,
    @InjectQueue(TRANSCRIPT_QUEUE)
    private readonly transcriptQueue: Queue<TranscriptJobData>,
  ) {}

  async handle(
    rawBody: string,
    headers: IncomingHttpHeaders,
  ): Promise<LiveKitWebhookResult> {
    const apiKey = this.config.get<string>('LIVEKIT_API_KEY');
    const apiSecret = this.config.get<string>('LIVEKIT_API_SECRET');
    if (!apiKey || !apiSecret) {
      this.logger.error('LIVEKIT_API_KEY or LIVEKIT_API_SECRET is not configured');
      throw new BadRequestException('Webhook not configured');
    }

    const authHeader =
      this.headerValue(headers, 'authorization') ??
      this.headerValue(headers, 'authorize');
    if (!authHeader) {
      throw new BadRequestException('Missing LiveKit authorization header');
    }

    const event = await this.verifyEvent(rawBody, authHeader);
    if (event.event === 'egress_ended') {
      const recordingPersisted = event.egressInfo
        ? await this.egress.persistBrowserRecordingFromEgress(event.egressInfo)
        : false;
      return {
        ok: true,
        event: event.event,
        queued: false,
        recordingPersisted,
      };
    }

    if (event.event !== 'room_finished') {
      return { ok: true, event: event.event, queued: false };
    }

    return this.enqueueTranscriptJob(event);
  }

  private async verifyEvent(
    rawBody: string,
    authHeader: string,
  ): Promise<WebhookEvent> {
    const receiver = new WebhookReceiver(
      this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
      this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
    );

    try {
      return await receiver.receive(rawBody, authHeader);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`LiveKit webhook verify failed: ${message}`);
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  private async enqueueTranscriptJob(
    event: WebhookEvent,
  ): Promise<LiveKitWebhookResult> {
    const liveKitRoomId = event.room?.sid;
    if (!liveKitRoomId) {
      this.logger.warn('LiveKit room_finished webhook did not include room sid');
      return { ok: true, event: event.event, queued: false };
    }

    const data = {
      liveKitRoomId,
      roomName: event.room?.name,
    };
    try {
      const job = await this.transcriptQueue.add('room_finished', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: 50,
      });
      if (this.isDisabledQueueJob(job)) {
        throw new Error('Transcript queue is disabled for this process');
      }
      return { ok: true, event: event.event, queued: true };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to enqueue transcript job from LiveKit room_finished ${liveKitRoomId}: ${message}`,
      );
      await this.assembleTranscriptFallback(data);
      return { ok: true, event: event.event, queued: false };
    }
  }

  private async assembleTranscriptFallback(data: TranscriptJobData): Promise<void> {
    try {
      const result = await this.transcriptAssembly.assemble(data);
      this.logger.warn(
        `Transcript fallback assembled LiveKit room ${data.liveKitRoomId}: ` +
          `${result.transcriptEntries} turns, totalCostUsd=${result.totalCostUsd}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Transcript fallback failed for LiveKit room ${data.liveKitRoomId}: ${message}`,
      );
    }
  }

  private isDisabledQueueJob(job: unknown): boolean {
    return (
      typeof job === 'object' &&
      job !== null &&
      (job as { queueDisabled?: unknown }).queueDisabled === true
    );
  }

  private headerValue(
    headers: IncomingHttpHeaders,
    key: string,
  ): string | undefined {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
}
