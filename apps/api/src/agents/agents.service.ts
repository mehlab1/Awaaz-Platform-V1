import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditAction, Prisma, CallStatus, EventType, ProviderCredentialMode } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { LiveKitBrowserTestService } from '../livekit/livekit-browser-test.service';
import { PluginsService } from '../plugins/plugins.service';
import { providerById } from '../plugins/provider-catalog';
import { PrismaService } from '../prisma/prisma.service';
import { VoicesService, type ResolvedTtsVoice } from '../voices/voices.service';
import type { CreateAgentVersionDto } from './dto/create-agent-version.dto';
import type { CreateAgentDto } from './dto/create-agent.dto';
import type { PatchAgentDto } from './dto/patch-agent.dto';

const DEFAULT_LLM_MODEL = 'llama-3.3-70b-versatile';
const DEFAULT_LLM_PROVIDER_ID = 'groq';
const DEFAULT_STT_PROVIDER_ID = 'deepgram';
const DEFAULT_STT_MODEL = 'nova-2-conversationalai';
const DEFAULT_KEY_SOURCE = 'finova_managed';
const ORG_DEFAULT_KEY_SOURCE = 'org_default';
const AGENT_OWN_KEY_SOURCE = 'agent_own';
const KEY_SOURCES = new Set([
  DEFAULT_KEY_SOURCE,
  ORG_DEFAULT_KEY_SOURCE,
  AGENT_OWN_KEY_SOURCE,
]);
const RUNTIME_LLM_PROVIDER_IDS = new Set([
  DEFAULT_LLM_PROVIDER_ID,
  'openai',
  'anthropic',
]);
const RUNTIME_STT_PROVIDER_IDS = new Set([
  DEFAULT_STT_PROVIDER_ID,
  'assemblyai',
  'groq-whisper',
]);
const DEFAULT_LLM_MODEL_BY_PROVIDER = new Map<string, string>([
  [DEFAULT_LLM_PROVIDER_ID, DEFAULT_LLM_MODEL],
  ['openai', 'gpt-4o'],
  ['anthropic', 'claude-sonnet-4-0'],
]);
const DEFAULT_STT_MODEL_BY_PROVIDER = new Map<string, string>([
  [DEFAULT_STT_PROVIDER_ID, DEFAULT_STT_MODEL],
  ['assemblyai', 'universal-streaming-v2'],
  ['groq-whisper', 'whisper-large-v3-turbo'],
]);

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly liveKitBrowserTest: LiveKitBrowserTestService,
    private readonly voices: VoicesService,
    private readonly plugins: PluginsService,
  ) {}

  async list(organizationId: string) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.agent.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        currentVersionId: true,
        createdAt: true,
        updatedAt: true,
        phoneNumbers: {
          select: { number: true },
          orderBy: { createdAt: 'asc' },
        },
        currentVersion: {
          select: {
            id: true,
            voiceId: true,
            versionNumber: true,
            isLive: true,
            publishedAt: true,
          },
        },
      },
    });

    if (rows.length === 0) {
      return [];
    }

    const agentIds = rows.map((row) => row.id);
    const grouped = await this.prisma.call.groupBy({
      by: ['agentId'],
      where: {
        organizationId,
        agentId: { in: agentIds },
        createdAt: { gte: sevenDaysAgo },
      },
      _count: { _all: true },
    });

    const countByAgent = new Map<string, number>();
    for (const g of grouped) {
      if (g.agentId) {
        countByAgent.set(g.agentId, g._count._all);
      }
    }

    return rows.map((agent) => {
      const { phoneNumbers, ...rest } = agent;
      return {
        ...rest,
        assignedPhoneNumbers: phoneNumbers.map((pn) => pn.number),
        callsLast7Days: countByAgent.get(agent.id) ?? 0,
      };
    });
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateAgentDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const agent = await tx.agent.create({
        data: {
          organizationId,
          name: dto.name,
          description: dto.description,
        },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.CREATED,
          entityType: 'Agent',
          entityId: agent.id,
          metadata: {
            name: agent.name,
            hasDescription: Boolean(agent.description),
          },
        },
        tx,
      );
      return agent;
    });
  }

  async get(organizationId: string, agentId: string) {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, organizationId, deletedAt: null },
      include: { currentVersion: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
    return this.sanitizeAgent(agent);
  }

  async update(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    dto: PatchAgentDto,
  ) {
    const data: { name?: string; description?: string | null } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.description !== undefined) {
      data.description = dto.description.length > 0 ? dto.description : null;
    }
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('No agent fields to update');
    }

    return this.prisma.$transaction(async (tx) => {
      await this.ensureAgentInTransaction(tx, organizationId, agentId);
      const agent = await tx.agent.update({
        where: { id: agentId },
        data,
        include: { currentVersion: true },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.UPDATED,
          entityType: 'Agent',
          entityId: agent.id,
          metadata: { fields: Object.keys(data) },
        },
        tx,
      );
      return agent;
    });
  }

  async delete(
    organizationId: string,
    agentId: string,
  ): Promise<{ ok: true }> {
    await this.ensureAgent(organizationId, agentId);
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
  }

  async listVersions(
    organizationId: string,
    agentId: string,
    options: { limit?: number } = {},
  ) {
    await this.ensureAgent(organizationId, agentId);
    const versions = await this.prisma.agentVersion.findMany({
      where: { agentId },
      orderBy: { versionNumber: 'desc' },
      take: options.limit,
    });
    return versions.map((version) => this.sanitizeVersion(version));
  }

  async createVersion(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    dto: CreateAgentVersionDto,
  ) {
    const resolvedVoice = await this.voices.resolveVoiceForAgentVersion(
      dto.voiceId,
      organizationId,
    );
    const pipelineData = await this.v1CompatiblePipelineData(
      dto,
      resolvedVoice,
      organizationId,
      null,
    );
    return this.prisma.$transaction(
      async (tx) => {
        await this.ensureAgentInTransaction(tx, organizationId, agentId);
        const last = await tx.agentVersion.findFirst({
          where: { agentId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const version = await tx.agentVersion.create({
          data: {
            agentId,
            versionNumber: (last?.versionNumber ?? 0) + 1,
            systemPrompt: dto.systemPrompt,
            ...pipelineData,
            temperature: dto.temperature,
            maxTokens: dto.maxTokens,
            firstMessage: dto.firstMessage,
            endCallPhrases: dto.endCallPhrases,
          },
        });
        await this.audit.record(
          {
            organizationId,
            actorUserId,
            action: AuditAction.CREATED,
            entityType: 'AgentVersion',
            entityId: version.id,
            metadata: {
              agentId,
              versionNumber: version.versionNumber,
              requestedVoiceId: dto.voiceId,
              voiceId: version.voiceId,
              ttsProviderId: version.ttsProviderId,
              ttsVoiceId: version.ttsVoiceId,
              ttsCredentialMode: version.ttsCredentialMode,
              ttsKeySource: version.ttsKeySource,
              llmProviderId: version.llmProviderId,
              llmModel: version.llmModel,
              llmCredentialMode: version.llmCredentialMode,
              llmKeySource: version.llmKeySource,
              sttProviderId: version.sttProviderId,
              sttModel: version.sttModel,
              sttCredentialMode: version.sttCredentialMode,
              sttKeySource: version.sttKeySource,
              voiceModelId: resolvedVoice.modelId,
              voiceLang: resolvedVoice.lang,
              voiceProviderId: resolvedVoice.providerId,
              model: version.model,
              temperature: version.temperature,
              maxTokens: version.maxTokens,
              systemPromptLength: version.systemPrompt.length,
              hasFirstMessage: Boolean(version.firstMessage),
              endCallPhraseCount: version.endCallPhrases.length,
            },
          },
          tx,
        );
        return this.sanitizeVersion(version);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateVersion(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    versionId: string,
    dto: CreateAgentVersionDto,
  ) {
    const resolvedVoice = await this.voices.resolveVoiceForAgentVersion(
      dto.voiceId,
      organizationId,
    );
    return this.prisma.$transaction(async (tx) => {
      await this.ensureAgentInTransaction(tx, organizationId, agentId);
      const existing = await tx.agentVersion.findFirst({
        where: { id: versionId, agentId },
        select: {
          id: true,
          versionNumber: true,
          isLive: true,
          ttsKeyEncrypted: true,
          llmKeyEncrypted: true,
          sttKeyEncrypted: true,
          fallbackTtsKeyEncrypted: true,
        },
      });
      if (!existing) {
        throw new NotFoundException('Agent version not found');
      }

      const pipelineData = await this.v1CompatiblePipelineData(
        dto,
        resolvedVoice,
        organizationId,
        existing,
      );
      const version = await tx.agentVersion.update({
        where: { id: versionId },
        data: {
          systemPrompt: dto.systemPrompt,
          ...pipelineData,
          temperature: dto.temperature,
          maxTokens: dto.maxTokens,
          firstMessage: dto.firstMessage,
          endCallPhrases: dto.endCallPhrases,
        },
      });

      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.UPDATED,
          entityType: 'AgentVersion',
          entityId: version.id,
          metadata: {
            agentId,
            versionNumber: version.versionNumber,
            updatedLiveVersion: existing.isLive,
            requestedVoiceId: dto.voiceId,
            voiceId: version.voiceId,
            ttsProviderId: version.ttsProviderId,
            ttsVoiceId: version.ttsVoiceId,
            ttsCredentialMode: version.ttsCredentialMode,
            ttsKeySource: version.ttsKeySource,
            llmProviderId: version.llmProviderId,
            llmModel: version.llmModel,
            llmCredentialMode: version.llmCredentialMode,
            llmKeySource: version.llmKeySource,
            sttProviderId: version.sttProviderId,
            sttModel: version.sttModel,
            sttCredentialMode: version.sttCredentialMode,
            sttKeySource: version.sttKeySource,
            voiceModelId: resolvedVoice.modelId,
            voiceLang: resolvedVoice.lang,
            model: version.model,
            temperature: version.temperature,
            maxTokens: version.maxTokens,
            systemPromptLength: version.systemPrompt.length,
            hasFirstMessage: Boolean(version.firstMessage),
            endCallPhraseCount: version.endCallPhrases.length,
          },
        },
        tx,
      );

      return this.sanitizeVersion(version);
    });
  }

  async publishVersion(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    versionId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureAgentInTransaction(tx, organizationId, agentId);
      const version = await tx.agentVersion.findFirst({
        where: { id: versionId, agentId },
        select: { id: true },
      });
      if (!version) {
        throw new NotFoundException('Agent version not found');
      }

      await tx.agentVersion.updateMany({
        where: { agentId },
        data: { isLive: false },
      });
      const published = await tx.agentVersion.update({
        where: { id: versionId },
        data: { isLive: true, publishedAt: new Date() },
      });
      await tx.agent.update({
        where: { id: agentId },
        data: { currentVersionId: versionId },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.PUBLISHED,
          entityType: 'AgentVersion',
          entityId: published.id,
          metadata: {
            agentId,
            versionNumber: published.versionNumber,
          },
        },
        tx,
      );
      return this.sanitizeVersion(published);
    });
  }

  async restoreVersion(
    organizationId: string,
    agentId: string,
    versionId: string,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.ensureAgentInTransaction(tx, organizationId, agentId);
        const source = await tx.agentVersion.findFirst({
          where: { id: versionId, agentId },
        });
        if (!source) {
          throw new NotFoundException('Agent version not found');
        }

        const last = await tx.agentVersion.findFirst({
          where: { agentId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
      const restored = await tx.agentVersion.create({
        data: {
            agentId,
            versionNumber: (last?.versionNumber ?? 0) + 1,
            systemPrompt: source.systemPrompt,
            voiceId: source.voiceId,
            model: source.model,
            ttsProviderId: source.ttsProviderId,
            ttsModel: source.ttsModel,
            ttsVoiceId: source.ttsVoiceId ?? source.voiceId,
            ttsCredentialMode: source.ttsCredentialMode,
            ttsKeySource: source.ttsKeySource,
            ttsKeyEncrypted: source.ttsKeyEncrypted,
            llmProviderId: source.llmProviderId,
            llmModel: source.llmModel ?? source.model,
            llmCredentialMode: source.llmCredentialMode,
            llmKeySource: source.llmKeySource,
            llmKeyEncrypted: source.llmKeyEncrypted,
            sttProviderId: source.sttProviderId,
            sttModel: source.sttModel,
            sttCredentialMode: source.sttCredentialMode,
            sttKeySource: source.sttKeySource,
            sttKeyEncrypted: source.sttKeyEncrypted,
            fallbackTtsProviderId: source.fallbackTtsProviderId,
            fallbackTtsModel: source.fallbackTtsModel,
            fallbackTtsVoiceId: source.fallbackTtsVoiceId,
            fallbackTtsCredentialMode: source.fallbackTtsCredentialMode,
            fallbackTtsKeySource: source.fallbackTtsKeySource,
            fallbackTtsKeyEncrypted: source.fallbackTtsKeyEncrypted,
            temperature: source.temperature,
            maxTokens: source.maxTokens,
            firstMessage: source.firstMessage,
            endCallPhrases: source.endCallPhrases,
            isLive: false,
            publishedAt: null,
          },
        });
        return this.sanitizeVersion(restored);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async createBrowserTestCall(
    organizationId: string,
    agentId: string,
  ) {
    const agent = await this.prisma.agent.findFirst({
      where: {
        id: agentId,
        organizationId,
        deletedAt: null,
        isActive: true,
      },
      include: { currentVersion: true },
    });
    if (!agent?.currentVersion) {
      throw new NotFoundException(
        'Agent not found or not active without a configured version',
      );
    }
    if (!this.liveKitBrowserTest.isConfigured()) {
      throw new ServiceUnavailableException(
        'LiveKit is not configured (set LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).',
      );
    }

    const callId = randomUUID();
    const runtimeSummary = this.browserTestRuntimeSummary(agent.currentVersion);
    await this.prisma.call.create({
      data: {
        id: callId,
        organizationId,
        agentId,
        agentVersionId: agent.currentVersion.id,
        direction: 'INBOUND',
        status: CallStatus.INITIATED,
        fromNumber: 'browser-preview',
        toNumber: null,
        metadata: {
          source: 'awaaz_browser_test_call',
          callId,
          isTest: true,
          isTestCall: true,
          identityStatus: 'created',
          runtime: runtimeSummary,
        },
      },
    });
    /* eslint-disable no-console */
    console.info(
      `call_identity_created call_id=${callId} agent=${agentId} organization=${organizationId}`,
    );
    /* eslint-enable no-console */

    try {
      const session = await this.liveKitBrowserTest.issueBrowserParticipantSession({
        callId,
        agentId,
        organizationId,
      });

      await this.prisma.call.update({
        where: { id: callId },
        data: {
          metadata: {
            source: 'awaaz_browser_test_call',
            callId,
            isTest: true,
            isTestCall: true,
            identityStatus: 'room_ready',
            liveKitRoomName: session.roomName,
            runtime: runtimeSummary,
            ...(session.recordingObjectKey
              ? {
                  recordingProvider: 'livekit-egress',
                  recordingObjectKey: session.recordingObjectKey,
                }
              : {}),
          },
        },
      });
      await this.prisma.call.updateMany({
        where: { id: callId, liveKitRoomId: null },
        data: { liveKitRoomId: session.roomName },
      });
      /* eslint-disable no-console */
      console.info(
        `call_identity_reconciled call_id=${callId} room=${session.roomName}`,
      );
      /* eslint-enable no-console */

      return { ...session, runtime: runtimeSummary };
    } catch (error: unknown) {
      await this.prisma.call.update({
        where: { id: callId },
        data: {
          status: CallStatus.FAILED,
          endedAt: new Date(),
          metadata: {
            source: 'awaaz_browser_test_call',
            callId,
            isTest: true,
            isTestCall: true,
            identityStatus: 'failed',
            failureReason: error instanceof Error ? error.message : String(error),
          },
        },
      });
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Unable to prepare browser test room: ${message}`,
      );
    }
  }

  async endBrowserTestCall(
    organizationId: string,
    agentId: string,
    callId: string,
  ): Promise<{ ok: true; state: 'ending' | 'ended' | 'already_ended' }> {
    const call = await this.prisma.call.findFirst({
      where: { id: callId, organizationId, agentId },
      select: {
        id: true,
        status: true,
        startedAt: true,
        liveKitRoomId: true,
        fromNumber: true,
        metadata: true,
      },
    });
    if (!call || !this.isBrowserPreviewCall(call)) {
      throw new NotFoundException('Browser test call not found');
    }

    const roomName = this.browserRoomName(call);
    const requestedAt = new Date().toISOString();
    const endMetadata = this.mergeBrowserCallMetadata(call.metadata, {
      endRequestedAt: requestedAt,
      endRequestedBy: 'frontend',
      endReason: 'manual_user_end',
      endedBy: 'user',
      lifecycle: {
        endRequestedAt: requestedAt,
        endRequestedBy: 'frontend',
      },
    });
    await this.prisma.call.update({
      where: { id: call.id },
      data: {
        metadata: endMetadata,
      },
    });

    if (call.status === CallStatus.COMPLETED) {
      if (roomName) {
        await this.liveKitBrowserTest.closeBrowserRoom({
          roomName,
          callId,
          reason: 'manual_user_end',
        });
      }
      return { ok: true, state: 'already_ended' };
    }

    if (roomName) {
      try {
        await this.liveKitBrowserTest.requestBrowserCallEnd({
          roomName,
          callId,
          reason: 'manual_user_end',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        /* eslint-disable no-console */
        console.warn(
          `call_end_authoritative_signal_failed call_id=${callId} room=${roomName}: ${message}`,
        );
        /* eslint-enable no-console */
        await this.liveKitBrowserTest.closeBrowserRoom({
          roomName,
          callId,
          reason: 'manual_user_end',
        });
      }
    }

    if (
      await this.completeWorkerlessBrowserTestCall(
        call,
        endMetadata,
        requestedAt,
        roomName,
      )
    ) {
      return { ok: true, state: 'ended' };
    }

    return { ok: true, state: 'ending' };
  }

  private async completeWorkerlessBrowserTestCall(
    call: {
      id: string;
      status: CallStatus;
      startedAt: Date | null;
      liveKitRoomId: string | null;
      metadata: Prisma.JsonValue | null;
    },
    endMetadata: Prisma.InputJsonValue,
    endedAtIso: string,
    roomName: string | null,
  ): Promise<boolean> {
    if (call.status !== CallStatus.INITIATED) {
      return false;
    }

    const endedAt = new Date(endedAtIso);
    const completedMetadata = this.mergeBrowserCallMetadata(endMetadata, {
      endedAt: endedAtIso,
      completedBy: 'api_workerless_browser_end',
      lifecycle: {
        backendCompletedAt: endedAtIso,
        backendCompletedBy: 'agents.endBrowserTestCall',
        workerlessCompletion: true,
      },
    });
    const completed = await this.prisma.$transaction(async (tx) => {
      const update = await tx.call.updateMany({
        where: { id: call.id, status: CallStatus.INITIATED },
        data: {
          status: CallStatus.COMPLETED,
          endedAt,
          durationSeconds: this.durationSeconds(call.startedAt, endedAt),
          metadata: completedMetadata,
        },
      });
      if (update.count === 0) {
        return false;
      }

      await tx.callEvent.create({
        data: {
          callId: call.id,
          eventType: EventType.CALL_ENDED,
          content: 'Call ended',
          startedAt: call.startedAt ?? undefined,
          endedAt,
          durationMs:
            call.startedAt === null
              ? undefined
              : Math.max(0, endedAt.getTime() - call.startedAt.getTime()),
          metadata: {
            timelineEvent: 'call_ended',
            source: 'agents.endBrowserTestCall.workerless',
            liveKitRoomId: call.liveKitRoomId,
            liveKitRoomName: roomName,
            endReason: 'manual_user_end',
            endedBy: 'user',
            lifecycle: {
              backendCompletedAt: endedAtIso,
              backendCompletedBy: 'agents.endBrowserTestCall',
              workerlessCompletion: true,
            },
          } as Prisma.InputJsonObject,
        },
      });
      return true;
    });

    if (completed && roomName) {
      await this.liveKitBrowserTest.closeBrowserRoom({
        roomName,
        callId: call.id,
        reason: 'manual_user_end',
      });
    }

    return completed;
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

  private mergeBrowserCallMetadata(
    metadata: Prisma.JsonValue | Prisma.InputJsonValue | null,
    update: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? { ...(metadata as Record<string, unknown>) }
        : {};
    const baseLifecycle =
      base.lifecycle && typeof base.lifecycle === 'object' && !Array.isArray(base.lifecycle)
        ? { ...(base.lifecycle as Record<string, unknown>) }
        : {};
    const updateLifecycle =
      update.lifecycle && typeof update.lifecycle === 'object' && !Array.isArray(update.lifecycle)
        ? { ...(update.lifecycle as Record<string, unknown>) }
        : {};
    return {
      ...base,
      ...update,
      lifecycle: {
        ...baseLifecycle,
        ...updateLifecycle,
      },
    } as Prisma.InputJsonObject;
  }

  private durationSeconds(startedAt: Date | null, endedAt: Date): number | undefined {
    if (!startedAt) {
      return undefined;
    }
    return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
  }

  private browserTestRuntimeSummary(version: {
    versionNumber: number;
    voiceId: string;
    model: string;
    ttsProviderId: string | null;
    ttsModel: string | null;
    ttsVoiceId: string | null;
    ttsCredentialMode: ProviderCredentialMode | null;
    llmProviderId: string | null;
    llmModel: string | null;
    llmCredentialMode: ProviderCredentialMode | null;
    sttProviderId: string | null;
    sttModel: string | null;
    sttCredentialMode: ProviderCredentialMode | null;
  }) {
    return {
      versionNumber: version.versionNumber,
      tts: {
        providerId: version.ttsProviderId ?? 'rime',
        credentialMode:
          version.ttsCredentialMode ?? ProviderCredentialMode.FINOVA_MANAGED,
        voiceId: version.ttsVoiceId ?? version.voiceId,
        model: version.ttsModel,
      },
      llm: {
        providerId: version.llmProviderId ?? DEFAULT_LLM_PROVIDER_ID,
        credentialMode:
          version.llmCredentialMode ?? ProviderCredentialMode.FINOVA_MANAGED,
        model: version.llmModel ?? version.model,
      },
      stt: {
        providerId: version.sttProviderId ?? DEFAULT_STT_PROVIDER_ID,
        credentialMode:
          version.sttCredentialMode ?? ProviderCredentialMode.FINOVA_MANAGED,
        model: version.sttModel ?? DEFAULT_STT_MODEL,
      },
    };
  }

  private async ensureAgent(
    organizationId: string,
    agentId: string,
  ): Promise<void> {
    const agent = await this.prisma.agent.findFirst({
      where: { id: agentId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
  }

  private async ensureAgentInTransaction(
    tx: Prisma.TransactionClient,
    organizationId: string,
    agentId: string,
  ): Promise<void> {
    const agent = await tx.agent.findFirst({
      where: { id: agentId, organizationId, deletedAt: null },
      select: { id: true },
    });
    if (!agent) {
      throw new NotFoundException('Agent not found');
    }
  }

  private async v1CompatiblePipelineData(
    dto: CreateAgentVersionDto,
    resolvedVoice: ResolvedTtsVoice,
    organizationId: string,
    existing:
      | {
          ttsKeyEncrypted: string | null;
          llmKeyEncrypted: string | null;
          sttKeyEncrypted: string | null;
          fallbackTtsKeyEncrypted: string | null;
        }
      | null,
  ) {
    const llmProviderId =
      dto.llmProviderId?.trim().toLowerCase() || DEFAULT_LLM_PROVIDER_ID;
    if (!RUNTIME_LLM_PROVIDER_IDS.has(llmProviderId)) {
      throw new BadRequestException(`Unsupported LLM provider: ${llmProviderId}`);
    }
    const llmModel =
      (dto.model?.trim() ||
        DEFAULT_LLM_MODEL_BY_PROVIDER.get(llmProviderId)) ??
      DEFAULT_LLM_MODEL;
    const llmProvider = providerById(llmProviderId);
    const supportedLlmModelIds = new Set(
      llmProvider?.models?.map((model) => model.id) ?? [],
    );
    if (supportedLlmModelIds.size > 0 && !supportedLlmModelIds.has(llmModel)) {
      throw new BadRequestException(
        `Unsupported ${llmProvider?.label ?? llmProviderId} LLM model: ${llmModel}`,
      );
    }
    const sttProviderId =
      dto.sttProviderId?.trim().toLowerCase() || DEFAULT_STT_PROVIDER_ID;
    if (!RUNTIME_STT_PROVIDER_IDS.has(sttProviderId)) {
      throw new BadRequestException(`Unsupported STT provider: ${sttProviderId}`);
    }
    const sttModel =
      (dto.sttModel?.trim() ||
        DEFAULT_STT_MODEL_BY_PROVIDER.get(sttProviderId)) ??
      DEFAULT_STT_MODEL;
    const sttProvider = providerById(sttProviderId);
    const supportedSttModelIds = new Set(
      sttProvider?.models?.map((model) => model.id) ?? [],
    );
    if (supportedSttModelIds.size > 0 && !supportedSttModelIds.has(sttModel)) {
      throw new BadRequestException(
        `Unsupported ${sttProvider?.label ?? sttProviderId} STT model: ${sttModel}`,
      );
    }
    const ttsKey = await this.resolveKeySourceForSave({
      label: 'TTS',
      organizationId,
      providerId: resolvedVoice.providerId,
      requestedKeySource: dto.ttsKeySource,
      legacyCredentialMode: dto.ttsCredentialMode,
      agentKey: dto.ttsAgentKey,
      existingEncryptedKey: existing?.ttsKeyEncrypted ?? null,
    });
    const llmKey = await this.resolveKeySourceForSave({
      label: 'LLM',
      organizationId,
      providerId: llmProviderId,
      requestedKeySource: dto.llmKeySource,
      legacyCredentialMode: dto.llmCredentialMode,
      agentKey: dto.llmAgentKey,
      existingEncryptedKey: existing?.llmKeyEncrypted ?? null,
    });
    const sttKey = await this.resolveKeySourceForSave({
      label: 'STT',
      organizationId,
      providerId: sttProviderId,
      requestedKeySource: dto.sttKeySource,
      legacyCredentialMode: dto.sttCredentialMode,
      agentKey: dto.sttAgentKey,
      existingEncryptedKey: existing?.sttKeyEncrypted ?? null,
    });
    
    let fallbackTtsKey = null;
    const fallbackTtsProviderId = dto.fallbackTtsProviderId?.trim().toLowerCase() || null;
    const fallbackTtsModel = dto.fallbackTtsModel?.trim() || null;
    const fallbackTtsVoiceId = dto.fallbackTtsVoiceId?.trim() || null;

    if (fallbackTtsProviderId) {
      if (!fallbackTtsVoiceId) {
        throw new BadRequestException('Fallback TTS voice is required when fallback TTS provider is set');
      }
      if (fallbackTtsProviderId === resolvedVoice.providerId) {
        throw new BadRequestException('Fallback TTS provider cannot be the same as the primary TTS provider');
      }
      
      fallbackTtsKey = await this.resolveKeySourceForSave({
        label: 'Fallback TTS',
        organizationId,
        providerId: fallbackTtsProviderId,
        requestedKeySource: dto.fallbackTtsKeySource,
        legacyCredentialMode: dto.fallbackTtsCredentialMode,
        agentKey: dto.fallbackTtsAgentKey,
        existingEncryptedKey: existing?.fallbackTtsKeyEncrypted ?? null,
      });
    }

    return {
      voiceId: resolvedVoice.storedVoiceId,
      model: llmModel,
      ttsProviderId: resolvedVoice.providerId,
      ttsModel: resolvedVoice.modelId,
      ttsVoiceId: resolvedVoice.providerVoiceId,
      ttsCredentialMode: ttsKey.credentialMode,
      ttsKeySource: ttsKey.keySource,
      ttsKeyEncrypted: ttsKey.encryptedKey,
      fallbackTtsProviderId,
      fallbackTtsModel,
      fallbackTtsVoiceId,
      fallbackTtsCredentialMode: fallbackTtsKey?.credentialMode,
      fallbackTtsKeySource: fallbackTtsKey?.keySource,
      fallbackTtsKeyEncrypted: fallbackTtsKey?.encryptedKey,
      llmProviderId,
      llmModel,
      llmCredentialMode: llmKey.credentialMode,
      llmKeySource: llmKey.keySource,
      llmKeyEncrypted: llmKey.encryptedKey,
      sttProviderId,
      sttModel,
      sttCredentialMode: sttKey.credentialMode,
      sttKeySource: sttKey.keySource,
      sttKeyEncrypted: sttKey.encryptedKey,
    };
  }

  private async resolveKeySourceForSave(input: {
    label: 'TTS' | 'LLM' | 'STT' | 'Fallback TTS';
    organizationId: string;
    providerId: string;
    requestedKeySource?: string;
    legacyCredentialMode?: ProviderCredentialMode;
    agentKey?: string;
    existingEncryptedKey: string | null;
  }): Promise<{
    keySource: string;
    encryptedKey: string | null;
    credentialMode: ProviderCredentialMode;
  }> {
    const keySource = this.normalizeKeySource(
      input.requestedKeySource,
      input.legacyCredentialMode,
    );

    if (keySource === DEFAULT_KEY_SOURCE) {
      return {
        keySource,
        encryptedKey: null,
        credentialMode: ProviderCredentialMode.FINOVA_MANAGED,
      };
    }

    if (keySource === ORG_DEFAULT_KEY_SOURCE) {
      const secret = await this.plugins.resolveOrgDefaultProviderSecret(
        input.organizationId,
        input.providerId,
      );
      if (!secret.ok) {
        throw new BadRequestException(
          `${input.label} saved workspace key for provider "${input.providerId}" is not available: ${secret.error}`,
        );
      }
      return {
        keySource,
        encryptedKey: null,
        credentialMode: ProviderCredentialMode.BYOK,
      };
    }

    const trimmedKey = input.agentKey?.trim();
    const encryptedKey = trimmedKey
      ? this.plugins.encryptSecretForStorage(trimmedKey)
      : input.existingEncryptedKey;
    if (!encryptedKey) {
      throw new BadRequestException(
        `${input.label} agent-owned key is required when key source is agent_own`,
      );
    }
    return {
      keySource,
      encryptedKey,
      credentialMode: ProviderCredentialMode.BYOK,
    };
  }

  private normalizeKeySource(
    requestedKeySource?: string,
    legacyCredentialMode?: ProviderCredentialMode,
  ): string {
    const normalized = requestedKeySource?.trim().toLowerCase();
    if (normalized) {
      if (!KEY_SOURCES.has(normalized)) {
        throw new BadRequestException(`Unsupported provider key source: ${normalized}`);
      }
      return normalized;
    }
    return legacyCredentialMode === ProviderCredentialMode.BYOK
      ? ORG_DEFAULT_KEY_SOURCE
      : DEFAULT_KEY_SOURCE;
  }

  private sanitizeAgent<T extends { currentVersion?: any | null }>(agent: T): T {
    if (!agent.currentVersion) {
      return agent;
    }
    return {
      ...agent,
      currentVersion: this.sanitizeVersion(agent.currentVersion),
    };
  }

  private sanitizeVersion<T extends Record<string, any>>(version: T) {
    const {
      ttsKeyEncrypted,
      llmKeyEncrypted,
      sttKeyEncrypted,
      fallbackTtsKeyEncrypted,
      ...safeVersion
    } = version;
    return {
      ...safeVersion,
      ttsHasAgentKey: Boolean(ttsKeyEncrypted),
      llmHasAgentKey: Boolean(llmKeyEncrypted),
      sttHasAgentKey: Boolean(sttKeyEncrypted),
      fallbackTtsHasAgentKey: Boolean(fallbackTtsKeyEncrypted),
    };
  }
}
