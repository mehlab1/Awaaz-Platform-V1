# Awaaz V2 Plugin Selection & Credential Management Playbook

## Summary
Create root MD file `Awaaz_V2_Plugin_Credentials_Execution_Playbook.md`, modeled after the V1 playbook, for a V2 rollout that adds provider selection and per-organization provider credentials without breaking existing V1 agents.

Current repo reality:
- V1 runtime is fixed to Deepgram STT -> Groq LLM -> Rime TTS in `apps/agent-worker`.
- `AgentVersion` only stores `voiceId` and `model`; `Voice` is Rime-shaped.
- The agent editor already has placeholder TTS/STT/LLM UI, but only Rime/Groq/Deepgram are functional.
- Organization tenancy, roles, audit logs, and masked API key UI patterns already exist.

Primary decision: plugin selection is per `AgentVersion`; credentials are per `Organization`.

## Key Changes

### Phase 0: Compatibility Gate
- Verify provider SDK/plugin compatibility against current `livekit-agents==0.8.11`.
- Do not assume current LiveKit 1.x docs apply directly; document any required worker upgrade before implementation.
- Use direct provider keys, not LiveKit Inference by default, because V2 requires BYOK credentials.
- References: LiveKit model/plugin docs confirm plugin and inference paths, but repo is currently pinned to older worker packages:
  - https://docs.livekit.io/agents/models/
  - https://docs.livekit.io/agents/models/inference/

### Phase 1: Data Model
- Add provider registry types in `packages/shared-types/src/index.ts`.
- Store provider IDs as strings, not Prisma enums, so new providers do not require migrations.
- Add `OrganizationProviderCredential` with:
  - `organizationId`, `providerId`
  - `credentialMode`: `BYOK` or `FINOVA_MANAGED`
  - encrypted API key fields, masked key prefix, status, validation timestamps, last-used timestamp
  - `markupBps` for Finova-managed billing
- Extend `AgentVersion` with:
  - `ttsProviderId`, `ttsModel`, `ttsVoiceId`
  - `llmProviderId`, `llmModel`
  - `sttProviderId`, `sttModel`
- Backfill all existing versions as:
  - TTS: Rime
  - LLM: Groq Llama using existing model
  - STT: Deepgram
- Keep legacy `voiceId` and `model` during V2 for backward compatibility.

### Phase 2: Backend APIs
- Add `PluginsModule`.
- Add `GET /api/v1/plugins/catalog`.
- Add org-scoped credential APIs:
  - `GET /api/v1/plugin-credentials`
  - `PUT /api/v1/plugin-credentials/:providerId`
  - `POST /api/v1/plugin-credentials/:providerId/validate`
  - `DELETE /api/v1/plugin-credentials/:providerId`
- Restrict credential writes to `OWNER`/`ADMIN`; allow builders/viewers to read catalog availability only.
- Never return plaintext keys; use AES-GCM with `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`.
- Resolve Finova-managed keys from env, preferring `FINOVA_*_API_KEY` and falling back to current `RIME_API_KEY`, `GROQ_API_KEY`, `DEEPGRAM_API_KEY` where applicable.

### Phase 3: Voices & Provider Catalog
- Replace Rime-only voice assumptions with provider-aware voice records.
- Add `providerId`, `providerVoiceId`, optional `organizationId`, and provider metadata to voices.
- Keep existing Rime voice sync working.
- Add provider-aware `GET /api/v1/voices?providerId=...`.
- Scope BYOK/custom voices to the organization; shared Finova-managed voices can remain global.

### Phase 4: Agent Editor UI
- Replace hard-coded pipeline selects in the agent editor with real catalog-backed controls.
- Supported V2 options:
  - TTS: Rime, Cartesia, ElevenLabs, Inworld
  - LLM: Groq Llama and Groq-hosted GPT-OSS, Anthropic Claude
  - STT: Deepgram, AssemblyAI, Groq Whisper
- Disable providers that have no valid BYOK key and no Finova-managed key.
- Add settings page `Settings -> AI Providers` for credentials and mode selection.
- Keep existing `Settings -> API Keys` unchanged; those are Awaaz API access keys, not provider credentials.

### Phase 5: Worker Runtime
- Replace hard-coded worker construction with provider factories:
  - `build_stt(config)`
  - `build_llm(config)`
  - `build_tts(config)`
- Keep custom `RimeTTS`, but pass resolved API key from internal config.
- Internal API returns live-version pipeline config plus resolved secrets only to the worker through `WORKER_SECRET`.
- Add provider IDs, model IDs, credential mode, and key fingerprint to call metadata; never log plaintext secrets.

### Phase 6: Billing & Markup
- Replace fixed transcript cost constants with provider/model pricing registry.
- Apply markup only when `credentialMode=FINOVA_MANAGED`.
- Store cost breakdown with base cost, markup cost, billable cost, provider IDs, and usage meters.
- Keep existing analytics pages working by preserving `sttUsd`, `llmUsd`, `ttsUsd`, `telephonyUsd`, and `totalUsd`.

## Test Plan
- Migration test: existing V1 agents migrate to Rime/Groq/Deepgram and still run browser Test Agent.
- API tests:
  - credential create/update/delete/validate
  - role enforcement
  - no plaintext key leakage
  - catalog availability by org
  - agent version create/update/publish with provider fields
- Worker smoke tests:
  - existing Rime/Groq/Deepgram path
  - one happy-path call per new provider after credentials are configured
  - missing/invalid key fails before LiveKit dispatch with a clear API error
- UI tests:
  - AI Providers settings page masks keys and shows validation state
  - agent editor disables unavailable providers
  - saved versions preserve provider selections
  - published live version controls Test Agent runtime

## Assumptions
- The first V2 implementation creates the MD playbook file at repo root.
- Provider selection is versioned with the agent, not only organization-wide.
- BYOK keys are stored encrypted in Postgres and are only decrypted server-side.
- Finova-managed markup is per organization/provider via `markupBps`.
- Exact non-existing model IDs must be validated in Phase 0 rather than guessed; only the existing Groq model is already grounded in the repo.
