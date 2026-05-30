export type PluginKind = 'tts' | 'llm' | 'stt';

export type ProviderValidationStyle =
  | 'rime-voices'
  | 'openai-models'
  | 'anthropic-models'
  | 'deepgram-projects'
  | 'cartesia-voices'
  | 'elevenlabs-models'
  | 'assemblyai-transcripts'
  | 'local-only';

export interface ProviderDefinition {
  id: string;
  kind: PluginKind;
  label: string;
  defaultModel?: string;
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
    finovaEnvVars: ['FINOVA_CARTESIA_API_KEY', 'CARTESIA_API_KEY'],
    validationStyle: 'cartesia-voices',
  },
  {
    id: 'elevenlabs',
    kind: 'tts',
    label: 'ElevenLabs',
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
    finovaEnvVars: ['FINOVA_INWORLD_API_KEY', 'INWORLD_API_KEY'],
    validationStyle: 'local-only',
  },
  {
    id: 'groq',
    kind: 'llm',
    label: 'Groq Llama',
    defaultModel: 'llama-3.3-70b-versatile',
    finovaEnvVars: ['FINOVA_GROQ_API_KEY', 'GROQ_API_KEY'],
    validationStyle: 'openai-models',
  },
  {
    id: 'openai',
    kind: 'llm',
    label: 'OpenAI GPT-4o',
    defaultModel: 'gpt-4o',
    finovaEnvVars: ['FINOVA_OPENAI_API_KEY', 'OPENAI_API_KEY'],
    validationStyle: 'openai-models',
  },
  {
    id: 'anthropic',
    kind: 'llm',
    label: 'Anthropic Claude',
    finovaEnvVars: ['FINOVA_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'],
    validationStyle: 'anthropic-models',
  },
  {
    id: 'deepgram',
    kind: 'stt',
    label: 'Deepgram',
    defaultModel: 'nova-2-conversationalai',
    finovaEnvVars: ['FINOVA_DEEPGRAM_API_KEY', 'DEEPGRAM_API_KEY'],
    validationStyle: 'deepgram-projects',
  },
  {
    id: 'assemblyai',
    kind: 'stt',
    label: 'AssemblyAI',
    finovaEnvVars: ['FINOVA_ASSEMBLYAI_API_KEY', 'ASSEMBLYAI_API_KEY'],
    validationStyle: 'assemblyai-transcripts',
  },
  {
    id: 'groq-whisper',
    kind: 'stt',
    label: 'Groq Whisper',
    finovaEnvVars: ['FINOVA_GROQ_API_KEY', 'GROQ_API_KEY'],
    validationStyle: 'openai-models',
  },
] as const;

export function providerById(providerId: string): ProviderDefinition | undefined {
  const normalized = providerId.trim().toLowerCase();
  return PROVIDER_CATALOG.find((provider) => provider.id === normalized);
}
