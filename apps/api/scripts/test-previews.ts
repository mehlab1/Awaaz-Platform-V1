import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { VoicesController } from '../src/voices/voices.controller';
import { VoicesService } from '../src/voices/voices.service';
import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const controller = app.get(VoicesController);
  const prisma = app.get(PrismaService);
  const voices = app.get(VoicesService);

  const org = await prisma.organization.findUniqueOrThrow({ where: { slug: 'finova-solutions' } });

  const req = {
    organizationId: org.id,
    userRole: 'ADMIN',
    user: { id: 'user_test' },
  } as any;

  // Sync Cartesia and Inworld
  console.log('\n--- Sync Cartesia ---');
  await controller.sync(req, { providerId: 'cartesia' });
  console.log('--- Sync Inworld ---');
  await controller.sync(req, { providerId: 'inworld' });

  // Helper to preview first voice of a provider
  async function previewFirst(providerId: string) {
    const providerVoices = await controller.list(req, { providerId });
    const voice = providerVoices.find((v: any) => v.previewPlaybackUrl);
    if (!voice) {
      console.log(`No preview available for provider ${providerId}`);
      return;
    }
    // Retrieve preview via service to get raw Uint8Array
    const audio = await voices.preview(voice.id, req.organizationId);
    console.log(`Preview for ${providerId} voice ${voice.name}: ${audio.byteLength} bytes`);
  }

  await previewFirst('cartesia');
  await previewFirst('inworld');

  await app.close();
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
