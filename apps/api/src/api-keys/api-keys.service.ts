import { createHash, randomBytes } from 'crypto';

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import type { CreateApiKeyDto } from './dto/create-api-key.dto';

const API_KEY_PREFIX_LENGTH = 8;

@Injectable()
export class ApiKeysService {
  constructor(private readonly prisma: PrismaService) {}

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

  async create(organizationId: string, dto: CreateApiKeyDto) {
    const name = dto.name.trim();
    if (name.length === 0) {
      throw new BadRequestException('API key name is required');
    }
    const fullKey = createFullKey();
    const key = await this.prisma.apiKey.create({
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
    return { ...key, fullKey };
  }

  async revoke(organizationId: string, apiKeyId: string): Promise<{ ok: true }> {
    const key = await this.prisma.apiKey.findFirst({
      where: { id: apiKeyId, organizationId },
      select: { id: true },
    });
    if (!key) {
      throw new NotFoundException('API key not found');
    }
    await this.prisma.apiKey.update({
      where: { id: key.id },
      data: { isRevoked: true },
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
