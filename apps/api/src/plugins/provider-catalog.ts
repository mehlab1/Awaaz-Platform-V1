export type PluginKind = 'tts' | 'llm' | 'stt';

export type ProviderValidationStyle =
  | 'rime-voices'
  | 'groq-models'
  | 'anthropic-models'
  | 'deepgram-projects'
  | 'cartesia-voices'
  | 'elevenlabs-models'
  | 'assemblyai-transcripts'
  | 'local-only';

export interface ProviderModelDefinition {
  id: string;
  label: string;
  default?: boolean;
}

export interface ProviderDefinition {
  id: string;
  kind: PluginKind;
  label: string;
  defaultModel?: string;
  models?: readonly ProviderModelDefinition[];
  finovaEnvVars: string[];
  validationStyle: ProviderValidationStyle;
}

export const PROVIDER_CATALOG: readonly ProviderDefinition[] = [
  {
    id: 'rime',
    kind: 'tts',
    label: 'Rime',
    finovaEnvVars: ['FINOVA_RIME_API_KEY', 'RIME_API_KEY'],
    validationStyle: 'rime-voices',
  },
  {
    id: 'cartesia',
    kind: 'tts',
    label: 'Cartesia',
    defaultModel: 'sonic-3.5',
    finovaEnvVars: ['FINOVA_CARTESIA_API_KEY', 'CARTESIA_API_KEY'],
    validationStyle: 'cartesia-voices',
  },
  {
    id: 'elevenlabs',
    kind: 'tts',
    label: 'ElevenLabs',
    defaultModel: 'eleven_flash_v2_5',
    finovaEnvVars: [
      'FINOVA_ELEVENLABS_API_KEY',
      'ELEVENLABS_API_KEY',
      'ELEVEN_API_KEY',
    ],
    validationStyle: 'elevenlabs-models',
  },
  {
    id: 'inworld',
    kind: 'tts',
    label: 'Inworld',
    defaultModel: 'inworld-tts-2',
    finovaEnvVars: ['FINOVA_INWORLD_API_KEY', 'INWORLD_API_KEY'],
    validationStyle: 'local-only',
  },
  {
    id: 'groq',
    kind: 'llm',
    label: 'Groq',
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
    finovaEnvVars: ['FINOVA_GROQ_API_KEY', 'GROQ_API_KEY'],
    validationStyle: 'groq-models',
  },
  {
    id: 'anthropic',
    kind: 'llm',
    label: 'Anthropic Claude (Coming Soon)',
    defaultModel: 'claude-sonnet-4-0',
    models: [
      {
        id: 'claude-sonnet-4-0',
        label: 'Claude Sonnet 4.0',
        default: true,
      },
      {
        id: 'claude-opus-4-0',
        label: 'Claude Opus 4.0',
      },
    ],
    finovaEnvVars: ['FINOVA_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'],
    validationStyle: 'anthropic-models',
  },
  {
    id: 'deepgram',
    kind: 'stt',
    label: 'Deepgram',
    defaultModel: 'nova-2-conversationalai',
    models: [
      {
        id: 'nova-2-conversationalai',
        label: 'Nova-2 Conversational AI',
        default: true,
      },
      {
        id: 'nova-2',
        label: 'Nova-2',
      },
      {
        id: 'nova-3',
        label: 'Nova-3',
      },
    ],
    finovaEnvVars: ['FINOVA_DEEPGRAM_API_KEY', 'DEEPGRAM_API_KEY'],
    validationStyle: 'deepgram-projects',
  },
  {
    id: 'assemblyai',
    kind: 'stt',
    label: 'AssemblyAI',
    defaultModel: 'universal-streaming-v2',
    models: [
      {
        id: 'universal-streaming-v2',
        label: 'Universal Streaming v2',
        default: true,
      },
    ],
    finovaEnvVars: ['FINOVA_ASSEMBLYAI_API_KEY', 'ASSEMBLYAI_API_KEY'],
    validationStyle: 'assemblyai-transcripts',
  },
  {
    id: 'groq-whisper',
    kind: 'stt',
    label: 'Groq Whisper',
    defaultModel: 'whisper-large-v3-turbo',
    models: [
      {
        id: 'whisper-large-v3-turbo',
        label: 'Whisper Large v3 Turbo',
        default: true,
      },
      {
        id: 'whisper-large-v3',
        label: 'Whisper Large v3',
      },
    ],
    finovaEnvVars: ['FINOVA_GROQ_API_KEY', 'GROQ_API_KEY'],
    validationStyle: 'groq-models',
  },
] as const;

export function providerById(providerId: string): ProviderDefinition | undefined {
  const normalized = providerId.trim().toLowerCase();
  return PROVIDER_CATALOG.find((provider) => provider.id === normalized);
}
