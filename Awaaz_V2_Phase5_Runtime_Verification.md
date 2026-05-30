# Phase 5 — Multi-Provider TTS Runtime Verification (Consolidated)

**Status:** Worker + API + UI guardrails implemented (Phases 5.1–5.6). **Live E2E not verified.** **Not production-ready.**

**Purpose:** Single checklist to validate Rime, Cartesia, ElevenLabs, and Inworld before Phase 6 (billing).

**UI note:** Publish Live and Test Agent are enabled for all four runtime TTS providers when paired with a supported Groq model. Amber banners remain: *"Provider runtime enabled but awaiting production verification."*

---

## Preconditions

| Item | Check |
|------|-------|
| API deployed with `resolveTtsForRuntime` for `rime`, `cartesia`, `elevenlabs`, `inworld` | ☐ |
| Worker deployed with `tts_factory` adapters + deps (`websockets` for Cartesia) | ☐ |
| Org or Finova API keys for each provider under test | ☐ |
| Test agent: Groq model (`llama-3.3-70b-versatile` or GPT-OSS) | ☐ |
| Deepgram STT unchanged | ☐ |

**Production API (adjust if different):** `https://awaaz-api-nxae.onrender.com`  
**Web:** `https://awaaz-v1-web-6zlf.vercel.app`  
**Worker:** Render `awaaz-agent-worker`

---

## Shared E2E matrix (per provider)

Run sections **A–F** for each provider column. Mark **PASS / FAIL / SKIP**.

| # | Scenario | Rime | Cartesia | ElevenLabs | Inworld |
|---|----------|------|----------|------------|---------|
| A | **Greeting** — first message plays clearly | ☐ | ☐ | ☐ | ☐ |
| B | **Conversation** — 3+ turns, no stuck silence | ☐ | ☐ | ☐ | ☐ |
| C | **Interruption** — barge-in stops agent speech; next turn clean | ☐ | ☐ | ☐ | ☐ |
| D | **End session** — idle/max/end_call behaves as today | ☐ | ☐ | ☐ | ☐ |
| E | **Transcript** — USER/AGENT events persisted after call | ☐ | ☐ | ☐ | ☐ |
| F | **Recording** — browser/R2 recording present after call | ☐ | ☐ | ☐ | ☐ |

### G. Rime regression (required once)

| Check | Pass |
|-------|------|
| Existing production Rime agent unchanged (no config drift) | ☐ |
| Test Agent on legacy Rime published version | ☐ |
| Barge-in + end_call on Rime | ☐ |
| Transcript + recording on Rime | ☐ |

---

## Per-provider setup

### Rime (baseline)

| Field | Value |
|-------|--------|
| Voice | Any synced Rime speaker |
| Credential | BYOK or `RIME_API_KEY` on worker (env fallback allowed) |
| Logs | `tts_runtime_provider provider=rime` |

### Cartesia

| Field | Value |
|-------|--------|
| Voice | Catalog `cartesia:{uuid}` → worker uses native UUID |
| Model | e.g. `sonic-3.5` |
| Credential | `credentials.tts.apiKey` only (no worker env) |
| Logs | `cartesia_tts_started`, `cartesia_tts_first_audio_ms`, `cartesia_tts_cancelled` |

See also: [Cartesia detail](./Awaaz_V2_Phase5_Cartesia_Runtime_Verification.md)

### ElevenLabs

| Field | Value |
|-------|--------|
| Voice | `elevenlabs:{voice_id}` |
| Model | e.g. `eleven_flash_v2_5` |
| API | HTTP stream `pcm_16000` |
| Logs | `elevenlabs_tts_*` |

See also: [ElevenLabs detail](./Awaaz_V2_Phase5_ElevenLabs_Runtime_Verification.md)

### Inworld

| Field | Value |
|-------|--------|
| Voice | `inworld:{voiceId}` (e.g. `Dennis`) |
| Model | `inworld-tts-2` |
| API | `POST /tts/v1/voice:stream`, PCM 16 kHz |
| Logs | `inworld_tts_*` |

See also: [Inworld detail](./Awaaz_V2_Phase5_Inworld_Runtime_Verification.md)

---

## Recommended test procedure

1. **Rime regression (G)** on a known-good agent first.
2. **One agent per external provider** — create version via UI (or API), publish live, confirm internal config:
   - `GET /internal/agents/:id/config` with worker secret
   - `pipeline.tts.providerId`, `voiceId`, `modelId`, `credentials.tts.apiKey` present
3. **Test Agent** from editor (or DevTools enable if needed on older builds).
4. Run matrix **A–F**; capture worker logs per provider.
5. **Failure triage:** wrong sample rate (garbled audio), missing key, wrong `voiceId`, stream not cancelled on interrupt.

---

## Internal config smoke (optional)

```bash
# From apps/api — requires DATABASE_DIRECT_URL, WORKER_SECRET, agent id
npx ts-node scripts/internal-config-smoke.ts <agentId>
```

Expect `pipeline.tts.providerId` to match published voice provider.

---

## Exit criteria (Phase 5 complete)

| Gate | Required |
|------|----------|
| All matrix cells **A–F** PASS for Cartesia, ElevenLabs, Inworld | Yes |
| **G** Rime regression PASS | Yes |
| No P0 audio/interrupt/transcript regressions | Yes |
| Team sign-off that stack is ready for Phase 6 billing work | Yes |

**Until exit criteria pass:** keep verification-pending UI messaging; do not describe multi-provider TTS as production-ready.

---

## Explicit non-goals (this verification)

- Phase 6 billing, pricing, markup
- Prisma schema changes
- Anthropic / non-Groq LLM runtime
- Non-Deepgram STT runtime
- Removing safety banners

---

## Related documents

- [Awaaz_V2_Phase5_TTS_Runtime_Plan.md](./Awaaz_V2_Phase5_TTS_Runtime_Plan.md)
- [Awaaz_V2_Plan.md](./Awaaz_V2_Plan.md)
