import { BillingService } from '../src/billing/billing.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main(): Promise<void> {
  const prisma = new PrismaService();
  const billing = new BillingService(prisma);

  try {
    await prisma.$connect();

    const byok = await billing.quote({
      providerId: 'groq',
      providerModelId: 'llama-3.3-70b-versatile',
      meter: 'TOKEN',
      usageQuantity: '1000000',
      credentialMode: 'BYOK',
      markupBps: 1500,
    });

    assertEqual(byok.baseCostUsdMicros.toString(), '0', 'BYOK base cost');
    assertEqual(byok.effectiveMarkupBps, 0, 'BYOK markup is zero');
    assertEqual(byok.markupUsdMicros.toString(), '0', 'BYOK markup cost');
    assertEqual(byok.totalCostUsdMicros.toString(), '0', 'BYOK total cost');

    const finova = await billing.quote({
      providerId: 'groq',
      providerModelId: 'llama-3.3-70b-versatile',
      meter: 'TOKEN',
      usageQuantity: '1000000',
      credentialMode: 'FINOVA_MANAGED',
      markupBps: 1500,
    });

    assertEqual(finova.baseCostUsdMicros.toString(), '790000', 'Finova base cost');
    assertEqual(finova.effectiveMarkupBps, 1500, 'Finova markup applies');
    assertEqual(finova.markupUsdMicros.toString(), '118500', 'Finova markup cost');
    assertEqual(finova.totalCostUsdMicros.toString(), '908500', 'Finova total cost');

    const minuteQuote = await billing.quote({
      providerId: 'deepgram',
      providerModelId: 'nova-2-conversationalai',
      meter: 'MINUTE',
      usageQuantity: '1.5',
      credentialMode: 'FINOVA_MANAGED',
      markupBps: 0,
    });
    assertEqual(minuteQuote.baseCostUsdMicros.toString(), '6450', 'Minute pricing');

    const charQuote = await billing.quote({
      providerId: 'rime',
      providerModelId: 'default',
      meter: 'CHARACTER',
      usageQuantity: '1000',
      credentialMode: 'FINOVA_MANAGED',
      markupBps: 0,
    });
    assertEqual(charQuote.baseCostUsdMicros.toString(), '20000', 'Character pricing');

    const placeholderQuote = await billing.quote({
      providerId: 'cartesia',
      providerModelId: 'default',
      meter: 'CHARACTER',
      usageQuantity: '1000',
      credentialMode: 'FINOVA_MANAGED',
      markupBps: 2500,
    });
    assertEqual(placeholderQuote.baseCostUsdMicros.toString(), '0', 'Placeholder base cost');
    assertEqual(placeholderQuote.totalCostUsdMicros.toString(), '0', 'Placeholder total cost');

    await expectThrows(
      () =>
        billing.quote({
          providerId: 'groq',
          providerModelId: 'does-not-exist',
          meter: 'TOKEN',
          usageQuantity: '1',
          credentialMode: 'FINOVA_MANAGED',
          markupBps: 0,
        }),
      'missing pricing row',
    );

    process.stdout.write('billing service smoke passed\n');
  } finally {
    await prisma.$disconnect();
  }
}

async function expectThrows(
  fn: () => Promise<unknown>,
  label: string,
): Promise<void> {
  let thrown = false;
  try {
    await fn();
  } catch {
    thrown = true;
  }

  if (!thrown) {
    throw new Error(`Expected ${label} to throw`);
  }
}

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});