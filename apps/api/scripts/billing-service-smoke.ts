import { BillingService } from '../src/billing/billing.service';

async function main(): Promise<void> {
  const runtimeProcess = (globalThis as any).process as {
    stdout: { write: (value: string) => void };
    stderr: { write: (value: string) => void };
    exit: (code: number) => never;
  };

  // Create BillingService without connecting to a real database and
  // override lookupRate with deterministic mock data so this smoke
  // script can run in CI/local without a Postgres instance.
  const billing = new BillingService(null as any);

  // Mock rate factory
  const makeRate = (providerId: string, providerModelId: string, meter: any, unitQuantity: bigint, priceUsdMicros: bigint, minChargeUsdMicros: bigint | null, roundingMode: any) => ({
    pricingVersionId: 'mock',
    pricingVersionNumber: 1,
    providerId,
    providerModelId,
    meter,
    currency: 'USD',
    unitQuantity,
    priceUsdMicros: priceUsdMicros,
    minChargeUsdMicros,
    roundingMode,
    effectiveFrom: new Date(),
    effectiveTo: null,
    notes: null,
  });

  // Override lookupRate to return expected snapshots for test inputs
  (billing as any).lookupRate = async (input: any) => {
    const { providerId, providerModelId, meter } = input;
    if (providerId === 'groq' && meter === 'TOKEN') {
      if (providerModelId === 'does-not-exist') {
        throw new Error('missing pricing row');
      }
      // tokens: unitQuantity = 1_000_000 (tokens scaled), price = 790000 micros ($0.79)
      return makeRate(providerId, providerModelId, meter, BigInt(1_000_000), BigInt(790000), null, 'HALF_UP');
    }
    if (providerId === 'deepgram' && meter === 'MINUTE') {
      // per-minute pricing: unitQuantity = 1 (minute), price = 4300 micros ($0.0043)
      return makeRate(providerId, providerModelId, meter, BigInt(1), BigInt(4300), null, 'HALF_UP');
    }
    if (providerId === 'rime' && meter === 'CHARACTER') {
      // characters: unitQuantity = 1000 chars, price = 20000 micros ($0.02)
      return makeRate(providerId, providerModelId, meter, BigInt(1000), BigInt(20000), null, 'HALF_UP');
    }
    if (providerId === 'cartesia') {
      return makeRate(providerId, providerModelId, meter, BigInt(1), BigInt(0), null, 'HALF_UP');
    }

    throw new Error(`No mock pricing for ${providerId}/${providerModelId}/${meter}`);
  };

  
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

    runtimeProcess.stdout.write('billing service smoke passed\n');
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
  const runtimeProcess = (globalThis as any).process as {
    stderr: { write: (value: string) => void };
    exit: (code: number) => never;
  };
  runtimeProcess.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  runtimeProcess.exit(1);
});