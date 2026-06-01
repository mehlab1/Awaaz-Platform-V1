import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type ExternalTtsVoiceProviderId = 'cartesia' | 'elevenlabs' | 'inworld';

export interface ProviderVoiceCatalogItem {
  providerId: ExternalTtsVoiceProviderId;
  providerVoiceId: string;
  name: string;
  description?: string;
  language: string;
  lang?: string;
  gender?: string;
  modelId?: string;
  previewAudioUrl?: string;
  metadata: Prisma.InputJsonObject;
}

const CARTESIA_API_VERSION = '2026-03-01';
const CARTESIA_VOICES_URL = 'https://api.cartesia.ai/voices';
const ELEVENLABS_VOICES_URL = 'https://api.elevenlabs.io/v2/voices';
const INWORLD_VOICES_URL = 'https://api.inworld.ai/voices/v1/voices';
const CARTESIA_DEFAULT_TTS_MODEL = 'sonic-3.5';
const INWORLD_DEFAULT_TTS_MODEL = 'inworld-tts-2';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_PAGES = 100;

@Injectable()
export class ProviderVoiceCatalogService {
  private readonly logger = new Logger(ProviderVoiceCatalogService.name);

  async listVoices(
    providerId: ExternalTtsVoiceProviderId,
    apiKey: string,
  ): Promise<ProviderVoiceCatalogItem[]> {
    switch (providerId) {
      case 'cartesia':
        return this.listCartesiaVoices(apiKey);
      case 'elevenlabs':
        return this.listElevenLabsVoices(apiKey);
      case 'inworld':
        return this.listInworldVoices(apiKey);
    }
  }

  private async listCartesiaVoices(
    apiKey: string,
  ): Promise<ProviderVoiceCatalogItem[]> {
    const voices: ProviderVoiceCatalogItem[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(CARTESIA_VOICES_URL);
      url.searchParams.set('limit', '100');
      url.searchParams.append('expand[]', 'preview_file_url');
      if (cursor) {
        url.searchParams.set('starting_after', cursor);
      }

      const payload = await this.fetchJson('cartesia', url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Cartesia-Version': CARTESIA_API_VERSION,
        },
      });
      const rows = this.recordArrayField(payload, 'data');
      voices.push(
        ...rows
          .map((row) => this.normalizeCartesiaVoice(row))
          .filter((voice): voice is ProviderVoiceCatalogItem => voice !== null),
      );

      const hasMore = this.booleanField(payload, 'has_more') === true;
      if (!hasMore || rows.length === 0) {
        break;
      }
      cursor =
        this.stringField(payload, 'next_page') ??
        this.stringField(rows[rows.length - 1], 'id') ??
        null;
      if (!cursor) {
        break;
      }
    }

    this.logger.log(`Cartesia voices loaded: ${voices.length}`);
    return this.dedupeVoices(voices);
  }

  private async listElevenLabsVoices(
    apiKey: string,
  ): Promise<ProviderVoiceCatalogItem[]> {
    const voices: ProviderVoiceCatalogItem[] = [];
    let nextPageToken: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(ELEVENLABS_VOICES_URL);
      url.searchParams.set('page_size', '100');
      url.searchParams.set('include_total_count', 'false');
      if (nextPageToken) {
        url.searchParams.set('next_page_token', nextPageToken);
      }

      const payload = await this.fetchJson('elevenlabs', url, {
        headers: { 'xi-api-key': apiKey },
      });
      const rows = this.recordArrayField(payload, 'voices');
      voices.push(
        ...rows
          .map((row) => this.normalizeElevenLabsVoice(row))
          .filter((voice): voice is ProviderVoiceCatalogItem => voice !== null),
      );

      const hasMore = this.booleanField(payload, 'has_more') === true;
      nextPageToken = this.stringField(payload, 'next_page_token') ?? null;
      if (!hasMore || !nextPageToken) {
        break;
      }
    }

    this.logger.log(`ElevenLabs voices loaded: ${voices.length}`);
    return this.dedupeVoices(voices);
  }

  private async listInworldVoices(
    apiKey: string,
  ): Promise<ProviderVoiceCatalogItem[]> {
    const voices: ProviderVoiceCatalogItem[] = [];
    let pageToken: string | null = null;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(INWORLD_VOICES_URL);
      url.searchParams.set('pageSize', '2000');
      url.searchParams.set('orderBy', 'display_name asc');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const payload = await this.fetchJson('inworld', url, {
        headers: { Authorization: `Basic ${apiKey}` },
      });
      const rows = this.recordArrayField(payload, 'voices');
      voices.push(
        ...rows
          .map((row) => this.normalizeInworldVoice(row))
          .filter((voice): voice is ProviderVoiceCatalogItem => voice !== null),
      );

      pageToken = this.stringField(payload, 'nextPageToken') ?? null;
      if (!pageToken) {
        break;
      }
    }

    this.logger.log(`Inworld voices loaded: ${voices.length}`);
    return this.dedupeVoices(voices);
  }

  private normalizeCartesiaVoice(
    raw: Record<string, unknown>,
  ): ProviderVoiceCatalogItem | null {
    const providerVoiceId = this.stringField(raw, 'id');
    if (!providerVoiceId) {
      return null;
    }
    const language = this.baseLanguageCode(this.stringField(raw, 'language')) ?? 'en';
    const previewAudioUrl =
      this.stringField(raw, 'preview_file_url') ??
      this.stringField(raw, 'previewFileUrl') ??
      this.stringField(raw, 'preview_url');

    return {
      providerId: 'cartesia',
      providerVoiceId,
      name: this.stringField(raw, 'name') ?? providerVoiceId,
      description: this.stringField(raw, 'description'),
      language,
      lang: this.stringField(raw, 'language'),
      gender: this.stringField(raw, 'gender'),
      modelId: CARTESIA_DEFAULT_TTS_MODEL,
      previewAudioUrl,
      metadata: this.compactJson({
        source: 'cartesia_voice_sync',
        providerId: 'cartesia',
        providerVoiceId,
        previewModelId: CARTESIA_DEFAULT_TTS_MODEL,
        country: this.stringField(raw, 'country'),
        isOwner: this.booleanField(raw, 'is_owner'),
        isPublic: this.booleanField(raw, 'is_public'),
        createdAt: this.stringField(raw, 'created_at'),
        hasPreviewFileUrl: Boolean(previewAudioUrl),
      }),
    };
  }

  private normalizeElevenLabsVoice(
    raw: Record<string, unknown>,
  ): ProviderVoiceCatalogItem | null {
    const providerVoiceId = this.stringField(raw, 'voice_id');
    if (!providerVoiceId) {
      return null;
    }
    const labels = this.stringRecordField(raw, 'labels');
    const verifiedLanguages = this.recordArrayField(raw, 'verified_languages');
    const firstVerifiedLanguage = verifiedLanguages[0];
    const verifiedLanguage = firstVerifiedLanguage
      ? this.stringField(firstVerifiedLanguage, 'language')
      : undefined;
    const verifiedLocale = firstVerifiedLanguage
      ? this.stringField(firstVerifiedLanguage, 'locale')
      : undefined;
    const language =
      this.baseLanguageCode(verifiedLanguage) ??
      this.baseLanguageCode(verifiedLocale) ??
      this.baseLanguageCode(labels.language) ??
      'en';
    const highQualityModelIds = this.stringArrayField(
      raw,
      'high_quality_base_model_ids',
    );
    const modelId =
      (firstVerifiedLanguage
        ? this.stringField(firstVerifiedLanguage, 'model_id')
        : undefined) ?? highQualityModelIds[0];
    const previewAudioUrl =
      this.stringField(raw, 'preview_url') ??
      (firstVerifiedLanguage
        ? this.stringField(firstVerifiedLanguage, 'preview_url')
        : undefined);

    return {
      providerId: 'elevenlabs',
      providerVoiceId,
      name: this.stringField(raw, 'name') ?? providerVoiceId,
      description: this.stringField(raw, 'description'),
      language,
      lang: verifiedLocale ?? verifiedLanguage,
      gender: labels.gender,
      modelId,
      previewAudioUrl,
      metadata: this.compactJson({
        source: 'elevenlabs_voice_sync',
        providerId: 'elevenlabs',
        providerVoiceId,
        category: this.stringField(raw, 'category'),
        labels,
        highQualityBaseModelIds: highQualityModelIds,
        verifiedLanguages: verifiedLanguages.map((item) =>
          this.compactJson({
            language: this.stringField(item, 'language'),
            locale: this.stringField(item, 'locale'),
            accent: this.stringField(item, 'accent'),
            modelId: this.stringField(item, 'model_id'),
            hasPreviewUrl: Boolean(this.stringField(item, 'preview_url')),
          }),
        ),
        isOwner: this.booleanField(raw, 'is_owner'),
        isLegacy: this.booleanField(raw, 'is_legacy'),
        isMixed: this.booleanField(raw, 'is_mixed'),
        recordingQuality: this.stringField(raw, 'recording_quality'),
        hasPreviewUrl: Boolean(previewAudioUrl),
      }),
    };
  }

  private normalizeInworldVoice(
    raw: Record<string, unknown>,
  ): ProviderVoiceCatalogItem | null {
    const providerVoiceId = this.stringField(raw, 'voiceId');
    if (!providerVoiceId) {
      return null;
    }
    const langCode = this.stringField(raw, 'langCode');
    const promptLanguages = this.stringArrayField(raw, 'promptLanguages');
    const language =
      this.baseLanguageCode(langCode) ??
      this.baseLanguageCode(promptLanguages[0]) ??
      'en';
    const tags = this.stringArrayField(raw, 'tags');

    return {
      providerId: 'inworld',
      providerVoiceId,
      name:
        this.stringField(raw, 'displayName') ??
        this.stringField(raw, 'name') ??
        providerVoiceId,
      description: this.stringField(raw, 'description'),
      language,
      lang: langCode ?? promptLanguages[0],
      gender: this.stringField(raw, 'gender') || this.genderFromTags(tags),
      modelId: INWORLD_DEFAULT_TTS_MODEL,
      metadata: this.compactJson({
        source: 'inworld_voice_sync',
        providerId: 'inworld',
        providerVoiceId,
        resourceName: this.stringField(raw, 'name'),
        sourceType: this.stringField(raw, 'source'),
        ageGroup: this.stringField(raw, 'ageGroup'),
        categories: this.stringArrayField(raw, 'categories'),
        tags,
        promptLanguages,
        previewModelId: INWORLD_DEFAULT_TTS_MODEL,
      }),
    };
  }

  private async fetchJson(
    providerId: string,
    url: URL,
    init: RequestInit,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await this.responseErrorText(response);
        throw new ServiceUnavailableException(
          `${providerId} voices request failed with ${response.status}: ${detail}`,
        );
      }
      return response.json();
    } catch (error: unknown) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new ServiceUnavailableException(
        `${providerId} voices request failed: ${message}`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async responseErrorText(response: Response): Promise<string> {
    const fallback = response.statusText || 'Unknown provider error';
    const raw = await response.text();
    if (!raw.trim()) {
      return fallback;
    }
    return raw.slice(0, 500);
  }

  private dedupeVoices(
    voices: ProviderVoiceCatalogItem[],
  ): ProviderVoiceCatalogItem[] {
    return [...new Map(voices.map((voice) => [voice.providerVoiceId, voice])).values()];
  }

  private recordArrayField(source: unknown, key: string): Record<string, unknown>[] {
    if (!this.isRecord(source)) {
      return [];
    }
    const value = source[key];
    return Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> => this.isRecord(item))
      : [];
  }

  private stringArrayField(source: unknown, key: string): string[] {
    if (!this.isRecord(source)) {
      return [];
    }
    const value = source[key];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }

  private stringRecordField(
    source: unknown,
    key: string,
  ): Record<string, string> {
    if (!this.isRecord(source)) {
      return {};
    }
    const value = source[key];
    if (!this.isRecord(value)) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (typeof entryValue === 'string' && entryValue.trim()) {
        result[entryKey] = entryValue;
      }
    }
    return result;
  }

  private stringField(
    source: unknown,
    key: string,
  ): string | undefined {
    if (!this.isRecord(source)) {
      return undefined;
    }
    const value = source[key];
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : undefined;
  }

  private booleanField(
    source: unknown,
    key: string,
  ): boolean | undefined {
    if (!this.isRecord(source)) {
      return undefined;
    }
    const value = source[key];
    return typeof value === 'boolean' ? value : undefined;
  }

  private baseLanguageCode(value: string | undefined): string | undefined {
    const raw = value?.trim();
    if (!raw) {
      return undefined;
    }
    const first = raw.split(/[-_]/)[0]?.trim().toLowerCase();
    return first || undefined;
  }

  private genderFromTags(tags: string[]): string | undefined {
    const normalized = tags.map((tag) => tag.trim().toLowerCase());
    if (normalized.includes('female') || normalized.includes('feminine')) {
      return 'female';
    }
    if (normalized.includes('male') || normalized.includes('masculine')) {
      return 'male';
    }
    if (normalized.includes('neutral') || normalized.includes('gender neutral')) {
      return 'neutral';
    }
    return undefined;
  }

  private compactJson(
    value: Record<string, unknown>,
  ): Prisma.InputJsonObject {
    const result: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === undefined) {
        continue;
      }
      if (Array.isArray(entry)) {
        result[key] = entry as Prisma.InputJsonArray;
      } else if (this.isRecord(entry)) {
        result[key] = this.compactJson(entry);
      } else {
        result[key] = entry as Prisma.InputJsonValue;
      }
    }
    return result as Prisma.InputJsonObject;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
