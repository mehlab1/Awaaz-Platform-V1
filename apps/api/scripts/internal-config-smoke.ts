/**
 * Phase 5.1 — smoke test for GET /internal/agents/:id/config contract.
 * Run from repo root:
 *   pnpm --filter @awaaz/api exec dotenv -e ../../.env -- ts-node --files scripts/internal-config-smoke.ts
 */
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';

import { AppModule } from '../src/app.module';
import { InternalService } from '../src/internal/internal.service';

async function main(): Promise<void> {
  process.env.DISABLE_REDIS ??= 'true';
  const prisma = new PrismaClient();
  const agent = await prisma.agent.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      currentVersion: {
        isLive: true,
        ttsProviderId: 'rime',
      },
    },
    select: {
      id: true,
      name: true,
      currentVersion: {
        select: { voiceId: true, ttsProviderId: true, versionNumber: true },
      },
    },
  });
  if (!agent?.currentVersion) {
    throw new Error('No live Rime agent found for smoke test');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const internal = app.get(InternalService);
    const config = await internal.getAgentConfig(agent.id);

    const requiredTopLevel = [
      'agentId',
      'voiceId',
      'voiceModelId',
      'voiceLang',
      'pipeline',
      'credentials',
      'metadata',
    ] as const;
    for (const key of requiredTopLevel) {
      if (!(key in config)) {
        throw new Error(`Missing top-level field: ${key}`);
      }
    }

    if (config.pipeline.tts.providerId !== 'rime') {
      throw new Error(`Expected pipeline.tts.providerId=rime, got ${config.pipeline.tts.providerId}`);
    }
    if (!config.credentials.tts.apiKey?.trim()) {
      throw new Error('credentials.tts.apiKey is empty');
    }
    if (!config.metadata.ttsKeyFingerprint?.trim()) {
      throw new Error('metadata.ttsKeyFingerprint is empty');
    }
    if (config.credentials.tts.apiKey === config.metadata.ttsKeyFingerprint) {
      throw new Error('keyFingerprint must not equal apiKey');
    }
    if (config.voiceId !== config.pipeline.tts.voiceId) {
      throw new Error('legacy voiceId must match pipeline.tts.voiceId for Rime');
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          agentId: config.agentId,
          agentName: agent.name,
          versionNumber: config.metadata.agentVersionNumber,
          legacy: {
            voiceId: config.voiceId,
            voiceModelId: config.voiceModelId,
            voiceLang: config.voiceLang,
          },
          pipeline: config.pipeline,
          credentials: {
            tts: {
              providerId: config.credentials.tts.providerId,
              mode: config.credentials.tts.mode,
              keyFingerprint: config.credentials.tts.keyFingerprint,
              apiKeyPresent: Boolean(config.credentials.tts.apiKey),
            },
          },
          metadata: config.metadata,
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
