import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, ProviderCredentialMode, type Voice } from '@prisma/client';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { PluginsService, type ResolvedProviderSecret } from '../plugins/plugins.service';
import { providerById } from '../plugins/provider-catalog';
import { StorageService } from '../storage/storage.service';
import {
  ProviderVoiceCatalogService,
  type ExternalTtsVoiceProviderId,
  type ProviderVoiceCatalogItem,
} from './provider-voice-catalog.service';
import { RimeService, type RimeVoice } from './rime.service';

export interface ResolvedRimeVoice {
  rimeVoiceId: string;
  modelId: string;
  lang: string;
}

/** Provider-aware voice resolution for agent versions and worker runtime. */
export interface ResolvedTtsVoice {
  providerId: string;
  providerVoiceId: string;
  modelId: string;
  language: string;
  lang: string;
  /** Value persisted on AgentVersion.voiceId */
  storedVoiceId: string;
}

export type VoiceListItem = Voice & {
  provider: string;
  previewPlaybackUrl: string | null;
  previewPlaybackExpiresInSeconds: number | null;
};

interface ListVoicesOptions {
  organizationId?: string;
  providerId?: string;
}

interface SyncVoicesOptions {
  organizationId?: string;
  providerId?: string;
}

type VoiceSyncScope = 'global' | 'organization';

type VoiceSyncProviderResult = {
  providerId: string;
  synced: number;
  previewsUploaded: number;
  credentialMode: ProviderCredentialMode | null;
  scope: VoiceSyncScope;
  skipped?: boolean;
  error?: string;
};

const RIME_PROVIDER_ID = 'rime';
const CARTESIA_PROVIDER_ID = 'cartesia';
const WORKER_RUNTIME_TTS_PROVIDER_IDS = [RIME_PROVIDER_ID, CARTESIA_PROVIDER_ID] as const;
const EXTERNAL_TTS_PROVIDER_IDS = ['cartesia', 'elevenlabs', 'inworld'] as const;
const VOICE_PREVIEW_EXPIRES_IN_SECONDS = 3_600;
const VOICE_PREVIEW_CACHE_CONTROL = 'public, max-age=31536000, immutable';

@Injectable()
export class VoicesService {
  private readonly logger = new Logger(VoicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rime: RimeService,
    private readonly providerVoices: ProviderVoiceCatalogService,
    private readonly plugins: PluginsService,
    private readonly storage: StorageService,
  ) {}

  async list(options: ListVoicesOptions = {}): Promise<VoiceListItem[]> {
    const providerId = this.normalizeVoiceProviderId(options.providerId);
    const voices = await this.prisma.voice.findMany({
      where: {
        isActive: true,
        ...(providerId ? { providerId } : {}),
        ...this.visibleVoiceScope(options.organizationId),
      },
      orderBy: [{ providerId: 'asc' }, { name: 'asc' }],
    });

    return Promise.all(voices.map((voice) => this.withPreviewPlayback(voice)));
  }

  async preview(
    voiceId: string,
    organizationId?: string,
  ): Promise<Uint8Array> {
    const trimmed = voiceId.trim();
    const voiceRow = await this.findVoiceRow(trimmed, organizationId);
    if (voiceRow && !voiceRow.isActive) {
      throw new NotFoundException('Voice not found');
    }
    if (voiceRow && voiceRow.providerId !== RIME_PROVIDER_ID) {
      throw new BadRequestException(
        'Voice preview is currently available for Rime voices only',
      );
    }
    const resolved = await this.resolveForTts(trimmed, organizationId);
    this.logger.log(
      `Voice preview request voiceId=${trimmed} rimeSpeaker=${resolved.rimeVoiceId} modelId=${resolved.modelId} lang=${resolved.lang}`,
    );
    const rimeVoice = {
      rimeVoiceId: resolved.rimeVoiceId,
      name: voiceRow?.name ?? resolved.rimeVoiceId,
      language: resolved.lang,
      lang: resolved.lang,
      modelId: resolved.modelId,
    };
    const audio = await this.rime.synthesizePreview(rimeVoice);
    await this.storePreviewIfNeeded(rimeVoice, audio, voiceRow?.previewAudioUrl);
    return audio;
  }

  /**
   * Resolve a stored AgentVersion.voiceId for version persistence.
   * Works for any synced catalog voice; does not require worker runtime support.
   */
  async resolveVoiceForAgentVersion(
    storedVoiceId: string,
    organizationId?: string,
  ): Promise<ResolvedTtsVoice> {
    const trimmed = storedVoiceId.trim();
    if (!trimmed) {
      throw new NotFoundException('Voice not found');
    }

    const voiceRow = await this.findVoiceRow(trimmed, organizationId);
    if (voiceRow && !voiceRow.isActive) {
      throw new NotFoundException('Voice not found');
    }

    if (voiceRow) {
      if (voiceRow.providerId === RIME_PROVIDER_ID) {
        const rime = await this.resolveRimeVoice({
          rimeVoiceId: voiceRow.providerVoiceId || voiceRow.rimeVoiceId,
          name: voiceRow.name,
          description: voiceRow.description ?? undefined,
          language: voiceRow.language,
          lang: voiceRow.lang ?? undefined,
          modelId: voiceRow.modelId ?? undefined,
          gender: voiceRow.gender ?? undefined,
        });
        if (!rime.lang || !rime.modelId) {
          throw new ServiceUnavailableException(
            'Rime voice metadata is missing; run voice sync before using this voice',
          );
        }
        return {
          providerId: RIME_PROVIDER_ID,
          providerVoiceId: rime.rimeVoiceId,
          modelId: rime.modelId,
          language: rime.language,
          lang: rime.lang,
          storedVoiceId: rime.rimeVoiceId,
        };
      }

      const modelId =
        voiceRow.modelId?.trim() ||
        providerById(voiceRow.providerId)?.defaultModel ||
        voiceRow.providerId;
      return {
        providerId: voiceRow.providerId,
        providerVoiceId: voiceRow.providerVoiceId || voiceRow.rimeVoiceId,
        modelId,
        language: voiceRow.language,
        lang: voiceRow.lang ?? voiceRow.language,
        storedVoiceId: voiceRow.rimeVoiceId,
      };
    }

    if (this.isExternalScopedVoiceId(trimmed)) {
      throw new NotFoundException('Voice not found');
    }

    const rime = await this.resolveRimeVoice({
      rimeVoiceId: trimmed,
      name: trimmed,
      language: 'en',
    });
    if (!rime.lang || !rime.modelId) {
      throw new ServiceUnavailableException(
        'Rime voice metadata is missing; run voice sync before using this voice',
      );
    }
    return {
      providerId: RIME_PROVIDER_ID,
      providerVoiceId: rime.rimeVoiceId,
      modelId: rime.modelId,
      language: rime.language,
      lang: rime.lang,
      storedVoiceId: rime.rimeVoiceId,
    };
  }

  /**
   * Resolve voice + validate worker runtime support.
   * Rime and Cartesia are supported in the worker; other providers return a clear error.
   */
  async resolveTtsForRuntime(
    storedVoiceId: string,
    organizationId?: string,
  ): Promise<ResolvedTtsVoice> {
    const resolved = await this.resolveVoiceForAgentVersion(
      storedVoiceId,
      organizationId,
    );
    if (
      !WORKER_RUNTIME_TTS_PROVIDER_IDS.includes(
        resolved.providerId as (typeof WORKER_RUNTIME_TTS_PROVIDER_IDS)[number],
      )
    ) {
      throw new ServiceUnavailableException(
        `TTS provider "${resolved.providerId}" is not supported by the worker runtime yet. ` +
          'Use a Rime or Cartesia voice for live calls and Test Agent.',
      );
    }
    this.logger.log(
      `Resolved voice for runtime stored=${storedVoiceId.trim()} ` +
        `provider=${resolved.providerId} voiceId=${resolved.providerVoiceId} ` +
        `modelId=${resolved.modelId} lang=${resolved.lang}`,
    );
    return resolved;
  }

  /**
   * Resolve a stored AgentVersion.voiceId (rime id or legacy DB id) to the exact
   * Rime speaker + model + lang tuple used by preview and the Python worker.
   */
  async resolveForTts(
    storedVoiceId: string,
    organizationId?: string,
  ): Promise<ResolvedRimeVoice> {
    const resolved = await this.resolveVoiceForAgentVersion(
      storedVoiceId,
      organizationId,
    );
    if (resolved.providerId !== RIME_PROVIDER_ID) {
      throw new ServiceUnavailableException(
        'Only Rime voices are supported by the current preview runtime',
      );
    }
    return {
      rimeVoiceId: resolved.providerVoiceId,
      modelId: resolved.modelId,
      lang: resolved.lang,
    };
  }

  async sync(options: SyncVoicesOptions = {}) {
    const providerId = this.normalizeVoiceProviderId(options.providerId);
    if (providerId) {
      const result = await this.syncProvider(providerId, options.organizationId);
      return {
        synced: result.voices.length,
        previewsUploaded: result.provider.previewsUploaded,
        providers: [result.provider],
        voices: result.voices,
      };
    }

    const providers = [
      RIME_PROVIDER_ID,
      ...EXTERNAL_TTS_PROVIDER_IDS,
    ];
    const providerResults: VoiceSyncProviderResult[] = [];
    const allVoices: Voice[] = [];

    for (const provider of providers) {
      try {
        const result = await this.syncProvider(provider, options.organizationId);
        providerResults.push(result.provider);
        allVoices.push(...result.voices);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Voice sync failed for provider=${provider}: ${message}`);
        providerResults.push({
          providerId: provider,
          synced: 0,
          previewsUploaded: 0,
          credentialMode: null,
          scope: 'global',
          error: message,
        });
      }
    }

    return {
      synced: allVoices.length,
      previewsUploaded: providerResults.reduce(
        (sum, result) => sum + result.previewsUploaded,
        0,
      ),
      providers: providerResults,
      voices: allVoices,
    };
  }

  private async syncProvider(
    providerId: string,
    organizationId?: string,
  ): Promise<{ provider: VoiceSyncProviderResult; voices: Voice[] }> {
    if (providerId === RIME_PROVIDER_ID) {
      return this.syncRimeVoices();
    }
    if (!this.isExternalTtsProviderId(providerId)) {
      throw new BadRequestException(`Unsupported voice provider: ${providerId}`);
    }
    return this.syncExternalProviderVoices(providerId, organizationId);
  }

  private async syncRimeVoices(): Promise<{
    provider: VoiceSyncProviderResult;
    voices: Voice[];
  }> {
    const voices = await this.rime.listVoices();
    const syncedAt = new Date();
    let previewCount = 0;
    const shouldUploadPreviews = this.storage.isConfigured();
    const existingPreviewByVoiceId = shouldUploadPreviews
      ? await this.existingPreviewMap(voices.map((voice) => voice.rimeVoiceId))
      : new Map<string, string | null>();

    if (!shouldUploadPreviews) {
      const synced = await this.syncWithoutPreviews(voices, syncedAt);
      return {
        provider: {
          providerId: RIME_PROVIDER_ID,
          synced: synced.length,
          previewsUploaded: previewCount,
          credentialMode: ProviderCredentialMode.FINOVA_MANAGED,
          scope: 'global',
        },
        voices: synced,
      };
    }

    const synced = await this.mapWithConcurrency(
      voices,
      2,
      async (voice) => {
        let previewAudioUrl =
          existingPreviewByVoiceId.get(voice.rimeVoiceId) ?? undefined;
        const previewObjectKey = this.previewObjectKey(voice);
        if (
          shouldUploadPreviews &&
          !this.previewCanBeReused(previewAudioUrl, previewObjectKey)
        ) {
          const preview = await this.rime.synthesizePreview(voice);
          previewAudioUrl = await this.uploadPreviewAudio(previewObjectKey, preview);
          previewCount += 1;
        }

        return this.prisma.voice.upsert({
          where: { rimeVoiceId: voice.rimeVoiceId },
          create: {
            providerId: RIME_PROVIDER_ID,
            providerVoiceId: voice.rimeVoiceId,
            rimeVoiceId: voice.rimeVoiceId,
            name: voice.name,
            description: voice.description,
            language: voice.language,
            lang: voice.lang,
            modelId: voice.modelId,
            gender: voice.gender,
            metadata: this.rimeVoiceMetadata(voice),
            previewAudioUrl,
            syncedAt,
          },
          update: {
            providerId: RIME_PROVIDER_ID,
            providerVoiceId: voice.rimeVoiceId,
            name: voice.name,
            description: voice.description,
            language: voice.language,
            lang: voice.lang,
            modelId: voice.modelId,
            gender: voice.gender,
            metadata: this.rimeVoiceMetadata(voice),
            previewAudioUrl,
            isActive: true,
            syncedAt,
          },
        });
      },
    );

    return {
      provider: {
        providerId: RIME_PROVIDER_ID,
        synced: synced.length,
        previewsUploaded: previewCount,
        credentialMode: ProviderCredentialMode.FINOVA_MANAGED,
        scope: 'global',
      },
      voices: synced,
    };
  }

  private async syncExternalProviderVoices(
    providerId: ExternalTtsVoiceProviderId,
    organizationId?: string,
  ): Promise<{ provider: VoiceSyncProviderResult; voices: Voice[] }> {
    const secret = await this.providerSecret(providerId, organizationId);
    if (!secret.ok) {
      throw new ServiceUnavailableException(secret.error);
    }

    const scopeOrganizationId =
      secret.credentialMode === ProviderCredentialMode.BYOK
        ? organizationId
        : undefined;
    if (secret.credentialMode === ProviderCredentialMode.BYOK && !scopeOrganizationId) {
      throw new ServiceUnavailableException(
        `BYOK voice sync for ${providerId} requires an organization scope`,
      );
    }

    const providerVoices = await this.providerVoices.listVoices(
      providerId,
      secret.key,
    );
    const syncedAt = new Date();
    const synced = await this.mapWithConcurrency(
      providerVoices,
      8,
      (voice) =>
        this.upsertExternalProviderVoice(
          voice,
          syncedAt,
          secret,
          scopeOrganizationId,
        ),
    );
    await this.plugins.markProviderCredentialUsed(secret.credentialId);

    return {
      provider: {
        providerId,
        synced: synced.length,
        previewsUploaded: 0,
        credentialMode: secret.credentialMode,
        scope: scopeOrganizationId ? 'organization' : 'global',
      },
      voices: synced,
    };
  }

  private async upsertExternalProviderVoice(
    voice: ProviderVoiceCatalogItem,
    syncedAt: Date,
    secret: ResolvedProviderSecret & { ok: true },
    organizationId?: string,
  ): Promise<Voice> {
    const legacyVoiceId = this.providerScopedVoiceId(
      voice.providerId,
      voice.providerVoiceId,
      organizationId,
    );
    const metadata = this.providerVoiceMetadata(voice, secret, organizationId);

    return this.prisma.voice.upsert({
      where: { rimeVoiceId: legacyVoiceId },
      create: {
        organizationId: organizationId ?? null,
        providerId: voice.providerId,
        providerVoiceId: voice.providerVoiceId,
        rimeVoiceId: legacyVoiceId,
        name: voice.name,
        description: voice.description ?? null,
        language: voice.language,
        lang: voice.lang ?? null,
        modelId: voice.modelId ?? null,
        gender: voice.gender ?? null,
        previewAudioUrl: voice.previewAudioUrl ?? null,
        metadata,
        syncedAt,
      },
      update: {
        organizationId: organizationId ?? null,
        providerId: voice.providerId,
        providerVoiceId: voice.providerVoiceId,
        name: voice.name,
        description: voice.description ?? null,
        language: voice.language,
        lang: voice.lang ?? null,
        modelId: voice.modelId ?? null,
        gender: voice.gender ?? null,
        previewAudioUrl: voice.previewAudioUrl ?? null,
        metadata,
        isActive: true,
        syncedAt,
      },
    });
  }

  private async syncWithoutPreviews(
    voices: Awaited<ReturnType<RimeService['listVoices']>>,
    syncedAt: Date,
  ) {
    if (voices.length === 0) {
      return [];
    }

    const values = voices.map((voice) =>
      Prisma.sql`(${randomUUID()}, null, ${RIME_PROVIDER_ID}, ${
        voice.rimeVoiceId
      }, ${voice.rimeVoiceId}, ${voice.name}, ${voice.description ?? null}, ${
        voice.language
      }, ${voice.lang ?? null}, ${voice.modelId ?? null}, ${
        voice.gender ?? null
      }, ${JSON.stringify(this.rimeVoiceMetadata(voice))}::jsonb, true, ${
        syncedAt
      }, ${syncedAt}, ${syncedAt})`,
    );

    await this.prisma.$executeRaw`
      INSERT INTO "voices" (
        "id",
        "organizationId",
        "providerId",
        "providerVoiceId",
        "rimeVoiceId",
        "name",
        "description",
        "language",
        "lang",
        "modelId",
        "gender",
        "metadata",
        "isActive",
        "syncedAt",
        "createdAt",
        "updatedAt"
      )
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("rimeVoiceId") DO UPDATE SET
        "organizationId" = EXCLUDED."organizationId",
        "providerId" = EXCLUDED."providerId",
        "providerVoiceId" = EXCLUDED."providerVoiceId",
        "name" = EXCLUDED."name",
        "description" = EXCLUDED."description",
        "language" = EXCLUDED."language",
        "lang" = EXCLUDED."lang",
        "modelId" = EXCLUDED."modelId",
        "gender" = EXCLUDED."gender",
        "metadata" = EXCLUDED."metadata",
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

  private async withPreviewPlayback(voice: Voice): Promise<VoiceListItem> {
    try {
      const playback = await this.previewPlaybackForStoredValue(
        voice.previewAudioUrl,
      );
      return {
        ...voice,
        provider: voice.providerId,
        previewPlaybackUrl: playback?.url ?? null,
        previewPlaybackExpiresInSeconds: playback?.expiresInSeconds ?? null,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not prepare stored preview URL for voice=${voice.rimeVoiceId}: ${message}`,
      );
      return {
        ...voice,
        provider: voice.providerId,
        previewPlaybackUrl: null,
        previewPlaybackExpiresInSeconds: null,
      };
    }
  }

  private async previewPlaybackForStoredValue(
    value: string | null,
  ): Promise<{ url: string; expiresInSeconds: number | null } | null> {
    const raw = value?.trim();
    if (!raw) {
      return null;
    }
    if (this.isHttpUrl(raw)) {
      return { url: raw, expiresInSeconds: null };
    }

    const publicUrl = this.storage.getPublicUrl(raw);
    if (publicUrl) {
      return { url: publicUrl, expiresInSeconds: null };
    }
    if (!this.storage.isConfigured()) {
      return null;
    }

    const objectKey = this.storage.normalizeObjectKey(raw);
    if (!objectKey) {
      return null;
    }

    return {
      url: await this.storage.getPresignedUrl(
        objectKey,
        VOICE_PREVIEW_EXPIRES_IN_SECONDS,
        'audio/wav',
      ),
      expiresInSeconds: VOICE_PREVIEW_EXPIRES_IN_SECONDS,
    };
  }

  private async existingPreviewMap(
    rimeVoiceIds: string[],
  ): Promise<Map<string, string | null>> {
    if (rimeVoiceIds.length === 0) {
      return new Map();
    }

    const existing = await this.prisma.voice.findMany({
      where: { rimeVoiceId: { in: rimeVoiceIds } },
      select: { rimeVoiceId: true, previewAudioUrl: true },
    });
    return new Map(
      existing.map((voice) => [voice.rimeVoiceId, voice.previewAudioUrl]),
    );
  }

  private async findVoiceRow(
    storedVoiceId: string,
    organizationId?: string,
  ): Promise<Voice | null> {
    const trimmed = storedVoiceId.trim();
    if (!trimmed) {
      return null;
    }
    const identifierWhere: Prisma.VoiceWhereInput[] = [
      { id: trimmed },
      { rimeVoiceId: trimmed },
      { providerVoiceId: trimmed },
    ];
    if (organizationId) {
      const organizationVoice = await this.prisma.voice.findFirst({
        where: {
          organizationId,
          OR: identifierWhere,
        },
      });
      if (organizationVoice) {
        return organizationVoice;
      }
    }
    return this.prisma.voice.findFirst({
      where: {
        organizationId: null,
        OR: identifierWhere,
      },
    });
  }

  private async storePreviewIfNeeded(
    voice: RimeVoice,
    audio: Uint8Array,
    existingPreviewAudioUrl: string | null | undefined,
  ): Promise<void> {
    if (!this.storage.isConfigured()) {
      return;
    }

    const objectKey = this.previewObjectKey(voice);
    if (this.previewCanBeReused(existingPreviewAudioUrl, objectKey)) {
      return;
    }

    try {
      await this.uploadPreviewAudio(objectKey, audio);
      await this.prisma.voice.updateMany({
        where: { rimeVoiceId: voice.rimeVoiceId },
        data: { previewAudioUrl: objectKey },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Could not store generated preview for voice=${voice.rimeVoiceId}: ${message}`,
      );
    }
  }

  private previewCanBeReused(
    storedValue: string | null | undefined,
    expectedObjectKey: string,
  ): boolean {
    const raw = storedValue?.trim();
    if (!raw) {
      return false;
    }
    if (this.isHttpUrl(raw)) {
      return true;
    }
    return this.storage.normalizeObjectKey(raw) === expectedObjectKey;
  }

  private uploadPreviewAudio(
    objectKey: string,
    audio: Uint8Array,
  ): Promise<string> {
    return this.storage.uploadBuffer(objectKey, audio, 'audio/wav', {
      cacheControl: VOICE_PREVIEW_CACHE_CONTROL,
    });
  }

  private previewObjectKey(voice: RimeVoice): string {
    const modelId = this.cleanPreviewObjectKeyPart(voice.modelId ?? 'mistv2');
    const lang = this.cleanPreviewObjectKeyPart(voice.lang ?? 'eng');
    const speaker = this.cleanPreviewObjectKeyPart(voice.rimeVoiceId);
    return `voice-previews/${modelId}/${lang}/${speaker}.wav`;
  }

  private cleanPreviewObjectKeyPart(value: string): string {
    return value
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unknown';
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
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
        providerId: RIME_PROVIDER_ID,
        providerVoiceId: fresh.rimeVoiceId,
        language: fresh.language,
        lang: fresh.lang,
        modelId: fresh.modelId,
        metadata: this.rimeVoiceMetadata(fresh),
      },
    });

    return fresh;
  }

  private normalizeVoiceProviderId(providerId: string | undefined): string | undefined {
    const normalized = providerId?.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    const provider = providerById(normalized);
    if (!provider || provider.kind !== 'tts') {
      throw new BadRequestException(`Unsupported voice provider: ${providerId}`);
    }
    return provider.id;
  }

  private visibleVoiceScope(organizationId: string | undefined): Prisma.VoiceWhereInput {
    if (!organizationId) {
      return { organizationId: null };
    }
    return {
      OR: [{ organizationId: null }, { organizationId }],
    };
  }

  private rimeVoiceMetadata(voice: RimeVoice): Prisma.InputJsonObject {
    return {
      source: 'rime_voice_sync',
      providerId: RIME_PROVIDER_ID,
      providerVoiceId: voice.rimeVoiceId,
      modelId: voice.modelId ?? null,
      lang: voice.lang ?? null,
    };
  }

  private async providerSecret(
    providerId: ExternalTtsVoiceProviderId,
    organizationId?: string,
  ): Promise<ResolvedProviderSecret> {
    if (organizationId) {
      return this.plugins.resolveOrganizationProviderSecret(
        organizationId,
        providerId,
      );
    }
    return this.plugins.resolveFinovaManagedProviderSecret(providerId);
  }

  private providerScopedVoiceId(
    providerId: ExternalTtsVoiceProviderId,
    providerVoiceId: string,
    organizationId?: string,
  ): string {
    const prefix = organizationId
      ? `org:${organizationId}:${providerId}`
      : providerId;
    return `${prefix}:${providerVoiceId}`;
  }

  private providerVoiceMetadata(
    voice: ProviderVoiceCatalogItem,
    secret: ResolvedProviderSecret & { ok: true },
    organizationId?: string,
  ): Prisma.InputJsonObject {
    return {
      ...voice.metadata,
      source: `${voice.providerId}_voice_sync`,
      providerId: voice.providerId,
      providerVoiceId: voice.providerVoiceId,
      credentialMode: secret.credentialMode,
      credentialScope: organizationId ? 'organization' : 'global',
      organizationId: organizationId ?? null,
    };
  }

  private isExternalTtsProviderId(
    providerId: string,
  ): providerId is ExternalTtsVoiceProviderId {
    return EXTERNAL_TTS_PROVIDER_IDS.some((candidate) => candidate === providerId);
  }

  private isExternalScopedVoiceId(storedVoiceId: string): boolean {
    const prefix = storedVoiceId.split(':')[0]?.toLowerCase();
    return EXTERNAL_TTS_PROVIDER_IDS.some((providerId) => providerId === prefix);
  }
}
