# Phase 5.5 — Inworld Runtime Verification Plan

**Implementation status:** Worker HTTP JSON stream adapter + factory routing + API `resolveTtsForRuntime` allows `inworld`. **Live E2E not verified.** Not production-ready. UI guardrails remain Rime-only (Phase 5.6).

**Purpose:** Prove Inworld TTS end-to-end via API publish + worker before UI unlock.

---

## 1. Voice catalog (from sync)

| Field | Value |
|-------|--------|
| `providerId` | `inworld` |
| Stored id | `inworld:{providerVoiceId}` in `rimeVoiceId` column |
| `providerVoiceId` | Inworld API `voiceId` (e.g. `Dennis`, display-name style ids) |
| Default `modelId` | `inworld-tts-2` (`INWORLD_DEFAULT_TTS_MODEL` in catalog sync) |
| Language | `langCode` or first `promptLanguages` entry → base ISO code |
| Preview URL | Not set in sync metadata (`hasPreviewUrl` typically false) |
| Auth | `Authorization: Basic {apiKey}` (same as voice list API) |

Worker internal config uses native `pipeline.tts.voiceId` = `providerVoiceId`, not the scoped `inworld:` prefix.

---

## 2. Runtime implementation

| Item | Detail |
|------|--------|
| Endpoint | `POST https://api.inworld.ai/tts/v1/voice:stream` |
| Encoding | `audioConfig.audioEncoding: PCM`, `sampleRateHertz: 16000` |
| Streaming | **HTTP JSON stream** — NDJSON / concatenated JSON objects with base64 `result.audioContent` |
| LLM text | Chunked via `take_ready_text` per HTTP request (one stream per text chunk) |
| Limitation | Not a single long-lived vendor socket; interrupt cancels in-flight HTTP stream and bumps `generation_id` |

---

## 3. Safe verification (no UI unlock)

1. Deploy worker + API with Phase 5.5.
2. Org Inworld key (BYOK or `FINOVA_INWORLD_API_KEY`).
3. API create version + publish with Inworld `voiceId`.
4. Verify `GET /internal/agents/:id/config` → `pipeline.tts.providerId === "inworld"`.
5. DevTools enable Test Agent (do not edit guardrails).
6. Multi-turn + barge-in; confirm `inworld_tts_*` logs.

---

## 4. Exit criteria

| Check | Pass |
|-------|------|
| Internal config + credential | ☐ |
| Audible speech, no garbled/wrong rate | ☐ |
| Barge-in stops stale audio | ☐ |
| Recording + transcript unchanged | ☐ |
| Missing key → clear failure | ☐ |

**All Phase 5 providers (5.3–5.5) PASS** → Phase 5.6 UI unlock only (still not “production-ready” until ops sign-off).

---

## 5. Non-goals

- No `agent-runtime-guardrails.ts` changes.
- No Phase 6 billing.
- No schema changes.
