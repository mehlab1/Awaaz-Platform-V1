ALTER TABLE "agent_versions"
  ADD COLUMN "tts_key_source" TEXT NOT NULL DEFAULT 'finova_managed',
  ADD COLUMN "tts_key_encrypted" TEXT,
  ADD COLUMN "llm_key_source" TEXT NOT NULL DEFAULT 'finova_managed',
  ADD COLUMN "llm_key_encrypted" TEXT,
  ADD COLUMN "stt_key_source" TEXT NOT NULL DEFAULT 'finova_managed',
  ADD COLUMN "stt_key_encrypted" TEXT;

