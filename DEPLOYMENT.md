# Deployment

This guide covers the current verified non-Twilio deployment path: Vercel web, Render API, Supabase Postgres, Clerk, LiveKit, and Redis. Twilio/PSTN/R2 recording work remains Phase 9.

## 1. Prepare Environment

Use `.env.example` as the source of required variable names. Never commit `.env` or real secrets.

Important alignment checks:

- Vercel `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and Render `CLERK_SECRET_KEY` must come from the same Clerk app/environment.
- Vercel `NEXT_PUBLIC_API_URL` must point to the deployed Render API URL.
- Render `FRONTEND_URL` must point to the deployed Vercel web URL.
- Render `DATABASE_URL` should use the Supabase transaction pooler with `pgbouncer=true`, `sslmode=require`, and a small connection limit.
- Render `DATABASE_DIRECT_URL` should use a migration-safe direct/session-pooler URL with `sslmode=require`.

## 2. Render API

The repo includes `render.yaml` for the API service.

Expected build command:

```bash
npm install -g pnpm@9 && pnpm install --frozen-lockfile --prod=false && pnpm --filter @awaaz/api exec prisma migrate deploy && pnpm --filter @awaaz/api exec prisma generate && pnpm --filter @awaaz/api build
```

Expected start command:

```bash
node apps/api/dist/main.js
```

Required Render variables:

- `NODE_ENV=production`
- `PORT=3001`
- `DATABASE_URL`
- `DATABASE_DIRECT_URL`
- `FRONTEND_URL`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_AGENT_NAME`
- `WORKER_SECRET`
- `REDIS_URL`
- `GROQ_API_KEY`
- `DEEPGRAM_API_KEY`
- `RIME_API_KEY`

R2 variables are optional until Phase 9 recording/preview verification:

- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY`
- `CLOUDFLARE_R2_SECRET_KEY`
- `CLOUDFLARE_R2_BUCKET_NAME`

Health check:

```powershell
Invoke-RestMethod https://YOUR_RENDER_API/health
```

Current deployed API health URL:

```text
https://awaaz-api-nxae.onrender.com/health
```

## 3. Vercel Web

Configure the project from the repo root.

Build command:

```bash
pnpm --filter web build
```

Install command:

```bash
pnpm install --frozen-lockfile
```

Required Vercel variables:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

Optional/supabase client variables if used by future frontend flows:

- `NEXT_PUBLIC_SUPABASE_URL`
- `ANON_KEY`

## 4. Clerk

Configure:

- Web app publishable key in Vercel.
- Secret key in Render.
- Clerk webhook endpoint: `https://YOUR_RENDER_API/webhooks/clerk`.
- Webhook signing secret in Render as `CLERK_WEBHOOK_SECRET`.
- Organization invitations enabled for the app.

Security smoke check:

```powershell
$api = "https://YOUR_RENDER_API"
$headers = @{
  "Content-Type" = "application/json"
  "svix-id" = "msg_fake_phase8"
  "svix-timestamp" = [string][DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  "svix-signature" = "v1,fake_signature"
}
$body = '{"type":"user.created","data":{"id":"user_fake"}}'
try {
  Invoke-WebRequest -Uri "$api/webhooks/clerk" -Method POST -Headers $headers -Body $body -ErrorAction Stop
} catch {
  Write-Host "StatusCode:" ([int]$_.Exception.Response.StatusCode)
}
```

Expected: `401`.

## 5. Database

Run migrations during Render deploy or manually:

```powershell
pnpm --filter @awaaz/api prisma:deploy
pnpm --filter @awaaz/api prisma:validate
```

Seed only when intentionally creating the baseline org/agent state:

```powershell
pnpm --filter @awaaz/api prisma:seed
```

Seed variables can override defaults; see `.env.example`.

## 6. Post-Deploy Verification

Run:

```powershell
pnpm --filter web lint
pnpm --filter web build
pnpm --filter @awaaz/api build
pnpm --filter @awaaz/api prisma:validate
```

Verify deployed pages:

- `/agents`
- `/calls`
- `/analytics`
- `/phone-numbers`
- `/settings/members`
- `/settings/api-keys`
- `/settings/organization`
- `/qualicall`

Verify non-Twilio security:

- Clerk fake signature returns `401`.
- Internal endpoint without `x-worker-secret` returns `403`.
- Cross-org wrong `x-organization-id` returns `403`.
- VIEWER mutation returns `403`.
- Organization route/header mismatch returns `403`.

## 7. Free-Tier Survival

Use UptimeRobot or an equivalent free monitor as the primary keep-alive. Do not add monitors that require Clerk user tokens or private worker secrets.

Recommended monitors:

- Render API: `GET https://awaaz-api-nxae.onrender.com/health` every 10 minutes. Expected response: HTTP `200` with JSON containing `status: "ok"`.
- Vercel web: `GET https://YOUR_VERCEL_APP/` every 10 minutes. Expected response: HTTP `200` or a normal Vercel redirect.

Optional Supabase keepalive decision:

- Skip public Supabase keepalive for the current Phase 8 scope. A direct Supabase ping either needs credentials or a deliberately public endpoint, so the safer current posture is API/web monitoring plus normal app traffic.

Worker heartbeat:

- `/internal/worker/heartbeat` is protected by `x-worker-secret`.
- A request without `x-worker-secret` should return `403`; this is expected and confirms the endpoint is not public.
- If the worker is deployed with private env vars, it may call `/internal/worker/heartbeat` every 5 minutes using the shared `WORKER_SECRET`.
- Live PSTN worker hardening remains Phase 9.

Manual checks:

```powershell
$api = "https://awaaz-api-nxae.onrender.com"
Invoke-RestMethod "$api/health"

try {
  Invoke-WebRequest "$api/internal/worker/heartbeat" -ErrorAction Stop
} catch {
  Write-Host "Expected protected heartbeat status:" ([int]$_.Exception.Response.StatusCode)
}
```

Expected heartbeat status without a secret: `403`.

Cold-start mitigation:

- After a long idle period, open the deployed web app and run one browser test call before demoing critical non-Twilio flows.
- Real PSTN warm-up and recording-path validation are Phase 9.

## 8. Out of Scope Until Phase 9

Do not block Phase 8 on:

- Twilio/PSTN live calls.
- Twilio recording webhook.
- R2 recording upload/download.
- Voice preview playback.
- Real recording waveform/audio playback.
- Live PSTN worker hardening.
