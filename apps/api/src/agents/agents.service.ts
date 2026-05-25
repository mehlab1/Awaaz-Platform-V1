import { randomUUID } from 'crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditAction, Prisma, CallStatus } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { LiveKitBrowserTestService } from '../livekit/livekit-browser-test.service';
import { PrismaService } from '../prisma/prisma.service';
import { VoicesService } from '../voices/voices.service';
import type { CreateAgentVersionDto } from './dto/create-agent-version.dto';
import type { CreateAgentDto } from './dto/create-agent.dto';
import type { PatchAgentDto } from './dto/patch-agent.dto';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly liveKitBrowserTest: LiveKitBrowserTestService,
    private readonly voices: VoicesService,
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
    return agent;
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
    return this.prisma.agentVersion.findMany({
      where: { agentId },
      orderBy: { versionNumber: 'desc' },
      take: options.limit,
    });
  }

  async createVersion(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    dto: CreateAgentVersionDto,
  ) {
    const resolvedVoice = await this.voices.resolveForTts(dto.voiceId);
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
            voiceId: resolvedVoice.rimeVoiceId,
            model: dto.model,
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
        return version;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
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
      return published;
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
        return tx.agentVersion.create({
          data: {
            agentId,
            versionNumber: (last?.versionNumber ?? 0) + 1,
            systemPrompt: source.systemPrompt,
            voiceId: source.voiceId,
            model: source.model,
            temperature: source.temperature,
            maxTokens: source.maxTokens,
            firstMessage: source.firstMessage,
            endCallPhrases: source.endCallPhrases,
            isLive: false,
            publishedAt: null,
          },
        });
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

      return session;
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
  ): Promise<{ ok: true; state: 'ending' | 'already_ended' }> {
    const call = await this.prisma.call.findFirst({
      where: { id: callId, organizationId, agentId },
      select: {
        id: true,
        status: true,
        liveKitRoomId: true,
        fromNumber: true,
        metadata: true,
      },
    });
    if (!call || !this.isBrowserPreviewCall(call)) {
      throw new NotFoundException('Browser test call not found');
    }

    const roomName = this.browserRoomName(call);
    await this.prisma.call.update({
      where: { id: call.id },
      data: {
        metadata: this.mergeBrowserCallMetadata(call.metadata, {
          endRequestedAt: new Date().toISOString(),
          endRequestedBy: 'frontend',
        }),
      },
    });

    if (call.status === CallStatus.COMPLETED) {
      if (roomName) {
        await this.liveKitBrowserTest.closeBrowserRoom({
          roomName,
          callId,
          reason: 'frontend requested end for completed call',
        });
      }
      return { ok: true, state: 'already_ended' };
    }

    if (roomName) {
      try {
        await this.liveKitBrowserTest.requestBrowserCallEnd({
          roomName,
          callId,
          reason: 'frontend end session',
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
          reason: 'frontend end session signal failed',
        });
      }
    }

    return { ok: true, state: 'ending' };
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
    metadata: Prisma.JsonValue | null,
    update: Record<string, unknown>,
  ): Prisma.InputJsonValue {
    const base =
      metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? { ...(metadata as Record<string, unknown>) }
        : {};
    return { ...base, ...update } as Prisma.InputJsonObject;
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
}
