import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoicesController } from '../src/voices/voices.controller';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const controller = app.get(VoicesController);
  const prisma = app.get(PrismaService); // reuse the same client, no pool exhaustion

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'finova-solutions' } });

  // Mock request object representing an authenticated ADMIN session
  const req = {
    organizationId: org.id,
    userRole: 'ADMIN',
    user: { id: 'user_3Do8hbNCi3SeLo5dyC86hl7pttr' },
  } as any;

  console.log(`Org: ${org.name} (${org.id})`);

  // ── 1. Sync Cartesia ──────────────────────────────────────────────────────
  console.log('\n--- POST /api/v1/voices/sync?providerId=cartesia ---');
  const syncRes = await controller.sync(req, { providerId: 'cartesia' });
  console.log('Provider:', JSON.stringify(syncRes.provider, null, 2));

  // ── 2. Fetch updated catalog ──────────────────────────────────────────────
  console.log('\n--- GET /api/v1/voices?providerId=cartesia ---');
  const voices = await controller.list(req, { providerId: 'cartesia' });
  console.log(`Returned ${voices.length} voices.`);

  const withPreview = voices.filter((v: any) => v.previewPlaybackUrl);
  console.log(`Voices with previewPlaybackUrl: ${withPreview.length}`);

  if (withPreview.length > 0) {
    console.log('\nSample preview URLs:');
    withPreview.slice(0, 3).forEach((v: any) => {
      console.log(`  ${v.name}: ${v.previewPlaybackUrl}`);
    });
    console.log('\nRESULT: PASS - Cartesia preview URLs populated after sync.');
  } else {
    console.log('\nRESULT: FAIL - No previewPlaybackUrl found after sync.');
    console.log('Check that FINOVA_CARTESIA_API_KEY is valid and the provider returns preview_file_url.');
  }

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
