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

import { TRANSCRIPT_QUEUE } from '../queues/queue.constants';
import type { TranscriptJobData } from '../queues/transcript.processor';

export interface LiveKitWebhookResult {
  ok: true;
  event: string;
  queued: boolean;
}

@Injectable()
export class LiveKitWebhooksService {
  private readonly logger = new Logger(LiveKitWebhooksService.name);

  constructor(
    private readonly config: ConfigService,
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

    await this.transcriptQueue.add(
      'room_finished',
      {
        liveKitRoomId,
        roomName: event.room?.name,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );

    return { ok: true, event: event.event, queued: true };
  }

  private headerValue(
    headers: IncomingHttpHeaders,
    key: string,
  ): string | undefined {
    const value = headers[key];
    return Array.isArray(value) ? value[0] : value;
  }
}
