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
import type { CreateAgentVersionDto } from './dto/create-agent-version.dto';
import type { CreateAgentDto } from './dto/create-agent.dto';
import type { PatchAgentDto } from './dto/patch-agent.dto';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly liveKitBrowserTest: LiveKitBrowserTestService,
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

  async listVersions(organizationId: string, agentId: string) {
    await this.ensureAgent(organizationId, agentId);
    return this.prisma.agentVersion.findMany({
      where: { agentId },
      orderBy: { versionNumber: 'desc' },
    });
  }

  async createVersion(
    organizationId: string,
    actorUserId: string,
    agentId: string,
    dto: CreateAgentVersionDto,
  ) {
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
            voiceId: dto.voiceId,
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
              voiceId: version.voiceId,
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

    try {
      const session = await this.liveKitBrowserTest.issueBrowserParticipantSession({
        agentId,
        organizationId,
      });

      // Persist an initial call row so the Calls UI can show the test call immediately.
      try {
        await this.prisma.call.create({
          data: {
            organizationId,
            agentId,
            agentVersionId: agent.currentVersion?.id ?? null,
            liveKitRoomId: session.roomName,
            direction: 'INBOUND',
            status: CallStatus.INITIATED,
            fromNumber: 'browser-preview',
            toNumber: null,
            metadata: {
              source: 'awaaz_browser_test_call',
              isTest: true,
              isTestCall: true,
            },
          },
        });
      } catch (error) {
        // Non-fatal: log and continue. Worker startCall upsert will reconcile.
        /* eslint-disable no-console */
        console.warn('Could not persist initial test call row:', error instanceof Error ? error.message : String(error));
        /* eslint-enable no-console */
      }

      return session;
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Unable to prepare browser test room: ${message}`,
      );
    }
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
