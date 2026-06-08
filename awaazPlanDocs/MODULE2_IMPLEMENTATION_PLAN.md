# Module 2 Implementation Plan

## Scope

This plan covers only the work described in `awaazPlanDocs/MODULE2.md`:

1. Multi-provider runtime support for STT, LLM, and TTS, with the missing OpenAI and Anthropic LLM runtime support and save-time/UI guardrails.
2. A dashboard UI for provider credentials that mounts the existing `useProviderCredentials` hook.
3. Automatic TTS failover, including pre-call health checks, a circuit breaker, and per-agent fallback configuration.

---

## Current Repository State

### Multi-provider runtime

- `apps/agent-worker/pipeline/stt_factory.py` supports Deepgram, AssemblyAI, and Groq Whisper.
- `apps/agent-worker/pipeline/tts_factory.py` supports Rime, Cartesia, ElevenLabs, and Inworld.
- `apps/agent-worker/pipeline/llm_factory.py` supports only Groq. Its runtime allowlist contains only `groq`.
- `apps/agent-worker/requirements.txt` includes the LiveKit OpenAI plugin but no Anthropic-specific runtime dependency.
- `packages/shared-types/src/index.ts` exposes Groq and Anthropic as LLM providers, but it does not currently expose OpenAI.
- `apps/api/src/plugins/provider-catalog.ts` exposes Groq and an Anthropic entry labelled as coming soon; OpenAI is not present.
- `apps/api/src/agents/agents.service.ts` already rejects LLM providers outside its Groq-only runtime allowlist through `v1CompatiblePipelineData()`. This partially satisfies the server-side guardrail described as missing in Module 2, but it must be aligned with the providers actually implemented in the worker and retain a clear API error.
- `apps/api/src/internal/internal.service.ts` repeats the Groq-only runtime check before returning worker configuration.
- `apps/web/app/(dashboard)/agents/[id]/agent-editor-client.tsx` builds provider options from the catalog but does not use a runtime-support flag to disable unsupported choices.
- `apps/web/lib/agent-runtime-guardrails.ts` treats verified Groq models as the only live LLM runtime and assesses the model without the selected LLM provider.

### Provider credentials UI

- Backend catalog, credential CRUD, validation, encryption, and sanitized responses are implemented in:
  - `apps/api/src/plugins/plugins.controller.ts`
  - `apps/api/src/plugins/plugins.service.ts`
  - `apps/api/src/plugins/provider-catalog.ts`
  - `apps/api/src/plugins/dto/upsert-provider-credential.dto.ts`
- `apps/web/hooks/use-provider-credentials.ts` implements catalog loading, credential loading, upsert, validation, deletion, error handling, and role checks.
- The hook is not mounted by any page.
- `apps/web/app/(dashboard)/settings/ai-providers/page.tsx` exists but currently redirects to `/agents`.
- `apps/web/components/dashboard-shell.tsx` has no navigation entry for provider credentials.
- The agent editor contains separate inline credential-management logic, but it does not replace the required dedicated settings page or mount `useProviderCredentials`.
- Existing voice data can be obtained from `GET /api/v1/voices`, implemented by `apps/api/src/voices/voices.controller.ts` and `apps/api/src/voices/voices.service.ts`.
- `OrganizationProviderCredential.metadata` and the existing upsert DTO can store provider-specific selections.

### TTS failover

- `apps/agent-worker/agent.py` builds one TTS engine and passes it directly to `VoiceAssistant`.
- `apps/agent-worker/pipeline/tts_factory.py` creates one selected provider and has no fallback wrapper, health probe, or circuit breaker.
- Provider implementations in `apps/agent-worker/pipeline/tts.py`, `cartesia_tts.py`, `elevenlabs_tts.py`, and `inworld_tts.py` surface provider errors but do not switch engines.
- `apps/api/prisma/schema.prisma` stores only the primary TTS selection on `AgentVersion`.
- `apps/api/src/internal/worker-agent-config.types.ts` and `apps/api/src/internal/internal.service.ts` return only one TTS pipeline and credential block.
- `apps/agent-worker/scripts/test_tts_factory.py` covers provider construction only; there is no failover test.

---

## Phase 1: Complete LLM Runtime Support

### Objective

Add OpenAI GPT-4o and Anthropic Claude Sonnet runtime support to the Python worker while preserving Groq behavior and BYOK/managed credential resolution.

### Relevant files/areas

- `apps/agent-worker/pipeline/llm_factory.py`
- `apps/agent-worker/requirements.txt`
- `apps/agent-worker/agent.py`
- New focused smoke test such as `apps/agent-worker/scripts/test_llm_factory.py`

### Implementation tasks

1. Add explicit provider constants and model allowlists for Groq, OpenAI, and Anthropic in `llm_factory.py`.
2. Add OpenAI GPT-4o as a distinct `openai` provider rather than treating Groq's OpenAI-compatible endpoint as native OpenAI.
3. Build native OpenAI LLM instances using the existing LiveKit OpenAI plugin and the API key supplied in `credentials.llm`, with the existing environment fallback pattern retained.
4. Add an Anthropic-compatible LiveKit dependency that matches the pinned `livekit-agents==0.8.11` stack, then construct Claude Sonnet through that adapter.
5. Keep provider-specific model validation so a model cannot be used with the wrong provider.
6. Preserve `parse_llm_runtime_selection()` precedence:
   - `pipeline.llm`
   - metadata fallback
   - legacy/default values
7. Keep logs limited to provider, model, credential source, and fingerprint; never log credential contents.
8. Ensure worker setup errors continue through the existing `worker_setup_failed` path in `agent.py` rather than failing without a recorded call error.

### Validation/testing

- Add no-network construction tests for Groq, OpenAI, and Anthropic using placeholder in-memory credential values.
- Test provider/model mismatch rejection.
- Test missing-credential errors for each provider.
- Test legacy Groq configuration remains the default.
- Run Python compilation for the worker pipeline and run the new LLM factory smoke test.
- In an integration environment, run one test call with each LLM provider and confirm the selected provider/model appears in worker logs and call timing metadata.

### Risks/dependencies

- The pinned LiveKit version may require a specific Anthropic plugin version or a small adapter.
- OpenAI and Anthropic streaming/tool-call behavior must remain compatible with the existing `VoiceAssistant` and `AwaazTools`.
- Provider model identifiers must be identical across the worker and TypeScript catalogs.

---

## Phase 2: Align Provider Catalogs and Add Save-Time/UI Guardrails

### Objective

Make the provider catalog, API validation, internal worker configuration, and agent editor agree on which LLM providers and models are live-runtime supported.

### Relevant files/areas

- `packages/shared-types/src/index.ts`
- `apps/api/src/plugins/provider-catalog.ts`
- `apps/api/src/plugins/plugins.service.ts`
- `apps/api/src/agents/agents.service.ts`
- `apps/api/src/internal/internal.service.ts`
- `apps/web/app/(dashboard)/agents/[id]/agent-editor-client.tsx`
- `apps/web/lib/agent-runtime-guardrails.ts`

### Implementation tasks

1. Add OpenAI and its GPT-4o model entry to the shared and API provider catalogs.
2. Complete the Anthropic model metadata in the shared catalog and remove the coming-soon label only after Phase 1 passes.
3. Add explicit runtime-support metadata to the API catalog response so credential availability and worker runtime support are represented separately.
4. Update the LLM runtime allowlists/model validation in both `AgentsService` and `InternalService` to match the tested worker providers.
5. Keep `AgentsService.createVersion()` validation before persistence and return a clear `BadRequestException` naming the unsupported provider or model.
6. Reuse the same validation when the existing version update flow persists runtime settings so saved versions cannot bypass the create-version guardrail.
7. Update the editor's `buildProviderOptions()` and `buildModelOptions()` logic to:
   - Disable providers not enabled in worker runtime.
   - Display a clear unavailable-for-live-runtime label.
   - Keep historical unsupported selections visible but disabled.
   - Show credential-related labels where available, such as configured, not configured, or invalid credentials.
   - Avoid raw API key entry inside the agent configuration page except for the explicit "This Agent Only" key source path added in Phase 3.
8. Update `assessRuntimeConfig()` to evaluate the selected LLM provider and model together instead of treating every model as a Groq model.
9. Block save, test, and publish actions when the selected provider/model is not runtime supported, while still relying on the API as the final enforcement layer.
10. When a runtime-supported provider requires credentials but is not configured or has invalid credentials, show a clear UI message directing the user to the provider credentials settings page instead of allowing a silent failure.

### Validation/testing

- API check: creating a version with an unknown or disabled LLM provider returns a clear 400 response and creates no version.
- API check: valid Groq, OpenAI, and Anthropic provider/model pairs save successfully after their runtime is enabled.
- API check: provider/model mismatches are rejected.
- UI check: unsupported providers are visibly labelled and cannot be selected for a new version.
- UI check: providers that are runtime-supported but not configured show a clear credentials-related message.
- UI check: agent configuration does not expose raw API key fields and directs users to the credentials settings page when needed.
- UI check: historical versions using an unsupported value remain readable and direct the user to a supported selection.
- Run `pnpm run build:api` and `pnpm run build:web`.

### Risks/dependencies

- Runtime support must not be advertised before the corresponding worker path is deployed.
- Runtime-support metadata must not be confused with `available`, which currently describes credential availability.
- Credential status must be shown as a separate UI concern from runtime support so users can understand whether a provider is unsupported, unconfigured, or invalid.
- The shared catalog and API catalog currently duplicate data; changes must be made together to avoid drift.

---

## Phase 3: Provider Credentials Page + BYOK Architecture

### Objective

Mount the existing provider credentials backend in `/settings/ai-providers` and update the agent editor to choose a key source per provider.

Do not create a new credentials backend or table. Use the existing plugins module, `OrganizationProviderCredential`, and `useProviderCredentials`.

### Key sources

```
finova_managed → Finova Managed
org_default    → Saved Workspace Key
agent_own      → This Agent Only
```

Priority:

```
1. agent_own
2. org_default
3. finova_managed
```

### Relevant files/areas

- `apps/web/app/(dashboard)/settings/ai-providers/page.tsx`
- `apps/web/app/(dashboard)/settings/ai-providers/ai-providers-client.tsx`
- `apps/web/hooks/use-provider-credentials.ts`
- `apps/web/components/dashboard-shell.tsx`
- `apps/web/app/(dashboard)/agents/[id]/agent-editor-client.tsx`
- `apps/web/lib/agent-runtime-guardrails.ts`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/agents/dto/create-agent-version.dto.ts`
- `apps/api/src/agents/agents.service.ts`
- `apps/api/src/internal/internal.service.ts`
- `apps/api/src/internal/worker-agent-config.types.ts`
- `apps/api/src/plugins/provider-catalog.ts`

### Implementation tasks

1. Replace the redirect in `/settings/ai-providers/page.tsx` with a real page.
2. Create `ai-providers-client.tsx` and mount `useProviderCredentials()`.
3. Add an AI Providers / Provider Credentials link in `dashboard-shell.tsx`.
4. Settings page should group providers by:
   - LLM
   - STT
   - TTS
5. Each provider card should show:
   - provider name
   - status: not configured / valid / invalid
   - key input
   - save/update
   - validate
   - delete
   - sanitized key prefix only
6. Add key source fields to `AgentVersion`:
   ```prisma
   stt_key_source    String  @default("finova_managed")
   stt_key_encrypted String?

   llm_key_source    String  @default("finova_managed")
   llm_key_encrypted String?

   tts_key_source    String  @default("finova_managed")
   tts_key_encrypted String?
   ```
7. Extend provider/catalog status with:
   ```ts
   orgCredentialStatus: "not_configured" | "configured_valid" | "configured_invalid"
   ```
   Derive this from existing `OrganizationProviderCredential` records. Do not create a new table.
8. In the agent editor, add a 3-way key source selector per provider:
   ```
   ○ Finova Managed
   ○ Saved Workspace Key
   ○ This Agent Only
   ```
9. Agent editor behavior:
   - `finova_managed`: no key input
   - `org_default`: use saved key from settings
   - `agent_own`: show inline key input
   - block Save/Publish if `org_default` is missing/invalid
   - block Save/Publish if `agent_own` is selected but key is empty
   - keep unsupported runtime providers disabled
10. In `AgentsService`, validate key source before saving:
    - `finova_managed`: existing behavior
    - `org_default`: requires valid org credential
    - `agent_own`: requires key and stores it encrypted
11. In `InternalService`, resolve actual key before worker config:
    - `agent_own`: decrypt agent key
    - `org_default`: use saved org credential
    - `finova_managed`: existing behavior
12. Update `assessRuntimeConfig()` to check key source validity with provider/model support.

### Validation/testing

- Settings page loads and uses `useProviderCredentials`.
- Add/update/validate/delete credential works.
- Agent editor shows 3 key source options.
- Saved Workspace Key uses settings credential.
- This Agent Only uses agent key.
- Finova Managed remains unchanged.
- Missing/invalid key blocks Save/Publish.
- Builds pass:
  ```
  pnpm run build:api
  pnpm run build:web
  ```

### Risks/dependencies

- Never silently fallback from `org_default` to `finova_managed`.
- Do not create a new credential backend or table.
- `orgCredentialStatus` must not expose raw key data.
- Reuse existing encryption utilities for agent-owned keys.

---

## Phase 4: Add Per-Agent TTS Fallback Configuration

### Objective

Persist a primary and fallback TTS configuration per agent version and deliver both resolved configurations to the worker.

### Relevant files/areas

- `apps/api/prisma/schema.prisma`
- New migration under `apps/api/prisma/migrations/`
- `apps/api/src/agents/dto/create-agent-version.dto.ts`
- `apps/api/src/agents/agents.service.ts`
- `apps/api/src/voices/voices.service.ts`
- `apps/api/src/internal/worker-agent-config.types.ts`
- `apps/api/src/internal/internal.service.ts`
- `apps/web/app/(dashboard)/agents/[id]/agent-editor-client.tsx`

### Implementation tasks

1. Add nullable fallback TTS fields to `AgentVersion`, mirroring the information needed to construct a provider engine:
   - Fallback provider
   - Fallback voice
   - Fallback model
   - Fallback language
   - Fallback key source using the same Phase 3 values: `finova_managed`, `org_default`, `agent_own`
   - Fallback encrypted key, only when `fallback_tts_key_source = agent_own`

   Suggested fallback key fields:
   ```prisma
   fallback_tts_key_source    String?
   fallback_tts_key_encrypted String?
   ```

2. Keep existing versions valid by making fallback configuration optional; no fallback means current single-provider behavior.
3. Extend `CreateAgentVersionDto` and the agent editor payload/state to accept optional fallback TTS provider, voice, model, language, and key source.
4. Resolve the fallback voice through `VoicesService` when creating or updating a version, just as the primary voice is resolved today.
5. Reject invalid combinations:
   - Unsupported fallback TTS provider
   - Missing fallback voice when fallback is enabled
   - Primary and fallback resolving to the same provider
   - `fallback_tts_key_source = org_default` but no valid saved workspace credential exists
   - `fallback_tts_key_source = agent_own` but no fallback key is provided
6. Add fallback provider, voice, and key source controls to the existing Voice Pipeline section of the agent editor.
7. Extend `WorkerAgentConfigResponse` with an optional fallback TTS pipeline block and corresponding resolved credential block.
8. Resolve fallback credentials in `InternalService` using the same Phase 3 credential rules:
   - `finova_managed`: existing managed key behavior
   - `org_default`: use saved workspace credential; never silently fallback
   - `agent_own`: decrypt fallback agent-owned key
9. Return a clear pre-call error if fallback TTS is configured but cannot be constructed.
10. Include fallback selection in the existing agent version audit metadata.

### Validation/testing

- Validate the Prisma schema and apply the migration in a disposable environment.
- Create and update versions with no fallback and confirm existing behavior is unchanged.
- Create a version with Rime primary and Cartesia or ElevenLabs fallback and inspect the internal worker config response.
- Confirm invalid or same-provider fallback selections return clear API errors before persistence.
- Confirm invalid fallback key source states return clear API errors before persistence.
- Confirm fallback configuration survives version reload, version restore, and publish flows.
- Run `pnpm run build:api` and `pnpm run build:web`.

### Risks/dependencies

- A fallback provider requires its own compatible voice/model/language tuple; provider ID alone is insufficient for `build_tts()`.
- Both primary and fallback credentials must be resolved without exposing them in public API responses.
- Never silently fallback from `org_default` to `finova_managed`.
- Historical version restore logic must copy the new nullable fields.

---

## Phase 5: Implement TTS Health Checks, Circuit Breaker, and Live Failover

### Objective

Automatically use the fallback TTS provider when the primary provider is unavailable before a call or fails during synthesis.

### Relevant files/areas

- `apps/agent-worker/pipeline/tts_factory.py`
- New provider-agnostic wrapper such as `apps/agent-worker/pipeline/failover_tts.py`
- `apps/agent-worker/pipeline/tts.py`
- `apps/agent-worker/pipeline/cartesia_tts.py`
- `apps/agent-worker/pipeline/elevenlabs_tts.py`
- `apps/agent-worker/pipeline/inworld_tts.py`
- `apps/agent-worker/agent.py`
- `apps/agent-worker/scripts/test_tts_factory.py`
- New failover smoke test such as `apps/agent-worker/scripts/test_tts_failover.py`

### Implementation tasks

1. Parse primary and optional fallback TTS selections from the worker config.
2. Assume primary and fallback credentials are already resolved by `InternalService` before reaching the worker.
3. Build both engines through the existing provider construction paths in `tts_factory.py`.
4. Introduce a provider-agnostic TTS wrapper that implements the LiveKit TTS interface used by `VoiceAssistant`.
5. Add a bounded pre-call health check:
   - Probe the primary provider before the assistant starts.
   - Select the fallback for the call when the primary probe fails.
   - Use strict timeouts so the health check does not materially delay call setup.
6. Add a circuit breaker at the wrapper/factory level:
   - Count retryable provider failures such as timeouts, connection failures, and provider 5xx responses.
   - Open the circuit after the configured threshold.
   - Route subsequent synthesis to the fallback while open.
   - Permit a controlled half-open probe after cooldown.
7. On a retryable primary synthesis failure, retry the failed unit of text with the fallback and continue the call.
8. Define streaming safety rules:
   - If no audio has been emitted for the failed text unit, retry it on fallback.
   - If partial audio has already been emitted, avoid replaying duplicate speech; switch subsequent text units to fallback.
   - Preserve cancellation and barge-in behavior.
9. Do not fail over for invalid local configuration; surface those errors clearly.
10. Emit structured logs/metrics for health check result, circuit state, failover reason, selected provider, and failover success/failure.
11. Update `close_tts()` so both primary and fallback engines are closed during setup failure and worker shutdown.

### Validation/testing

- Unit/smoke test: primary succeeds and fallback is never used.
- Unit/smoke test: simulated Rime 5xx causes retry through Cartesia or ElevenLabs.
- Unit/smoke test: failed pre-call primary health check selects fallback before first speech.
- Unit/smoke test: repeated primary errors open the circuit and later calls bypass primary until cooldown.
- Unit/smoke test: half-open success closes the circuit.
- Unit/smoke test: fallback failure is surfaced once with both provider contexts.
- Test cancellation while primary is active and after failover.
- Test shutdown closes both engines.
- Run a controlled live call with a simulated primary outage and confirm the call continues with audible fallback speech.

### Manual verification

- Configure an agent with a Rime primary and a different supported fallback.
- Start a test call with the primary healthy and confirm no failover event is emitted.
- Simulate a retryable primary outage and confirm the first affected response continues through the fallback.
- Restore primary service and verify the circuit returns to normal after its cooldown/probe behavior.

### Risks/dependencies

- Streaming failover can duplicate or truncate speech if failover occurs after partial audio emission.
- Provider engines use different transport implementations but must present the same PCM format expected by LiveKit.
- Health probes can add latency or provider traffic and therefore require strict timeouts and bounded frequency.
- Circuit state must be concurrency-safe when one worker process handles multiple calls.
- Worker must not receive raw key source logic; it should receive already resolved credentials only.

---

## Phase 6: Integrated Module 2 Verification

### Objective

Verify the complete Module 2 workflow across dashboard configuration, agent version persistence, worker configuration, provider credential resolution, and live calls.

### Validation/testing

1. Build the API and web applications.
2. Compile the Python worker modules and run the LLM, TTS factory, and failover smoke tests.
3. Verify the provider catalog reports runtime support separately from credential availability.
4. Verify the provider credentials page supports all required states:
   - Not configured
   - Configured and valid
   - Configured and invalid
5. Save and run agent versions using each supported LLM provider.
6. Confirm unsupported provider/model selections are blocked in the editor and rejected by the API if submitted directly.
7. Verify primary STT/LLM/TTS credentials resolve correctly for each key source:
   - `finova_managed`
   - `org_default`
   - `agent_own`
8. Verify fallback TTS credentials resolve correctly for each applicable key source.
9. Confirm `org_default` fails clearly when the saved workspace key is missing or invalid.
10. Confirm no path silently falls back from `org_default` to `finova_managed`.
11. Run primary-only TTS calls for regression coverage.
12. Run primary-plus-fallback TTS calls with healthy and failing primary providers.
13. Confirm call setup failures and failover failures create actionable recorded errors rather than silent call failure.
14. Confirm no credential contents appear in browser responses, UI logs, API logs, worker logs, or error metadata.
15. Run:
    ```
    pnpm run build:api
    pnpm run build:web
    ```

### Risks/dependencies

- End-to-end provider checks require a configured integration environment with outbound provider access.
- Deployment order matters: worker support must be deployed before catalogs mark a provider runtime-enabled.
- API, web, and worker versions must agree on provider IDs, model IDs, key source values, and fallback config shape.
- Phase 3 credential resolution must be complete before fallback credential verification can pass.