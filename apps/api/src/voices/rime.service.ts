import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const RIME_VOICES_URL = 'https://users.rime.ai/data/voices/voice_details.json';
const RIME_TTS_URL = 'https://users.rime.ai/v1/rime-tts';
const SAMPLE_RATE = 16_000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const PREVIEW_SPEED_ALPHA = 1.12;
const PREVIEW_TIME_SCALE_FACTOR = 1.12;

export interface RimeVoice {
  rimeVoiceId: string;
  name: string;
  description?: string;
  language: string;
  lang?: string;
  gender?: string;
  modelId?: string;
}

@Injectable()
export class RimeService {
  private readonly logger = new Logger(RimeService.name);

  constructor(private readonly config: ConfigService) {}

  async listVoices(): Promise<RimeVoice[]> {
    const response = await this.fetchRime(RIME_VOICES_URL, {
      headers: { Authorization: `Bearer ${this.apiKey()}` },
    });
    if (!response.ok) {
      const detail = await this.responseErrorText(response);
      this.logger.warn(`Rime voices request failed: ${response.status} ${detail}`);
      throw new ServiceUnavailableException(
        `Rime voices request failed with ${response.status}: ${detail}`,
      );
    }
    const voices = this.normalizeVoices(await response.json());
    this.logger.log(`Rime voices loaded: ${voices.length}`);
    return voices;
  }

  async synthesizePreview(voice: RimeVoice): Promise<Uint8Array> {
    const modelId = voice.modelId ?? 'mistv2';
    const lang = voice.lang ?? 'eng';
    const previewText = this.previewText(voice.name);

    const response = await this.fetchRime(RIME_TTS_URL, {
      method: 'POST',
      headers: {
        Accept: 'audio/pcm',
        Authorization: `Bearer ${this.apiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: previewText,
        modelId,
        speaker: voice.rimeVoiceId,
        lang,
        samplingRate: SAMPLE_RATE,
        ...this.previewSpeedFields(modelId),
      }),
    });
    if (!response.ok) {
      const detail = await this.responseErrorText(response);
      this.logger.warn(
        `Rime preview failed for speaker=${voice.rimeVoiceId} modelId=${modelId} lang=${lang}: ${response.status} ${detail}`,
      );
      throw new ServiceUnavailableException(
        `Rime preview request failed with ${response.status}: ${detail}`,
      );
    }

    const pcm = new Uint8Array(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? 'unknown';
    if (pcm.byteLength === 0) {
      this.logger.warn(
        `Rime preview returned empty audio speaker=${voice.rimeVoiceId} modelId=${modelId} lang=${lang} contentType=${contentType}`,
      );
      throw new ServiceUnavailableException('Rime preview returned empty audio');
    }
    if (
      !contentType.includes('audio') &&
      !contentType.includes('octet-stream') &&
      !contentType.includes('wav')
    ) {
      this.logger.warn(
        `Rime preview returned unexpected content type speaker=${voice.rimeVoiceId} modelId=${modelId} lang=${lang} contentType=${contentType} bytes=${pcm.byteLength}`,
      );
      throw new ServiceUnavailableException(
        `Rime preview returned unexpected content type: ${contentType}`,
      );
    }
    this.logger.log(
      `Rime preview succeeded speaker=${voice.rimeVoiceId} modelId=${modelId} lang=${lang} chars=${previewText.length} bytes=${pcm.byteLength} contentType=${contentType}`,
    );
    return this.wavFromPcm(pcm);
  }

  private previewText(rawName: string): string {
    const name = this.cleanPreviewName(rawName);
    if (!name) {
      return 'Hi, I am Awaaz’s voice agent.';
    }
    return `Hi, this is ${name}. I am Awaaz’s voice agent.`;
  }

  private cleanPreviewName(rawName: string): string {
    return rawName
      .replace(/[_-]+/g, ' ')
      .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  private previewSpeedFields(modelId: string): Record<string, number> {
    const normalized = modelId.toLowerCase();
    if (
      normalized.includes('arcana') ||
      normalized.includes('coda') ||
      normalized.includes('mistv3')
    ) {
      return { timeScaleFactor: PREVIEW_TIME_SCALE_FACTOR };
    }
    return { speedAlpha: PREVIEW_SPEED_ALPHA };
  }

  private apiKey(): string {
    const apiKey = this.config.get<string>('RIME_API_KEY')?.trim();
    if (!apiKey) {
      this.logger.error('RIME_API_KEY is not configured for backend Rime calls');
      throw new ServiceUnavailableException('RIME_API_KEY is not configured');
    }
    return apiKey;
  }

  private normalizeVoices(payload: unknown): RimeVoice[] {
    const rawVoices = this.voiceArray(payload);
    const voices = rawVoices
      .map((raw) => this.normalizeVoice(raw))
      .filter((voice): voice is RimeVoice => voice !== null);
    return [...new Map(voices.map((voice) => [voice.rimeVoiceId, voice])).values()];
  }

  private voiceArray(payload: unknown): unknown[] {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (!this.isRecord(payload)) {
      return [];
    }
    const voices = payload['voices'];
    if (Array.isArray(voices)) {
      return voices;
    }
    const data = payload['data'];
    return Array.isArray(data) ? data : [];
  }

  private normalizeVoice(raw: unknown): RimeVoice | null {
    if (!this.isRecord(raw)) {
      return null;
    }
    const id =
      this.stringField(raw, 'rimeVoiceId') ??
      this.stringField(raw, 'voiceId') ??
      this.stringField(raw, 'speaker') ??
      this.stringField(raw, 'id');
    if (!id) {
      return null;
    }

    return {
      rimeVoiceId: id,
      name:
        this.stringField(raw, 'name') ??
        this.stringField(raw, 'displayName') ??
        id,
      description: this.stringField(raw, 'description'),
      language:
        this.stringField(raw, 'language') ??
        this.stringField(raw, 'lang') ??
        'en',
      lang: this.stringField(raw, 'lang'),
      gender: this.stringField(raw, 'gender'),
      modelId: this.stringField(raw, 'modelId'),
    };
  }

  private stringField(
    source: Record<string, unknown>,
    key: string,
  ): string | undefined {
    const value = source[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private wavFromPcm(pcm: Uint8Array): Uint8Array {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    this.writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcm.byteLength, true);
    this.writeAscii(view, 8, 'WAVE');
    this.writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, CHANNELS, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8, true);
    view.setUint16(32, (CHANNELS * BITS_PER_SAMPLE) / 8, true);
    view.setUint16(34, BITS_PER_SAMPLE, true);
    this.writeAscii(view, 36, 'data');
    view.setUint32(40, pcm.byteLength, true);

    const wav = new Uint8Array(44 + pcm.byteLength);
    wav.set(new Uint8Array(header), 0);
    wav.set(pcm, 44);
    return wav;
  }

  private writeAscii(view: DataView, offset: number, value: string): void {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
  }

  private async fetchRime(
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Rime network request failed: ${message}`);
      throw new ServiceUnavailableException(
        `Rime network request failed: ${message}`,
      );
    }
  }

  private async responseErrorText(response: Response): Promise<string> {
    const fallback = response.statusText || 'Unknown Rime error';
    const raw = await response.text();
    if (!raw.trim()) {
      return fallback;
    }

    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
      if (typeof parsed.error === 'string') {
        return parsed.error;
      }
      if (typeof parsed.message === 'string') {
        return parsed.message;
      }
    } catch {
      return raw.slice(0, 500);
    }

    return raw.slice(0, 500);
  }
}
