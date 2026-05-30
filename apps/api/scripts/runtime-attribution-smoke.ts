import {
  CallDirection,
  CallStatus,
  EventType,
  PrismaClient,
} from '@prisma/client';

import { BillingAttributionService } from '../src/billing/billing-attribution.service';
import { BillingService } from '../src/billing/billing.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  const billing = new BillingService(prisma);
  const attribution = new BillingAttributionService(prisma, billing);

  try {
    await prisma.$connect();

    const agent = await prisma.agent.findFirst({
      where: { currentVersionId: { not: null }, deletedAt: null },
      include: { currentVersion: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!agent?.currentVersion) {
      throw new Error('No seed agent with a live version was found');
    }

    const createdCall = await prisma.call.create({
      data: {
        organizationId: agent.organizationId,
        agentId: agent.id,
        agentVersionId: agent.currentVersion.id,
        direction: CallDirection.INBOUND,
        status: CallStatus.COMPLETED,
        fromNumber: '+15550000001',
        toNumber: '+15550000002',
        startedAt: new Date(Date.now() - 90_000),
        endedAt: new Date(),
        durationSeconds: 90,
        metadata: {
          source: 'runtime-attribution-smoke',
          isTest: true,
        },
        costBreakdown: {
          sttUsd: 1.01,
          llmUsd: 2.02,
          ttsUsd: 3.03,
          telephonyUsd: 4.04,
          totalUsd: 10.1,
        },
        totalCostUsd: 10.1,
      },
    });

    await prisma.callEvent.createMany({
      data: [
        {
          callId: createdCall.id,
          eventType: EventType.USER_SPEECH,
          content: 'hello there',
          speaker: 'user',
          durationMs: 30000,
          startedAt: new Date(Date.now() - 85_000),
          endedAt: new Date(Date.now() - 55_000),
          metadata: {
            source: 'runtime-attribution-smoke',
          },
        },
        {
          callId: createdCall.id,
          eventType: EventType.AGENT_SPEECH,
          content: 'hello, how can I help you today?',
          speaker: 'agent',
          durationMs: 3000,
          tokenCount: 32,
          startedAt: new Date(Date.now() - 45_000),
          endedAt: new Date(Date.now() - 42_000),
          metadata: {
            source: 'runtime-attribution-smoke',
          },
        },
      ],
    });

    const result = await attribution.emitForCall(createdCall.id);
    if (!result.created) {
      throw new Error('Attribution did not create a snapshot for the completed call');
    }

    const ledgerRows = await prisma.usageLedgerEntry.findMany({
      where: { callId: createdCall.id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });

    const snapshot = await prisma.callBillingSnapshot.findUnique({
      where: { callId: createdCall.id },
    });

    if (!snapshot) {
      throw new Error('Missing call billing snapshot after attribution');
    }

    if (snapshot.lineItemCount !== ledgerRows.length) {
      throw new Error(
        `Snapshot line count mismatch: expected ${ledgerRows.length}, got ${snapshot.lineItemCount}`,
      );
    }

    const providers = new Set(ledgerRows.map((row) => row.providerId));
    for (const expectedProvider of ['groq', 'rime', 'deepgram']) {
      if (!providers.has(expectedProvider)) {
        throw new Error(`Missing expected ledger entry for provider ${expectedProvider}`);
      }
    }

    const unchangedCall = await prisma.call.findUnique({
      where: { id: createdCall.id },
      select: { costBreakdown: true, totalCostUsd: true },
    });
    if (
      JSON.stringify(unchangedCall?.costBreakdown) !==
        JSON.stringify(createdCall.costBreakdown) ||
      unchangedCall?.totalCostUsd !== createdCall.totalCostUsd
    ) {
      throw new Error('Legacy call cost fields changed during attribution');
    }

    await prisma.call.delete({ where: { id: createdCall.id } });

    process.stdout.write(
      JSON.stringify(
        {
          callId: createdCall.id,
          ledgerRows: ledgerRows.length,
          snapshotLineItems: snapshot.lineItemCount,
          providers: [...providers],
          status: 'ok',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});