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

export const RUNTIME_LLM_PROVIDER_IDS = [
  'groq',
  'openai',
  'anthropic',
] as const;

export type RuntimeLlmProviderId = (typeof RUNTIME_LLM_PROVIDER_IDS)[number];

export const RUNTIME_LLM_MODELS_BY_PROVIDER = {
  groq: [
    'llama-3.3-70b-versatile',
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
  ],
  openai: ['gpt-4o'],
  anthropic: ['claude-sonnet-4-0'],
} as const satisfies Record<RuntimeLlmProviderId, readonly string[]>;

export const GROQ_RUNTIME_MODEL_IDS = RUNTIME_LLM_MODELS_BY_PROVIDER.groq;

export type GroqRuntimeModelId = (typeof GROQ_RUNTIME_MODEL_IDS)[number];

export const CATALOG_ONLY_VOICE_MESSAGE =
  'Catalog only: this provider is not enabled for live calls or Test Agent yet.';

export const LLM_RUNTIME_ISSUE_MESSAGE =
  'Live runtime supports Groq, OpenAI GPT-4o, and Anthropic Claude Sonnet model selections only.';

export const VOICE_PREVIEW_UNAVAILABLE_MESSAGE =
  'Preview is not available for this provider yet.';

export type VoiceRuntimeStatusLabel =
  | 'Runtime Enabled'
  | 'Preview Available'
  | 'Preview Unavailable';

export interface VoiceRef {
  rimeVoiceId: string;
  provider?: string | null;
  previewPlaybackUrl?: string | null;
}

export interface RuntimeConfigAssessment {
  voiceProviderId: string;
  llmProviderId: string;
  isRuntimeTtsVoice: boolean;
  isRuntimeLlmProvider: boolean;
  isRuntimeLlmModel: boolean;
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

export function isRuntimeLlmProvider(
  providerId: string | null | undefined,
): providerId is RuntimeLlmProviderId {
  const normalized = normalizeProviderId(providerId);
  return (RUNTIME_LLM_PROVIDER_IDS as readonly string[]).includes(normalized);
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

export function isRuntimeLlmModel(
  providerId: string | null | undefined,
  model: string | null | undefined,
): boolean {
  const normalizedProvider = normalizeProviderId(providerId);
  if (!isRuntimeLlmProvider(normalizedProvider)) {
    return false;
  }
  const normalizedModel = model?.trim() ?? '';
  return (RUNTIME_LLM_MODELS_BY_PROVIDER[normalizedProvider] as readonly string[])
    .includes(normalizedModel);
}

export function canPreviewVoice(voice: VoiceRef): boolean {
  const providerId = voiceProviderIdFromStoredId(voice.rimeVoiceId, [voice]);
  if (providerId === RUNTIME_TTS_PROVIDER || providerId === 'inworld' || providerId === 'cartesia') {
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
  }

  labels.push(
    canPreviewVoice(voice) ? 'Preview Available' : 'Preview Unavailable',
  );

  return labels;
}

export function assessRuntimeConfig(params: {
  voiceId: string;
  llmProviderId?: string | null;
  model: string;
  voices: readonly VoiceRef[];
}): RuntimeConfigAssessment {
  const voiceProviderId = voiceProviderIdFromStoredId(params.voiceId, params.voices);
  const llmProviderId = normalizeProviderId(params.llmProviderId) || RUNTIME_LLM_PROVIDER;
  const isRuntimeTtsVoice = isRuntimeTtsProvider(voiceProviderId);
  const isRuntimeLlmProviderSelection = isRuntimeLlmProvider(llmProviderId);
  const isRuntimeLlmModelSelection = isRuntimeLlmModel(llmProviderId, params.model);
  const isRimeVoice = voiceProviderId === RUNTIME_TTS_PROVIDER;
  const isGroqModel = llmProviderId === RUNTIME_LLM_PROVIDER && isGroqRuntimeModel(params.model);

  const blockingIssues: string[] = [];
  const warnings: string[] = [];

  if (!isRuntimeTtsVoice) {
    blockingIssues.push(CATALOG_ONLY_VOICE_MESSAGE);
  }
  if (!isRuntimeLlmProviderSelection || !isRuntimeLlmModelSelection) {
    blockingIssues.push(LLM_RUNTIME_ISSUE_MESSAGE);
  }
  const canRunLive =
    isRuntimeTtsVoice &&
    isRuntimeLlmProviderSelection &&
    isRuntimeLlmModelSelection;
  const selectedVoice = params.voices.find(
    (voice) => voice.rimeVoiceId === params.voiceId.trim(),
  );
  const runtimeStatusLabels = selectedVoice
    ? voiceRuntimeStatusLabels(selectedVoice, params.voices)
    : isRuntimeTtsVoice
      ? (['Runtime Enabled'] as VoiceRuntimeStatusLabel[])
      : [];

  return {
    voiceProviderId,
    llmProviderId,
    isRuntimeTtsVoice,
    isRuntimeLlmProvider: isRuntimeLlmProviderSelection,
    isRuntimeLlmModel: isRuntimeLlmModelSelection,
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
