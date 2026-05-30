import { PrismaClient } from '@prisma/client';

const REQUIRED_USAGE_COLUMNS = [
  'organizationId',
  'callId',
  'providerId',
  'providerModelId',
  'credentialMode',
  'pricingVersionId',
  'usageMeter',
  'usageQuantity',
  'baseCostUsdMicros',
  'markupBps',
  'markupUsdMicros',
  'totalCostUsdMicros',
  'createdAt',
] as const;

const REQUIRED_SNAPSHOT_COLUMNS = [
  'organizationId',
  'callId',
  'lineItemCount',
  'totalBaseCostUsdMicros',
  'totalMarkupUsdMicros',
  'totalCostUsdMicros',
  'lineItems',
  'createdAt',
  'updatedAt',
] as const;

const REQUIRED_CALL_COST_COLUMNS = ['costBreakdown', 'totalCostUsd'] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    await expectColumns(prisma, 'usage_ledger_entries', REQUIRED_USAGE_COLUMNS);
    await expectColumns(prisma, 'call_billing_snapshots', REQUIRED_SNAPSHOT_COLUMNS);
    await expectColumns(prisma, 'calls', REQUIRED_CALL_COST_COLUMNS);

    const usageDelegateCount = await prisma.usageLedgerEntry.count();
    const snapshotDelegateCount = await prisma.callBillingSnapshot.count();

    process.stdout.write(
      JSON.stringify(
        {
          usageLedgerEntryCount: usageDelegateCount,
          callBillingSnapshotCount: snapshotDelegateCount,
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

async function expectColumns(
  prisma: PrismaClient,
  tableName: string,
  requiredColumns: readonly string[],
): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ${tableName}
  `;

  const columns = new Set(rows.map((row) => row.column_name));
  const missing = requiredColumns.filter((column) => !columns.has(column));

  if (missing.length > 0) {
    throw new Error(`Missing columns on ${tableName}: ${missing.join(', ')}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});