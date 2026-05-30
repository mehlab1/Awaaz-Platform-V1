import { PrismaClient } from '@prisma/client';

import { BillingAttributionService } from '../src/billing/billing-attribution.service';
import { BillingService } from '../src/billing/billing.service';
import { PrismaService } from '../src/prisma/prisma.service';

const DEFAULT_BATCH_SIZE = 50;

async function main(): Promise<void> {
  const prisma = new PrismaService();
  const billing = new BillingService(prisma);
  const attribution = new BillingAttributionService(prisma, billing);
  const writeEnabled = normalizeBool(process.env.BILLING_BACKFILL_WRITE);
  const batchSize = normalizeInt(process.env.BILLING_BACKFILL_BATCH_SIZE, DEFAULT_BATCH_SIZE);

  try {
    await prisma.$connect();

    const eligible = await prisma.call.count({
      where: {
        status: 'COMPLETED',
        billingSnapshot: { is: null },
        events: { some: { eventType: { in: ['USER_SPEECH', 'AGENT_SPEECH'] } } },
      },
    });

    const selectedCalls = await prisma.call.findMany({
      where: {
        status: 'COMPLETED',
        billingSnapshot: { is: null },
        events: { some: { eventType: { in: ['USER_SPEECH', 'AGENT_SPEECH'] } } },
      },
      orderBy: [{ endedAt: 'desc' }, { createdAt: 'asc' }],
      take: writeEnabled ? batchSize : 0,
      select: { id: true, organizationId: true, endedAt: true, createdAt: true },
    });

    if (!writeEnabled) {
      process.stdout.write(
        JSON.stringify(
          {
            mode: 'dry-run',
            eligibleCalls: eligible,
            batchSize,
            wouldWrite: false,
            selectedCalls: selectedCalls.length,
          },
          null,
          2,
        ) + '\n',
      );
      return;
    }

    const processed: Array<{ callId: string; created: boolean; lineItems: number }> = [];
    const errors: Array<{ callId: string; error: string }> = [];
    let skippedAlreadyBackfilled = 0;

    for (const call of selectedCalls) {
      const existing = await prisma.callBillingSnapshot.findUnique({
        where: { callId: call.id },
        select: { id: true },
      });
      if (existing) {
        skippedAlreadyBackfilled += 1;
        continue;
      }

      try {
        const result = await attribution.emitForCall(call.id);
        processed.push({
          callId: result.callId,
          created: result.created,
          lineItems: result.lineItems,
        });
      } catch (error: unknown) {
        errors.push({ callId: call.id, error: messageOf(error) });
      }
    }

    process.stdout.write(
      JSON.stringify(
        {
          mode: 'write',
          eligibleCalls: eligible,
          batchSize,
          selectedCalls: selectedCalls.length,
          processedCalls: processed.length,
          skippedAlreadyBackfilled,
          errors,
          processed,
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

function normalizeBool(value: string | undefined): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function normalizeInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error: unknown) => {
  process.stderr.write(`${messageOf(error)}\n`);
  process.exit(1);
});