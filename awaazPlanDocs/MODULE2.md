## _**MODULE 2 — AGENT PIPELINE PROVIDER SYSTEM (STT, LLM, TTS)**_ 

_**Priority: CRITICAL — Directly determines call quality and provider flexibility. V1 locked all components to one provider. V2 is the target: each component is independently selectable with BYOK support. This module is treated as one unit because building V1locked first and then rebuilding for V2 is wasted effort.**_ 

## _**2-1  Multi-Provider Runtime Support in Agent Worker     PARTIALLY BUILT**_ 

_What it is: The Python agent worker must support all V2 providers at runtime so a call can use any configured LLM, STT, or TTS provider without failing. Currently only Groq is supported for LLM despite the catalog exposing others._ 

_What is currently built: stt_factory.py supports Deepgram, AssemblyAI, and Groq Whisper at runtime. tts_factory.py supports Rime, Cartesia, ElevenLabs, and Inworld at runtime. llm_factory.py only supports Groq (RUNTIME_LLM_PROVIDERS = frozenset({RUNTIME_LLM_PROVIDER_GROQ}))._ 

_The critical problem: The shared-types V2_PROVIDER_CATALOG exposes Anthropic Claude Sonnet as a selectable LLM in the agent editor. If a user selects Anthropic, the worker throws ValueError: LLM provider anthropic is not enabled in worker runtime and the call fails silently. The user sees a failed call with no actionable error in the dashboard._ 

_What is missing:_ 

- _OpenAI GPT-4o runtime support in llm_factory.py_ 

- _Anthropic Claude Sonnet runtime support in llm_factory.py_ 

- _Server-side validation in AgentsService.createVersion() that rejects any LLM provider_ 

- _not yet supported at runtime, with a clear API error message before the version is saved_ 

- _A UI guardrail in the agent editor that disables or marks unsupported provider options_ 

- _with a clear label_ 

## _**2-2  BYOK Credential Frontend — Plugin Credentials UI     BACKEND BUILT, NO FRONTEND or UNVERIFIED**_ 

_What it is: The UI for users to enter their own provider API keys for BYOK (Bring Your Own Key) mode, so they can use their own Deepgram, Groq, Anthropic, ElevenLabs, or other accounts directly._ 

_What is currently built: The complete backend is confirmed working. PluginsCatalogController (GET /plugins/catalog), PluginCredentialsController (GET, PUT, POST, DELETE /plugin-credentials/:providerId), PluginsService with AES-256-GCM encryption for key storage at rest, and the useProviderCredentials React hook with full CRUD, validation, and error handling are all implemented._ 

## _**The critical gap: The useProviderCredentials hook is imported by zero other files in the entire codebase. The hook is fully built but never mounted anywhere. All credential management backend work is completely inaccessible to users.**_ 

_What is missing:_ 

- _A /settings/plugins or /settings/credentials page in the dashboard that mounts the_ 

- _useProviderCredentials hook_ 

- _UI form for users to enter and save their API key per provider_ 

- _Key validation feedback (green checkmark or red error after testing the key against the_ 

- _provider)_ 

- _Plugin-specific configuration UI: voice ID dropdown for ElevenLabs and Rime, model_ 

- _selector for LLM providers, language/model selector for STT providers_ 

- _Visual indicator per provider showing: not configured, configured and valid, configured_ 

- _but key invalid_ 

## _**2-3  TTS Automatic Failover on Provider Outage     MISSING ENTIRELY**_ 

_What it is: If the primary TTS provider returns an error during a live call, the worker should automatically retry with a fallback provider rather than failing the call._ 

_What the spec risk register states: "Build Cartesia or ElevenLabs fallback by mid-V1 even if not user-exposed; engage failover automatically"_ 

_What is currently built: tts_factory.py can instantiate all four TTS providers. There is no automatic switching between them on error._ 

_What is missing:_ 

- _No automatic failover logic: if Rime 5xx, retry with Cartesia_ 

- _No health check on TTS provider availability before a call starts_ 

- _No circuit breaker pattern in RimeTTS or at the tts_factory level_ 

- _No fallback provider configuration field per agent (primary TTS, fallback TTS)_ 

