import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CallStatus,
  EventType,
  Prisma,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';
import { TRANSCRIPT_QUEUE } from '../queues/queue.constants';
import type { TranscriptJobData } from '../queues/transcript.processor';
import type { CallEventDto } from './dto/call-event.dto';
import type { EndCallDto } from './dto/end-call.dto';
import type { StartCallDto } from './dto/start-call.dto';

@Injectable()
export class InternalService {
  private readonly logger = new Logger(InternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRANSCRIPT_QUEUE)
    private readonly transcriptQueue: Queue<TranscriptJobData>,
  ) {}

  async getAgentConfig(agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null, isActive: true },
      include: { currentVersion: true },
    });
    if (!agent?.currentVersion) {
      throw new NotFoundException('Agent config not found');
    }

    const version = agent.currentVersion;
    return {
      agentId: agent.id,
      organizationId: agent.organizationId,
      systemPrompt: version.systemPrompt,
      voiceId: version.voiceId,
      model: version.model,
      temperature: version.temperature,
      maxTokens: version.maxTokens,
      firstMessage: version.firstMessage,
      endCallPhrases: version.endCallPhrases,
    };
  }

  async startCall(dto: StartCallDto) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id: dto.agentId,
        organizationId: dto.organizationId,
        deletedAt: null,
      },
      select: { currentVersionId: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return this.prisma.call.upsert({
      where: { liveKitRoomId: dto.liveKitRoomId },
      create: {
        organizationId: dto.organizationId,
        agentId: dto.agentId,
        agentVersionId: agent.currentVersionId,
        liveKitRoomId: dto.liveKitRoomId,
        direction: dto.direction,
        status: CallStatus.IN_PROGRESS,
        fromNumber: dto.fromNumber,
        toNumber: dto.toNumber,
        startedAt: new Date(),
        metadata: this.toJson(dto.metadata),
      },
      update: {
        agentId: dto.agentId,
        agentVersionId: agent.currentVersionId,
        status: CallStatus.IN_PROGRESS,
        fromNumber: dto.fromNumber,
        toNumber: dto.toNumber,
        metadata: this.toJson(dto.metadata),
      },
    });
  }

  async endCall(callId: string, dto: EndCallDto): Promise<{ ok: true }> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: { startedAt: true, liveKitRoomId: true },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    const endedAt = new Date();
    await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.COMPLETED,
        endedAt,
        durationSeconds: this.durationSeconds(call.startedAt, endedAt),
        metadata: this.toJson(dto.metadata),
      },
    });
    await this.enqueueTranscriptJob(callId, call.liveKitRoomId);
    return { ok: true };
  }

  async emitEvent(callId: string, dto: CallEventDto): Promise<{ ok: true }> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: { id: true },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }

    await this.prisma.callEvent.create({
      data: {
        callId,
        eventType: dto.eventType,
        content: dto.text,
        speaker: dto.speaker ?? this.speakerForEvent(dto.eventType),
        latencyMs: dto.latencyMs,
        tokenCount: dto.tokenCount,
        metadata: this.toJson(dto.metadata),
      },
    });
    return { ok: true };
  }

  heartbeat(): { ok: true; timestamp: string } {
    return { ok: true, timestamp: new Date().toISOString() };
  }

  private speakerForEvent(eventType: EventType): string | undefined {
    if (eventType === EventType.USER_SPEECH) {
      return 'user';
    }
    if (eventType === EventType.AGENT_SPEECH) {
      return 'agent';
    }
    return undefined;
  }

  private durationSeconds(startedAt: Date | null, endedAt: Date): number | undefined {
    if (!startedAt) {
      return undefined;
    }
    return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
  }

  private async enqueueTranscriptJob(
    callId: string,
    liveKitRoomId: string | null,
  ): Promise<void> {
    try {
      await this.transcriptQueue.add(
        'call_ended',
        { callId, liveKitRoomId: liveKitRoomId ?? undefined },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to enqueue transcript job for ${callId}: ${message}`);
    }
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value === undefined ? undefined : (value as Prisma.InputJsonObject);
  }
}
