# Awaaz Web (Dashboard)

Next.js 15 dashboard for the Awaaz V1 platform (`apps/web`).

## Features

- Clerk authentication and org context
- Agents editor (versioning, publish, **Test Agent** browser preview)
- Call history and detail (transcript, latency, R2 recording playback)
- Analytics, phone numbers, settings, Qualicall placeholder

## Local run

From repo root (uses root `.env` via Next.js env loading):

```bash
pnpm dev:web
```

Open [http://localhost:3000](http://localhost:3000).

Required env (see [`.env.example`](../../.env.example)):

- `NEXT_PUBLIC_API_URL` — local API default `http://localhost:3001`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

Test Agent requires API + LiveKit + Python worker running. See [ARCHITECTURE.md](../../ARCHITECTURE.md).

## Deploy

Vercel — see [DEPLOYMENT.md](../../DEPLOYMENT.md) §5.

```bash
pnpm --filter web build
```
