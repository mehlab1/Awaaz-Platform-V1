# Phase 5.4 — ElevenLabs Runtime Verification Plan

**Implementation status:** Worker HTTP stream adapter (`elevenlabs_tts.py`) + factory routing + API `resolveTtsForRuntime` allows `elevenlabs`. **Live E2E not verified.** Not production-ready. UI guardrails remain Rime-only (Phase 5.6).

**Purpose:** Prove ElevenLabs TTS works end-to-end via API publish + worker, without unlocking the web editor for non-Rime voices.

**Prerequisite:** Cartesia Phase 5.3 E2E should complete first per main plan order; ElevenLabs can be verified in parallel via API-only path if desired.

---

## 1. What was implemented

| Item | Location |
|------|----------|
| HTTP stream TTS | `apps/agent-worker/pipeline/elevenlabs_tts.py` |
| `pcm_16000` output | `POST /v1/text-to-speech/{voice_id}/stream?output_format=pcm_16000` |
| Chunked LLM text | `ElevenLabsSynthesizeStream` + `take_ready_text` (same as Rime) |
| Factory | `tts_factory.py` → `elevenlabs` → `ElevenLabsTTS` |
| API runtime allowlist | `voices.service.ts` — `WORKER_RUNTIME_TTS_PROVIDER_IDS` includes `elevenlabs` |
| Logs | `elevenlabs_tts_started`, `elevenlabs_tts_first_audio_ms`, `elevenlabs_tts_cancelled`, `elevenlabs_tts_stream_closed`, `elevenlabs_tts_error` |

**Credentials:** `credentials.tts.apiKey` from internal agent config only (no worker env fallback).

**Default model:** `eleven_flash_v2_5` when voice row model is empty or placeholder.

---

## 2. Safe verification path (no UI unlock)

Same pattern as [Cartesia verification](./Awaaz_V2_Phase5_Cartesia_Runtime_Verification.md):

1. Deploy worker + API with Phase 5.4 changes.
2. Org has Finova or BYOK ElevenLabs key configured.
3. Create agent version via API with ElevenLabs `voiceId` (catalog UUID / provider voice id).
4. Publish version via API.
5. `GET /internal/agents/:id/config` — confirm `pipeline.tts.providerId === "elevenlabs"`, voice/model, `credentials.tts.apiKey` present (masked in logs via fingerprint only).
6. Test Agent: open agent in web → DevTools enable **Test Agent** button (do **not** change `agent-runtime-guardrails.ts`).
7. Run multi-turn + barge-in; check worker logs for `elevenlabs_tts_*` events.

---

## 3. Exit criteria

| Check | Pass |
|-------|------|
| Internal config resolves ElevenLabs voice + key | ☐ |
| First audio &lt; ~2s after agent speaks | ☐ |
| Barge-in stops playback; next turn uses new generation | ☐ |
| `end_call` + recording + transcript unchanged | ☐ |
| Missing key → worker fails before/during TTS with clear error | ☐ |

**All PASS** → ElevenLabs runtime is verified; still **do not** unlock UI until Cartesia E2E + Phase 5.6.

---

## 4. Explicit non-goals

- No Phase 5.6 UI guardrail changes.
- No Inworld (5.5).
- No claim of production-ready until checklist complete.
