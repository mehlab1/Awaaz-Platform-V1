ALTER TABLE "agent_versions"
  ADD COLUMN "ttsCredentialMode" "ProviderCredentialMode" NOT NULL DEFAULT 'FINOVA_MANAGED',
  ADD COLUMN "llmCredentialMode" "ProviderCredentialMode" NOT NULL DEFAULT 'FINOVA_MANAGED',
  ADD COLUMN "sttCredentialMode" "ProviderCredentialMode" NOT NULL DEFAULT 'FINOVA_MANAGED';
