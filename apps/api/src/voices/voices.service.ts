import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { RimeService, type RimeVoice } from './rime.service';

export interface ResolvedRimeVoice {
  rimeVoiceId: string;
  modelId: string;
  lang: string;
}

@Injectable()
export class VoicesService {
  private readonly logger = new Logger(VoicesService.name);

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

  async preview(voiceId: string): Promise<Uint8Array> {
    const trimmed = voiceId.trim();
    const voiceRow = await this.prisma.voice.findUnique({
      where: { rimeVoiceId: trimmed },
    });
    if (voiceRow && !voiceRow.isActive) {
      throw new NotFoundException('Voice not found');
    }
    const resolved = await this.resolveForTts(trimmed);
    this.logger.log(
      `Voice preview request voiceId=${trimmed} rimeSpeaker=${resolved.rimeVoiceId} modelId=${resolved.modelId} lang=${resolved.lang}`,
    );
    return this.rime.synthesizePreview({
      rimeVoiceId: resolved.rimeVoiceId,
      name: resolved.rimeVoiceId,
      language: resolved.lang,
      lang: resolved.lang,
      modelId: resolved.modelId,
    });
  }

  /**
   * Resolve a stored AgentVersion.voiceId (rime id or legacy DB id) to the exact
   * Rime speaker + model + lang tuple used by preview and the Python worker.
   */
  async resolveForTts(storedVoiceId: string): Promise<ResolvedRimeVoice> {
    const trimmed = storedVoiceId.trim();
    if (!trimmed) {
      throw new NotFoundException('Voice not found');
    }

    const voiceRow =
      (await this.prisma.voice.findUnique({
        where: { rimeVoiceId: trimmed },
      })) ??
      (await this.prisma.voice.findUnique({
        where: { id: trimmed },
      }));

    const rimeVoice: RimeVoice = voiceRow
      ? {
          rimeVoiceId: voiceRow.rimeVoiceId,
          name: voiceRow.name,
          description: voiceRow.description ?? undefined,
          language: voiceRow.language,
          lang: voiceRow.lang ?? undefined,
          modelId: voiceRow.modelId ?? undefined,
          gender: voiceRow.gender ?? undefined,
        }
      : {
          rimeVoiceId: trimmed,
          name: trimmed,
          language: 'en',
        };

    const resolved = await this.resolveRimeVoice(rimeVoice);
    if (!resolved.lang || !resolved.modelId) {
      throw new ServiceUnavailableException(
        'Rime voice metadata is missing; run voice sync before using this voice',
      );
    }

    const result: ResolvedRimeVoice = {
      rimeVoiceId: resolved.rimeVoiceId,
      modelId: resolved.modelId,
      lang: resolved.lang,
    };
    this.logger.log(
      `Resolved voice for TTS stored=${trimmed} rimeVoiceId=${result.rimeVoiceId} modelId=${result.modelId} lang=${result.lang}`,
    );
    return result;
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
            lang: voice.lang,
            modelId: voice.modelId,
            gender: voice.gender,
            previewAudioUrl,
            syncedAt,
          },
          update: {
            name: voice.name,
            description: voice.description,
            language: voice.language,
            lang: voice.lang,
            modelId: voice.modelId,
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
      }, ${voice.language}, ${voice.lang ?? null}, ${voice.modelId ?? null}, ${
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
        "lang",
        "modelId",
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
        "lang" = EXCLUDED."lang",
        "modelId" = EXCLUDED."modelId",
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

  private async resolveRimeVoice(voice: RimeVoice): Promise<RimeVoice> {
    if (voice.lang && voice.modelId) {
      return voice;
    }

    const voices = await this.rime.listVoices();
    const fresh = voices.find((candidate) => candidate.rimeVoiceId === voice.rimeVoiceId);
    if (!fresh) {
      return voice;
    }

    await this.prisma.voice.update({
      where: { rimeVoiceId: voice.rimeVoiceId },
      data: {
        language: fresh.language,
        lang: fresh.lang,
        modelId: fresh.modelId,
      },
    });

    return fresh;
  }
}
