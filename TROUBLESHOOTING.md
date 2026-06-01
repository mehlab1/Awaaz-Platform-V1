# Troubleshooting

Operational guide for the **current** browser-preview deployment: Vercel + Render API + Render worker + LiveKit + Upstash Redis + R2.

**Architecture:** [ARCHITECTURE.md](./ARCHITECTURE.md) · **Deploy:** [DEPLOYMENT.md](./DEPLOYMENT.md)

Twilio/PSTN issues are out of scope until telephony is implemented.

---

## How to inspect logs

| Component | Where |
|-----------|--------|
| API | Render → `awaaz-api` → Logs |
| Worker | Render → `awaaz-agent-worker` → Logs |
| Web | Vercel → Deployment → Functions/Runtime logs |
| LiveKit | LiveKit Cloud → Rooms / Agents / Webhooks |
| Redis | Upstash dashboard → Commands / usage |
| R2 | Cloudflare dashboard → R2 → bucket metrics |

Filter API logs for: `BullMQ`, `Redis preflight`, `Transcript fallback`, `room_finished`, `egress_ended`, `LiveKit webhook`.

---

## Test Agent button disabled

**Symptoms:** "No unsaved changes" but Test Agent greyed out.

**Checks:**

- Hover button — tooltip shows blocking reason
- DevTools console: `[AgentEditor] Test Agent gate` debug object
- Common blocks: unsaved prompt/voice edits, save/publish in progress, agent inactive, no live published version, live version missing prompt/voice

**Note:** Test Agent uses the **live published version**, not the version you are viewing in history. Viewing V9 while V10 is live is OK if there are no unsaved edits.

---

## Stuck "Connecting" in Test Agent modal

**Symptoms:** Modal opens, spinner on Connecting, no agent audio.

**Checks:**

1. LiveKit worker **Connected** in LiveKit dashboard
2. `LIVEKIT_AGENT_NAME` identical on API and worker
3. `LIVEKIT_URL` / keys match same LiveKit project
4. Worker `AWAAZ_API_URL` points to deployed API (not localhost)
5. `WORKER_SECRET` matches on API and worker
6. Render worker not sleeping — wake API + worker via health monitor or retry after 60s
7. Browser mic permission granted

**Resolution:**

- Redeploy/restart worker after env changes
- Run Test Agent again after cold start
- Check worker logs for dispatch received / config fetch errors

---

## Worker not connecting (LiveKit)

**Symptoms:** Room created, no agent joins; worker logs show auth/connection errors.

**Checks:**

- `LIVEKIT_URL` uses `wss://` for WebRTC (worker SDK)
- API uses same project keys for room create + dispatch
- Worker build uses Python 3.11 (`runtime.txt`)
- No `REDIS_URL` required on worker — missing Redis is **not** the cause

**Resolution:** Align all `LIVEKIT_*` vars; restart worker; verify Connected in dashboard.

---

## No audio (browser test)

**Checks:**

- Microphone allowed in browser
- Agent live version has valid `voiceId` (Rime)
- `RIME_API_KEY` on worker
- Worker logs: TTS/STT errors, not just connection
- LiveKit participant subscribed to agent audio track

**Interruption issues:**

- User speech during agent playback should barge-in (see `LIVEKIT_INTERRUPT_*` env)
- If agent never stops talking: check `LIVEKIT_FINAL_PLAYBACK_DRAIN_SECONDS`, graceful end logs
- If agent cuts off too aggressively: increase `LIVEKIT_INTERRUPT_SPEECH_SECONDS`

---

## Voice mismatch (wrong voice in test call)

**Cause:** Test Agent always uses **live published version** voice, not the voice selected in editor while viewing another version or before publish.

**Resolution:**

1. Save & Publish with desired voice
2. Confirm badge "Live V{n}" on agent header
3. Re-run Test Agent with no unsaved changes

Editor voice dropdown preview (`Play preview`) uses **selected editor voice** — that is independent of Test Agent.

---

## Transcript missing or empty

**Symptoms:** Call completes; transcript/cost empty on call detail.

**Checks:**

1. **Redis:** API log `BullMQ queues enabled after Redis preflight` OR intentional fallback logs
2. **LiveKit webhook:** `room_finished` configured → `POST /webhooks/livekit`
3. **Webhook auth:** `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` on API
4. Worker emitted speech events (`/internal/calls/:id/events`)
5. API logs: `Transcript fallback assembled` or BullMQ worker processing

**Redis down / quota exceeded:**

- API disables BullMQ for process; sync fallback runs on `room_finished` webhook
- If webhook also fails, browser preview gets fallback on `endCall` + late `emitEvent`
- Re-enable Redis: fix `REDIS_URL`, remove `DISABLE_REDIS`, redeploy

**Transcript ordering / timestamps:**

- Events sorted by `startedAt` in assembly
- If ordering looks wrong, check worker event timestamps in DB `callEvent` rows
- Late events after `COMPLETED` trigger browser-preview fallback re-assembly (idempotent)

---

## Recording 404 or "Recording unavailable"

**Symptoms:** Transcript exists; recording never appears or playback 404.

**Checks:**

1. `CLOUDFLARE_R2_*` set on API
2. `LIVEKIT_BROWSER_RECORDING_ENABLED` not `false`
3. LiveKit webhook includes `egress_ended`
4. Egress not skipped — API log on room create; if egress fails, room retries without recording
5. Wait **5–30s** after hangup (egress finalize + webhook)
6. Call detail polls recording — up to ~12s client-side

**R2 causes:**

- Wrong bucket/credentials
- Object not yet uploaded when webhook fires (check API egress persist logs)
- CORS blocking browser WaveSurfer — presigned URL may still work in new tab

---

## Redis / Upstash quota exhaustion

**Symptoms:**

```text
ERR max requests limit exceeded
evalsha / auth / eval errors in loop
```

**Cause (historical):** BullMQ + ioredis reconnect loops against exhausted Upstash free tier.

**Current protections:**

- Preflight once; disable queues on failure
- No reconnect (`retryStrategy: () => null`)
- Stalled check every 60s; max 1 stalled recovery
- Analytics cache disconnects on error
- `DISABLE_REDIS=true` for local dev

**Resolution:**

1. Stop local API if burning quota
2. Local: `pnpm dev:api:no-redis` or `DISABLE_REDIS=true`
3. Production: new Upstash instance → update `REDIS_URL` → remove `DISABLE_REDIS` → redeploy
4. Rotate credentials if leaked

**Healthy startup log:**

```text
BullMQ queues enabled after Redis preflight
```

---

## Webhook misconfiguration

| Webhook | URL | Required events |
|---------|-----|-----------------|
| Clerk | `/webhooks/clerk` | org/member events |
| LiveKit | `/webhooks/livekit` | `room_finished`, `egress_ended` |

**Symptoms:** Transcripts never queue; recordings never persist.

**Checks:**

- URL uses public Render API HTTPS
- LiveKit signing uses same API key/secret as server
- Render deploy complete after URL change
- API logs show webhook verify failures → fix secrets

---

## Analytics empty

**Expected:** Browser test calls (`metadata.isTest`, `fromNumber: browser-preview`) are **excluded** from analytics.

**Checks:**

- At least one non-test call exists
- Correct `x-organization-id` header
- Redis cache miss still hits Postgres — empty usually means no qualifying calls

---

## Invalid or expired token (401)

**Checks:**

- Vercel publishable key + Render secret key = same Clerk app
- Redeploy after Clerk env change
- Sign out, hard refresh, sign in

---

## Internal endpoint 403

**Expected:** Missing/wrong `x-worker-secret` → 403.

**Fix:** Align `WORKER_SECRET` on API and worker; redeploy both.

---

## Supabase P1001

**Checks:**

- `DATABASE_URL` uses pooler port 6543 + `pgbouncer=true&sslmode=require`
- `connection_limit=1` on free tier
- Redeploy after URL change

---

## Render free tier sleeping

**Symptoms:** First request slow; Test Agent Connecting timeout; health monitor flapping.

**Resolution:**

- UptimeRobot on `/health` every 10 min
- Allow 60–90s after idle before demo
- Upgrade plan or accept cold-start delay

---

## API keys security

- Full key shown once at creation
- DB stores hash only
- Revoke test keys after QA

---

## BYOK credential save returns 503

**Error:** `BYOK credential encryption key is missing. Set PROVIDER_CREDENTIAL_ENCRYPTION_KEY (preferred) or WORKER_SECRET.`

**Why it happens:** API must encrypt BYOK provider secrets before writing `organizationProviderCredential.secretCiphertext`. If no encryption key is configured, save fails before Prisma write.

**Checks:**

1. Render API has one of:
	- `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` (preferred)
	- `PROVIDER_ENCRYPTION_KEY`
	- `CREDENTIAL_ENCRYPTION_KEY`
	- fallback: `WORKER_SECRET`
2. Redeploy API after setting env vars.
3. Retry `PUT /api/v1/plugin-credentials/:providerId`.

**Key generation (recommended):**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set output as `PROVIDER_CREDENTIAL_ENCRYPTION_KEY`.

---

## "Finova Managed is not configured" for Deepgram

**Why it happens:** This is not because Deepgram is paid. It means API runtime does not currently have a Finova-managed Deepgram key (`FINOVA_DEEPGRAM_API_KEY` or `DEEPGRAM_API_KEY`) available to serve shared Finova mode.

**Checks:**

1. Confirm env var exists on Render API (not only worker).
2. Open `GET /api/v1/plugins/catalog` and verify `deepgram.finovaManagedAvailable = true`.
3. If you only want BYOK, this message is expected and harmless after BYOK key is saved.

---

## Verification checklist after incident

```powershell
Invoke-RestMethod https://YOUR_API/health
pnpm --filter @awaaz/api exec dotenv -e ../../.env -- ts-node scripts/bullmq-smoke.ts
```

1. API health 200
2. BullMQ preflight log (production)
3. LiveKit worker Connected
4. One Test Agent → transcript + cost
5. Recording appears (if R2 configured)

---

## Still deferred (not bugs)

- Twilio/PSTN calls and audio
- Twilio recording → R2 pipeline
- `POST /webhooks/twilio`

See [Deferred_Features_Implementation_Guide.md](./Deferred_Features_Implementation_Guide.md).
