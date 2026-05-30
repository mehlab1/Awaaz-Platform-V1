-- Phase 6.2: immutable usage ledger and call billing snapshots.
-- Additive only: does not alter call analytics fields or runtime cost logic.

CREATE TABLE "usage_ledger_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerModelId" TEXT NOT NULL,
    "credentialMode" "ProviderCredentialMode" NOT NULL,
    "pricingVersionId" TEXT NOT NULL,
    "usageMeter" "PricingMeter" NOT NULL,
    "usageQuantity" DECIMAL(20,6) NOT NULL,
    "baseCostUsdMicros" BIGINT NOT NULL,
    "markupBps" INTEGER NOT NULL DEFAULT 0,
    "markupUsdMicros" BIGINT NOT NULL,
    "totalCostUsdMicros" BIGINT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_ledger_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "call_billing_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "lineItemCount" INTEGER NOT NULL DEFAULT 0,
    "totalBaseCostUsdMicros" BIGINT NOT NULL,
    "totalMarkupUsdMicros" BIGINT NOT NULL,
    "totalCostUsdMicros" BIGINT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_billing_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "usage_ledger_entries_organizationId_createdAt_idx"
    ON "usage_ledger_entries"("organizationId", "createdAt");

CREATE INDEX "usage_ledger_entries_callId_createdAt_idx"
    ON "usage_ledger_entries"("callId", "createdAt");

CREATE INDEX "usage_ledger_entries_providerId_providerModelId_idx"
    ON "usage_ledger_entries"("providerId", "providerModelId");

CREATE INDEX "usage_ledger_entries_pricingVersionId_idx"
    ON "usage_ledger_entries"("pricingVersionId");

CREATE UNIQUE INDEX "call_billing_snapshots_callId_key"
    ON "call_billing_snapshots"("callId");

CREATE INDEX "call_billing_snapshots_organizationId_createdAt_idx"
    ON "call_billing_snapshots"("organizationId", "createdAt");

CREATE INDEX "call_billing_snapshots_callId_createdAt_idx"
    ON "call_billing_snapshots"("callId", "createdAt");

ALTER TABLE "usage_ledger_entries"
    ADD CONSTRAINT "usage_ledger_entries_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "usage_ledger_entries"
    ADD CONSTRAINT "usage_ledger_entries_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "calls"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "usage_ledger_entries"
    ADD CONSTRAINT "usage_ledger_entries_pricingVersionId_fkey"
    FOREIGN KEY ("pricingVersionId") REFERENCES "provider_pricing_versions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "call_billing_snapshots"
    ADD CONSTRAINT "call_billing_snapshots_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "call_billing_snapshots"
    ADD CONSTRAINT "call_billing_snapshots_callId_fkey"
    FOREIGN KEY ("callId") REFERENCES "calls"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;