import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import type { ListCallsQueryDto } from './dto/list-calls.query.dto';

const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class CallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listPaged(organizationId: string, query: ListCallsQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? DEFAULT_PAGE_SIZE));
    const where = this.buildWhere(organizationId, query);

    const total = await this.prisma.call.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const pageClamped = Math.min(page, totalPages);
    const skip = total === 0 ? 0 : (pageClamped - 1) * limit;

    const items = await this.prisma.call.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      select: {
        id: true,
        status: true,
        direction: true,
        fromNumber: true,
        toNumber: true,
        startedAt: true,
        endedAt: true,
        durationSeconds: true,
        metadata: true,
        totalCostUsd: true,
        createdAt: true,
        agent: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      items,
      page: pageClamped,
      pageSize: limit,
      total,
      totalPages,
    };
  }

  private buildWhere(
    organizationId: string,
    query: ListCallsQueryDto,
  ): Prisma.CallWhereInput {
    const clauses: Prisma.CallWhereInput[] = [{ organizationId }];

    if (query.agentId?.trim()) {
      clauses.push({ agentId: query.agentId.trim() });
    }

    if (query.direction !== undefined) {
      clauses.push({ direction: query.direction });
    }

    if (query.status !== undefined) {
      clauses.push({ status: query.status });
    }

    const createdBounds = utcCreatedAtBounds(query.dateFrom, query.dateTo);
    if (createdBounds !== undefined) {
      clauses.push({ createdAt: createdBounds });
    }

    if (query.phone?.trim()) {
      const t = query.phone.trim();
      clauses.push({
        OR: [
          {
            fromNumber: {
              contains: t,
              mode: Prisma.QueryMode.insensitive,
            },
          },
          {
            toNumber: {
              contains: t,
              mode: Prisma.QueryMode.insensitive,
            },
          },
        ],
      });
    }

    return clauses.length === 1 ? clauses[0] : { AND: clauses };
  }

  async getDetailWithRelations(organizationId: string, callId: string) {
    const call = await this.prisma.call.findFirst({
      where: { id: callId, organizationId },
      include: {
        transcript: true,
        agent: { select: { id: true, name: true } },
      },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    return call;
  }

  async getRecordingPlaybackUrl(
    organizationId: string,
    callId: string,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const call = await this.prisma.call.findFirst({
      where: { id: callId, organizationId },
      select: { recordingUrl: true, metadata: true },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    const recordingKey =
      call.recordingUrl?.trim() || this.recordingObjectKeyFromMetadata(call.metadata);
    if (!recordingKey) {
      throw new NotFoundException('NO_RECORDING');
    }
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Playback URL cannot be minted until object storage is configured.',
      );
    }
    const objectKey = this.storage.normalizeObjectKey(recordingKey);
    if (!objectKey) {
      throw new NotFoundException('RECORDING_NOT_READY');
    }
    try {
      const objectExists = await this.storage.objectExists(objectKey);
      if (!objectExists) {
        throw new NotFoundException('RECORDING_NOT_READY');
      }

      const expiresInSeconds = 300;
      const url = await this.storage.getPresignedUrl(
        objectKey,
        expiresInSeconds,
        this.recordingContentType(objectKey),
      );
      if (call.recordingUrl?.trim() !== objectKey) {
        await this.prisma.call.update({
          where: { id: callId },
          data: { recordingUrl: objectKey },
        });
      }
      return { url, expiresInSeconds };
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `Could not mint a playback URL: ${message}`,
      );
    }
  }

  private recordingObjectKeyFromMetadata(
    metadata: Prisma.JsonValue | null,
  ): string | null {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return null;
    }

    const record = metadata as Record<string, unknown>;
    const nested = record.recording;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>;
      const objectKey = nestedRecord.objectKey;
      if (typeof objectKey === 'string' && objectKey.trim()) {
        return objectKey.trim();
      }
    }

    const topLevel = record.recordingObjectKey;
    if (typeof topLevel === 'string' && topLevel.trim()) {
      return topLevel.trim();
    }

    return null;
  }

  private recordingContentType(key: string): string | undefined {
    const normalized = key.split('?')[0]?.toLowerCase() ?? '';
    if (normalized.endsWith('.mp3')) {
      return 'audio/mpeg';
    }
    if (normalized.endsWith('.wav')) {
      return 'audio/wav';
    }
    if (normalized.endsWith('.ogg') || normalized.endsWith('.oga')) {
      return 'audio/ogg';
    }
    if (normalized.endsWith('.m4a')) {
      return 'audio/mp4';
    }
    return undefined;
  }
}

function utcCreatedAtBounds(
  dateFrom?: string,
  dateTo?: string,
): Prisma.DateTimeFilter | undefined {
  const f = dateFrom?.trim();
  const t = dateTo?.trim();
  if (!f && !t) {
    return undefined;
  }
  const filter: Prisma.DateTimeFilter = {};
  if (f) {
    filter.gte = new Date(`${f}T00:00:00.000Z`);
  }
  if (t) {
    filter.lte = new Date(`${t}T23:59:59.999Z`);
  }
  return filter;
}
