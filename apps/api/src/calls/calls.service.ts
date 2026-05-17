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
      select: { recordingUrl: true },
    });
    if (!call) {
      throw new NotFoundException('Call not found');
    }
    if (!call.recordingUrl?.trim()) {
      throw new NotFoundException('NO_RECORDING');
    }
    if (!this.storage.isConfigured()) {
      throw new ServiceUnavailableException(
        'Playback URL cannot be minted until object storage is configured.',
      );
    }
    try {
      const expiresInSeconds = 300;
      const url = await this.storage.getPresignedUrl(
        call.recordingUrl,
        expiresInSeconds,
      );
      return { url, expiresInSeconds };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `Could not mint a playback URL: ${message}`,
      );
    }
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
