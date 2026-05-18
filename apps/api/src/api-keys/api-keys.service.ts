import { createHash, randomBytes } from 'crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';

const API_KEY_PREFIX_LENGTH = 8;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(organizationId: string) {
    return this.prisma.apiKey.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        isRevoked: true,
        lastUsedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async create(
    organizationId: string,
    actorUserId: string,
    dto: CreateApiKeyDto,
  ) {
    const name = dto.name.trim();
    if (name.length === 0) {
      throw new BadRequestException('API key name is required');
    }
    const fullKey = createFullKey();
    const key = await this.prisma.$transaction(async (tx) => {
      const created = await tx.apiKey.create({
        data: {
          organizationId,
          name,
          keyPrefix: fullKey.slice(0, API_KEY_PREFIX_LENGTH),
          keyHash: hashApiKey(fullKey),
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          isRevoked: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.CREATED,
          entityType: 'ApiKey',
          entityId: created.id,
          metadata: {
            name: created.name,
            keyPrefix: created.keyPrefix,
          },
        },
        tx,
      );
      return created;
    });
    return { ...key, fullKey };
  }

  async revoke(
    organizationId: string,
    actorUserId: string,
    apiKeyId: string,
  ): Promise<{ ok: true }> {
    await this.prisma.$transaction(async (tx) => {
      const key = await tx.apiKey.findFirst({
        where: { id: apiKeyId, organizationId },
        select: { id: true, name: true, keyPrefix: true },
      });
      if (!key) {
        throw new NotFoundException('API key not found');
      }
      await tx.apiKey.update({
        where: { id: key.id },
        data: { isRevoked: true },
      });
      await this.audit.record(
        {
          organizationId,
          actorUserId,
          action: AuditAction.REVOKED,
          entityType: 'ApiKey',
          entityId: key.id,
          metadata: {
            name: key.name,
            keyPrefix: key.keyPrefix,
          },
        },
        tx,
      );
    });
    return { ok: true };
  }
}

function createFullKey(): string {
  return `ak_${randomBytes(24).toString('hex')}`;
}

function hashApiKey(fullKey: string): string {
  return createHash('sha256').update(fullKey).digest('hex');
}
