import { PrismaClient } from '@prisma/client';

import { PluginsService } from '../src/plugins/plugins.service';

const EXPECTED_PROVIDER_IDS = [
  'groq',
  'rime',
  'cartesia',
  'elevenlabs',
  'inworld',
  'deepgram',
  'assemblyai',
  'groq-whisper',
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const service = new PluginsService(
    prisma as never,
    { record: async () => undefined } as never,
    { get: () => undefined } as never,
  );

  try {
    const versions = await prisma.providerPricingVersion.findMany({
      include: { rates: true },
    });

    if (versions.length === 0) {
      throw new Error('No provider pricing versions were found');
    }

    const catalog = await service.catalog('smoke-org');
    const byId = new Map(catalog.providers.map((provider) => [provider.id, provider]));

    for (const providerId of EXPECTED_PROVIDER_IDS) {
      const provider = byId.get(providerId);
      if (!provider) {
        throw new Error(`Missing provider in catalog response: ${providerId}`);
      }

      if (!provider.pricing) {
        throw new Error(`Missing pricing metadata for provider: ${providerId}`);
      }

      if (typeof provider.pricing.version !== 'number') {
        throw new Error(`Invalid pricing version for provider: ${providerId}`);
      }

      for (const rate of provider.pricing.rates) {
        if (typeof rate.priceUsdMicros !== 'string') {
          throw new Error(`priceUsdMicros must be serialized as a string for ${providerId}`);
        }
        if (rate.minChargeUsdMicros !== null && typeof rate.minChargeUsdMicros !== 'string') {
          throw new Error(`minChargeUsdMicros must be a string or null for ${providerId}`);
        }
      }
    }

    const serialized = JSON.stringify(catalog);
    if (
      serialized.includes('secretCiphertext') ||
      serialized.includes('secretIv') ||
      serialized.includes('secretAuthTag')
    ) {
      throw new Error('Catalog response leaked secret credential fields');
    }

    process.stdout.write('provider pricing smoke passed\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});