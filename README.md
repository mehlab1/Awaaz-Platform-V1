# Awaaz V1 Platform

Multi-tenant AI voice agent platform: configure agents, run **browser LiveKit test calls**, review call history (transcripts, latency, recordings), and monitor analytics.

**Architecture (current):** [ARCHITECTURE.md](./ARCHITECTURE.md) — deployment topology, browser preview flow, Redis safe mode, R2 recordings, env vars, verification logs.

**Deploy:** [DEPLOYMENT.md](./DEPLOYMENT.md) · **Incidents:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## What is implemented

- Next.js dashboard on **Vercel** (Clerk auth, agents, calls, analytics, settings)
- NestJS API on **Render** (Prisma/Supabase, Clerk webhooks, LiveKit test-call, internal worker API)
- Python **LiveKit agent worker** on **Render** (Deepgram → Groq → Rime; barge-in; graceful end)
- **Browser Test Agent** — uses **live published version**; LiveKit WebRTC preview
- **Cloudflare R2** browser recordings via LiveKit Egress + presigned playback
- **Transcript + cost assembly** via BullMQ; **sync fallback** when Redis disabled/unavailable
- **Redis safe mode** — preflight, no retry storms, `DISABLE_REDIS` for local dev
- Agent versioning, publish flow, voice preview, phone assignment UI, members, API keys
- Analytics (test calls excluded from production metrics)

## What is still deferred

- **Twilio/PSTN** live calls, Twilio webhooks, Twilio→R2 recording ingestion, PSTN recording lifecycle

Details: [Deferred_Features_Implementation_Guide.md](./Deferred_Features_Implementation_Guide.md)

## Apps

| Path | Role |
|------|------|
| `apps/web` | Next.js dashboard |
| `apps/api` | NestJS API + BullMQ + webhooks |
| `apps/agent-worker` | Python LiveKit voice worker (**no Redis**) |
| `apps/qualicall-worker` | Placeholder |

## Local development

**Requirements:** Node 20, pnpm 9+, Supabase, Clerk, LiveKit. Redis optional locally.

```powershell
pnpm install
Copy-Item .env.example .env
pnpm --filter @awaaz/api prisma:validate
pnpm --filter @awaaz/api prisma:deploy
pnpm --filter @awaaz/api prisma:seed
```

```powershell
pnpm dev:api          # API with Redis (if REDIS_URL set and DISABLE_REDIS=false)
pnpm dev:api:no-redis # API without Redis — transcript fallback mode
pnpm dev:web
```

Worker (separate terminal):

```powershell
cd apps/agent-worker
pip install -r requirements.txt
python main.py start
```

Set `DISABLE_REDIS=true` in local `.env` to avoid burning Upstash quota during dev.

## Verification

```powershell
pnpm --filter web build
pnpm --filter @awaaz/api build
pnpm --filter @awaaz/api prisma:validate
git diff --check
```

## Free-tier monitoring

- API: `GET https://YOUR_RENDER_API/health` every 10 minutes (UptimeRobot)
- Web: Vercel root URL every 10 minutes
- Do **not** expose `/internal/worker/heartbeat` publicly (requires `x-worker-secret`)

Historical execution checklist: [Awaaz_V1_Agent_Execution_Playbook.md](./Awaaz_V1_Agent_Execution_Playbook.md) (phase labels kept for traceability; see ARCHITECTURE.md for current state).
