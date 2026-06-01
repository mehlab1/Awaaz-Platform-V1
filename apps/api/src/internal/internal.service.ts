import { InjectQueue } from '@nestjs/bullmq';
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CallStatus,
  EventType,
  Prisma,
  ProviderCredentialMode,
} from '@prisma/client';
import type { Queue } from 'bullmq';

import { LiveKitBrowserTestService } from '../livekit/livekit-browser-test.service';
import { providerById } from '../plugins/provider-catalog';
import { PluginsService } from '../plugins/plugins.service';
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
import type { WorkerAgentConfigResponse } from './worker-agent-config.types';

const DEFAULT_LLM_PROVIDER_ID = 'groq';
const DEFAULT_LLM_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_STT_PROVIDER_ID = 'deepgram';
const DEFAULT_STT_MODEL = 'nova-2-conversationalai';
const RUNTIME_LLM_PROVIDER_IDS = new Set([DEFAULT_LLM_PROVIDER_ID]);
const RUNTIME_STT_PROVIDER_IDS = new Set([
  DEFAULT_STT_PROVIDER_ID,
  'assemblyai',
  'groq-whisper',
]);

type WorkerProviderSecret = {
  providerId: string;
  mode: ProviderCredentialMode;
  apiKey: string;
  keyFingerprint: string;
};

@Injectable()
export class InternalService {
  private readonly logger = new Logger(InternalService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(TRANSCRIPT_QUEUE)
    private readonly transcriptQueue: Queue<TranscriptJobData>,
    private readonly transcriptAssembly: TranscriptAssemblyService,
    private readonly voices: VoicesService,
    private readonly plugins: PluginsService,
    private readonly liveKitBrowserTest: LiveKitBrowserTestService,
  ) {}

  async getAgentConfig(agentId: string): Promise<WorkerAgentConfigResponse> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, deletedAt: null, isActive: true },
      include: { currentVersion: true },
    });
    if (!agent?.currentVersion) {
      throw new NotFoundException('Agent config not found');
    }

    const version = agent.currentVersion;
    const voice = await this.voices.resolveTtsForRuntime(
      version.voiceId,
      agent.organizationId,
    );
    const ttsCredentialMode =
      version.ttsCredentialMode ?? ProviderCredentialMode.FINOVA_MANAGED;
    const ttsSecret = await this.plugins.resolveOrganizationProviderSecret(
      agent.organizationId,
      voice.providerId,
      ttsCredentialMode,
    );
    if (!ttsSecret.ok) {
      throw new ServiceUnavailableException(
        `TTS credential for provider "${voice.providerId}" is not available: ${ttsSecret.error}`,
      );
    }
    await this.plugins.markProviderCredentialUsed(ttsSecret.credentialId);

    const sttProviderId = (
      version.sttProviderId ?? DEFAULT_STT_PROVIDER_ID
    ).trim().toLowerCase();
    const sttModel = (version.sttModel ?? DEFAULT_STT_MODEL).trim();
    const llmProviderId = (
      version.llmProviderId ?? DEFAULT_LLM_PROVIDER_ID
    ).trim().toLowerCase();
    const llmModel = (version.llmModel ?? version.model ?? DEFAULT_LLM_MODEL).trim();
    this.ensureRuntimeModel('STT', sttProviderId, sttModel);
    this.ensureRuntimeModel('LLM', llmProviderId, llmModel);
    const sttCredentialMode =
      version.sttCredentialMode ?? ProviderCredentialMode.FINOVA_MANAGED;
    const llmCredentialMode =
      version.llmCredentialMode ?? ProviderCredentialMode.FINOVA_MANAGED;
    const sttSecret = await this.optionalWorkerProviderSecret(
      agent.organizationId,
      sttProviderId,
      sttCredentialMode,
      'STT',
    );
    const llmSecret = await this.optionalWorkerProviderSecret(
      agent.organizationId,
      llmProviderId,
      llmCredentialMode,
      'LLM',
    );
    const keyFingerprint = this.plugins.keyFingerprint(ttsSecret.key);

    this.logger.log(
        `Loaded agent config agent=${agent.id} version=${version.id} v${version.versionNumber} ` +
        `storedVoiceId=${version.voiceId} ttsProvider=${voice.providerId} ` +
        `ttsVoiceId=${voice.providerVoiceId} ttsModel=${voice.modelId} lang=${voice.lang} ` +
        `credentialMode=${ttsSecret.credentialMode} keyFingerprint=${keyFingerprint} ` +
        `sttProvider=${sttProviderId} sttMode=${sttCredentialMode} ` +
        `llmProvider=${llmProviderId} llmMode=${llmCredentialMode}`,
    );

    return {
      agentId: agent.id,
      agentVersionId: version.id,
      organizationId: agent.organizationId,
      systemPrompt: version.systemPrompt,
      voiceId: voice.providerVoiceId,
      voiceModelId: voice.modelId,
      voiceLang: voice.lang,
      model: version.model,
      temperature: version.temperature,
      maxTokens: version.maxTokens,
      firstMessage: version.firstMessage,
      endCallPhrases: version.endCallPhrases,
      pipeline: {
        stt: {
          providerId: sttProviderId,
          model: sttModel,
        },
        llm: {
          providerId: llmProviderId,
          model: llmModel,
        },
        tts: {
          providerId: voice.providerId,
          voiceId: voice.providerVoiceId,
          modelId: voice.modelId,
          language: voice.lang,
        },
      },
      credentials: {
        tts: {
          providerId: voice.providerId,
          mode: ttsSecret.credentialMode,
          apiKey: ttsSecret.key,
          keyFingerprint,
        },
        ...(sttSecret ? { stt: sttSecret } : {}),
        ...(llmSecret ? { llm: llmSecret } : {}),
      },
      metadata: {
        ttsProviderId: voice.providerId,
        ttsModel: voice.modelId,
        ttsVoiceId: voice.providerVoiceId,
        ttsCredentialMode: ttsSecret.credentialMode,
        ttsKeyFingerprint: keyFingerprint,
        sttProviderId,
        sttModel,
        sttCredentialMode,
        ...(sttSecret ? { sttKeyFingerprint: sttSecret.keyFingerprint } : {}),
        llmProviderId,
        llmModel,
        llmCredentialMode,
        ...(llmSecret ? { llmKeyFingerprint: llmSecret.keyFingerprint } : {}),
        agentVersionNumber: version.versionNumber,
      },
    };
  }

  private async optionalWorkerProviderSecret(
    organizationId: string,
    providerId: string,
    credentialMode: ProviderCredentialMode,
    label: 'STT' | 'LLM',
  ): Promise<WorkerProviderSecret | null> {
    const secret = await this.plugins.resolveOrganizationProviderSecret(
      organizationId,
      providerId,
      credentialMode,
    );
    if (!secret.ok) {
      if (credentialMode === ProviderCredentialMode.BYOK) {
        throw new ServiceUnavailableException(
          `${label} credential for provider "${providerId}" is not available: ${secret.error}`,
        );
      }
      this.logger.warn(
        `${label} Finova-managed credential for provider "${providerId}" is not available in API config; worker environment will be used if configured.`,
      );
      return null;
    }

    await this.plugins.markProviderCredentialUsed(secret.credentialId);
    return {
      providerId,
      mode: secret.credentialMode,
      apiKey: secret.key,
      keyFingerprint: this.plugins.keyFingerprint(secret.key),
    };
  }

  private ensureRuntimeModel(
    label: 'STT' | 'LLM',
    providerId: string,
    modelId: string,
  ): void {
    const provider = providerById(providerId);
    const expectedKind = label.toLowerCase();
    const runtimeProviderIds =
      label === 'LLM' ? RUNTIME_LLM_PROVIDER_IDS : RUNTIME_STT_PROVIDER_IDS;
    if (!runtimeProviderIds.has(providerId) || !provider || provider.kind !== expectedKind) {
      throw new ServiceUnavailableException(
        `${label} provider "${providerId}" is not enabled for worker runtime`,
      );
    }
    const supportedModelIds = new Set(
      provider.models?.map((model) => model.id) ?? [],
    );
    if (supportedModelIds.size > 0 && !supportedModelIds.has(modelId)) {
      throw new ServiceUnavailableException(
        `${label} model "${modelId}" is not enabled for provider "${providerId}"`,
      );
    }
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
        metadata: this.mergeEndMetadata(call.metadata, dto, endedAt),
      },
      select: {
        id: true,
        liveKitRoomId: true,
        fromNumber: true,
        metadata: true,
      },
    });
    const endReason = this.canonicalEndReason(dto.reason) ?? this.metadataString(updatedCall.metadata, 'endReason');
    this.logger.log(
      `call_end_backend_completed call_id=${callId} reason=${endReason ?? '(unspecified)'}`,
    );
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

  private mergeEndMetadata(
    existing: Prisma.JsonValue | null,
    dto: EndCallDto,
    endedAt: Date,
  ): Prisma.InputJsonValue {
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    const update = dto.metadata ?? {};
    const baseLifecycle = this.objectValue(base.lifecycle);
    const updateLifecycle = this.objectValue(update.lifecycle);
    const incomingReason = this.canonicalEndReason(dto.reason);
    const updateReason = this.canonicalEndReason(this.stringValue(update.endReason));
    const existingReason = this.canonicalEndReason(this.stringValue(base.endReason));
    const reason =
      (incomingReason === 'technical_disconnect'
        ? updateReason ?? existingReason ?? incomingReason
        : incomingReason) ??
      updateReason ??
      existingReason ??
      'technical_disconnect';
    const endedBy =
      this.stringValue(update.endedBy) ??
      this.stringValue(base.endedBy) ??
      this.endedByForReason(reason);
    const lifecycle = {
      ...baseLifecycle,
      ...updateLifecycle,
      backendCompletedAt: endedAt.toISOString(),
    };

    return {
      ...base,
      ...update,
      endReason: reason,
      endedBy,
      lifecycle,
    } as Prisma.InputJsonObject;
  }

  private objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? { ...(value as Record<string, unknown>) }
      : {};
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private metadataString(metadata: Prisma.JsonValue | null, key: string): string | undefined {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }
    return this.stringValue((metadata as Record<string, unknown>)[key]);
  }

  private canonicalEndReason(reason: string | undefined): string | undefined {
    const normalized = reason?.trim().toLowerCase().replace(/\s+/g, '_');
    if (!normalized) {
      return undefined;
    }
    if (
      [
        'goal_completed',
        'user_goodbye',
        'idle_timeout',
        'manual_user_end',
        'max_duration',
        'technical_disconnect',
      ].includes(normalized)
    ) {
      return normalized;
    }
    if (['frontend_end_session', 'frontend_requested_end', 'manual_end'].includes(normalized)) {
      return 'manual_user_end';
    }
    if (['assistant_requested_end_call_tool', 'assistant_end_call'].includes(normalized)) {
      return 'goal_completed';
    }
    if (['user_closing_utterance', 'goodbye', 'bye'].includes(normalized)) {
      return 'user_goodbye';
    }
    if (['room_shutdown', 'worker_shutdown', 'disconnect', 'disconnected'].includes(normalized)) {
      return 'technical_disconnect';
    }
    return normalized;
  }

  private endedByForReason(reason: string): string {
    if (reason === 'manual_user_end') {
      return 'user';
    }
    if (reason === 'technical_disconnect') {
      return 'system';
    }
    return 'agent';
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
