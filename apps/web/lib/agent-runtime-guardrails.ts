export const RUNTIME_TTS_PROVIDER = 'rime';
export const RUNTIME_STT_PROVIDER = 'deepgram';
export const RUNTIME_LLM_PROVIDER = 'groq';

export const GROQ_RUNTIME_MODEL_IDS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const;

export type GroqRuntimeModelId = (typeof GROQ_RUNTIME_MODEL_IDS)[number];

export const CATALOG_ONLY_VOICE_MESSAGE =
  'Catalog only: live calls and Test Agent support Rime voices only for now.';

export const RUNTIME_PIPELINE_FOOTNOTE =
  'More providers are available in the catalog; runtime support coming soon.';

export const VOICE_PREVIEW_UNAVAILABLE_MESSAGE =
  'Preview is not available for this provider yet.';

export interface VoiceRef {
  rimeVoiceId: string;
  provider?: string | null;
  previewPlaybackUrl?: string | null;
}

export interface RuntimeConfigAssessment {
  voiceProviderId: string;
  isRimeVoice: boolean;
  isGroqModel: boolean;
  canPublishLive: boolean;
  canTestLive: boolean;
  issues: string[];
}

function normalizeProviderId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function voiceProviderIdFromStoredId(
  voiceId: string,
  voices: readonly VoiceRef[],
): string {
  const trimmed = voiceId.trim();
  if (!trimmed) {
    return RUNTIME_TTS_PROVIDER;
  }

  const row = voices.find((voice) => voice.rimeVoiceId === trimmed);
  const fromRow = normalizeProviderId(row?.provider);
  if (fromRow) {
    return fromRow;
  }

  const prefix = trimmed.split(':')[0]?.toLowerCase();
  if (
    prefix === 'elevenlabs' ||
    prefix === 'cartesia' ||
    prefix === 'inworld' ||
    prefix === 'rime'
  ) {
    return prefix;
  }

  return RUNTIME_TTS_PROVIDER;
}

export function isRimeRuntimeVoice(
  voiceId: string,
  voices: readonly VoiceRef[],
): boolean {
  return (
    voiceProviderIdFromStoredId(voiceId, voices) === RUNTIME_TTS_PROVIDER
  );
}

export function isGroqRuntimeModel(model: string): boolean {
  const normalized = model.trim();
  return (GROQ_RUNTIME_MODEL_IDS as readonly string[]).includes(normalized);
}

export function assessRuntimeConfig(params: {
  voiceId: string;
  model: string;
  voices: readonly VoiceRef[];
}): RuntimeConfigAssessment {
  const voiceProviderId = voiceProviderIdFromStoredId(params.voiceId, params.voices);
  const isRimeVoice = voiceProviderId === RUNTIME_TTS_PROVIDER;
  const isGroqModel = isGroqRuntimeModel(params.model);

  const issues: string[] = [];
  if (!isRimeVoice) {
    issues.push(CATALOG_ONLY_VOICE_MESSAGE);
  }
  if (!isGroqModel) {
    issues.push(
      'Live runtime currently supports Groq models only (Llama 3.3 70B or GPT-OSS).',
    );
  }

  const canRunLive = isRimeVoice && isGroqModel;

  return {
    voiceProviderId,
    isRimeVoice,
    isGroqModel,
    canPublishLive: canRunLive,
    canTestLive: canRunLive,
    issues,
  };
}

export function canPreviewVoice(voice: VoiceRef): boolean {
  const providerId = voiceProviderIdFromStoredId(voice.rimeVoiceId, [voice]);
  if (providerId === RUNTIME_TTS_PROVIDER) {
    return true;
  }
  return Boolean(voice.previewPlaybackUrl?.trim());
}

export function isCatalogOnlyVoiceProvider(providerId: string): boolean {
  return providerId !== RUNTIME_TTS_PROVIDER && providerId !== 'future';
}
