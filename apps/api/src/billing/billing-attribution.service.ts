import { Injectable, Logger } from '@nestjs/common';
import {
  CallDirection,
  EventType,
  Prisma,
  type CallEvent,
  type ProviderCredentialMode,
  type PricingMeter,
} from '@prisma/client';

import { BillingService } from './billing.service';
import { PrismaService } from '../prisma/prisma.service';

type AttributionSourceName = 'stt' | 'llm' | 'tts' | 'telephony';

interface UsageSource {
  source: AttributionSourceName;
  providerId: string;
  providerModelId: string;
  meter: PricingMeter;
  usageQuantity: string;
  credentialMode: ProviderCredentialMode;
  markupBps: number;
}

type BillingCall = Prisma.CallGetPayload<{
  include: {
    agentVersion: true;
    events: true;
  };
}>;

interface AttributionLineItem extends UsageSource {
  pricingVersionId: string;
  pricingVersionNumber: number;
  currency: string;
  baseCostUsdMicros: string;
  markupUsdMicros: string;
  totalCostUsdMicros: string;
}

export interface AttributionResult {
  callId: string;
  created: boolean;
  lineItems: number;
  skippedSources: string[];
}

@Injectable()
export class BillingAttributionService {
  private readonly logger = new Logger(BillingAttributionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async emitForCall(callId: string): Promise<AttributionResult> {
    const existing = await this.prisma.callBillingSnapshot.findUnique({
      where: { callId },
      select: { id: true },
    });
    if (existing) {
      return { callId, created: false, lineItems: 0, skippedSources: [] };
    }

    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      include: {
        agentVersion: true,
        events: {
          where: {
            eventType: {
              in: [EventType.USER_SPEECH, EventType.AGENT_SPEECH],
            },
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        },
      },
    });

    if (!call) {
      this.logger.warn(`billing attribution skipped: call not found callId=${callId}`);
      return { callId, created: false, lineItems: 0, skippedSources: ['call_not_found'] };
    }

    const billingTime = call.endedAt ?? call.updatedAt ?? new Date();
    const sources = await this.usageSources(call, call.events);
    const lineItems: AttributionLineItem[] = [];
    const skippedSources: string[] = [];

    for (const source of sources) {
      try {
        const quote = await this.billing.quote({
          providerId: source.providerId,
          providerModelId: source.providerModelId,
          meter: source.meter,
          usageQuantity: source.usageQuantity,
          credentialMode: source.credentialMode,
          markupBps: source.markupBps,
          billingTime,
        });

        lineItems.push({
          ...source,
          pricingVersionId: quote.pricingVersionId,
          pricingVersionNumber: quote.pricingVersionNumber,
          currency: quote.currency,
          baseCostUsdMicros: quote.baseCostUsdMicros.toString(),
          markupUsdMicros: quote.markupUsdMicros.toString(),
          totalCostUsdMicros: quote.totalCostUsdMicros.toString(),
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        skippedSources.push(`${source.source}:${message}`);
        this.logger.warn(
          `billing attribution skipped source=${source.source} callId=${callId} reason=${message}`,
        );
      }
    }

    const totals = lineItems.reduce(
      (accumulator, item) => ({
        base: accumulator.base + BigInt(item.baseCostUsdMicros),
        markup: accumulator.markup + BigInt(item.markupUsdMicros),
        total: accumulator.total + BigInt(item.totalCostUsdMicros),
      }),
      { base: 0n, markup: 0n, total: 0n },
    );

    await this.prisma.$transaction(async (tx) => {
      if (lineItems.length > 0) {
        await tx.usageLedgerEntry.createMany({
          data: lineItems.map((item) => ({
            organizationId: call.organizationId,
            callId: call.id,
            providerId: item.providerId,
            providerModelId: item.providerModelId,
            credentialMode: item.credentialMode,
            pricingVersionId: item.pricingVersionId,
            usageMeter: item.meter,
            usageQuantity: item.usageQuantity,
            baseCostUsdMicros: BigInt(item.baseCostUsdMicros),
            markupBps: item.markupBps,
            markupUsdMicros: BigInt(item.markupUsdMicros),
            totalCostUsdMicros: BigInt(item.totalCostUsdMicros),
            metadata: {
              source: item.source,
              pricingVersionNumber: item.pricingVersionNumber,
              currency: item.currency,
            },
          })),
        });
      }

      await tx.callBillingSnapshot.create({
        data: {
          organizationId: call.organizationId,
          callId: call.id,
          lineItemCount: lineItems.length,
          totalBaseCostUsdMicros: totals.base,
          totalMarkupUsdMicros: totals.markup,
          totalCostUsdMicros: totals.total,
          lineItems: lineItems.map((item) => ({
            source: item.source,
            providerId: item.providerId,
            providerModelId: item.providerModelId,
            meter: item.meter,
            usageQuantity: item.usageQuantity,
            credentialMode: item.credentialMode,
            markupBps: item.markupBps,
            pricingVersionId: item.pricingVersionId,
            pricingVersionNumber: item.pricingVersionNumber,
            currency: item.currency,
            baseCostUsdMicros: item.baseCostUsdMicros,
            markupUsdMicros: item.markupUsdMicros,
            totalCostUsdMicros: item.totalCostUsdMicros,
          })),
          metadata: {
            billingTime: billingTime.toISOString(),
            skippedSources,
          },
        },
      });
    });

    return {
      callId: call.id,
      created: true,
      lineItems: lineItems.length,
      skippedSources,
    };
  }

  private async usageSources(
    call: BillingCall,
    events: CallEvent[],
  ): Promise<UsageSource[]> {
    const agentVersion = call.agentVersion;
    if (!agentVersion) {
      return [];
    }

    const sources: UsageSource[] = [];

    const sttDurationMinutes = this.sumSpeechDurationMs(events, 'USER_SPEECH') / 60_000;
    if (sttDurationMinutes > 0) {
      const credential = await this.providerCredential(
        call.organizationId,
        agentVersion.sttProviderId,
        agentVersion.sttCredentialMode,
      );
      sources.push({
        source: 'stt',
        providerId: agentVersion.sttProviderId,
        providerModelId: agentVersion.sttModel ?? 'default',
        meter: 'MINUTE',
        usageQuantity: sttDurationMinutes.toString(),
        credentialMode: credential.credentialMode,
        markupBps: credential.markupBps,
      });
    }

    const llmTokens = this.sumTokens(events);
    if (llmTokens > 0) {
      const credential = await this.providerCredential(
        call.organizationId,
        agentVersion.llmProviderId,
        agentVersion.llmCredentialMode,
      );
      sources.push({
        source: 'llm',
        providerId: agentVersion.llmProviderId,
        providerModelId: agentVersion.llmModel ?? agentVersion.model,
        meter: 'TOKEN',
        usageQuantity: llmTokens.toString(),
        credentialMode: credential.credentialMode,
        markupBps: credential.markupBps,
      });
    }

    const ttsCharacters = this.sumSpeechCharacters(events);
    if (ttsCharacters > 0) {
      const credential = await this.providerCredential(
        call.organizationId,
        agentVersion.ttsProviderId,
        agentVersion.ttsCredentialMode,
      );
      sources.push({
        source: 'tts',
        providerId: agentVersion.ttsProviderId,
        providerModelId: agentVersion.ttsModel ?? 'default',
        meter: 'CHARACTER',
        usageQuantity: ttsCharacters.toString(),
        credentialMode: credential.credentialMode,
        markupBps: credential.markupBps,
      });
    }

    if (call.direction === CallDirection.INBOUND || call.direction === CallDirection.OUTBOUND) {
      const durationSeconds = Math.max(0, call.durationSeconds ?? 0);
      if (durationSeconds > 0) {
        sources.push({
          source: 'telephony',
          providerId: 'twilio',
          providerModelId: call.direction,
          meter: 'MINUTE',
          usageQuantity: (durationSeconds / 60).toString(),
          credentialMode: 'FINOVA_MANAGED',
          markupBps: 0,
        });
      }
    }

    return sources;
  }

  private async providerCredential(
    organizationId: string,
    providerId: string,
    selectedMode: ProviderCredentialMode | null | undefined,
  ): Promise<{
    credentialMode: ProviderCredentialMode;
    markupBps: number;
  }> {
    const credentialMode = selectedMode ?? 'FINOVA_MANAGED';
    const credential = await this.prisma.organizationProviderCredential.findUnique({
      where: {
        organizationId_providerId: {
          organizationId,
          providerId,
        },
      },
      select: { credentialMode: true, markupBps: true },
    });

    return {
      credentialMode,
      markupBps: credentialMode === 'BYOK' ? 0 : credential?.markupBps ?? 0,
    };
  }

  private sumSpeechDurationMs(events: CallEvent[], eventType: 'USER_SPEECH' | 'AGENT_SPEECH'): number {
    return events
      .filter((event) => event.eventType === eventType)
      .reduce((sum, event) => sum + this.eventDurationMs(event), 0);
  }

  private sumTokens(events: CallEvent[]): number {
    return events
      .filter((event) => event.eventType === 'AGENT_SPEECH')
      .reduce((sum, event) => sum + (event.tokenCount ?? this.estimateTokens(event.content ?? '')), 0);
  }

  private sumSpeechCharacters(events: CallEvent[]): number {
    return events
      .filter((event) => event.eventType === 'AGENT_SPEECH')
      .reduce((sum, event) => sum + (event.content?.length ?? 0), 0);
  }

  private eventDurationMs(event: CallEvent): number {
    if (typeof event.durationMs === 'number' && event.durationMs >= 0) {
      return event.durationMs;
    }
    if (event.startedAt && event.endedAt) {
      return Math.max(0, event.endedAt.getTime() - event.startedAt.getTime());
    }
    return 0;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
