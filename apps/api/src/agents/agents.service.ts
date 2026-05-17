import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateAgentVersionDto } from './dto/create-agent-version.dto';
import type { CreateAgentDto } from './dto/create-agent.dto';
import type { PatchAgentDto } from './dto/patch-agent.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.agent.findMany({
      where: { organizationId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        isActive: true,
        currentVersionId: true,
        createdAt: true,
        updatedAt: true,
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            isLive: true,
            publishedAt: true,
          },
        },
      },
    });
  }

  create(organizationId: string, dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        organizationId,
        name: dto.name,
        description: dto.description,
      },
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

    await this.ensureAgent(organizationId, agentId);
    return this.prisma.agent.update({
      where: { id: agentId },
      data,
      include: { currentVersion: true },
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
        return tx.agentVersion.create({
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
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async publishVersion(
    organizationId: string,
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
