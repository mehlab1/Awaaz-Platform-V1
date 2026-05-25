import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  CallStatus,
  EventType,
  Prisma,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { LiveKitBrowserTestService } from '../livekit/livekit-browser-test.service';
import { PrismaService } from '../prisma/prisma.service';
import { TRANSCRIPT_QUEUE } from '../queues/queue.constants';
import {
  TranscriptAssemblyService,
  type TranscriptJobData,
} from '../queues/transcript-assembly.service';
import { VoicesService } from '../voices/voices.service';
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
    private readonly transcriptAssembly: TranscriptAssemblyService,
    private readonly voices: VoicesService,
    private readonly liveKitBrowserTest: LiveKitBrowserTestService,
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
    const voice = await this.voices.resolveForTts(version.voiceId);
    this.logger.log(
      `Loaded agent config agent=${agent.id} version=${version.id} v${version.versionNumber} ` +
        `storedVoiceId=${version.voiceId} rimeSpeaker=${voice.rimeVoiceId} ` +
        `modelId=${voice.modelId} lang=${voice.lang}`,
    );
    return {
      agentId: agent.id,
      agentVersionId: version.id,
      organizationId: agent.organizationId,
      systemPrompt: version.systemPrompt,
      voiceId: voice.rimeVoiceId,
      voiceModelId: voice.modelId,
      voiceLang: voice.lang,
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

    const startedAt = new Date();
    const metadata = this.toJson(dto.metadata);
    const data = {
      agentId: dto.agentId,
      agentVersionId: agent.currentVersionId,
      status: CallStatus.IN_PROGRESS,
      fromNumber: dto.fromNumber,
      toNumber: dto.toNumber,
      metadata,
    };
    const roomName = dto.liveKitRoomName?.trim();
    const canonicalCallId = dto.callId?.trim();
    if (canonicalCallId) {
      const existing = await this.prisma.call.findUnique({
        where: { id: canonicalCallId },
        select: { id: true, metadata: true, liveKitRoomId: true, startedAt: true },
      });
      if (existing) {
        const reconciled = await this.prisma.call.update({
          where: { id: existing.id },
          data: {
            ...data,
            liveKitRoomId: dto.liveKitRoomId,
            startedAt: existing.startedAt ?? startedAt,
            metadata: this.mergeMetadata(existing.metadata, dto.metadata),
          },
        });
        this.logger.log(
          `call_identity_reconciled call_id=${existing.id} liveKitRoomId=${dto.liveKitRoomId} roomName=${roomName ?? '(none)'}`,
        );
        return reconciled;
      }
      this.logger.warn(
        `call_identity_existing_missing call_id=${canonicalCallId}; falling back to room reconciliation`,
      );
    }

    if (roomName && roomName !== dto.liveKitRoomId) {
      const existingBySid = await this.prisma.call.findUnique({
        where: { liveKitRoomId: dto.liveKitRoomId },
        select: { id: true },
      });
      if (existingBySid) {
        const reconciled = await this.prisma.call.update({
          where: { id: existingBySid.id },
          data,
        });
        this.logger.log(
          `call_identity_existing call_id=${existingBySid.id} liveKitRoomId=${dto.liveKitRoomId}`,
        );
        return reconciled;
      }

      const placeholder = await this.prisma.call.findFirst({
        where: {
          organizationId: dto.organizationId,
          agentId: dto.agentId,
          liveKitRoomId: roomName,
          status: CallStatus.INITIATED,
        },
        select: { id: true },
      });
      if (placeholder) {
        const reconciled = await this.prisma.call.update({
          where: { id: placeholder.id },
          data: {
            ...data,
            liveKitRoomId: dto.liveKitRoomId,
            startedAt,
          },
        });
        this.logger.log(
          `call_identity_reconciled call_id=${placeholder.id} liveKitRoomId=${dto.liveKitRoomId} roomName=${roomName}`,
        );
        return reconciled;
      }
    }

    const created = await this.prisma.call.upsert({
      where: { liveKitRoomId: dto.liveKitRoomId },
      create: {
        organizationId: dto.organizationId,
        ...data,
        liveKitRoomId: dto.liveKitRoomId,
        direction: dto.direction,
        startedAt,
      },
      update: data,
    });
    this.logger.log(
      `call_identity_created call_id=${created.id} liveKitRoomId=${dto.liveKitRoomId}`,
    );
    return created;
  }

  async endCall(callId: string, dto: EndCallDto): Promise<{ ok: true }> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        liveKitRoomId: true,
        fromNumber: true,
        metadata: true,
      },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    if (call.status === CallStatus.COMPLETED) {
      this.logger.log(`call_end_existing call_id=${callId}`);
      const roomName = this.browserRoomName(call);
      if (this.isBrowserPreviewCall(call) && roomName) {
        await this.liveKitBrowserTest.closeBrowserRoom({
          roomName,
          callId,
          reason: dto.reason ?? 'duplicate end call',
        });
      }
      return { ok: true };
    }

    const endedAt = new Date();
    this.logger.log(
      `Ending call ${callId}: room=${call.liveKitRoomId ?? '(none)'}, ` +
        `browserPreview=${this.isBrowserPreviewCall(call)}, ` +
        `metadataUpdateKeys=${Object.keys(dto.metadata ?? {}).join(',') || '(none)'}`,
    );
    const updatedCall = await this.prisma.call.update({
      where: { id: callId },
      data: {
        status: CallStatus.COMPLETED,
        endedAt,
        durationSeconds: this.durationSeconds(call.startedAt, endedAt),
        metadata: this.mergeMetadata(call.metadata, dto.metadata),
      },
      select: {
        id: true,
        liveKitRoomId: true,
        fromNumber: true,
        metadata: true,
      },
    });
    const enqueued = await this.enqueueTranscriptJob(callId, call.liveKitRoomId);
    if (!enqueued && this.isBrowserPreviewCall(updatedCall)) {
      await this.assembleTranscriptFallback(callId, call.liveKitRoomId);
    }
    const roomName = this.browserRoomName(updatedCall);
    if (this.isBrowserPreviewCall(updatedCall) && roomName) {
      await this.liveKitBrowserTest.closeBrowserRoom({
        roomName,
        callId,
        reason: dto.reason ?? 'call completed',
      });
    }
    return { ok: true };
  }

  async emitEvent(callId: string, dto: CallEventDto): Promise<{ ok: true }> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: {
        id: true,
        status: true,
        liveKitRoomId: true,
        fromNumber: true,
        metadata: true,
      },
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
        startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
        endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined,
        durationMs: dto.durationMs,
        latencyMs: dto.latencyMs,
        tokenCount: dto.tokenCount,
        metadata: this.toJson(dto.metadata),
      },
    });
    this.logger.log(
      `Persisted call event ${dto.eventType} for ${callId}: ` +
        `chars=${dto.text?.length ?? 0}, latencyMs=${dto.latencyMs ?? 'null'}, ` +
        `status=${call.status}, browserPreview=${this.isBrowserPreviewCall(call)}`,
    );
    if (call.status === CallStatus.COMPLETED && this.isBrowserPreviewCall(call)) {
      await this.assembleTranscriptFallback(call.id, call.liveKitRoomId);
    }
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
  ): Promise<boolean> {
    try {
      const job = await this.transcriptQueue.add(
        'call_ended',
        { callId, liveKitRoomId: liveKitRoomId ?? undefined },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );
      if (this.isDisabledQueueJob(job)) {
        throw new Error('Transcript queue is disabled for this process');
      }
      return true;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to enqueue transcript job for ${callId}: ${message}`);
      return false;
    }
  }

  private async assembleTranscriptFallback(
    callId: string,
    liveKitRoomId: string | null,
  ): Promise<void> {
    try {
      const result = await this.transcriptAssembly.assemble({
        callId,
        liveKitRoomId: liveKitRoomId ?? undefined,
      });
      this.logger.warn(
        `Transcript fallback assembled call ${result.callId}: ` +
          `${result.transcriptEntries} turns, totalCostUsd=${result.totalCostUsd}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Transcript fallback failed for ${callId}: ${message}`);
    }
  }

  private isDisabledQueueJob(job: unknown): boolean {
    return (
      typeof job === 'object' &&
      job !== null &&
      (job as { queueDisabled?: unknown }).queueDisabled === true
    );
  }

  private isBrowserPreviewCall(call: {
    fromNumber: string | null;
    metadata: Prisma.JsonValue | null;
  }): boolean {
    if (call.fromNumber === 'browser-preview') {
      return true;
    }
    if (!call.metadata || typeof call.metadata !== 'object' || Array.isArray(call.metadata)) {
      return false;
    }
    const metadata = call.metadata as Record<string, unknown>;
    return (
      metadata.source === 'awaaz_browser_test_call' ||
      metadata.isTest === true ||
      metadata.isTestCall === true
    );
  }

  private toJson(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
    return value === undefined ? undefined : (value as Prisma.InputJsonObject);
  }

  private mergeMetadata(
    existing: Prisma.JsonValue | null,
    update: Record<string, unknown> | undefined,
  ): Prisma.InputJsonValue | undefined {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    if (update === undefined && Object.keys(base).length === 0) {
      return undefined;
    }
    return {
      ...base,
      ...(update ?? {}),
    } as Prisma.InputJsonObject;
  }

  private browserRoomName(call: {
    liveKitRoomId: string | null;
    metadata: Prisma.JsonValue | null;
  }): string | null {
    const metadata =
      call.metadata && typeof call.metadata === 'object' && !Array.isArray(call.metadata)
        ? (call.metadata as Record<string, unknown>)
        : {};
    const roomName = metadata.liveKitRoomName;
    if (typeof roomName === 'string' && roomName.trim()) {
      return roomName.trim();
    }
    const liveKitRoomId = call.liveKitRoomId?.trim();
    return liveKitRoomId?.startsWith('test-') ? liveKitRoomId : null;
  }
}
