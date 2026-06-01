# Deployment

Deploy guide for the **current** Awaaz stack: Vercel web, Render API + Python worker, Supabase, Clerk, LiveKit, Upstash Redis, Cloudflare R2.

**Architecture reference:** [ARCHITECTURE.md](./ARCHITECTURE.md)

**Still deferred:** Twilio/PSTN telephony and Twilio recording ingestion only.

---

## 1. Topology overview

| Service | Platform | Blueprint name |
|---------|----------|----------------|
| Frontend | Vercel | (manual project) |
| API | Render web | `awaaz-api` |
| Voice worker | Render background worker | `awaaz-agent-worker` |
| Postgres | Supabase | — |
| Redis | Upstash | — |
| Recordings | Cloudflare R2 | bucket `awaaz-recordings` |
| Realtime | LiveKit Cloud | — |

---

## 2. Environment preparation

Copy [`.env.example`](./.env.example) → `.env` locally. Never commit secrets.

**Cross-service alignment (required):**

- Vercel `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + Render `CLERK_SECRET_KEY` → same Clerk app
- Vercel `NEXT_PUBLIC_API_URL` → Render API URL
- Render API `FRONTEND_URL` → Vercel URL
- API + worker `WORKER_SECRET` → identical
- API + worker `LIVEKIT_*` + `LIVEKIT_AGENT_NAME` → identical LiveKit project
- Worker `AWAAZ_API_URL` → Render API URL (not localhost)
- API `REDIS_URL` → Upstash `rediss://…`; **do not** set `DISABLE_REDIS` on Render

**Database URLs:**

- `DATABASE_URL` — Supabase transaction pooler, `?pgbouncer=true&sslmode=require&connection_limit=1`
- `DATABASE_DIRECT_URL` — session/direct pooler for migrations, `?sslmode=require`

---

## 3. Render API (`awaaz-api`)

Defined in [`render.yaml`](./render.yaml).

**Build:**

```bash
npm install -g pnpm@9 && pnpm install --frozen-lockfile --prod=false && pnpm --filter @awaaz/api exec prisma migrate deploy && pnpm --filter @awaaz/api exec prisma generate && pnpm --filter @awaaz/api build
```

**Start:**

```bash
node apps/api/dist/main.js
```

**Health check path:** `/health`

### Required env vars

| Variable | Notes |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3001` |
| `DATABASE_URL` | Supabase pooler |
| `DATABASE_DIRECT_URL` | Migrations |
| `FRONTEND_URL` | Vercel URL |
| `CLERK_SECRET_KEY` | |
| `CLERK_WEBHOOK_SECRET` | Clerk → `POST /webhooks/clerk` |
| `LIVEKIT_URL` | `wss://…` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | |
| `LIVEKIT_AGENT_NAME` | e.g. `awaaz-agent` |
| `WORKER_SECRET` | Shared with worker |
| `PROVIDER_CREDENTIAL_ENCRYPTION_KEY` | Required to store/decrypt BYOK provider secrets (32-byte base64/hex recommended) |
| `REDIS_URL` | Upstash `rediss://…` |
| `GROQ_API_KEY` / `DEEPGRAM_API_KEY` / `RIME_API_KEY` | Voice preview + worker config source |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Browser recordings |
| `CLOUDFLARE_R2_ACCESS_KEY` / `CLOUDFLARE_R2_SECRET_KEY` | |
| `CLOUDFLARE_R2_BUCKET_NAME` | `awaaz-recordings` |

### Optional env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `LIVEKIT_BROWSER_RECORDING_ENABLED` | `true` | Room composite egress to R2 |
| `DISABLE_REDIS` | unset | **Leave unset** in production |
| `PUBLIC_ASSET_BASE_URL` | unset | Optional R2 custom-domain base URL for cached voice previews |

### LiveKit webhooks (API)

Configure in LiveKit Cloud → Webhooks:

- URL: `https://YOUR_RENDER_API/webhooks/livekit`
- Events: `room_finished`, `egress_ended` (at minimum for transcripts + recordings)

### Redis on Render

1. Create Upstash Redis database; copy **TLS** URL (`rediss://…`)
2. Set `REDIS_URL` on Render API
3. Remove `DISABLE_REDIS` if previously set during quota outage
4. Redeploy; confirm log: `BullMQ queues enabled after Redis preflight`

If preflight fails, API still starts — transcripts use **sync fallback**; analytics skip cache.

### Health check

```powershell
Invoke-RestMethod https://YOUR_RENDER_API/health
```

Current API: `https://awaaz-api-nxae.onrender.com/health`

---

## 4. Render worker (`awaaz-agent-worker`)

**Type:** Background Worker (Python)

**Root directory:** `apps/agent-worker`

**Build:**

```bash
pip install -r requirements.txt
```

**Start:**

```bash
python main.py start
```

**Runtime:** `runtime.txt` pins `python-3.11.9`. Set `PYTHON_VERSION=3.11.9` in Render if needed.

### Required env vars

| Variable | Notes |
|----------|-------|
| `LIVEKIT_URL` | Same as API |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | |
| `LIVEKIT_AGENT_NAME` | Must match API dispatches |
| `AWAAZ_API_URL` | `https://YOUR_RENDER_API` |
| `WORKER_SECRET` | Same as API |
| `DEEPGRAM_API_KEY` / `GROQ_API_KEY` / `RIME_API_KEY` | Voice pipeline |

**Do not set:** `REDIS_URL`, `DISABLE_REDIS` — worker has no Redis dependency.

### Verification

1. LiveKit Cloud → Agents → worker shows **Connected**
2. Run browser Test Agent from dashboard
3. Worker logs: agent config loaded, call events, graceful end

See [`apps/agent-worker/README.md`](./apps/agent-worker/README.md).

---

## 5. Vercel web

**Root:** repo root

**Install:** `pnpm install --frozen-lockfile`

**Build:** `pnpm --filter web build`

### Required env vars

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | Render API URL |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key |

No Redis, LiveKit secrets, or worker keys on Vercel.

---

## 6. Clerk

- Publishable key → Vercel
- Secret key → Render API
- Webhook: `https://YOUR_RENDER_API/webhooks/clerk`
- Signing secret → `CLERK_WEBHOOK_SECRET`
- Enable organization invitations

Fake signature smoke test should return **401**:

```powershell
$api = "https://YOUR_RENDER_API"
# … see ARCHITECTURE.md or prior DEPLOYMENT examples
```

---

## 7. Cloudflare R2

Required for **browser** call recordings (not Twilio).

1. Create bucket `awaaz-recordings`
2. Create R2 API token with read/write
3. Set `CLOUDFLARE_R2_*` on Render API
4. Configure CORS for browser playback (GET, Range headers)
5. Verify: `GET /api/v1/calls/:id/recording` returns presigned URL after test call

Object key pattern: `recordings/browser-preview/{orgId}/{agentId}/{roomName}.mp3`

---

## 8. Database migrations

Runs in Render API build. Manual:

```powershell
pnpm --filter @awaaz/api prisma:deploy
pnpm --filter @awaaz/api prisma:validate
```

Seed (optional baseline org/agent):

```powershell
pnpm --filter @awaaz/api prisma:seed
```

---

## 9. Post-deploy verification

```powershell
pnpm --filter web lint
pnpm --filter web build
pnpm --filter @awaaz/api build
pnpm --filter @awaaz/api prisma:validate
```

**Functional checks:**

1. Sign in → `/agents` → open agent → **Test Agent** (live version, no unsaved edits)
2. Complete browser call → `/calls/:id` → transcript, cost, latency within ~10s
3. Recording appears after egress (may take 5–30s)
4. `/analytics` loads (non-test calls only)
5. API log: `BullMQ queues enabled after Redis preflight`
6. LiveKit worker **Connected**

**Security checks:**

- Clerk fake webhook → 401
- `/internal/*` without `x-worker-secret` → 403
- Cross-org `x-organization-id` → 403

---

## 10. Free-tier survival

| Monitor | URL | Interval |
|---------|-----|----------|
| Render API | `https://YOUR_API/health` | 10 min |
| Vercel web | `https://YOUR_APP/` | 10 min |

- `/internal/worker/heartbeat` is **private** (`x-worker-secret` required)
- After cold start, run one Test Agent call before demos
- Render free tier workers/API sleep after idle — expect 30–90s first request delay

---

## 11. Local vs production env summary

| Setting | Local `.env` | Render API | Render worker | Vercel |
|---------|--------------|------------|---------------|--------|
| `DISABLE_REDIS` | `true` | omit | N/A | N/A |
| `REDIS_URL` | optional | required | **none** | N/A |
| `AWAAZ_API_URL` | `http://localhost:3001` | N/A | Render API URL | N/A |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | N/A | N/A | Render API URL |

Full variable list: [`.env.example`](./.env.example) and [ARCHITECTURE.md](./ARCHITECTURE.md).
