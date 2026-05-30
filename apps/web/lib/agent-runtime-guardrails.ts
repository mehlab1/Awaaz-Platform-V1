export const RUNTIME_TTS_PROVIDER = 'rime';
export const RUNTIME_STT_PROVIDER = 'deepgram';
export const RUNTIME_LLM_PROVIDER = 'groq';

export const RUNTIME_TTS_PROVIDER_IDS = [
  'rime',
  'cartesia',
  'elevenlabs',
  'inworld',
] as const;

export type RuntimeTtsProviderId = (typeof RUNTIME_TTS_PROVIDER_IDS)[number];

export const GROQ_RUNTIME_MODEL_IDS = [
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
] as const;

export type GroqRuntimeModelId = (typeof GROQ_RUNTIME_MODEL_IDS)[number];

export const CATALOG_ONLY_VOICE_MESSAGE =
  'Catalog only: this provider is not enabled for live calls or Test Agent yet.';

export const PROVIDER_VERIFICATION_PENDING_MESSAGE =
  'Provider runtime enabled but awaiting production verification.';

export const GROQ_RUNTIME_ISSUE_MESSAGE =
  'Live runtime currently supports Groq models only (Llama 3.3 70B or GPT-OSS).';

export const RUNTIME_PIPELINE_FOOTNOTE =
  'Live runtime uses Deepgram STT, Groq LLM, and your selected TTS provider (Rime, Cartesia, ElevenLabs, or Inworld). Additional catalog providers are not wired to the worker yet.';

export const VOICE_PREVIEW_UNAVAILABLE_MESSAGE =
  'Preview is not available for this provider yet.';

export type VoiceRuntimeStatusLabel =
  | 'Runtime Enabled'
  | 'Preview Available'
  | 'Preview Unavailable'
  | 'Verification Pending';

export interface VoiceRef {
  rimeVoiceId: string;
  provider?: string | null;
  previewPlaybackUrl?: string | null;
}

export interface RuntimeConfigAssessment {
  voiceProviderId: string;
  isRuntimeTtsVoice: boolean;
  isRimeVoice: boolean;
  isGroqModel: boolean;
  canPublishLive: boolean;
  canTestLive: boolean;
  blockingIssues: string[];
  warnings: string[];
  /** Blocking issues plus non-blocking warnings (for banner display). */
  issues: string[];
  runtimeStatusLabels: VoiceRuntimeStatusLabel[];
}

function normalizeProviderId(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function isRuntimeTtsProvider(
  providerId: string | null | undefined,
): providerId is RuntimeTtsProviderId {
  const normalized = normalizeProviderId(providerId);
  return (RUNTIME_TTS_PROVIDER_IDS as readonly string[]).includes(normalized);
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
  if (isRuntimeTtsProvider(prefix)) {
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

export function canPreviewVoice(voice: VoiceRef): boolean {
  const providerId = voiceProviderIdFromStoredId(voice.rimeVoiceId, [voice]);
  if (providerId === RUNTIME_TTS_PROVIDER || providerId === 'inworld') {
    return true;
  }
  return Boolean(voice.previewPlaybackUrl?.trim());
}

export function voiceRuntimeStatusLabels(
  voice: VoiceRef,
  voices: readonly VoiceRef[] = [voice],
): VoiceRuntimeStatusLabel[] {
  const providerId = voiceProviderIdFromStoredId(voice.rimeVoiceId, voices);
  const labels: VoiceRuntimeStatusLabel[] = [];

  if (isRuntimeTtsProvider(providerId)) {
    labels.push('Runtime Enabled');
    if (providerId !== RUNTIME_TTS_PROVIDER) {
      labels.push('Verification Pending');
    }
  }

  labels.push(
    canPreviewVoice(voice) ? 'Preview Available' : 'Preview Unavailable',
  );

  return labels;
}

export function assessRuntimeConfig(params: {
  voiceId: string;
  model: string;
  voices: readonly VoiceRef[];
}): RuntimeConfigAssessment {
  const voiceProviderId = voiceProviderIdFromStoredId(params.voiceId, params.voices);
  const isRuntimeTtsVoice = isRuntimeTtsProvider(voiceProviderId);
  const isRimeVoice = voiceProviderId === RUNTIME_TTS_PROVIDER;
  const isGroqModel = isGroqRuntimeModel(params.model);

  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (!isRuntimeTtsVoice) {
    blockingIssues.push(CATALOG_ONLY_VOICE_MESSAGE);
  }
  if (!isGroqModel) {
    blockingIssues.push(GROQ_RUNTIME_ISSUE_MESSAGE);
  }
  if (isRuntimeTtsVoice && !isRimeVoice && isGroqModel) {
    warnings.push(PROVIDER_VERIFICATION_PENDING_MESSAGE);
  }

  const canRunLive = isRuntimeTtsVoice && isGroqModel;
  const selectedVoice = params.voices.find(
    (voice) => voice.rimeVoiceId === params.voiceId.trim(),
  );
  const runtimeStatusLabels = selectedVoice
    ? voiceRuntimeStatusLabels(selectedVoice, params.voices)
    : isRuntimeTtsVoice
      ? ([
          'Runtime Enabled',
          ...(isRimeVoice ? [] : (['Verification Pending'] as const)),
        ] as VoiceRuntimeStatusLabel[])
      : [];

  return {
    voiceProviderId,
    isRuntimeTtsVoice,
    isRimeVoice,
    isGroqModel,
    canPublishLive: canRunLive,
    canTestLive: canRunLive,
    blockingIssues,
    warnings,
    issues: [...blockingIssues, ...warnings],
    runtimeStatusLabels,
  };
}

/** @deprecated Use isRuntimeTtsProvider — kept for call sites migrating gradually. */
export function isCatalogOnlyVoiceProvider(providerId: string): boolean {
  const normalized = normalizeProviderId(providerId);
  return !isRuntimeTtsProvider(normalized);
}
