-- Phase 6.1: billing primitives and provider pricing registry.
-- Additive only: no changes to calls, transcripts, or provider credentials.

CREATE TYPE "PricingMeter" AS ENUM ('MINUTE', 'TOKEN', 'CHARACTER', 'REQUEST');

CREATE TYPE "PricingRoundingMode" AS ENUM ('HALF_UP', 'CEIL', 'FLOOR');

CREATE TABLE "provider_pricing_versions" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_pricing_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_pricing_rates" (
    "id" TEXT NOT NULL,
    "providerPricingVersionId" TEXT NOT NULL,
    "providerModelId" TEXT NOT NULL,
    "meter" "PricingMeter" NOT NULL,
    "unitQuantity" INTEGER NOT NULL DEFAULT 1,
    "priceUsdMicros" INTEGER NOT NULL,
    "minChargeUsdMicros" INTEGER,
    "roundingMode" "PricingRoundingMode" NOT NULL DEFAULT 'HALF_UP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_pricing_rates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_pricing_versions_providerId_version_key"
    ON "provider_pricing_versions"("providerId", "version");

CREATE INDEX "provider_pricing_versions_providerId_isActive_idx"
    ON "provider_pricing_versions"("providerId", "isActive");

CREATE INDEX "provider_pricing_versions_providerId_effectiveFrom_effectiveTo_idx"
    ON "provider_pricing_versions"("providerId", "effectiveFrom", "effectiveTo");

CREATE UNIQUE INDEX "provider_pricing_rates_providerPricingVersionId_providerModelId_meter_key"
    ON "provider_pricing_rates"("providerPricingVersionId", "providerModelId", "meter");

CREATE INDEX "provider_pricing_rates_providerModelId_meter_idx"
    ON "provider_pricing_rates"("providerModelId", "meter");

ALTER TABLE "provider_pricing_rates"
    ADD CONSTRAINT "provider_pricing_rates_providerPricingVersionId_fkey"
    FOREIGN KEY ("providerPricingVersionId") REFERENCES "provider_pricing_versions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;