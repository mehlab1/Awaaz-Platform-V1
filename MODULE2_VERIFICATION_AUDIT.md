# Module 2 Verification Audit

This document breaks down the verification of Module 2 into hyper-granular, file-by-file phases. Each phase represents a small, isolated unit of work that can be completed and verified by a coding agent before moving on.

---

## Section 1: Multi-Provider Runtime Support (LLM)

### Phase 1.1: Worker LLM Support (`llm_factory.py`)
- **Target File**: `apps/agent-worker/pipeline/llm_factory.py`
- **Verification Goals**:
  - `openai` and `anthropic` must be added to `RUNTIME_LLM_PROVIDERS`.
  - GPT-4o must route correctly through the LiveKit `openai` plugin.
  - Claude Sonnet 3.5 must route correctly through the LiveKit `anthropic` plugin.
  - Provider model identifiers must match the exact string expected by the backend and LiveKit.

### Phase 1.2: API Provider Catalog & Model Validation
- **Target Files**: `packages/shared-types/src/index.ts`, `apps/api/src/plugins/provider-catalog.ts`, `apps/api/src/agents/agents.service.ts`
- **Verification Goals**:
  - Remove "coming soon" label from Anthropic.
  - Add OpenAI explicitly to the catalog.
  - Ensure API validation (`AgentsService`) aligns exactly with `llm_factory.py` allowlist so unsupported providers throw a `400 BadRequest` before saving.

### Phase 1.3: Agent Editor Guardrails (UI)
- **Target Files**: `apps/web/app/(dashboard)/agents/[id]/agent-editor-client.tsx`, `apps/web/lib/agent-runtime-guardrails.ts`
- **Verification Goals**:
  - The UI dropdowns must disable and visually label (e.g., "Not Supported") any LLM provider not currently enabled in the runtime.
  - Test/Save/Publish buttons must be fully disabled if an unsupported provider is selected.
  - Ensure users are directed to the settings page if they select a supported provider but have no credentials configured for it.

---

## Section 2: BYOK Credential Frontend

### Phase 2.1: Mount Provider Settings Page (`page.tsx` & `dashboard-shell.tsx`)
- **Target Files**: `apps/web/app/(dashboard)/settings/ai-providers/page.tsx`, `apps/web/components/dashboard-shell.tsx`
- **Verification Goals**:
  - Replace the existing redirect in `page.tsx` with a legitimate dashboard page.
  - Add a visible navigation link in the `dashboard-shell.tsx` sidebar for "AI Providers".

### Phase 2.2: Build the Provider Credentials Client (`ai-providers-client.tsx`)
- **Target File**: `apps/web/app/(dashboard)/settings/ai-providers/ai-providers-client.tsx`
- **Verification Goals**:
  - Correctly mount and utilize the `useProviderCredentials` hook.
  - Render individual cards for STT, TTS, and LLM grouped by category.
  - Each card must possess: an API Key input field, a Save button, a Delete button, and a Validate button.
  - UI State Management: Cards must display "Not Configured", "Valid", or "Invalid" status badges.
  - Form security: Mask the input key. Provide delete confirmation prompts.

### Phase 2.3: Agent Editor Key Source Selector
- **Target File**: `apps/web/app/(dashboard)/agents/[id]/agent-editor-client.tsx`
- **Verification Goals**:
  - Add a 3-way radio or dropdown selector per provider in the agent configuration: "Finova Managed", "Saved Workspace Key" (`org_default`), and "This Agent Only" (`agent_own`).
  - If `agent_own` is selected, conditionally reveal an inline API key input field.
  - Block Save/Publish actions if `org_default` is selected but the workspace key is missing or invalid.

---

## Section 3: TTS Automatic Failover

### Phase 3.1: Backend Schema & DTO (`schema.prisma`)
- **Target Files**: `apps/api/prisma/schema.prisma`, `apps/api/src/agents/dto/create-agent-version.dto.ts`
- **Verification Goals**:
  - Database schema must include nullable fallback fields: `fallback_tts_provider`, `fallback_tts_voice`, `fallback_tts_model`, `fallback_tts_language`, `fallback_tts_key_source`, `fallback_tts_key_encrypted`.
  - Prisma migration successfully generated and applied.
  - Validation DTO accepts these optional fields cleanly.

### Phase 3.2: API Internal Resolution (`agents.service.ts` & `internal.service.ts`)
- **Target Files**: `apps/api/src/agents/agents.service.ts`, `apps/api/src/internal/internal.service.ts`
- **Verification Goals**:
  - API explicitly rejects requests where primary and fallback TTS providers are identical.
  - API rejects fallback configuration if no fallback voice is provided.
  - `InternalService` properly resolves fallback credentials (`agent_own` decryption or `org_default` retrieval) before packing the `WorkerAgentConfigResponse`.

### Phase 3.3: TTS Fallback UI in Editor
- **Target File**: `apps/web/app/(dashboard)/agents/[id]/agent-editor-client.tsx`
- **Verification Goals**:
  - Add a dedicated section under "Voice Pipeline" allowing the user to select an optional Fallback TTS Provider.
  - Conditionally display dropdowns for the fallback voice and fallback key source if a provider is selected.

### Phase 3.4: Worker Factory Construction (`tts_factory.py`)
- **Target File**: `apps/agent-worker/pipeline/tts_factory.py`
- **Verification Goals**:
  - `build_tts_with_failover()` correctly parses primary and fallback selection.
  - Return primary early if primary and fallback providers are the same.
  - If fallback fails to build (e.g. invalid voice_id or bad key), emit a metric (`tts_fallback_build_failed`) but continue seamlessly with primary only.
  - Return the composite `FailoverTTS` instance wrapper.

### Phase 3.5: Worker Failover State Machine (`failover_tts.py`)
- **Target File**: `apps/agent-worker/pipeline/failover_tts.py`
- **Verification Goals**:
  - Implement an eager, asynchronous background health probe (`_probe_task`) upon instantiation without race-condition locks.
  - Intercept streaming failures per-chunk (`FailoverSynthesizeStream` and `FailoverChunkedStream`).
  - Correctly replay `_buffered_text` if the primary fails *before* emitting any audio for the chunk.
  - Ensure differing sample rates between primary and fallback are patched using `rtc.AudioResampler` to prevent artifact glitches.
