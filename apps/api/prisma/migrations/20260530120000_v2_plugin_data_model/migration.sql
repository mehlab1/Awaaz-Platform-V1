-- Phase 1: V2 plugin selection and per-organization provider credential data model.

CREATE TYPE "ProviderCredentialMode" AS ENUM ('BYOK', 'FINOVA_MANAGED');

CREATE TYPE "ProviderCredentialStatus" AS ENUM (
    'NOT_CONFIGURED',
    'CONFIGURED',
    'VALID',
    'INVALID'
);

ALTER TABLE "agent_versions"
    ADD COLUMN "ttsProviderId" TEXT NOT NULL DEFAULT 'rime',
    ADD COLUMN "ttsModel" TEXT,
    ADD COLUMN "ttsVoiceId" TEXT,
    ADD COLUMN "llmProviderId" TEXT NOT NULL DEFAULT 'groq',
    ADD COLUMN "llmModel" TEXT,
    ADD COLUMN "sttProviderId" TEXT NOT NULL DEFAULT 'deepgram',
    ADD COLUMN "sttModel" TEXT NOT NULL DEFAULT 'nova-2-conversationalai';

UPDATE "agent_versions"
SET
    "ttsVoiceId" = "voiceId",
    "llmModel" = "model"
WHERE
    "ttsVoiceId" IS NULL
    OR "llmModel" IS NULL;

ALTER TABLE "voices"
    ADD COLUMN "organizationId" TEXT,
    ADD COLUMN "providerId" TEXT NOT NULL DEFAULT 'rime',
    ADD COLUMN "providerVoiceId" TEXT,
    ADD COLUMN "metadata" JSONB;

UPDATE "voices"
SET "providerVoiceId" = "rimeVoiceId"
WHERE "providerVoiceId" IS NULL;

ALTER TABLE "voices"
    ALTER COLUMN "providerVoiceId" SET NOT NULL,
    ALTER COLUMN "providerVoiceId" SET DEFAULT '';

CREATE TABLE "organization_provider_credentials" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "credentialMode" "ProviderCredentialMode" NOT NULL DEFAULT 'FINOVA_MANAGED',
    "status" "ProviderCredentialStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "keyPrefix" TEXT,
    "keyFingerprint" TEXT,
    "secretCiphertext" TEXT,
    "secretIv" TEXT,
    "secretAuthTag" TEXT,
    "validationError" TEXT,
    "lastValidatedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "markupBps" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_provider_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_provider_credentials_organizationId_providerId_key"
    ON "organization_provider_credentials"("organizationId", "providerId");

CREATE INDEX "organization_provider_credentials_providerId_idx"
    ON "organization_provider_credentials"("providerId");

CREATE INDEX "organization_provider_credentials_status_idx"
    ON "organization_provider_credentials"("status");

CREATE INDEX "voices_organizationId_providerId_idx"
    ON "voices"("organizationId", "providerId");

CREATE INDEX "voices_providerId_providerVoiceId_idx"
    ON "voices"("providerId", "providerVoiceId");

ALTER TABLE "organization_provider_credentials"
    ADD CONSTRAINT "organization_provider_credentials_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voices"
    ADD CONSTRAINT "voices_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
