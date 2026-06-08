import type { ProviderCredentialMode } from '@prisma/client';

export interface WorkerPipelineSttConfig {
  providerId: string;
  model: string;
}

export interface WorkerPipelineLlmConfig {
  providerId: string;
  model: string;
}

export interface WorkerPipelineTtsConfig {
  providerId: string;
  voiceId: string;
  modelId: string;
  language: string;
}

export interface WorkerTtsCredentials {
  providerId: string;
  mode: ProviderCredentialMode;
  apiKey: string;
  keyFingerprint: string;
}

export interface WorkerProviderCredentials {
  providerId: string;
  mode: ProviderCredentialMode;
  apiKey: string;
  keyFingerprint: string;
}

export interface WorkerAgentConfigMetadata {
  ttsProviderId: string;
  ttsModel: string;
  ttsVoiceId: string;
  ttsCredentialMode: ProviderCredentialMode;
  ttsKeySource: string;
  ttsKeyFingerprint: string;
  sttProviderId: string;
  sttModel: string;
  sttCredentialMode: ProviderCredentialMode;
  sttKeySource: string;
  sttKeyFingerprint?: string;
  llmProviderId: string;
  llmModel: string;
  llmCredentialMode: ProviderCredentialMode;
  llmKeySource: string;
  llmKeyFingerprint?: string;
  agentVersionNumber: number;
}

/** Response for GET /internal/agents/:id/config (worker secret only). */
export interface WorkerAgentConfigResponse {
  agentId: string;
  agentVersionId: string;
  organizationId: string;
  systemPrompt: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  firstMessage: string | null;
  endCallPhrases: string[];
  /** @deprecated Use pipeline.tts — kept for Rime worker compatibility */
  voiceId: string;
  /** @deprecated Use pipeline.tts.modelId */
  voiceModelId: string;
  /** @deprecated Use pipeline.tts.language */
  voiceLang: string;
  pipeline: {
    stt: WorkerPipelineSttConfig;
    llm: WorkerPipelineLlmConfig;
    tts: WorkerPipelineTtsConfig;
  };
  credentials: {
    tts: WorkerTtsCredentials;
    stt?: WorkerProviderCredentials;
    llm?: WorkerProviderCredentials;
  };
  metadata: WorkerAgentConfigMetadata;
}
