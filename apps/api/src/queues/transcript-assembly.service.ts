import { Injectable, NotFoundException } from '@nestjs/common';
import { CallDirection, EventType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface TranscriptJobData {
  callId?: string;
  liveKitRoomId?: string;
  roomName?: string;
}

export interface TranscriptAssemblyResult {
  callId: string;
  transcriptEntries: number;
  totalCostUsd: number;
}

interface TranscriptEntry {
  speaker: string | null;
  text: string;
  startedAt: string | null;
  endedAt: string | null;
  latencyMs: number | null;
}

interface CostBreakdown {
  sttUsd: number;
  llmUsd: number;
  ttsUsd: number;
  telephonyUsd: number;
  totalUsd: number;
  durationMinutes: number;
  llmTokens: number;
  ttsCharacters: number;
}

const STT_PER_MINUTE_USD = 0.0043;
const LLM_PER_TOKEN_USD = 0.79 / 1_000_000;
const TTS_PER_CHARACTER_USD = 0.020 / 1_000;
const TELEPHONY_PER_MINUTE_USD = 0.0085;

@Injectable()
export class TranscriptAssemblyService {
  constructor(private readonly prisma: PrismaService) {}

  async assemble(data: TranscriptJobData): Promise<TranscriptAssemblyResult> {
    const call = await this.findCall(data);
    const events = await this.prisma.callEvent.findMany({
      where: {
        callId: call.id,
        eventType: { in: [EventType.USER_SPEECH, EventType.AGENT_SPEECH] },
      },
      orderBy: { createdAt: 'asc' },
    });

    const transcript = events.map((event): TranscriptEntry => ({
      speaker: event.speaker ?? this.speakerForEvent(event.eventType),
      text: event.content ?? '',
      startedAt: event.startedAt?.toISOString() ?? null,
      endedAt: event.endedAt?.toISOString() ?? null,
      latencyMs: event.latencyMs ?? null,
    }));
    const cost = this.calculateCost({
      durationSeconds: call.durationSeconds,
      events,
      direction: call.direction,
    });

    await this.prisma.$transaction([
      this.prisma.transcript.upsert({
        where: { callId: call.id },
        create: {
          callId: call.id,
          content: transcript as unknown as Prisma.InputJsonValue,
          assembledAt: new Date(),
        },
        update: {
          content: transcript as unknown as Prisma.InputJsonValue,
          assembledAt: new Date(),
        },
      }),
      this.prisma.call.update({
        where: { id: call.id },
        data: {
          costBreakdown: cost as unknown as Prisma.InputJsonValue,
          totalCostUsd: cost.totalUsd,
        },
      }),
    ]);

    return {
      callId: call.id,
      transcriptEntries: transcript.length,
      totalCostUsd: cost.totalUsd,
    };
  }

  private async findCall(data: TranscriptJobData) {
    if (data.callId) {
      const call = await this.prisma.call.findUnique({
        where: { id: data.callId },
      });
      if (call) {
        return call;
      }
    }

    if (data.liveKitRoomId) {
      const call = await this.prisma.call.findUnique({
        where: { liveKitRoomId: data.liveKitRoomId },
      });
      if (call) {
        return call;
      }
    }

    if (data.roomName) {
      const call = await this.prisma.call.findUnique({
        where: { liveKitRoomId: data.roomName },
      });
      if (call) {
        return call;
      }
    }

    throw new NotFoundException('Call not found for transcript job');
  }

  private calculateCost(input: {
    durationSeconds: number | null;
    events: Array<{
      eventType: EventType;
      content: string | null;
      tokenCount: number | null;
    }>;
    direction: CallDirection;
  }): CostBreakdown {
    const durationMinutes = Math.max(
      (input.durationSeconds ?? 0) / 60,
      input.events.length > 0 ? 1 / 60 : 0,
    );
    const llmTokens = input.events
      .filter((event) => event.eventType === EventType.AGENT_SPEECH)
      .reduce(
        (sum, event) =>
          sum + (event.tokenCount ?? this.estimateTokens(event.content ?? '')),
        0,
      );
    const ttsCharacters = input.events
      .filter((event) => event.eventType === EventType.AGENT_SPEECH)
      .reduce((sum, event) => sum + (event.content?.length ?? 0), 0);

    const sttUsd = durationMinutes * STT_PER_MINUTE_USD;
    const llmUsd = llmTokens * LLM_PER_TOKEN_USD;
    const ttsUsd = ttsCharacters * TTS_PER_CHARACTER_USD;
    const telephonyUsd =
      input.direction === CallDirection.INBOUND ||
      input.direction === CallDirection.OUTBOUND
        ? durationMinutes * TELEPHONY_PER_MINUTE_USD
        : 0;

    return this.roundCost({
      sttUsd,
      llmUsd,
      ttsUsd,
      telephonyUsd,
      totalUsd: sttUsd + llmUsd + ttsUsd + telephonyUsd,
      durationMinutes,
      llmTokens,
      ttsCharacters,
    });
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  private speakerForEvent(eventType: EventType): string | null {
    if (eventType === EventType.USER_SPEECH) {
      return 'user';
    }
    if (eventType === EventType.AGENT_SPEECH) {
      return 'agent';
    }
    return null;
  }

  private roundCost(cost: CostBreakdown): CostBreakdown {
    return {
      ...cost,
      sttUsd: this.roundUsd(cost.sttUsd),
      llmUsd: this.roundUsd(cost.llmUsd),
      ttsUsd: this.roundUsd(cost.ttsUsd),
      telephonyUsd: this.roundUsd(cost.telephonyUsd),
      totalUsd: this.roundUsd(cost.totalUsd),
      durationMinutes: Number(cost.durationMinutes.toFixed(4)),
    };
  }

  private roundUsd(value: number): number {
    return Number(value.toFixed(6));
  }
}
