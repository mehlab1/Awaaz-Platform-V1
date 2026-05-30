import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PricingMeter,
  PricingRoundingMode,
  ProviderCredentialMode,
  type ProviderPricingRate,
  type ProviderPricingVersion,
} from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export interface BillingLookupInput {
  providerId: string;
  providerModelId: string;
  meter: PricingMeter;
  billingTime?: Date;
  pricingVersionId?: string;
}

export interface BillingCalculationInput extends BillingLookupInput {
  usageQuantity: number | string | bigint;
  credentialMode: ProviderCredentialMode;
  markupBps: number;
}

export interface BillingRateSnapshot {
  pricingVersionId: string;
  pricingVersionNumber: number;
  providerId: string;
  providerModelId: string;
  meter: PricingMeter;
  currency: string;
  unitQuantity: bigint;
  priceUsdMicros: bigint;
  minChargeUsdMicros: bigint | null;
  roundingMode: PricingRoundingMode;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  notes: string | null;
}

export interface BillingQuote extends BillingRateSnapshot {
  usageQuantity: string;
  baseCostUsdMicros: bigint;
  effectiveMarkupBps: number;
  markupUsdMicros: bigint;
  totalCostUsdMicros: bigint;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: BillingCalculationInput): Promise<BillingQuote> {
    const rate = await this.lookupRate(input);
    const usageMicros = this.quantityToMicros(input.usageQuantity);
    const baseCostUsdMicros = this.calculateBaseCostUsdMicros(rate, usageMicros);
    const effectiveMarkupBps =
      input.credentialMode === ProviderCredentialMode.BYOK
        ? 0
        : Math.max(0, Math.trunc(input.markupBps));
    const markupUsdMicros = this.calculateMarkupUsdMicros(
      baseCostUsdMicros,
      effectiveMarkupBps,
      rate.roundingMode,
    );

    return {
      ...rate,
      usageQuantity: this.formatQuantity(input.usageQuantity),
      baseCostUsdMicros,
      effectiveMarkupBps,
      markupUsdMicros,
      totalCostUsdMicros: baseCostUsdMicros + markupUsdMicros,
    };
  }

  async lookupRate(input: BillingLookupInput): Promise<BillingRateSnapshot> {
    const version = input.pricingVersionId
      ? await this.prisma.providerPricingVersion.findUnique({
          where: { id: input.pricingVersionId },
          include: { rates: true },
        })
      : await this.prisma.providerPricingVersion.findFirst({
          where: {
            providerId: input.providerId,
            isActive: true,
            effectiveFrom: { lte: input.billingTime ?? new Date() },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gt: input.billingTime ?? new Date() } },
            ],
          },
          orderBy: [{ version: 'desc' }, { effectiveFrom: 'desc' }],
          include: { rates: true },
        });

    if (!version) {
      throw new NotFoundException(
        `No pricing version found for provider ${input.providerId}`,
      );
    }

    const rate = version.rates.find(
      (candidate) =>
        candidate.providerModelId === input.providerModelId &&
        candidate.meter === input.meter,
    );

    if (!rate) {
      throw new NotFoundException(
        `No pricing rate found for provider ${input.providerId}, model ${input.providerModelId}, meter ${input.meter}`,
      );
    }

    return this.toRateSnapshot(version, rate);
  }

  private toRateSnapshot(
    version: ProviderPricingVersion & { rates: ProviderPricingRate[] },
    rate: ProviderPricingRate,
  ): BillingRateSnapshot {
    return {
      pricingVersionId: version.id,
      pricingVersionNumber: version.version,
      providerId: version.providerId,
      providerModelId: rate.providerModelId,
      meter: rate.meter,
      currency: version.currency,
      unitQuantity: BigInt(rate.unitQuantity),
      priceUsdMicros: BigInt(rate.priceUsdMicros),
      minChargeUsdMicros:
        rate.minChargeUsdMicros === null
          ? null
          : BigInt(rate.minChargeUsdMicros),
      roundingMode: rate.roundingMode,
      effectiveFrom: version.effectiveFrom,
      effectiveTo: version.effectiveTo,
      notes: version.notes ?? null,
    };
  }

  private calculateBaseCostUsdMicros(
    rate: BillingRateSnapshot,
    usageMicros: bigint,
  ): bigint {
    const denominator = rate.unitQuantity * SCALE_MICROS;
    const numerator = usageMicros * rate.priceUsdMicros;
    let baseCostUsdMicros = this.roundDivision(
      numerator,
      denominator,
      rate.roundingMode,
    );

    if (
      rate.minChargeUsdMicros !== null &&
      baseCostUsdMicros < rate.minChargeUsdMicros
    ) {
      baseCostUsdMicros = rate.minChargeUsdMicros;
    }

    return baseCostUsdMicros;
  }

  private calculateMarkupUsdMicros(
    baseCostUsdMicros: bigint,
    markupBps: number,
    roundingMode: PricingRoundingMode,
  ): bigint {
    if (markupBps <= 0) {
      return 0n;
    }

    return this.roundDivision(
      baseCostUsdMicros * BigInt(markupBps),
      10_000n,
      roundingMode,
    );
  }

  private roundDivision(
    numerator: bigint,
    denominator: bigint,
    roundingMode: PricingRoundingMode,
  ): bigint {
    if (denominator === 0n) {
      throw new Error('Cannot divide by zero when calculating billing cost');
    }

    const quotient = numerator / denominator;
    const remainder = numerator % denominator;

    if (remainder === 0n) {
      return quotient;
    }

    switch (roundingMode) {
      case PricingRoundingMode.CEIL:
        return quotient + 1n;
      case PricingRoundingMode.FLOOR:
        return quotient;
      case PricingRoundingMode.HALF_UP:
      default:
        return remainder * 2n >= denominator ? quotient + 1n : quotient;
    }
  }

  private quantityToMicros(quantity: number | string | bigint): bigint {
    if (typeof quantity === 'bigint') {
      return quantity * SCALE_MICROS;
    }

    const text = typeof quantity === 'number' ? quantity.toString() : quantity;
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return 0n;
    }

    const negative = trimmed.startsWith('-');
    const normalized = negative ? trimmed.slice(1) : trimmed;
    const [wholePartRaw, fractionalPartRaw = ''] = normalized.split('.');
    const wholePart = BigInt(wholePartRaw || '0');
    const fractionText = `${fractionalPartRaw}000000`.slice(0, 6);
    const fractionPart = BigInt(fractionText || '0');
    const scaled = wholePart * SCALE_MICROS + fractionPart;
    return negative ? -scaled : scaled;
  }

  private formatQuantity(quantity: number | string | bigint): string {
    return typeof quantity === 'bigint' ? quantity.toString() : String(quantity);
  }
}

const SCALE_MICROS = 1_000_000n;