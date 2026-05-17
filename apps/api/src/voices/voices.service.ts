import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RimeService } from './rime.service';

@Injectable()
export class VoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rime: RimeService,
    private readonly storage: StorageService,
  ) {}

  list() {
    return this.prisma.voice.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async sync() {
    const voices = await this.rime.listVoices();
    const syncedAt = new Date();
    let previewCount = 0;
    const shouldUploadPreviews = this.storage.isConfigured();

    if (!shouldUploadPreviews) {
      const synced = await this.syncWithoutPreviews(voices, syncedAt);
      return {
        synced: synced.length,
        previewsUploaded: previewCount,
        voices: synced,
      };
    }

    const synced = await this.mapWithConcurrency(
      voices,
      2,
      async (voice) => {
        let previewAudioUrl: string | undefined;
        if (shouldUploadPreviews) {
          const preview = await this.rime.synthesizePreview(voice);
          previewAudioUrl = await this.storage.uploadBuffer(
            `voice-previews/${voice.rimeVoiceId}.wav`,
            preview,
            'audio/wav',
          );
          previewCount += 1;
        }

        return this.prisma.voice.upsert({
          where: { rimeVoiceId: voice.rimeVoiceId },
          create: {
            rimeVoiceId: voice.rimeVoiceId,
            name: voice.name,
            description: voice.description,
            language: voice.language,
            gender: voice.gender,
            previewAudioUrl,
            syncedAt,
          },
          update: {
            name: voice.name,
            description: voice.description,
            language: voice.language,
            gender: voice.gender,
            previewAudioUrl,
            isActive: true,
            syncedAt,
          },
        });
      },
    );

    return {
      synced: synced.length,
      previewsUploaded: previewCount,
      voices: synced,
    };
  }

  private async syncWithoutPreviews(
    voices: Awaited<ReturnType<RimeService['listVoices']>>,
    syncedAt: Date,
  ) {
    if (voices.length === 0) {
      return [];
    }

    const values = voices.map((voice) =>
      Prisma.sql`(${randomUUID()}, ${voice.rimeVoiceId}, ${voice.name}, ${
        voice.description ?? null
      }, ${voice.language}, ${
        voice.gender ?? null
      }, true, ${syncedAt}, ${syncedAt}, ${syncedAt})`,
    );

    await this.prisma.$executeRaw`
      INSERT INTO "voices" (
        "id",
        "rimeVoiceId",
        "name",
        "description",
        "language",
        "gender",
        "isActive",
        "syncedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("rimeVoiceId") DO UPDATE SET
        "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "language" = EXCLUDED."language",
        "gender" = EXCLUDED."gender",
        "isActive" = true,
        "syncedAt" = EXCLUDED."syncedAt",
        "updatedAt" = EXCLUDED."updatedAt"
    `;

    return this.prisma.voice.findMany({
      where: {
        rimeVoiceId: { in: voices.map((voice) => voice.rimeVoiceId) },
      },
      orderBy: { name: 'asc' },
    });
  }

  private async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    mapper: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = [];
    for (let index = 0; index < items.length; index += concurrency) {
      const chunk = items.slice(index, index + concurrency);
      results.push(...(await Promise.all(chunk.map(mapper))));
    }
    return results;
  }
}
