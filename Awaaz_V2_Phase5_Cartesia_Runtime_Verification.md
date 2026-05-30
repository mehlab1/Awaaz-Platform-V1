# Phase 5.3 — Cartesia Runtime Verification Plan

**Implementation status:** Code merged in worker + API (`resolveTtsForRuntime` allows `cartesia`). **Live E2E not yet verified.** Not production-ready. UI guardrails remain Rime-only until this checklist passes and Phase 5.6 runs.

**Purpose:** Prove Cartesia TTS works end-to-end before ElevenLabs/Inworld UI unlock.

**Scope:** Verification only — no UI guardrail changes in this phase (Phase 5.6 unlocks Cartesia in the editor after Cartesia E2E passes).

**Production references (adjust if your URLs differ):**

| Service | URL |
|---------|-----|
| API | `https://awaaz-api-nxae.onrender.com` |
| Web | `https://awaaz-v1-web-6zlf.vercel.app` |
| Worker | Render `awaaz-agent-worker` |

---

## 1. Worker deployment requirements

### 1.1 Dependency checklist

| Item | Where | Expected |
|------|--------|----------|
| `websockets==13.1` | `apps/agent-worker/requirements.txt` | Present after Phase 5.3 |
| Cartesia module | `apps/agent-worker/pipeline/cartesia_tts.py` | Deployed with worker |
| Factory routing | `apps/agent-worker/pipeline/tts_factory.py` | `cartesia` → `CartesiaTTS` |

**After deploy:** Trigger a manual Render deploy (or push) so the worker image runs `pip install -r requirements.txt` and picks up `websockets`.

### 1.2 Render worker settings

| Setting | Value |
|---------|--------|
| Type | Background Worker |
| Root | `apps/agent-worker` |
| Build | `pip install -r requirements.txt` |
| Start | `python main.py start` |
| Python | 3.11.9 (`runtime.txt` / `PYTHON_VERSION`) |

### 1.3 Worker environment variables

| Variable | Required for Cartesia? | Notes |
|----------|------------------------|--------|
| `LIVEKIT_URL` | Yes | Same project as API |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Yes | |
| `LIVEKIT_AGENT_NAME` | Yes | Must match API dispatch (default `awaaz-agent`) |
| `AWAAZ_API_URL` | Yes | Production API base URL |
| `WORKER_SECRET` | Yes | Must match API `WORKER_SECRET` |
| `DEEPGRAM_API_KEY` | Yes | STT unchanged |
| `GROQ_API_KEY` | Yes | LLM unchanged |
| `RIME_API_KEY` | Yes for Rime agents | Not used for Cartesia TTS path |
| `CARTESIA_API_KEY` on worker | **No** | Cartesia key comes from internal config only |

**Do not set:** `REDIS_URL` on the worker.

### 1.4 API environment (credential source)

Cartesia audio uses **`credentials.tts.apiKey`** from `GET /internal/agents/:id/config`. That key is resolved on the **API**, not the worker env.

| API variable / store | Purpose |
|----------------------|---------|
| `FINOVA_CARTESIA_API_KEY` or `CARTESIA_API_KEY` | Finova-managed Cartesia key |
| Org BYOK | `organization_provider_credentials` for `providerId=cartesia` |
| `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` | Required if org uses BYOK |

**Pre-flight:** Settings → AI Providers → Cartesia shows configured/valid, or Finova env is set on Render API.

### 1.5 Credential resolution path

```text
Worker job starts
  → GET /internal/agents/:agentId/config  (x-worker-secret)
  → VoicesService.resolveTtsForRuntime(voiceId)  [allows rime | cartesia]
  → PluginsService.resolveOrganizationProviderSecret(orgId, "cartesia")
      → BYOK decrypt if configured, else FINOVA_CARTESIA_API_KEY / CARTESIA_API_KEY
  → Response: pipeline.tts + credentials.tts.apiKey + metadata.ttsKeyFingerprint
  → build_tts(config) → CartesiaTTS(api_key=...)
```

**Failure before LiveKit:** API returns `503` if Cartesia credential missing; worker raises if `apiKey` absent.

### 1.6 Deployment smoke (no audio)

1. Render → `awaaz-agent-worker` → **Logs** → worker **Connected** in LiveKit Cloud → Agents.
2. `curl https://awaaz-api-nxae.onrender.com/health` → `{"status":"ok",...}`.
3. Internal config for a **published Cartesia** agent (see §2) — redact `apiKey` in notes; confirm:
   - `pipeline.tts.providerId` = `"cartesia"`
   - `credentials.tts.apiKey` non-empty
   - `metadata.ttsCredentialMode` = `FINOVA_MANAGED` or `BYOK`
   - No `apiKey` in any **public** API response (plugins catalog, test-call JSON to browser should not include provider secrets).

---

## 2. Test setup (bypass UI guardrails safely)

UI still blocks **Publish Live** and **Test Agent** for non-Rime voices (`apps/web/lib/agent-runtime-guardrails.ts`). Runtime and API support Cartesia; use **API + worker** only.

### 2.1 Use a dedicated test agent

Do **not** repoint your primary production Rime agent unless you plan to restore it.

1. Create a new agent, e.g. `Cartesia E2E Verify`.
2. Or reuse an existing low-traffic test agent.

### 2.2 Pick a Cartesia voice

```http
GET /api/v1/voices?providerId=cartesia
Authorization: Bearer <clerk_jwt>
x-organization-id: <org_id>
```

Record:

| Field | Example |
|-------|---------|
| `rimeVoiceId` (use as `voiceId` in version DTO) | `cartesia:<uuid>` |
| `providerVoiceId` | native UUID |
| `modelId` | often `null` → runtime defaults to `sonic-3.5` |
| `language` | `en` |

### 2.3 Create and publish version (API)

```http
POST /api/v1/agents/{agentId}/versions
Content-Type: application/json
Authorization: Bearer <clerk_jwt>
x-organization-id: <org_id>

{
  "systemPrompt": "You are a friendly test assistant. Keep replies short.",
  "voiceId": "<rimeVoiceId from catalog, e.g. cartesia:xxxxxxxx>",
  "model": "llama-3.3-70b-versatile",
  "temperature": 0.7,
  "maxTokens": 1024,
  "firstMessage": "Hi, this is a Cartesia voice test. Say something and try interrupting me."
}
```

**Confirm response:**

- `ttsProviderId` = `"cartesia"`
- `ttsVoiceId` = Cartesia native voice UUID (not the `cartesia:` prefix string)
- `ttsModel` = `sonic-3.5` or synced model

```http
POST /api/v1/agents/{agentId}/versions/{versionId}/publish
```

Confirm agent `currentVersion` is the new version (GET agent).

### 2.4 Verify internal config (worker view)

```powershell
# Load WORKER_SECRET from repo .env; replace AGENT_ID
curl.exe -s -H "x-worker-secret: $env:WORKER_SECRET" `
  "https://awaaz-api-nxae.onrender.com/internal/agents/AGENT_ID/config"
```

**Expect:** `pipeline.tts.providerId` = `cartesia`, `credentials.tts.apiKeyPresent` (do not log full key).  
**Without secret:** `403 Missing worker secret`.

### 2.5 Start browser test without UI button

**Option A — Browser console (same logged-in session):**

On any dashboard page (while signed in), run:

```javascript
const agentId = 'YOUR_AGENT_ID';
const orgId = 'YOUR_ORG_ID'; // from org switcher / network tab on API calls
const token = await window.Clerk?.session?.getToken(); // or your app's getToken
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'https://awaaz-api-nxae.onrender.com'}/api/v1/agents/${agentId}/test-call`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'x-organization-id': orgId,
    'Content-Type': 'application/json',
  },
  body: '{}',
});
console.log(await res.json());
```

Use returned `serverUrl`, `participantToken`, `roomName` with LiveKit playground or your existing test-call flow if you can open the modal programmatically.

**Option B — curl + Clerk JWT** (from a logged-in session token):

```http
POST /api/v1/agents/{agentId}/test-call
Authorization: Bearer <clerk_jwt>
x-organization-id: <org_id>
```

Join the room with the web app’s test UI only if you temporarily enable the button in DevTools (`disabled` removed) — **do not commit** that change.

**Option C — Local stack:** API + worker + web on localhost; same API steps; point `AWAAZ_API_URL` to local API.

---

## 3. End-to-end test cases

### A. Greeting

| Step | Action |
|------|--------|
| 1 | Start test call (§2.5) |
| 2 | Wait for worker to join room |
| 3 | Listen for `firstMessage` |

**PASS:** Audible greeting, no worker crash, API call status → `IN_PROGRESS`.  
**FAIL:** Silence, `503` on config, worker error `TTS provider ... not enabled`, or `Cartesia API key is required`.

### B. Conversation

| Step | Action |
|------|--------|
| 1 | Speak a short question |
| 2 | Wait for agent reply |

**PASS:** User turn transcribed (STT), agent reply heard with Cartesia voice (not Rime). Worker logs show `cartesia_tts_started` per turn.  
**FAIL:** STT/LLM errors only, or Rime-sounding voice / wrong provider in logs (`tts_runtime_provider=rime`).

### C. Interruption

| Step | Action |
|------|--------|
| 1 | Ask: “Tell me a long story about space travel.” |
| 2 | While agent is speaking, talk over the agent clearly |

**PASS:** Agent speech stops within ~1s; no long tail of old audio; logs include `cartesia_tts_cancelled` and/or `cartesia_tts_context_closed` with `reason=cancel`.  
**FAIL:** Agent keeps playing previous audio for multiple seconds; no cancel logs; overlapping monologues.

### D. End Session

| Step | Action |
|------|--------|
| 1 | End via UI “End Session” or `POST .../test-call/{callId}/end` |
| 2 | Leave room |

**PASS:** Call ends, worker shutdown logs, no repeated errors.  
**FAIL:** Hung room, worker exceptions on shutdown, websocket errors spamming after end.

### E. Persistence

| Check | Where |
|-------|--------|
| Call row | Dashboard → Calls or DB `calls` |
| Transcript | Call detail → transcript assembly completed |
| Recording | R2 object from egress metadata on call (if egress enabled) |

**PASS:** Call `ENDED`, transcript has USER + AGENT events, recording object key present when R2/LiveKit egress configured.  
**FAIL:** Missing transcript job, call stuck `IN_PROGRESS`, recording never attached.

---

## 4. Logs to inspect

**Where:** Render → `awaaz-agent-worker` → Logs (filter by `call_id` or `agent_id`).

| Log line | Meaning |
|----------|---------|
| `tts_provider_selected` | Factory chose provider; confirm `provider=cartesia` |
| `tts_runtime_provider` | Should be `cartesia` |
| `tts_key_fingerprint` | Fingerprint only — never the raw key |
| `voice_config_loaded` | Should include `tts_provider=cartesia` |
| `cartesia_tts_started` | New WS context for a turn |
| `cartesia_tts_first_audio_ms` | Time to first audio (track latency) |
| `cartesia_tts_cancelled` | Barge-in / cancel path |
| `cartesia_tts_context_closed` | Normal or cancel teardown |
| `cartesia_tts_error` | Provider/protocol failure — investigate payload |

**API logs:** `Loaded agent config` with `ttsProvider=cartesia`, `credentialMode=...`, `keyFingerprint=...`.

**Avoid:** Logging full `credentials.tts.apiKey` anywhere.

---

## 5. Success criteria

### PASS (Cartesia verified)

All required:

1. Deployed worker includes `websockets` and Cartesia code (§1).
2. Internal config for published Cartesia agent returns `pipeline.tts.providerId=cartesia` and resolvable `credentials.tts` (§2.4).
3. **A + B** — greeting and at least one full user/agent turn with Cartesia audio.
4. **C** — interrupt stops playback; cancel/close logs present.
5. **D** — session ends cleanly.
6. **E** — transcript saved; recording saved if egress enabled in your environment.
7. **Rime regression spot-check** — existing Rime agent still works after same worker deploy (one quick Test Agent).

### FAIL (do not unlock UI)

Any of:

- Worker cannot load config (`503` credential / unsupported provider).
- No audible Cartesia output despite successful room join.
- Stale audio after barge-in (critical).
- `cartesia_tts_error` on every turn.
- Transcript or call lifecycle broken vs. current Rime baseline.
- Rime agents regressed on same worker build.

### PARTIAL

- A/B pass but C flaky → fix interrupt before unlock.
- E recording missing but transcript OK → document egress gap; may still unlock TTS if audio path PASS.

---

## 6. Exact manual steps (ordered)

### Phase 0 — Deploy (15 min)

1. Merge/deploy Phase 5.3 worker + API (Cartesia allowed in `resolveTtsForRuntime`).
2. Render: deploy **API** and **agent-worker**; confirm build log installs `websockets==13.1`.
3. LiveKit Cloud → Agents → worker **Connected**.
4. `curl` API `/health` → OK.

### Phase 1 — Credentials (5 min)

1. Render API env: confirm `FINOVA_CARTESIA_API_KEY` or org BYOK for Cartesia.
2. Dashboard → Settings → AI Providers → Cartesia: valid / configured.
3. Optional: `GET /api/v1/plugins/catalog` (authenticated) — Cartesia `available: true`.

### Phase 2 — Cartesia agent (10 min)

1. Create agent `Cartesia E2E Verify`.
2. `GET /api/v1/voices?providerId=cartesia` → pick one voice; copy `rimeVoiceId`.
3. `POST .../versions` with that `voiceId`, Groq model, short prompt + `firstMessage`.
4. Verify response `ttsProviderId=cartesia`.
5. `POST .../versions/{versionId}/publish`.
6. `GET /internal/agents/{id}/config` with `x-worker-secret` → confirm Cartesia pipeline + credentials (redact key in notes).

### Phase 3 — Live test (20–30 min)

1. `POST .../test-call` (API or browser console §2.5).
2. Join room (test modal via DevTools enable, or LiveKit client with token).
3. Run cases **A → E** (§3); note timestamps and log excerpts.
4. End call; open Calls → verify transcript + recording.

### Phase 4 — Rime regression (5 min)

1. Open existing Rime live agent.
2. One Test Agent call: greet + one reply (UI works for Rime).
3. Confirm still Rime audio and no worker errors.

### Phase 5 — Decision

- **All PASS** → mark Cartesia verified in [consolidated Phase 5 checklist](./Awaaz_V2_Phase5_Runtime_Verification.md) (UI already allows runtime providers with verification banner).
- **Any FAIL** → fix worker/API; do not unlock UI.

---

## 7. Is Cartesia safe to unlock afterward?

| Unlock | When |
|--------|------|
| **Yes — Cartesia in UI** | All §5 PASS criteria met on **production** worker build, including interrupt (C) and Rime spot-check. Update `agent-runtime-guardrails.ts` to treat `cartesia` like Rime for `canPublishLive` / `canTestLive`. |
| **Not yet** | Any FAIL, or only API/config verified without live audio. |
| **UI (Phase 5.6)** | Publish/Test enabled for runtime TTS providers; verification-pending banner remains until E2E passes. |

---

## Related docs

- [Awaaz_V2_Phase5_TTS_Runtime_Plan.md](./Awaaz_V2_Phase5_TTS_Runtime_Plan.md) — overall Phase 5
- [apps/agent-worker/README.md](./apps/agent-worker/README.md) — worker runbook
- [DEPLOYMENT.md](./DEPLOYMENT.md) — Render matrix
