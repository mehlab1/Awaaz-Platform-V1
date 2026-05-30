export const V2_TTS_PROVIDER_IDS = [
  'rime',
  'cartesia',
  'elevenlabs',
  'inworld',
] as const;

export const V2_LLM_PROVIDER_IDS = [
  'groq',
  'anthropic',
] as const;

export const V2_STT_PROVIDER_IDS = [
  'deepgram',
  'assemblyai',
  'groq-whisper',
] as const;

export type V2TtsProviderId = (typeof V2_TTS_PROVIDER_IDS)[number];
export type V2LlmProviderId = (typeof V2_LLM_PROVIDER_IDS)[number];
export type V2SttProviderId = (typeof V2_STT_PROVIDER_IDS)[number];

export type V2ProviderKind = 'tts' | 'llm' | 'stt';

export type V2ProviderId =
  | V2TtsProviderId
  | V2LlmProviderId
  | V2SttProviderId;

export type ProviderCredentialMode = 'BYOK' | 'FINOVA_MANAGED';

export type ProviderCredentialStatus =
  | 'NOT_CONFIGURED'
  | 'CONFIGURED'
  | 'VALID'
  | 'INVALID';

export interface V2ProviderCatalogItem {
  id: V2ProviderId;
  kind: V2ProviderKind;
  label: string;
  credentialEnvVar: string;
  supportsByok: boolean;
  supportsFinovaManaged: boolean;
  defaultModel?: string;
  models?: readonly V2ProviderCatalogModel[];
}

export interface V2ProviderCatalogModel {
  id: string;
  label: string;
  default?: boolean;
}

export const V2_PROVIDER_CATALOG = [
  {
    id: 'rime',
    kind: 'tts',
    label: 'Rime',
    credentialEnvVar: 'RIME_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
  },
  {
    id: 'cartesia',
    kind: 'tts',
    label: 'Cartesia',
    credentialEnvVar: 'CARTESIA_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
  },
  {
    id: 'elevenlabs',
    kind: 'tts',
    label: 'ElevenLabs',
    credentialEnvVar: 'ELEVEN_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
  },
  {
    id: 'inworld',
    kind: 'tts',
    label: 'Inworld',
    credentialEnvVar: 'INWORLD_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
  },
  {
    id: 'groq',
    kind: 'llm',
    label: 'Groq',
    credentialEnvVar: 'GROQ_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
    defaultModel: 'llama-3.3-70b-versatile',
    models: [
      {
        id: 'llama-3.3-70b-versatile',
        label: 'Llama 3.3 70B Versatile',
        default: true,
      },
      {
        id: 'openai/gpt-oss-120b',
        label: 'GPT-OSS 120B',
      },
      {
        id: 'openai/gpt-oss-20b',
        label: 'GPT-OSS 20B',
      },
    ],
  },
  {
    id: 'anthropic',
    kind: 'llm',
    label: 'Anthropic Claude',
    credentialEnvVar: 'ANTHROPIC_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
  },
  {
    id: 'deepgram',
    kind: 'stt',
    label: 'Deepgram',
    credentialEnvVar: 'DEEPGRAM_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
  },
  {
    id: 'assemblyai',
    kind: 'stt',
    label: 'AssemblyAI',
    credentialEnvVar: 'ASSEMBLYAI_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
  },
  {
    id: 'groq-whisper',
    kind: 'stt',
    label: 'Groq Whisper',
    credentialEnvVar: 'GROQ_API_KEY',
    supportsByok: true,
    supportsFinovaManaged: true,
  },
] as const satisfies readonly V2ProviderCatalogItem[];

export const V1_COMPATIBLE_AGENT_PIPELINE = {
  ttsProviderId: 'rime',
  llmProviderId: 'groq',
  llmModel: 'llama-3.3-70b-versatile',
  sttProviderId: 'deepgram',
  sttModel: 'nova-2-conversationalai',
} as const;
