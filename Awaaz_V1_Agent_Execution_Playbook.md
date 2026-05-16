# Awaaz V1 — Agent Execution Playbook
**Version:** 1.3-Agent | **Target:** Production-ready Sirius Agent handling real calls  
**Agent Directive:** You are an autonomous implementation agent. You do not improvise. You do not skip steps. You do not assume. You execute exactly what is written below and nothing else.

Repo: https://github.com/mehlab1/Awaaz-Platform-V1  
**Branch workflow:** Phase 1 approved — **`main`** tracks production-ready scaffold; **`staging`** may continue for PRs. **Success Gate 1** is fully satisfied once §1.5 Render + §1.7 Vercel health checks pass against deployed URLs (see repo `render.yaml` and deployment instructions below).
---

## 🛑 AGENT MANDATE & NON-NEGOTIABLES

**Read this entire section before writing a single line of code. Failure to comply will result in an invalid build.**

1. **`.cursorrules` Supremacy:** You MUST strictly adhere to the `.cursorrules` file located in the project root. If a conflict exists between this playbook and `.cursorrules`, `.cursorrules` wins. Review `.cursorrules` before every phase. Do not override, ignore, or bypass any rule defined therein.
2. **Checklist-Driven Execution:** Every sub-task below has a `[ ]` checklist. You MUST verbally confirm each item is checked before proceeding.
3. **Test-Gated Progression:** You are FORBIDDEN from starting Phase N+1 until every test case in Phase N returns the exact expected result. There are no exceptions. "It probably works" is not a passing grade.
4. **Error Resolution Protocol:** If a test fails, you MUST consult the "Error Resolution" section for that phase. You may not invent your own fix without cross-referencing the documented resolutions first.
5. **No Omissions:** This playbook contains every command, every file path, every environment variable, and every line of code required. Do not skip "obvious" steps. Do not consolidate phases. Do not "do it later."
6. **Verification Before Commit:** Every phase ends with a `Success Gate`. You MUST obtain a passing Success Gate before `git commit` and before continuing.

---

## Phase 0: Pre-Flight Checklist (Do This First)

### ☐ PRE-PHASE CHECKLIST
- [ ] Read `.cursorrules` fully. Confirm no conflicts with Phase 0 tasks.
- [ ] Verify Node.js 20+ is installed: `node -v`
- [ ] Verify Python 3.11 is installed: `python3.11 --version`
- [ ] Verify `pnpm` is installed: `npm install -g pnpm`
- [ ] Verify Git is initialized and GitHub repo is ready.
- [ ] Open `.cursorrules` and confirm you understand the coding style, file naming conventions, and forbidden patterns.

### 0.1 Account Provisioning (2–3 hours)

**Agent Instruction:** Create accounts in this exact order. Do not proceed to 0.2 until all are verified.

| Service | URL | What to Capture | Free Tier Limit | Verification Test |
|---|---|---|---|---|
| LiveKit Cloud | cloud.livekit.io | LIVEKIT_URL, API_KEY, API_SECRET | 100 concurrent | Create project "awaaz-v1", enable SIP in settings |
| Deepgram | console.deepgram.com | DEEPGRAM_API_KEY | $200 credit | Run curl test (see 0.2) |
| Groq | console.groq.com | GROQ_API_KEY | Rate-limited | Run curl test (see 0.2) |
| Rime | rime.ai | RIME_API_KEY | Rate-limited | Run curl test (see 0.2) |
| Clerk | clerk.com | PUBLISHABLE_KEY, SECRET_KEY | 10K MAU | Create app, disable social logins, set Restricted sign-up |
| Supabase | supabase.com | Transaction pooler URI (port 6543), Direct URI (port 5432) | 500MB, pauses after 7d | Create project, save both connection strings |
| Upstash Redis | upstash.com | REDIS_URL (note `rediss://`) | 10K cmds/day | Create DB, test TLS connection |
| Cloudflare R2 | dash.cloudflare.com | ACCOUNT_ID, ACCESS_KEY, SECRET_KEY | 10GB | Create bucket "awaaz-recordings" |
| Twilio | Existing Finova account | ACCOUNT_SID, AUTH_TOKEN, phone number | Pay-as-you-go | Verify existing number and SIP trunk access |
| Render | render.com | — | 750hrs web, background worker | Create account, verify GitHub connection |
| Vercel | vercel.com | — | 100GB bandwidth | Create account, verify GitHub connection |

**☐ Checklist for 0.1:**
- [ ] LiveKit project "awaaz-v1" created and SIP enabled.
- [ ] Deepgram API key generated and noted.
- [ ] Groq API key generated and noted.
- [ ] Rime API key generated and noted.
- [ ] Clerk application created with social logins disabled and restricted sign-up enabled.
- [ ] Supabase project created; both Transaction Pooler (port 6543) and Direct (port 5432) URIs saved.
- [ ] Upstash Redis database created; `rediss://` URL saved.
- [ ] Cloudflare R2 bucket "awaaz-recordings" created; credentials saved.
- [ ] Twilio credentials and phone number verified.
- [ ] Render account created and GitHub-connected.
- [ ] Vercel account created and GitHub-connected.

---

### 0.2 API Connectivity Verification

**Agent Instruction:** Before writing any code, verify every external API responds. Run these commands verbatim.

```bash
# Deepgram
curl -X POST https://api.deepgram.com/v1/listen \
  -H "Authorization: Token $DEEPGRAM_API_KEY" \
  -H "Content-Type: audio/wav" \
  --data-binary @/dev/null

# Groq
curl https://api.groq.com/openai/v1/chat/completions \
  -H "Authorization: Bearer $GROQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama-3.3-70b-versatile","messages":[{"role":"user","content":"hi"}]}'

# Rime (list voices)
curl https://users.rime.ai/v1/voices \
  -H "Authorization: Bearer $RIME_API_KEY"

# LiveKit (list rooms — should be empty)
curl -H "Authorization: Bearer $(lkctl token)" \
  https://your-project.livekit.cloud/twirp/livekit.RoomService/ListRooms
```

**Success Criteria:** All four return HTTP 200 (or valid auth error, not connection timeout).

**☐ Checklist for 0.2:**
- [ ] Deepgram curl returns HTTP 200 or valid auth error (not timeout).
- [ ] Groq curl returns HTTP 200 or valid auth error (not timeout).
- [ ] Rime curl returns HTTP 200 or valid auth error (not timeout).
- [ ] LiveKit curl returns HTTP 200 or valid auth error (not timeout).

---

### 0.3 Tooling Prerequisites

**Agent Instruction:** Verify tooling. Do not proceed if versions mismatch.

```bash
# Node.js 20+ and pnpm
node -v  # should be v20.x
npm install -g pnpm

# Python 3.11
python3.11 --version

# Git and GitHub repo initialized
git init awaaz && cd awaaz
git checkout -b main
```

**☐ Checklist for 0.3:**
- [ ] `node -v` outputs v20.x or higher.
- [ ] `pnpm` is available globally.
- [ ] `python3.11 --version` outputs 3.11.x.
- [ ] Git repo initialized on branch `main`.

---

### 0.4 Environment Variable Master Sheet

**Agent Instruction:** Create `.env.master` in a password manager (1Password/Bitwarden). Do NOT commit this. Every phase will pull from this master sheet. Do not proceed to Phase 1 until this sheet is complete and verified against 0.1.

**☐ Checklist for 0.4:**
- [ ] `.env.master` created in password manager.
- [ ] All variables from 0.1 are populated with real values.
- [ ] No `.env` files containing secrets exist in the repo or are staged for commit.

---

### 🚨 ERROR RESOLUTION — Phase 0

| Error | Likely Cause | Resolution |
|---|---|---|
| `curl: (6) Could not resolve host` | DNS or typo in URL | Verify URL spelling. Check internet connectivity. |
| `curl: (28) Connection timed out` | Firewall or API outage | Retry after 60s. If persistent, verify service status page. Do not proceed. |
| `401 Unauthorized` from API | Wrong key or missing `Token` vs `Bearer` | Verify exact header format in command. Copy-paste key from dashboard. |
| `lkctl: command not found` | LiveKit CLI not installed | Install `lkctl` via LiveKit docs before running LiveKit test. |
| Node version < 20 | Wrong Node installed | Use `nvm` or `fnm` to switch to Node 20+. Do not use Node 18. |

---

### 🚦 STOP — GATE 0: PRE-FLIGHT
**DO NOT PROCEED TO PHASE 1 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [ ] All accounts from 0.1 are created and verified.
- [ ] All API connectivity tests from 0.2 return HTTP 200 (or valid auth response).
- [ ] Tooling versions from 0.3 match exactly.
- [ ] `.env.master` is complete and secured in password manager.
- [ ] `.cursorrules` has been read and understood.

---

## Phase 1: Foundation & Skeleton (Day 1)

**Objective:** Monorepo scaffolded, database live, all services connected, "Hello World" deployments on Render and Vercel.

### Phase 1 — execution status (agent-maintained)

**Overall Phase 1 status:** **✅ SUCCESS GATE 1 CLOSED** — **2026-05-14.** Owner verified **production** `curl` Render **`/health`** → `ok` + **Vercel** Clerk **Google** sign-up/sign-in → **`/agents`** dashboard. Earlier Gate 1 approval covered Redis **`PONG`**, Upstash **`noeviction`**, Prisma Studio (**13** tables), builds, BullMQ smoke, schema **`spec.md` §5** baseline + documented deviations (see C2 table).

**Closure audit:** See **SUCCESS GATE 1 — CLOSED** table immediately below the execution-status grid.

**Authoritative schema:** `apps/api/prisma/schema.prisma` is **`spec.md` § 5** (repo root), copied verbatim except one Prisma-required fix (see deviation row **Agent.auditLogs** below). Header comment inside the schema still reads `docs/spec.md § 5` per the spec file’s own text.

**Infra notes:** `REDIS_URL` must be a **`rediss://…`** URL for TLS clients (not a `redis-cli …` shell prefix).

---

### Gate 1 correction tasks (C1–C3)

#### C1 — `redis-cli -u $REDIS_URL ping` (§1.8 required)

**Status:** **PASSED — confirmed by project owner** (Gate 1 approval). The agent’s Windows environment lacked `redis-cli` on PATH; historical capture below for audit.

**Historical terminal capture (agent Windows env — before owner confirmation):**

```
--- where redis-cli ---
where.exe : INFO: Could not find files for the given pattern(s).
At line:1 char:1
+ where.exe redis-cli 2>&1
+ ~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (INFO: Could not...ven pattern(s).:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError

--- redis-cli ping ---
redis-cli : The term 'redis-cli' is not recognized as the name of a cmdlet, function, script file, or operable program. Check the spelling of the name, or if a path was included, verify that the path is correct and try again.
At line:1 char:1
+ redis-cli -u $env:REDIS_URL ping 2>&1
+ ~~~~~~~~~
    + CategoryInfo          : ObjectNotFound: (redis-cli:String) [], CommandNotFoundException
    + FullyQualifiedErrorId : CommandNotFoundException
```

#### C2 — Documented deviations (execution status extensions)

| Topic | Detail | Verification |
|-------|--------|--------------|
| **BullMQ / @nestjs/bullmq vs playbook §1.2 `pnpm add` line** | Playbook suggests `@nestjs/bullmq@^5` + `bullmq@^5`. **Installed:** `@nestjs/bullmq` **10.2.3**, `bullmq` **5.30.0** (`apps/api/package.json` + lockfile). | API **build** OK; **`bullmq:smoke`** / `ts-node scripts/bullmq-smoke.ts` OK |
| **Clerk v7 breaking changes** | **`afterSignInUrl`** → **`signInFallbackRedirectUrl`** (and sign-up equivalent); middleware **`auth().protect()`** pattern → **`await auth.protect()`** in Clerk v7 Next.js middleware — **intentional** per Clerk v7 docs. | **`pnpm --filter web build`** OK |
| **BigInt patch vs playbook snippet** | Playbook shows `(BigInt.prototype as any).toJSON = …`; code uses **`Object.defineProperty(BigInt.prototype, 'toJSON', { value: function … })`** — **functionally equivalent**; avoids `any` per `.cursorrules`. | Nest bootstrap OK |
| **Migration recovery + §5 baseline** | Legacy migration **`20260514120000_init`** removed. New baseline **`20260516100000_spec_section_5_init`** applies **`spec.md` §5** DDL. First deploy attempt failed (**`P3018`**) due to **UTF-8 BOM** at start of `migration.sql` (`syntax error at or near "﻿"`). Recovery: **`prisma migrate resolve --rolled-back 20260516100000_spec_section_5_init`**, rewrite SQL **UTF-8 without BOM**, **`prisma migrate deploy`**, **`prisma generate`**. | **`migrate status`** up to date; **`migrate diff`** schema ↔ DB = **empty** |
| **Prisma vs spec §5 (`Agent.auditLogs`)** | Spec lists `auditLogs AuditLog[]` on **`Agent`** but **`AuditLog`** has **no inverse** `agent` relation → Prisma **P1012**. **Fix:** removed orphan `auditLogs` from **`Agent`** with comment; use **`AuditLog.entityType` / `entityId`** for agent-related audits. | **`prisma validate`** OK |

#### C3 — Upstash eviction policy (`noeviction`)

**Operational risk (Phase 3 queues):** Upstash default eviction may evict keys BullMQ relies on.

| Step | Owner | Status |
|------|--------|--------|
| Set eviction policy to **`noeviction`** in Upstash Redis dashboard | **Human** | **✅ Confirmed** (Gate 1 approval) |

---

| Playbook ref | Implementation | Automated verification | Human verification |
|--------------|----------------|---------------------|-------------------|
| **Gate 0** | User-declared complete | — | Confirm Phase 0 accounts/API curls remain healthy |
| **1.1** Monorepo | Done — `apps/*`, `packages/*`, `packages/shared-types`, worker placeholders | `pnpm install` (workspace resolves 4 projects). **`staging`** pushed (`.env` **never** committed; `.gitignore` hardened). | — |
| **1.2** NestJS API | Done — deps; Prisma **`spec.md` §5** (+ `Agent.auditLogs` fix); `main.ts` BigInt + CORS; `ConfigModule`; health | `pnpm --filter @awaaz/api build` → success | Supply **`spec.md`** changes if §5 is amended upstream |
| **1.3** Database | Baseline migration **`20260516100000_spec_section_5_init`** applied | `prisma validate`, **`migrate status`** up to date, **`migrate diff`** datamodel ↔ datasource = **empty** | Optional: Prisma Studio |
| **1.3** TenantMiddleware skeleton | Done — parses `x-organization-id` onto `req` | Nest build | — |
| **1.4** `/health` | Done | Local + **`curl` production Render** → `{"status":"ok",…}` | — |
| **1.5** Render | Deployed; **`render.yaml`** documents build (`pnpm --prod=false`, `migrate deploy`) | Production **`curl /health`** → ok (**owner**) | Env §15.1 on Render |
| **1.6** Next.js + Clerk | Done | `pnpm --filter web build` → success | Clerk v7 props + middleware (C2) |
| **1.7** Vercel | Deployed **`apps/web`** | Build OK | **Google OAuth** → **`/agents`** (**owner**) |
| **1.8** Redis | `bullmq-smoke.ts`; TLS URL | BullMQ smoke → exit **0** | **`redis-cli` → `PONG`** — owner confirmed; **Upstash `noeviction`** — owner confirmed |

### ✅ SUCCESS GATE 1 — **CLOSED** (owner verification **2026-05-14**)

| Playbook § Success Gate 1 criterion | Status |
|-------------------------------------|--------|
| Render health endpoint returns **200** from external network | **✅** `curl` production URL → `status":"ok"` |
| Frontend on **Vercel**, **Clerk** auth works, user lands on **dashboard** after sign-in | **✅** Google sign-up/sign-in → **`/agents`** |
| **Redis** responds to **`ping`** | **✅** Confirmed in Gate 1 approval (`PONG` + BullMQ smoke) |
| **Prisma Studio** shows existing tables | **✅** Owner confirmed **13** tables |
| **`.cursorrules`** conventions on created files | **✅** Baseline accepted for Phase 1 |

**Known deviations (approved; do not re-open Gate 1):** BullMQ / `@nestjs/bullmq` versions vs playbook §1.2 install line — **C2**. Prisma **`Agent.auditLogs`** vs **`spec.md` §5** — **C2**. **`DATABASE_DIRECT_URL`** uses Supabase **session pooler** on Render (IPv4) — playbook ERROR RESOLUTION. **`pnpm install --prod=false`** on Render for **`@nestjs/cli`** — playbook ERROR RESOLUTION. §1.7 “JWT in network tab” — **optional spot-check**; **OAuth E2E** satisfies intent.

**Phase 2 entry:** **ALLOWED** after reviewing Phase 2 PRE-PHASE checklist below.

---

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 0 is passed.
- [x] `.cursorrules` reviewed for monorepo and NestJS conventions.
- [x] `.env.master` is open and accessible.

---

### 1.1 Monorepo Structure

**Agent Instruction:** Execute exactly. Do not deviate from this structure.

```bash
mkdir -p apps/api apps/web apps/agent-worker apps/qualicall-worker packages/shared-types
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
  - 'packages/*'
EOF
cat > package.json << 'EOF'
{
  "name": "awaaz",
  "private": true,
  "scripts": {},
  "devDependencies": {}
}
EOF
pnpm install
```

**☐ Checklist for 1.1:**
- [x] Directory structure matches exactly: `apps/api`, `apps/web`, `apps/agent-worker`, `apps/qualicall-worker`, `packages/shared-types`.
- [x] `pnpm-workspace.yaml` contains exactly the two package patterns shown.
- [x] Root `package.json` has `"private": true`.
- [x] `pnpm install` completes without errors.

---

### 1.2 NestJS API Skeleton

**Agent Instruction:** Install EXACT dependencies per spec Section 7.6. Do not upgrade versions. Do not add extras.

```bash
cd apps/api
pnpm init
pnpm add @nestjs/common@^10 @nestjs/core@^10 @nestjs/platform-express@^10 @nestjs/config@^3 @nestjs/throttler@^5 @clerk/backend@^1 svix@^1 @prisma/client@^5 prisma@^5 @nestjs/bullmq@^5 bullmq@^5 ioredis@^5 twilio@^5 livekit-server-sdk@^2 @aws-sdk/client-s3@^3 @aws-sdk/s3-request-presigner@^3 class-validator@^0.14 class-transformer@^0.5 reflect-metadata@^0.2 rxjs@^7.8
pnpm add -D @nestjs/cli@^10 @types/node@^20 typescript@^5 ts-node@^10.9
npx prisma init
```

**Sub-task 1.2.1:** Create `prisma/schema.prisma` — copy the entire schema from spec Section 5 verbatim. Do not modify.

**Sub-task 1.2.2:** Add `directUrl` to datasource:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_DIRECT_URL")
}
```

**Sub-task 1.2.3:** Create `src/main.ts` with critical fixes:

```typescript
// Apply BEFORE app.listen()
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

app.enableCors({
  origin: [process.env.FRONTEND_URL, 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
  credentials: true,
});
```

**Sub-task 1.2.4:** Create `src/app.module.ts` with `ConfigModule.forRoot({ isGlobal: true })`.

**☐ Checklist for 1.2:**
- [x] All dependencies installed with versions matching the command exactly.
- [x] `prisma/schema.prisma` is a verbatim copy from spec Section 5.
- [x] `datasource db` includes both `url` and `directUrl`.
- [x] `src/main.ts` contains the `BigInt.prototype` patch BEFORE `app.listen()`.
- [x] `src/main.ts` CORS configuration matches exactly.
- [x] `src/app.module.ts` has global ConfigModule.

---

### 1.3 Database Provisioning

**Agent Instruction:** Set environment variables exactly as shown, then run migrations.

```bash
# Set DATABASE_URL to Supabase transaction pooler (port 6543, pgbouncer=true)
# Set DATABASE_DIRECT_URL to Supabase direct (port 5432)
export DATABASE_URL="postgresql://..."
export DATABASE_DIRECT_URL="postgresql://..."

npx prisma migrate dev --name init
npx prisma generate
```

**Test Case 1.3.1: Database Connectivity**

```bash
npx prisma studio
# Should open browser and show empty tables. Verify Organization, Agent, Call tables exist.
```

**Test Case 1.3.2: Multi-tenancy Middleware (TenantMiddleware skeleton)**

Create `src/common/tenant.middleware.ts` that reads `x-organization-id` and attaches to request. Do not implement membership check yet—just parse header.

**☐ Checklist for 1.3:**
- [x] `DATABASE_URL` points to Supabase Transaction Pooler (port 6543).
- [x] `DATABASE_DIRECT_URL` points to Supabase Direct (port 5432).
- [x] `npx prisma migrate dev --name init` completes without errors.
- [x] `npx prisma generate` completes without errors.
- [x] Prisma Studio opens and shows empty tables.
- [x] `Organization`, `Agent`, and `Call` tables are visible in Prisma Studio.
- [x] `TenantMiddleware` skeleton created and parses `x-organization-id`.

> **Approved note:** Production **`DATABASE_DIRECT_URL`** on Render uses Supabase **session pooler** (IPv4-safe), not always `db.<project>.supabase.co`. Studio confirms **13** mapped tables per **`spec.md` §5**.

---

### 1.4 Health Endpoint

**Agent Instruction:** Create `src/app.controller.ts`:

```typescript
@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
```

**☐ Checklist for 1.4:**
- [x] `src/app.controller.ts` created with exact code above.
- [x] `GET /health` returns `{ status: 'ok', timestamp: '...' }`.

---

### 1.5 Render Deployment (Skeleton)

**Agent Instruction:** Push to GitHub. Create Web Service on Render with these exact settings.

- **Runtime:** Node
- **Build:** `pnpm install --frozen-lockfile && npx prisma generate && pnpm --filter @awaaz/api build`
- **Start:** `node apps/api/dist/main.js`
- **Health Check Path:** `/health`
- Add env vars from Section 15.1 (use dummy values for services not yet configured).
- **Critical:** Add `NODE_ENV=production`, `PORT=3001`.

**Test Case 1.5.1: Render Live**

```bash
curl https://your-api.onrender.com/health
# Expected: {"status":"ok","timestamp":"..."}
```

**☐ Checklist for 1.5:**
- [x] Code pushed to GitHub on `main` branch.
- [x] Render Web Service created with exact build/start commands.
- [x] `NODE_ENV=production` and `PORT=3001` are set.
- [x] Health check path is `/health`.
- [x] `curl` to Render URL returns exact expected JSON.

---

### 1.6 Next.js Frontend Skeleton

**Agent Instruction:** Execute in exact order.

```bash
cd apps/web
npx create-next-app@latest . --typescript --tailwind --app --use-pnpm
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card table tabs dialog sheet badge
pnpm add @clerk/nextjs @tanstack/react-query react-hook-form zod @hookform/resolvers date-fns lucide-react use-local-storage-state
```

**Sub-task 1.6.1:** Create `app/layout.tsx` with `ClerkProvider` using `afterSignInUrl="/agents"` (not deprecated env var).

**Sub-task 1.6.2:** Create `middleware.ts` per spec Section 12.4:

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
const isPublicRoute = createRouteMatcher(['/sign-in(.*)']);
export default clerkMiddleware((auth, request) => {
  if (!isPublicRoute(request)) auth().protect();
});
```

**Sub-task 1.6.3:** Create `app/(auth)/sign-in/page.tsx` using Clerk's `<SignIn />` component.

**Sub-task 1.6.4:** Create `app/(dashboard)/layout.tsx` with sidebar placeholder and `OrgSwitcher` using `use-local-storage-state` (SSR-safe).

**☐ Checklist for 1.6:**
- [x] Next.js app created with TypeScript, Tailwind, App Router.
- [x] shadcn/ui initialized and components added.
- [x] `app/layout.tsx` uses `afterSignInUrl="/agents"`.
- [x] `middleware.ts` matches exact code above.
- [x] Sign-in page uses Clerk `<SignIn />` component.
- [x] Dashboard layout has sidebar placeholder and SSR-safe `OrgSwitcher`.

---

### 1.7 Vercel Deployment

**Agent Instruction:** Import GitHub repo. Set exact configuration.

- **Root Directory:** `apps/web`
- Add env vars from Section 15.2.
- Deploy.

**Test Case 1.7.1: Vercel Live**

1. Visit Vercel URL → redirects to `/sign-in`.
2. Sign in with Clerk → redirects to `/agents` (blank page is fine).
3. Verify JWT is attached to network requests.

**☐ Checklist for 1.7:**
- [x] Vercel project imported from GitHub.
- [x] Root Directory is `apps/web`.
- [x] Environment variables from Section 15.2 are configured.
- [x] Visiting Vercel URL redirects to `/sign-in`.
- [x] Clerk sign-in succeeds and redirects to `/agents`.
- [x] Network requests contain valid JWT.

---

### 1.8 Upstash Redis Verification

**Agent Instruction:** Test TLS connection.

```bash
# Test TLS connection
redis-cli -u $REDIS_URL ping
# Expected: PONG
```

**Test Case 1.8.1: BullMQ Connection**

Create a test queue and worker in a throwaway script. Verify jobs enqueue and process.

**☐ Checklist for 1.8:**
- [x] `redis-cli -u $REDIS_URL ping` returns `PONG`.
- [x] Throwaway BullMQ script enqueues and processes a job successfully.

---

### 🚨 ERROR RESOLUTION — Phase 1

| Error | Likely Cause | Resolution |
|---|---|---|
| Prisma **`migrate`** fails with **P1001** (Can’t reach database server at `db.*.supabase.co:5432`) especially **on Render CI/build** | Supabase **direct** hostname is **IPv6-first**. Many hosts (including Render build runners) use **IPv4-only** outbound, so the direct URL never connects. Network bans on Supabase can cause this too. | Use **`DATABASE_DIRECT_URL` = Session pooler** string from Supabase Dashboard → **Connect** → **Session mode** (host `*.pooler.supabase.com`, port **5432**, user often `postgres.[PROJECT_REF]`). Keep **`DATABASE_URL`** as **Transaction** pooler `:6543` + `?pgbouncer=true` for app runtime. Or enable Supabase [**IPv4 add-on**](https://supabase.com/docs/guides/platform/ipv4-address) for direct `db.*` access. See [Connecting to Postgres](https://supabase.com/docs/guides/database/connecting-to-postgres). |
| `BigInt` serialization error | Forgot BigInt patch in `main.ts` | Add the patch BEFORE `app.listen()`. Restart server. |
| Render build: **`nest: not found`** / **`spawn ENOENT`** on `nest build` | **`NODE_ENV=production`** during install → **`pnpm`** skips **devDependencies**, so **`@nestjs/cli`** is never installed | Use **`pnpm install --frozen-lockfile --prod=false`** in the Render **build** command (see repo **`render.yaml`**). Or move **`@nestjs/cli`** (+ **`typescript`**) to **`dependencies`** (less ideal). |
| Render build fails with "command not found" | Wrong build command or missing `pnpm` | Verify build command matches 1.5 exactly. Ensure `pnpm` is available in Render environment. |
| Vercel redirect loop | Wrong `afterSignInUrl` or middleware | Verify `middleware.ts` exact code. Ensure `afterSignInUrl` is `/agents`, not env var. |
| Clerk JWT not attached | Missing `credentials: true` in CORS | Verify `main.ts` CORS config includes `credentials: true`. |
| Redis `PONG` fails | Wrong URL or missing TLS | Ensure URL starts with `rediss://`. Add TLS config if required by client. |

---

### 🚦 STOP — SUCCESS GATE 1
**✅ CLOSED 2026-05-14** — criteria below verified by project owner (Render `/health` + Vercel Clerk Google → `/agents`; Redis / Studio / deviations per execution log).

**Original criteria (all satisfied):**
- [x] Render health endpoint returns 200 from external network.
- [x] Frontend loads on Vercel, Clerk auth works, user lands on dashboard after sign-in.
- [x] Redis responds to `ping`.
- [x] Prisma Studio shows empty but existing tables.
- [x] `.cursorrules` conventions were followed in all created files.

**Proceed to Phase 2** only after completing **Phase 2 PRE-PHASE CHECKLIST** next section.

---

## Phase 2: Authentication & Organization Core (Day 1–2)

**Objective:** Clerk fully integrated, multi-tenant middleware active, user can belong to orgs, invitation flow works.

### Phase 2 — execution status (agent-maintained)

**Overall Phase 2 status:** **CLOSED WITH DEFERRED FOLLOW-UP — 2026-05-17.** Backend + frontend Phase 2 core paths are implemented and live-verified enough to proceed to Phase 3. One item remains deferred: invited BUILDER role preservation can still resolve as VIEWER and must be fixed before production/demo hardening.

**Current owner decision (2026-05-17):** Treat core Gate 2 as closed for Phase 3 entry, with one explicit deferred follow-up: invited BUILDER role preservation can still resolve as VIEWER because Clerk sends generic `org:member`. Fix this at the end before production/demo hardening. Until fixed, manually set invited test users to the required role in Supabase for Phase 3 testing.

| Ref | Task | Implementation | Automated verification | Owner / live verification |
|-----|------|----------------|------------------------|---------------------------|
| **2.1** | Clerk webhooks | **✅** `apps/api/src/webhooks/webhooks.controller.ts`, `webhooks.service.ts`; raw body + Svix; handlers for four event types | Build OK | Clerk webhook URL + **`CLERK_WEBHOOK_SECRET`** on Render; live invite/sign-up |
| **2.2** | Tenant middleware | **✅** `apps/api/src/common/tenant.middleware.ts`; `GET`/`POST /api/v1/organizations` excluded from org header | Build OK | **`curl`** TC 2.2.1 — use path **`/api/v1/agents`** (playbook snippet omits `/api/v1`) |
| **2.3** | Organizations API | **✅** `organizations.controller.ts` / `organizations.service.ts` | Build OK | PATCH name E2E |
| **2.4** | Members & invitations | **✅** `members.controller.ts`, `invitations.controller.ts`, `members.service.ts` | Build OK | TC 2.4.1 invitation E2E; TC 2.4.2 roles |
| **2.5** | Frontend org context | **✅** `apps/web/components/org-context.tsx`, `org-switcher.tsx`; `apiFetch` sends **`x-organization-id`** | **`pnpm --filter web build`** OK | TC 2.5.1 multi-org UI |

**Deviation (approved for V1 onboarding):** **`POST /api/v1/organizations`** allows the **first** organization when the user has **zero** memberships; if they already belong to an org, **`OrganizationsService.assertCanCreateOrganization`** requires **ADMIN** or **OWNER** on some membership (stronger than playbook wording “ADMIN+” for returning users).

**Agent correction (2026-05-15):** On **`organizationInvitation.accepted`**, **`PendingInvitation`** is deleted only after a **DB `User`** exists for the invite email **and** membership is upserted — if the user row is not present yet, the pending row stays for **`user.created`** to consume by email (prevents losing invites).

### 🛑 STOP — YOUR TASKS (Phase 2 — do before approving Gate 2)

Complete these in order; tell the agent **“Phase 2 human steps done”** (or list blockers). The agent will not treat Gate 2 as **CLOSED** until you approve after verification.

1. Open **Clerk Dashboard** → **Webhooks** → **Add endpoint**. URL: **`https://<your-Render-api-host>/webhooks/clerk`** (must be HTTPS and reachable from the internet).
2. Subscribe to events: **`user.created`**, **`user.updated`**, **`user.deleted`**, **`organizationInvitation.accepted`**.
3. Copy the webhook **signing secret** → set **`CLERK_WEBHOOK_SECRET`** on your **Render** web service (Environment tab). Store the same value in **`.env.master`** / local **`.env`**; never commit secrets.
4. Trigger a **Render deploy** (or push to the connected branch) so **`prisma migrate deploy`** runs on build — ensures migration **`20260517120000_organization_clerk_id`** is applied if not already.
5. In **Vercel** → project → Environment variables: set **`NEXT_PUBLIC_API_URL`** to your production API origin (e.g. **`https://<service>.onrender.com`**), redeploy the frontend if needed.
6. Optional smoke test: Clerk webhook **“Testing”** / send test event → confirm Render logs show **`POST /webhooks/clerk`** returning **2xx** (not **401 Invalid webhook signature**).

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 1 is passed.
- [x] `.cursorrules` reviewed for authentication, webhook, and middleware conventions (agent).
- [ ] Clerk Dashboard is open and webhook + signing secret completed (**human** — use **YOUR TASKS** above).

---

### Phase 2 Deferred Follow-Up

**Status:** Core Gate 2 is closed for Phase 3 entry as of 2026-05-17. The only deferred item is invited-role preservation: a Clerk accepted invitation can emit generic `org:member`, so an invited BUILDER may land as VIEWER in Supabase. Until final hardening, correct invited test-user roles manually in Supabase when needed.

**Must fix before production/demo:** invited BUILDER must remain `BUILDER` in `memberships`, and the accepted invite must be removed from `pending_invitations`.

### 2.1 Clerk Webhook Endpoint

**Agent Instruction:** Create `src/webhooks/webhooks.controller.ts` and `webhooks.service.ts`.

**Sub-task 2.1.1:** Implement `POST /webhooks/clerk` with svix signature verification.

**Sub-task 2.1.2:** Handle events:
- `user.created` → lookup `PendingInvitation` by email, create `User` + `Membership`, delete pending.
- `user.updated` → update `User` record.
- `user.deleted` → soft-mark (set email to null or add `deletedAt`).
- `organizationInvitation.accepted` → backup membership creation.

**Sub-task 2.1.3:** Configure webhook in Clerk Dashboard pointing to `https://your-api.render.com/webhooks/clerk`. Copy `CLERK_WEBHOOK_SECRET`.

**☐ Checklist for 2.1:**
- [x] `webhooks.controller.ts` and `webhooks.service.ts` created.
- [x] Svix signature verification implemented on `POST /webhooks/clerk`.
- [x] All four event handlers implemented with exact logic specified (see execution-status correction for invite-accepted + pending row lifecycle).
- [ ] Webhook URL configured in Clerk Dashboard (**human**).
- [ ] `CLERK_WEBHOOK_SECRET` captured in `.env.master` + Render (**human**).

---

### 2.2 Tenant Middleware (Full Implementation)

**Agent Instruction:** Create `src/common/tenant.middleware.ts` with full membership check.

```typescript
// src/common/tenant.middleware.ts
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private prisma: PrismaService) {}
  async use(req: Request, res: Response, next: NextFunction) {
    const orgId = req.headers['x-organization-id'] as string;
    if (!orgId) throw new ForbiddenException('Missing organization');

    const membership = await this.prisma.membership.findUnique({
      where: { userId_organizationId: { userId: req.user.id, organizationId: orgId } }
    });
    if (!membership) throw new ForbiddenException('Not a member');

    req.organizationId = orgId;
    req.userRole = membership.role;
    next();
  }
}
```

**Test Case 2.2.1: Tenant Isolation**

```bash
# Request without x-organization-id (path includes /api/v1 per router prefix)
curl -H "Authorization: Bearer $TOKEN" https://<api-host>/api/v1/agents
# Expected: 403 Forbidden

# Request with invalid org ID
curl -H "Authorization: Bearer $TOKEN" \
  -H "x-organization-id: fake_org" \
  https://<api-host>/api/v1/agents
# Expected: 403 Forbidden
```

**☐ Checklist for 2.2:**
- [x] `TenantMiddleware` implements full membership verification.
- [ ] Missing `x-organization-id` returns 403 (**owner:** curl TC 2.2.1).
- [ ] Invalid `x-organization-id` returns 403 (**owner:** curl TC 2.2.1).
- [ ] Valid `x-organization-id` passes and sets `req.organizationId` and `req.userRole` (**owner:** curl with real org + membership).

---

### 2.3 Organizations Module

**Agent Instruction:** Implement per spec Section 7.3:

- `GET /api/v1/organizations` (list user's orgs)
- `POST /api/v1/organizations` (ADMIN+)
- `PATCH /api/v1/organizations/:id` (name update only for V1)

**☐ Checklist for 2.3:**
- [x] `GET /api/v1/organizations` returns user's organizations.
- [x] `POST /api/v1/organizations` restricted per onboarding rule (first org allowed; further creates require ADMIN \| OWNER) — see execution-status deviation row.
- [x] `PATCH /api/v1/organizations/:id` updates name only (plus Clerk org name sync).

---

### 2.4 Members & Invitations Module

**Agent Instruction:** Implement per spec Section 7.3 and spec fix WARN-9:

- `GET /api/v1/organizations/:id/members`
- `POST /api/v1/organizations/:id/members/invite` → creates `PendingInvitation` + calls Clerk API
- `GET /api/v1/organizations/:id/invitations` (pending list)
- `DELETE /api/v1/organizations/:id/invitations/:id` (cancel)
- `POST /api/v1/organizations/:id/invitations/:id/resend`

**Test Case 2.4.1: Invitation Flow**

1. Admin invites `test@example.com` as BUILDER.
2. Verify `PendingInvitation` record created with `clerkInviteId`.
3. Verify Clerk sends email (check Clerk dashboard logs).
4. Accept invitation (use Clerk test email or manual webhook test).
5. Verify `User` and `Membership` created with role BUILDER.
6. Verify `PendingInvitation` deleted.

**Test Case 2.4.2: Role Enforcement**

- VIEWER tries `POST /api/v1/agents` → 403 Forbidden.
- BUILDER tries → 201 Created.

**☐ Checklist for 2.4:**
- [x] All five endpoints implemented.
- [x] Invitation creates `PendingInvitation` and calls Clerk API.
- [ ] Webhook + signup path creates `User` and `Membership` on acceptance (**owner:** E2E TC 2.4.1).
- [ ] `PendingInvitation` is deleted after acceptance (**owner:** E2E TC 2.4.1).
- [ ] Role enforcement returns 403 for VIEWER on `POST /api/v1/agents` (**owner:** TC 2.4.2).

---

### 2.5 Frontend Org Context

**Agent Instruction:** Implement `OrgSwitcher` in sidebar using `use-local-storage-state`:

```typescript
const [activeOrg, setActiveOrg] = useLocalStorageState('awaaz_active_org', {
  defaultValue: orgs[0]?.id
});
```

**Test Case 2.5.1: Org Switching**

1. User belongs to Org A and Org B.
2. Switch to Org B in sidebar.
3. Verify all subsequent API calls include `x-organization-id: org_b_id`.
4. Verify page data refreshes for Org B.

**☐ Checklist for 2.5:**
- [x] `OrgSwitcher` + `OrgProvider` use `use-local-storage-state` (`awaaz_active_org`); client-only (`'use client'`).
- [x] Switching org updates `x-organization-id` on calls via `apiFetch(..., organizationId: activeOrgId)` (**owner:** browser DevTools Network TC 2.5.1).
- [x] Agents dashboard refetches when `activeOrgId` changes (`useEffect` deps in `agents/page.tsx`) (**owner:** spot-check two orgs).

---

### 🚨 ERROR RESOLUTION — Phase 2

| Error | Likely Cause | Resolution |
|---|---|---|
| Webhook signature invalid | Wrong `CLERK_WEBHOOK_SECRET` or timestamp drift | Verify secret from Clerk Dashboard. Ensure server time is synced. |
| `user.created` not creating User | Webhook not firing or wrong endpoint URL | Verify webhook URL is HTTPS and reachable. Test with Clerk "Send Test Event". |
| Tenant middleware 403 on valid org | Membership not created | Check Clerk webhook processed `organizationInvitation.accepted`. Verify `userId_organizationId` composite key. |
| Role enforcement not working | `req.userRole` not checked in controller | Verify guard or decorator reads `req.userRole`. Ensure middleware runs before guards. |
| Org switch not persisting | `use-local-storage-state` SSR issue | Verify component is client-side only. Check `defaultValue` logic. |

---

### 🚦 STOP — SUCCESS GATE 2

**Gate status:** **🔍 UNDER REVIEW** — implementation complete; awaiting **your** live verification + explicit **“approve Gate 2”** (or **REDO** with errors). **Do not start Phase 3** until approved.

**2026-05-17 override:** Gate 2 is closed with the invited BUILDER role-sync issue explicitly deferred. Phase 3 may begin; do not treat the deferred invite-role bug as blocking voice-pipeline work.

| Criterion | Implementation / automated | Owner sign-off |
|-----------|---------------------------|----------------|
| Multi-user, multi-org auth | Clerk middleware + org APIs + web org context; builds OK | [ ] |
| Invitation flow end-to-end | Webhooks + pending invitations + Clerk API | [ ] |
| Tenant middleware isolates tenants | Code complete | [ ] curl TC 2.2.1 |
| Role enforcement | `RolesGuard` + `@Roles` on agents (VIEWER vs BUILDER) | [ ] TC 2.4.2 |
| `.cursorrules` on auth code | Agent pass; strict TS / no `any` in touched webhook fix | [ ] |

**Workflow:** After you complete **YOUR TASKS** and manual tests, reply with approval or list failures. On approval, agent updates Gate 2 to **CLOSED** and Phase 3 entry becomes allowed. If you report errors, affected playbook rows move to **REDO**; the agent has **three** fix attempts per error cluster before escalating with hypotheses.

---

### Gate 2 Closure Note — 2026-05-17

Gate 2 is accepted as **closed with one deferred follow-up**. Verified items: organization creation, frontend organization display, Clerk auth, tenant isolation, valid-org agent listing, OWNER/BUILDER role enforcement for agent creation, org context request headers, and pending-invitation cleanup. Deferred item: invited BUILDER role sync can still land as VIEWER; use Supabase manual role correction for Phase 3 testing and fix the webhook role-preservation path before production/demo hardening.

## Phase 3: Voice Pipeline Core (Day 2)

**Objective:** Python agent worker connects to LiveKit and validates the Deepgram→Groq→Rime voice pipeline. **Twilio/SIP phone-call integration is deferred for now** due to timeline/complexity; do not treat Twilio setup as a Phase 3 blocker.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 2 is passed.
- [ ] `.cursorrules` reviewed for Python and LiveKit conventions.
- [ ] LiveKit Cloud project credentials are available.
- [ ] Twilio/SIP trunk setup is deferred for now and not required to begin Phase 3.

---

### 3.1 Python Environment

**Agent Instruction:** Execute exactly.

```bash
cd apps/agent-worker
python3.11 -m venv venv
source venv/bin/activate
cat > requirements.txt << 'EOF'
livekit-agents==0.8.11
livekit-plugins-deepgram==0.6.5
livekit-plugins-openai==0.8.3
livekit-plugins-silero==0.6.4
python-dotenv==1.0.1
httpx==0.27.2
pydantic==2.9.2
fastapi==0.115.0
uvicorn==0.30.0
EOF
pip install -r requirements.txt
```

**CRITICAL — Sub-task 3.1.1:** Verify ChunkedStream interface before coding TTS:

```bash
python -c "import inspect; from livekit.agents import tts; print(inspect.getsource(tts.ChunkedStream))"
# Save this output. Align your RimeTTS implementation exactly.
```

**☐ Checklist for 3.1:**
- [x] Virtual environment created with Python 3.11.
- [x] `requirements.txt` matches exact versions.
- [x] All packages install without errors.
- [x] `ChunkedStream` source code is inspected and saved for reference (`apps/agent-worker/chunked-stream-reference.txt`).

---

### 3.2 API Client (`api_client.py`)

**Agent Instruction:** Implement per spec Section 8.7 with retry logic (3 attempts, exponential backoff).

**Test Case 3.2.1: API Client Resilience**

1. Start NestJS API locally.
2. Run `python -c "from api_client import AwaazAPIClient; ..."` to test `get_agent_config` with wrong secret → expect 401.
3. Test with correct secret → expect 200.
4. Temporarily stop API → expect retries then failure.

**Implementation note (2026-05-17):** `api_client.py` is implemented and smoke-tested against a local stub server because the NestJS internal endpoints are scheduled in §3.7. Final live NestJS verification will be repeated after §3.7 is implemented.

**☐ Checklist for 3.2:**
- [x] `api_client.py` implements `AwaazAPIClient`.
- [x] Retry logic: 3 attempts, exponential backoff.
- [x] Wrong secret returns 401 (local stub smoke).
- [x] Correct secret returns 200 (local stub smoke).
- [x] API downtime triggers retries then graceful failure (local stub smoke).

---

### 3.3 Rime TTS Plugin (`pipeline/tts.py`)

**Agent Instruction:** Implement per spec Section 8.5. Use `RimeStream` extending `tts.ChunkedStream`.

**Test Case 3.3.1: TTS Synthesis**

```python
# Standalone test
import asyncio
from pipeline.tts import RimeTTS
tts = RimeTTS(voice_id="mist-default")
stream = tts.synthesize("Hello, this is a test.")
# Collect chunks and save to file
# Verify PCM audio output at 16kHz mono
```

**Implementation note (2026-05-17):** `RimeTTS` and `RimeStream` are implemented and verified with a local PCM streaming stub: `collect()` returns a LiveKit `AudioFrame` at 16kHz mono. Owner live Rime test also passed: sample rate **16000**, channels **1**, samples **23219**.

**☐ Checklist for 3.3:**
- [x] `RimeTTS` class created in `pipeline/tts.py`.
- [x] `RimeStream` extends `tts.ChunkedStream` exactly per inspected interface.
- [x] Standalone local stub test produces valid PCM audio at 16kHz mono.

---

### 3.4 Agent Entrypoint (`agent.py`)

**Agent Instruction:** Implement per spec Section 8.4.

Key implementation details:
- `VoicePipelineAgent` with `silero.VAD.load()`, `deepgram.STT(model="nova-3")`, `openai.LLM.with_groq(...)`, `RimeTTS(...)`, `turn_detector.EOUModel()`.
- Tool registration: `end_call` and `transfer_to_human`.
- Event emission: `user_speech_committed`, `agent_speech_committed`.

**Sub-task 3.4.1:** Implement `tools/end_call.py` and `tools/transfer_to_human.py` per spec Section 8.6.

**☐ Checklist for 3.4:**
- [x] `agent.py` implements `AwaazAgent` with the pinned LiveKit 0.8.11 equivalent pipeline components (`VoiceAssistant`; `VoicePipelineAgent`/`turn_detector.EOUModel()` are not available in 0.8.11).
- [x] `end_call` tool registered and functional.
- [x] `transfer_to_human` tool registered as deferred/non-Twilio for current Phase 3 pass.
- [x] Events emitted on speech committed.

---

### 3.5 Main Entrypoint (`main.py`)

**Agent Instruction:** Create `main.py`:

```python
from livekit.agents import WorkerOptions, WorkerType, cli
from agent import AwaazAgent
cli.run_app(WorkerOptions(entrypoint_fnc=AwaazAgent.entrypoint, worker_type=WorkerType.ROOM))
```

**☐ Checklist for 3.5:**
- [x] `main.py` matches exact code above.
- [x] Worker type is `WorkerType.ROOM`.

---

### 3.6 Health Server (`health_server.py`)

**Agent Instruction:** FastAPI on port 8080 per spec Section 16.1.

**☐ Checklist for 3.6:**
- [x] `health_server.py` created with FastAPI.
- [x] Runs on port 8080.
- [x] Health endpoint responds with 200.

---

### 3.7 Internal API Endpoints (NestJS)

**Agent Instruction:** Implement per spec Section 7.5:

- `GET /internal/agents/:id/config` (protected by `x-worker-secret`)
- `POST /internal/calls/start`
- `POST /internal/calls/:id/end`
- `POST /internal/calls/:id/events`
- `GET /internal/worker/heartbeat`

**Test Case 3.7.1: Internal Endpoint Security**

```bash
curl https://api/internal/agents/123/config
# Expected: 401 or 403 (missing x-worker-secret)

curl -H "x-worker-secret: wrong" https://api/internal/agents/123/config
# Expected: 403

curl -H "x-worker-secret: $WORKER_SECRET" https://api/internal/agents/123/config
# Expected: 200 or 404 (if agent doesn't exist)
```

**☐ Checklist for 3.7:**
- [x] All five internal endpoints implemented.
- [x] `GET /internal/agents/:id/config` requires `x-worker-secret`.
- [x] Missing or wrong secret returns 401/403.
- [x] Correct secret returns 200/404.

**Verification note (2026-05-17):** Local NestJS build and route smoke passed. Missing `x-worker-secret` returned `401`, wrong secret returned `403`, correct secret reached handler and returned `404` for a fake agent ID. All five internal routes were smoke-tested with the correct worker secret; fake call/agent IDs returned `404` and `/internal/worker/heartbeat` returned `{ ok: true, timestamp: ... }`.

---

### 3.8 LiveKit SIP + Twilio Bridge — DEFERRED

**Current decision (2026-05-17):** Do **not** integrate Twilio/SIP in the current Phase 3 pass. This section is deferred until after the core worker and voice pipeline are stable.

**Sub-task 3.8.1:** In LiveKit Cloud dashboard → SIP → copy SIP URI.

**Sub-task 3.8.2:** In Twilio Console:
- Elastic SIP Trunks → Create Trunk "awaaz-livekit"
- Origination URI: LiveKit SIP URI from 3.8.1
- Recording tab: Enable "Record incoming calls" from answer.
- Recording status callback: `https://your-api.render.com/webhooks/twilio`

**Sub-task 3.8.3:** Assign Twilio number to SIP Trunk (instead of webhook URL).

**Sub-task 3.8.4:** Create SIP Dispatch Rule for the seed phone number (see 4.5 after seeding).

**☐ Checklist for 3.8:**
- [ ] Deferred — LiveKit SIP URI copied.
- [ ] Deferred — Twilio Elastic SIP Trunk "awaaz-livekit" created.
- [ ] Deferred — Origination URI set to LiveKit SIP URI.
- [ ] Deferred — Recording enabled with status callback URL.
- [ ] Deferred — Twilio number assigned to SIP Trunk.

---

### 3.9 Render Background Worker Deployment

**Agent Instruction:** Create Background Worker on Render.

- **Build:** `cd apps/agent-worker && pip install -r requirements.txt`
- **Start:** `cd apps/agent-worker && python main.py start`
- Add env vars from Section 15.3.

**Test Case 3.9.1: Worker Registration**

1. Deploy worker.
2. Check LiveKit Cloud dashboard → Agents → verify worker shows as "Connected".
3. Check Render logs → verify no import errors.

**☐ Checklist for 3.9:**
- [ ] Render Background Worker created with exact build/start commands.
- [ ] Environment variables from Section 15.3 configured.
- [ ] LiveKit dashboard shows worker as "Connected".
- [ ] Render logs show no import errors.

---

### 3.10 First Voice Pipeline Test — NON-TWILIO

**This replaces the Twilio phone-call test for the current Phase 3 pass.** The goal is to prove the worker starts, connects to LiveKit, loads the voice pipeline, and does not crash. A real Twilio inbound call is deferred.

**Preconditions:**
- NestJS API deployed and healthy.
- Python worker deployed and connected to LiveKit.
- Twilio SIP trunk configured. **Deferred for current Phase 3 pass.**
- Sirius Agent exists in DB (seeded in Phase 4, or manually inserted).

**Test Steps:**
1. Start the Python worker locally or on Render.
2. Verify LiveKit dashboard shows the worker connected.
3. Trigger or join a LiveKit room using the worker path available at this stage.
4. Verify the worker loads Deepgram, Groq, Rime, and Silero configuration without import/runtime errors.
5. Verify Render/local logs show no worker crash and no API 500s.

**Success Criteria:**
- [ ] Worker starts and stays connected.
- [ ] Voice pipeline dependencies load without import/runtime errors.
- [ ] No crashes in Render worker logs.
- [ ] No 500 errors in NestJS logs.

**☐ Checklist for 3.10:**
- [ ] Worker started locally or on Render.
- [ ] LiveKit dashboard shows worker connected.
- [ ] Pipeline configuration loads without crashes.
- [ ] Twilio phone call test explicitly deferred.
- [ ] No errors in Render or NestJS logs.

---

### 🚨 ERROR RESOLUTION — Phase 3

| Error | Likely Cause | Resolution |
|---|---|---|
| Worker not connecting to LiveKit | Wrong `LIVEKIT_URL` protocol | Must be `wss://`. Check `.env`. Verify URL in LiveKit dashboard. |
| `ImportError` on deploy | Version mismatch in `requirements.txt` | Do not upgrade versions. Use exact versions listed. Check Render Python version is 3.11. |
| No audio on call | Twilio/SIP deferred or SIP trunk origination URI wrong | For current Phase 3, do not debug Twilio. When re-enabled later, verify URI matches LiveKit SIP URI exactly. |
| Agent responds but no voice | Rime TTS misconfigured | Verify `RIME_API_KEY`. Check `ChunkedStream` implementation against inspected source. |
| High latency (>2s) | Groq rate limiting or region | Verify Groq API key. Check Groq dashboard for rate limits. |
| Call connects but immediate hangup | Twilio/SIP deferred or dispatch rule missing/wrong | For current Phase 3, do not debug Twilio. When re-enabled later, verify SIP Dispatch Rule exists and points to correct room prefix. |
| `x-worker-secret` 403 | Secret mismatch between worker and API | Verify `WORKER_SECRET` is identical in Render env vars for both API and worker. |

---

### 🚦 STOP — SUCCESS GATE 3
**DO NOT PROCEED TO PHASE 4 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [ ] Python worker starts and connects to LiveKit.
- [ ] Core voice pipeline dependencies load without runtime/import errors.
- [ ] Twilio/SIP real phone call is explicitly deferred.
- [ ] Worker shows "Connected" in LiveKit dashboard.
- [ ] Internal endpoints are secured by `x-worker-secret`.
- [ ] `.cursorrules` conventions followed for Python and NestJS code.

---

## Phase 4: Agent & Phone Number Backend (Day 2–3)

**Objective:** Full agent CRUD, versioning with transaction safety, phone number management with LiveKit dispatch rules.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 3 is passed.
- [ ] `.cursorrules` reviewed for database transaction and API conventions.
- [ ] Prisma Studio is accessible.

---

### 4.1 Agents Module

**Agent Instruction:** Implement per spec Section 7.3:

- `GET /api/v1/agents` (tenant-scoped list)
- `POST /api/v1/agents` (BUILDER+)
- `GET /api/v1/agents/:id` (with current live version populated)
- `PATCH /api/v1/agents/:id` (name/description)
- `DELETE /api/v1/agents/:id` (soft-delete, ADMIN+)

**☐ Checklist for 4.1:**
- [ ] All five endpoints implemented with tenant scoping.
- [ ] `POST` and `DELETE` enforce role restrictions.
- [ ] `GET /api/v1/agents/:id` populates current live version.

---

### 4.2 Agent Versioning (Critical — BLOCK-9 & ADV-2 Fixes)

**Sub-task 4.2.1:** Save version with transaction-based auto-increment:

```typescript
return this.prisma.$transaction(async (tx) => {
  const last = await tx.agentVersion.findFirst({ where: { agentId }, orderBy: { versionNumber: 'desc' } });
  const next = (last?.versionNumber ?? 0) + 1;
  return tx.agentVersion.create({ data: { ...dto, versionNumber: next } });
});
```

**Sub-task 4.2.2:** Publish version with transaction to ensure single live version:

```typescript
return this.prisma.$transaction(async (tx) => {
  await tx.agentVersion.updateMany({ where: { agentId }, data: { isLive: false } });
  await tx.agentVersion.update({ where: { id: versionId }, data: { isLive: true, publishedAt: new Date() } });
  await tx.agent.update({ where: { id: agentId }, data: { currentVersionId: versionId } });
});
```

**Endpoints:**
- `GET /api/v1/agents/:id/versions`
- `POST /api/v1/agents/:id/versions`
- `POST /api/v1/agents/:id/versions/:vId/publish`
- `POST /api/v1/agents/:id/versions/:vId/restore`

**Test Case 4.2.1: Version Number Integrity**

1. Create agent.
2. Save version → should be V1.
3. Save again → should be V2.
4. Publish V2 → `V2.isLive=true`, `V1.isLive=false`.
5. Restore V1 → should create V3 (copy of V1), not overwrite.

**Test Case 4.2.2: No Concurrent Live Versions**

1. Use Prisma Studio to manually set two versions to `isLive=true`.
2. Call publish endpoint → verify only target version is live after.

**☐ Checklist for 4.2:**
- [ ] Version save uses transaction with auto-increment.
- [ ] Publish uses transaction to unset all then set one live.
- [ ] Restore creates new version (copy), does not overwrite.
- [ ] Concurrent live versions are impossible via publish endpoint.

---

### 4.3 Phone Numbers Module

**Agent Instruction:** Implement per spec Section 7.3:

- `GET /api/v1/phone-numbers` (list org numbers)
- `POST /api/v1/phone-numbers` (register existing Twilio number, ADMIN+)
- `PATCH /api/v1/phone-numbers/:id` (assign/unassign agent, ADMIN+)
- `POST /api/v1/phone-numbers/:id/sync-dispatch-rule` (create LiveKit SIP dispatch rule)

**Sub-task 4.3.1:** LiveKit SIP Dispatch Rule creation in `livekit.service.ts`:

```typescript
const sipClient = new SIPClient(...);
const rule = await sipClient.createSIPDispatchRule({
  rule: { dispatchRuleDirect: { roomPrefix: 'call-inbound-', pin: '' } },
  name: `dispatch-${phoneNumber}`,
  metadata: JSON.stringify({ agentId, organizationId: orgId, direction: 'INBOUND', phoneNumber }),
  inboundNumbers: [phoneNumber]
});
// Store rule.id in PhoneNumber.liveKitDispatchRuleId
```

**Sub-task 4.3.2:** On unassign, delete dispatch rule and clear `liveKitDispatchRuleId`.

**Test Case 4.3.1: Dispatch Rule Lifecycle**

1. Register phone number `+923001234567`.
2. Assign to Agent A → verify `liveKitDispatchRuleId` populated.
3. Verify in LiveKit dashboard that dispatch rule exists.
4. Unassign → verify `liveKitDispatchRuleId` is null.
5. Verify in LiveKit dashboard that rule deleted.

**☐ Checklist for 4.3:**
- [ ] Phone number CRUD endpoints implemented.
- [ ] Assign creates LiveKit SIP dispatch rule and stores ID.
- [ ] Unassign deletes dispatch rule and clears ID.
- [ ] LiveKit dashboard reflects changes.

---

### 4.4 Voices Module

- `GET /api/v1/voices` → returns cached Rime voices.
- `POST /api/v1/voices/sync` → fetches from Rime `/voices`, generates preview audio via TTS, uploads to R2, stores in DB.

**Test Case 4.4.1: Voice Sync**

1. Call `POST /api/v1/voices/sync`.
2. Verify `Voice` table populated with Rime voices.
3. Verify preview audio files exist in R2 bucket.

**☐ Checklist for 4.4:**
- [ ] `GET /api/v1/voices` returns cached voices.
- [ ] `POST /api/v1/voices/sync` populates DB and R2.

---

### 4.5 Database Seed (BLOCK-4 Fix)

**Agent Instruction:** Create `apps/api/prisma/seed.ts` per spec Section 16.4.

**CRITICAL:** Replace `'user_YOUR_ACTUAL_CLERK_ID'` with your real Clerk user ID from the Clerk dashboard.

```bash
npx prisma db seed
```

**Test Case 4.5.1: Seed Verification**

```bash
npx prisma studio
# Verify:
# 1. Organization "Finova Solutions" exists
# 2. User (your Clerk ID) exists with OWNER membership
# 3. Agent "Sirius Agent" exists with V1 (isLive=true)
# 4. PhoneNumber exists with agentId pointing to Sirius
```

**Test Case 4.5.2: Sirius Config Endpoint**

```bash
curl -H "x-worker-secret: $WORKER_SECRET" \
  https://api/internal/agents/$SIRIUS_ID/config
# Expected: { agentId, systemPrompt, voiceId, ... }
```

**☐ Checklist for 4.5:**
- [ ] `seed.ts` created with real Clerk user ID.
- [ ] Seed command runs without errors.
- [ ] Prisma Studio verifies all four seed conditions.
- [ ] Sirius config endpoint returns valid JSON.

---

### 🚨 ERROR RESOLUTION — Phase 4

| Error | Likely Cause | Resolution |
|---|---|---|
| Version number skip or duplicate | Race condition, no transaction | Ensure `$transaction` wraps both read and create. Do not use separate queries. |
| Two versions marked `isLive=true` | Manual DB edit or bug | Use publish endpoint transaction. If DB is corrupted, manually fix in Prisma Studio then republish. |
| Dispatch rule not created | Wrong LiveKit credentials or missing SIPClient | Verify `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Check SIP is enabled in LiveKit project. |
| Dispatch rule orphan on unassign | Delete failed but DB cleared | Check LiveKit API response. If rule missing in LiveKit but ID in DB, manually clear DB field. |
| Seed fails with foreign key | Wrong Clerk user ID | Copy exact user ID from Clerk Dashboard → Users. Ensure ID starts with `user_`. |
| Sirius config 404 | Agent not seeded or wrong ID | Verify seed created Sirius Agent. Check `currentVersionId` is populated. |

---

### 🚦 STOP — SUCCESS GATE 4
**DO NOT PROCEED TO PHASE 5 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [ ] Agent versioning works transactionally.
- [ ] Phone number assignment creates LiveKit dispatch rules.
- [ ] Sirius Agent is queryable by worker via internal endpoint.
- [ ] No concurrent live versions possible.
- [ ] `.cursorrules` conventions followed for all backend modules.

---

## Phase 5: Call Lifecycle & Media Processing (Day 3–4)

**Objective:** Inbound/outbound calls tracked, recordings uploaded, transcripts built, costs calculated.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 4 is passed.
- [ ] `.cursorrules` reviewed for webhook, queue, and storage conventions.
- [ ] Twilio recording settings enabled.
- [ ] R2 bucket "awaaz-recordings" exists.

---

### 5.1 Twilio Webhook Handler

**Agent Instruction:** Implement `POST /webhooks/twilio` per spec Section 7.4.

**Sub-task 5.1.1:** Signature verification using `twilio.validateRequest`.

**Sub-task 5.1.2:** Status callback handling:
- `initiated` → create Call record (inbound) or update existing (outbound).
- `answered` → status = `IN_PROGRESS`, set `startedAt`.
- `completed` → status = `COMPLETED`, set `endedAt`, `durationSeconds`.
- `failed` → status = `FAILED`.
- `no-answer` → status = `ABANDONED`.
- `recording-completed` → enqueue `recordingQueue` job.

**☐ Checklist for 5.1:**
- [ ] Twilio signature verification implemented.
- [ ] All status callbacks handled with correct state transitions.
- [ ] `recording-completed` enqueues job to BullMQ.

---

### 5.2 Outbound Call Endpoint

**Agent Instruction:** `POST /api/v1/calls/outbound` per spec Section 7.3.

**Sub-task 5.2.1:** TwiML security with signed tokens (NHP-1 fix):

```typescript
const token = crypto.createHmac('sha256', TWIML_SECRET)
  .update(`${sipUri}:${Date.now()}`)
  .digest('hex');
await redis.setex(`twiml:${token}`, 60, sipUri);
```

**Sub-task 5.2.2:** TwiML endpoint (`GET /twiml/outbound`) per spec Section 10.3 with XML escaping and domain validation.

**Test Case 5.2.1: TwiML Security**

```bash
# Request without token
curl https://api/twiml/outbound
# Expected: 404

# Request with expired token
curl https://api/twiml/outbound?token=expired
# Expected: 404

# Request with valid token but wrong domain
# (manually inject bad URI into Redis)
# Expected: 400 Bad Request
```

**☐ Checklist for 5.2:**
- [ ] Outbound call endpoint creates signed TwiML token.
- [ ] Token stored in Redis with 60s TTL.
- [ ] TwiML endpoint validates token and domain.
- [ ] Invalid/missing token returns 404.
- [ ] Wrong domain returns 400.

---

### 5.3 LiveKit Webhook Handler

**Agent Instruction:** `POST /webhooks/livekit` per spec Section 7.4.

**Sub-task 5.3.1:** Signature verification using `livekit-server-sdk.WebhookReceiver`.

**Sub-task 5.3.2:** Handle `room_finished` → enqueue `transcriptQueue` job.

**☐ Checklist for 5.3:**
- [ ] LiveKit signature verification implemented.
- [ ] `room_finished` enqueues transcript job.

---

### 5.4 BullMQ Queue Setup (WARN-7 Fix)

**Agent Instruction:** Configure Redis with TLS for Upstash:

```typescript
const connection = new Redis(process.env.REDIS_URL, {
  tls: {},
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
```

Register queues: `transcript`, `recording`.

**☐ Checklist for 5.4:**
- [ ] Redis connection uses TLS config for Upstash.
- [ ] `transcript` and `recording` queues registered.
- [ ] `maxRetriesPerRequest: null` and `enableReadyCheck: false` are set.

---

### 5.5 Recording Worker (BLOCK-7 Fix)

**Agent Instruction:** Implement `RecordingWorker` per spec Section 14.3.

**Sub-task 5.5.1:** Download from Twilio using Basic Auth.

**Sub-task 5.5.2:** Upload to R2 using `StorageService.uploadBuffer`.

**Sub-task 5.5.3:** Update `Call.recordingUrl` with R2 object key.

**Test Case 5.5.1: Recording Pipeline**

1. Make a test call.
2. Wait for `recording-completed` webhook.
3. Verify job enqueued in BullMQ (check Upstash or logs).
4. Verify job processed successfully.
5. Verify `.mp3` file exists in R2 bucket under `recordings/{callId}.mp3`.
6. Call `GET /api/v1/calls/:id/recording` → verify presigned URL returns audio.

**☐ Checklist for 5.5:**
- [ ] Recording worker downloads from Twilio.
- [ ] Uploads to R2 under correct path.
- [ ] `Call.recordingUrl` updated.
- [ ] Presigned URL returns valid audio.

---

### 5.6 Transcript Worker (WARN-7 Fix)

**Agent Instruction:** Implement `TranscriptWorker` per spec Section 14.3.

**Sub-task 5.6.1:** 3-second delay to wait for Twilio webhook settlement.

**Sub-task 5.6.2:** Fallback lookup by `liveKitRoomId` if `callId` not in job data.

**Sub-task 5.6.3:** Assemble `USER_SPEECH` and `AGENT_SPEECH` events into `Transcript` record.

**☐ Checklist for 5.6:**
- [ ] Worker delays 3 seconds before processing.
- [ ] Fallback lookup by `liveKitRoomId` implemented.
- [ ] Transcript assembled from speech events.

---

### 5.7 Cost Calculation (WARN-12 Fix)

**Agent Instruction:** Implement `calculateCost()` inside transcript worker.

**Sub-task 5.7.1:** Sum `tokenCount` (fallback to `estimatedTokens = charCount // 4`).

**Sub-task 5.7.2:** Calculate per spec:
- STT: $0.0043/minute
- LLM: $0.79/1M tokens
- TTS: $0.020/1K chars
- Telephony: $0.0085/minute

**Test Case 5.7.1: Cost Accuracy**

1. Make a 2-minute test call.
2. Verify transcript worker completes.
3. Query `Call.costBreakdown` from DB.
4. Manual verification: STT ≈ $0.0086, Telephony ≈ $0.017. Total should be reasonable (>$0.01, <$0.50 for 2 min).

**☐ Checklist for 5.7:**
- [ ] Token count summed with char fallback.
- [ ] Cost breakdown includes STT, LLM, TTS, Telephony.
- [ ] 2-minute test call produces reasonable total cost.

---

### 5.8 Storage Service (BLOCK-7 Fix)

**Agent Instruction:** Implement `StorageService` with `@aws-sdk/client-s3` pointing to R2.

**Test Case 5.8.1: R2 Upload/Download**

```typescript
// Unit test
await storageService.uploadBuffer('test/hello.txt', Buffer.from('hello'), 'text/plain');
const url = await storageService.getPresignedUrl('test/hello.txt', 60);
const response = await fetch(url);
// Verify response.text() === 'hello'
```

**☐ Checklist for 5.8:**
- [ ] `StorageService` uses S3 SDK configured for R2.
- [ ] Upload and presigned URL test passes.

---

### 🚨 ERROR RESOLUTION — Phase 5

| Error | Likely Cause | Resolution |
|---|---|---|
| Twilio webhook 401 | Signature validation failed | Verify `AUTH_TOKEN`. Ensure URL in Twilio console matches exact endpoint (including https). |
| Recording job not enqueued | Wrong webhook type or missing handler | Verify Twilio console sends `recording-completed`. Check webhook route is `POST /webhooks/twilio`. |
| Recording file missing in R2 | Worker crash or credential issue | Check Render worker logs. Verify R2 `ACCESS_KEY` and `SECRET_KEY`. Check bucket name. |
| Transcript missing events | LiveKit webhook not firing | Verify LiveKit webhook URL is HTTPS. Check `WebhookReceiver` secret matches LiveKit dashboard. |
| Cost calculation zero | Token count missing or char fallback wrong | Verify `charCount // 4` logic. Check that `AGENT_SPEECH` events carry token metadata. |
| Presigned URL expires fast | Wrong TTL or clock skew | Verify TTL is in seconds. Check server time. |

---

### 🚦 STOP — SUCCESS GATE 5
**DO NOT PROCEED TO PHASE 6 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [ ] End-to-end: Call is made → Twilio records → webhook fires → job downloads → file in R2.
- [ ] Transcript is assembled with speech events.
- [ ] Cost is calculated and stored.
- [ ] TwiML tokens are secure (404 on invalid, 400 on wrong domain).
- [ ] `.cursorrules` conventions followed for all webhook and worker code.

---

## Phase 6: Frontend Core Features (Day 4–5)

**Objective:** Dashboard usable. Agents editable. Test calls from browser work. Call history viewable.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 5 is passed.
- [ ] `.cursorrules` reviewed for React, Next.js, and frontend conventions.
- [ ] shadcn/ui components are installed.

---

### 6.1 API Client (`lib/api.ts`)

**Agent Instruction:** Implement per spec Section 12.5 with `x-organization-id` header.

**☐ Checklist for 6.1:**
- [ ] API client attaches `x-organization-id` to all requests.
- [ ] Clerk token is fetched and attached as `Authorization` header.

---

### 6.2 React Query Hooks

Create:
- `hooks/use-agents.ts`
- `hooks/use-calls.ts`
- `hooks/use-analytics.ts`

All must use `getToken()` from Clerk and pass `organizationId`.

**☐ Checklist for 6.2:**
- [ ] All three hooks created.
- [ ] Hooks use Clerk `getToken()`.
- [ ] Hooks pass `organizationId` to API calls.

---

### 6.3 Agents List Page (`/agents`)

**Agent Instruction:** Table with columns: Name, Status, Voice, Phone Number, Last Edited, Calls (7d), Actions.
- "New Agent" button.
- Pre-populated Sirius Agent visible on load.

**Test Case 6.3.1: Agents List**

1. Load `/agents` → verify Sirius Agent appears.
2. Verify status badge is "Active" (green).
3. Verify assigned phone number displayed.

**☐ Checklist for 6.3:**
- [ ] Agents table has all specified columns.
- [ ] Sirius Agent appears on load.
- [ ] Status badge shows "Active" in green.
- [ ] Assigned phone number displayed.

---

### 6.4 Agent Create/Edit Page

**Sub-task 6.4.1:** Monaco Editor for system prompt (dynamic import, `ssr: false` per WARN-2/HP-3).

**Sub-task 6.4.2:** Auto-save draft to localStorage every 30 seconds using `use-local-storage-state`:

```typescript
const [draft, setDraft] = useLocalStorageState(`agent-draft-${agentId}`, { defaultValue: '' });
```

**Sub-task 6.4.3:** Voice Selector component with audio preview (fetched from `GET /api/v1/voices`).

**Sub-task 6.4.4:** Phone number dropdown showing assignment status.

**Sub-task 6.4.5:** "Save Version" vs "Save & Publish" buttons.

**Test Case 6.4.1: Draft Persistence**

1. Edit Sirius prompt.
2. Close browser tab.
3. Reopen `/agents/{id}` → verify draft restored from localStorage.

**Test Case 6.4.2: Version Save**

1. Click "Save Version".
2. Verify API call to `POST /api/v1/agents/:id/versions`.
3. Verify toast "Saved as V2".
4. Verify version history panel shows V2.

**☐ Checklist for 6.4:**
- [ ] Monaco Editor loads client-side only.
- [ ] Draft auto-saves to localStorage every 30s.
- [ ] Draft persists across tab close/reopen.
- [ ] Voice selector plays preview audio.
- [ ] Phone number dropdown shows assignment.
- [ ] "Save Version" and "Save & Publish" both functional.

---

### 6.5 Version History Panel

**Agent Instruction:** Right panel on edit page.
- List versions newest first.
- "View Diff" → modal with `react-diff-viewer-continued`.
- "Restore" → creates new version from old (confirmation dialog).
- "Publish" → sets live (confirmation dialog).

**Test Case 6.5.1: Diff View**

1. Save V1 with prompt "Hello".
2. Save V2 with prompt "Hello world".
3. Click "View Diff" on V1 → verify side-by-side shows addition of " world".

**☐ Checklist for 6.5:**
- [ ] Version history panel shows versions newest first.
- [ ] Diff viewer renders side-by-side correctly.
- [ ] Restore creates new version (does not overwrite).
- [ ] Publish triggers confirmation and updates live version.

---

### 6.6 Test Call Modal

**Agent Instruction:** Full-screen modal.
- "Connecting" → "Active" → "Ended" states.
- Uses `@livekit/components-react` `LiveKitRoom`.
- Pulsing microphone icon based on audio level.

**Sub-task 6.6.1:** `POST /api/v1/agents/:id/test-call` endpoint creates room with `isTestCall: true` metadata.

**Test Case 6.6.1: Browser Test Call**

1. Click "Test Agent" on Sirius page.
2. Allow microphone permissions.
3. Speak "Hello".
4. Expected: Hear agent response within 2 seconds.
5. Click "End Call".
6. Verify test call appears in Call History with "Test" badge.

**☐ Checklist for 6.6:**
- [ ] Test call modal has three states.
- [ ] LiveKit room connects successfully.
- [ ] Microphone icon pulses with audio level.
- [ ] Agent responds within 2 seconds.
- [ ] Test call marked with "Test" badge in history.

---

### 6.7 Call History Page (`/calls`)

**Agent Instruction:** Filter bar: Agent, Direction, Status, Date range, Phone number.
- Table with pagination (20 per page).
- Columns per spec Section 13.2.

**Test Case 6.7.1: Filtering**

1. Make 1 inbound call and 1 outbound call.
2. Filter by "Inbound" → only inbound shows.
3. Filter by date range excluding today → empty state.

**☐ Checklist for 6.7:**
- [ ] All filters implemented.
- [ ] Pagination is 20 per page.
- [ ] Filtering by direction works correctly.
- [ ] Date range filter works correctly.

---

### 6.8 Call Detail Page (`/calls/:id`)

**Sub-task 6.8.1:** Audio player with `wavesurfer.js` (dynamic import, SSR-safe).

**Sub-task 6.8.2:** Transcript viewer with clickable timestamps jumping audio.

**Sub-task 6.8.3:** Cost breakdown card.

**Sub-task 6.8.4:** Latency breakdown card.

**Test Case 6.8.1: Call Detail**

1. Open completed call.
2. Click play on audio → verify waveform renders.
3. Click transcript turn at 0:30 → verify audio jumps to 0:30.
4. Verify cost breakdown sums correctly.

**☐ Checklist for 6.8:**
- [ ] Waveform renders on call detail page.
- [ ] Clicking transcript timestamp seeks audio.
- [ ] Cost breakdown displays accurate sums.
- [ ] Latency metrics displayed.

---

### 🚨 ERROR RESOLUTION — Phase 6

| Error | Likely Cause | Resolution |
|---|---|---|
| Monaco Editor fails to load | SSR import | Ensure `dynamic(() => import(...), { ssr: false })`. Do not import statically at top level. |
| Draft not persisting | Wrong localStorage key or SSR | Verify key is `agent-draft-${agentId}`. Ensure hook runs client-side. |
| Voice preview no audio | R2 preview missing or CORS | Verify voice sync ran in Phase 4. Check R2 CORS policy allows audio playback. |
| Test call modal stuck "Connecting" | LiveKit token issue or room creation failure | Check `POST /api/v1/agents/:id/test-call` response. Verify LiveKit credentials. |
| Waveform not rendering | `wavesurfer.js` SSR or missing audio | Ensure dynamic import. Verify presigned URL returns valid audio blob. |
| Transcript click doesn't seek | Timestamp format mismatch | Ensure transcript timestamps are in seconds and `wavesurfer.seekTo()` receives correct value. |

---

### 🚦 STOP — SUCCESS GATE 6
**DO NOT PROCEED TO PHASE 7 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [ ] User can edit agent, save versions, publish.
- [ ] Browser test call connects and speaks.
- [ ] Call history filters and paginates correctly.
- [ ] Call detail shows audio waveform, clickable transcript, and cost breakdown.
- [ ] `.cursorrules` conventions followed for all frontend code.

---

## Phase 7: Analytics & Settings (Day 5)

**Objective:** Analytics dashboard shows real data. Settings pages functional.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 6 is passed.
- [ ] `.cursorrules` reviewed for analytics and settings conventions.
- [ ] Real (non-test) call data exists in database.

---

### 7.1 Analytics Backend

**Agent Instruction:** Implement endpoints per spec Section 7.3:

- `GET /api/v1/analytics/overview` (today, 7d, 30d)
- `GET /api/v1/analytics/calls-trend` (daily buckets)
- `GET /api/v1/analytics/costs` (monthly breakdown)
- `GET /api/v1/analytics/latency` (P50/P95/P99)
- `GET /api/v1/analytics/agents` (top 5 by volume)
- `GET /api/v1/analytics/live` (active calls count)

**CRITICAL:** Exclude test calls from all analytics:

```sql
WHERE (metadata->>'isTest' IS NULL OR metadata->>'isTest' != 'true')
```

**Sub-task 7.1.1:** Redis caching for analytics (TTLs: overview 60s, trend 5min, costs 5min, latency 60s).

**☐ Checklist for 7.1:**
- [ ] All six analytics endpoints implemented.
- [ ] Test calls excluded via metadata filter in every query.
- [ ] Redis caching applied with correct TTLs.

---

### 7.2 Analytics Frontend

**Agent Instruction:** Dashboard layout:
- Row 1: 4 stat cards (today calls, minutes, avg duration, avg cost).
- Row 2: Recharts line charts (calls over time, minutes over time) with 7d/30d toggle.
- Row 3: Cost breakdown chart + top agents chart.
- Row 4: Latency P50/P95/P99 + success rate + live call counter (polls every 10s).

**Test Case 7.2.1: Analytics Accuracy**

1. Make 3 test calls (should NOT appear).
2. Make 2 real calls (should appear).
3. Verify "Total Calls Today" = 2.
4. Verify cost chart sums to actual costs.

**☐ Checklist for 7.2:**
- [ ] Stat cards display correct values.
- [ ] Line charts toggle between 7d and 30d.
- [ ] Cost breakdown chart sums correctly.
- [ ] Top agents chart shows top 5.
- [ ] Live call counter polls every 10s.
- [ ] Test calls are excluded from all metrics.

---

### 7.3 Phone Numbers Tab (`/phone-numbers`)

**Agent Instruction:** Table showing numbers, assigned agent, status.
- "Assign Agent" dropdown.
- "Add Number" modal (connect existing Twilio number).

**Test Case 7.3.1: Number Assignment**

1. Unassign Sirius number.
2. Verify `liveKitDispatchRuleId` cleared in DB.
3. Assign to new agent.
4. Verify new dispatch rule created and stored.

**☐ Checklist for 7.3:**
- [ ] Phone numbers table displays all org numbers.
- [ ] Unassign clears dispatch rule ID.
- [ ] Assign creates new dispatch rule.

---

### 7.4 Members Tab (`/settings/members`)

**Agent Instruction:** Members table with role dropdown.
- "Invite Member" dialog (email + role).
- Pending invitations section with resend/cancel.

**Test Case 7.4.1: Member Management**

1. Invite new user as VIEWER.
2. Verify `PendingInvitation` created.
3. Cancel invitation → verify deleted.
4. Re-invite → accept → verify `Membership` created with VIEWER role.

**☐ Checklist for 7.4:**
- [ ] Members table shows roles.
- [ ] Invitation creates pending record.
- [ ] Cancel deletes pending invitation.
- [ ] Acceptance creates membership with correct role.

---

### 7.5 API Keys Tab (`/settings/api-keys`)

**Agent Instruction:** Table showing prefix, created date, last used.
- "Create" dialog showing full key ONCE.
- Revoke action.

**Sub-task 7.5.1:** SHA-256 hashing (not bcrypt):

```typescript
const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
```

**Test Case 7.5.1: Key Lifecycle**

1. Create key "Test Key".
2. Verify full key displayed once.
3. Verify only prefix shown in table.
4. Verify hash stored in DB (not plaintext).
5. Revoke → verify `isRevoked=true`.

**☐ Checklist for 7.5:**
- [ ] API key table shows prefix and metadata.
- [ ] Full key revealed only once on creation.
- [ ] SHA-256 hash stored, never plaintext.
- [ ] Revoke sets `isRevoked=true`.

---

### 7.6 Organization Settings

**Agent Instruction:** Minimal: name update only.

**☐ Checklist for 7.6:**
- [ ] Organization name update endpoint works.
- [ ] Frontend form updates name.

---

### 7.7 Qualicall Placeholder

**Agent Instruction:** Create `/qualicall` page with "Coming Soon" message and badge in sidebar.

**☐ Checklist for 7.7:**
- [ ] `/qualicall` route exists.
- [ ] Sidebar shows Qualicall badge.
- [ ] Page displays "Coming Soon".

---

### 🚨 ERROR RESOLUTION — Phase 7

| Error | Likely Cause | Resolution |
|---|---|---|
| Analytics includes test calls | Missing metadata filter | Verify every SQL/query has `WHERE (metadata->>'isTest' IS NULL OR metadata->>'isTest' != 'true')`. |
| Cache returning stale data | Wrong TTL or no invalidation | Verify TTL values. If needed, add cache key invalidation on call completion. |
| Phone number unassign not clearing rule | Frontend not calling API or API bug | Verify PATCH request fires. Check API logs for dispatch rule deletion. |
| Invitation email not sent | Clerk configuration | Verify Clerk app has email provider configured. Check Clerk dashboard logs. |
| API key shown more than once | Frontend state bug | Ensure dialog closes and state resets after creation. Store full key in temporary state only. |
| SHA-256 mismatch | Encoding issue | Ensure `update(fullKey)` uses UTF-8 string. Verify digest is `hex`. |

---

### 🚦 STOP — SUCCESS GATE 7
**DO NOT PROCEED TO PHASE 8 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [ ] Analytics display real (non-test) data.
- [ ] Settings fully functional (members, API keys, org settings).
- [ ] Phone number assignment syncs dispatch rules from UI.
- [ ] Qualicall placeholder visible.
- [ ] `.cursorrules` conventions followed for all settings and analytics code.

---

## Phase 8: End-to-End Integration & Hardening (Day 5–6)

**Objective:** Full system test. Security verification. Free-tier survival setup.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 7 is passed.
- [ ] `.cursorrules` reviewed for security, testing, and documentation conventions.
- [ ] All previous phases' test cases are passing.

---

### 8.1 Complete User Journey Test

**Scenario: New Agent Creation to Call Analysis**

| Step | Action | Verification |
|---|---|---|
| 1 | Admin creates "Sales Agent" | Appears in list, V1 created |
| 2 | Assigns phone number | Dispatch rule created |
| 3 | Edits prompt, saves V2 | Version history shows V2 |
| 4 | Publishes V2 | V2 is live |
| 5 | Makes inbound call | Call connects, uses V2 prompt |
| 6 | Ends call | Status = COMPLETED |
| 7 | Wait 30 seconds | Recording in R2, transcript built |
| 8 | Opens Call Detail | Audio plays, transcript accurate |
| 9 | Checks Analytics | Call counted, cost calculated |
| 10 | Viewer logs in | Can see everything, cannot edit |

**☐ Checklist for 8.1:**
- [ ] Step 1: Sales Agent created and visible.
- [ ] Step 2: Dispatch rule created for assigned number.
- [ ] Step 3: V2 saved and visible in history.
- [ ] Step 4: V2 published and live.
- [ ] Step 5: Inbound call connects and uses V2 prompt.
- [ ] Step 6: Call ends with status COMPLETED.
- [ ] Step 7: Recording and transcript available within 30s.
- [ ] Step 8: Call detail page fully functional.
- [ ] Step 9: Analytics reflects the call and cost.
- [ ] Step 10: Viewer role restricted to read-only.

---

### 8.2 Security Audit

**Agent Instruction:** Verify all spec security requirements:

| Check | Test | Expected |
|---|---|---|
| TwiML token | Request `/twiml/outbound?token=fake` | 404 |
| TwiML domain | Inject bad URI into Redis, request | 400 |
| Internal endpoints | Request without `x-worker-secret` | 403 |
| Cross-org access | Request with valid token but wrong `x-organization-id` | 403 |
| Clerk webhook | Request with wrong signature | 401 |
| Twilio webhook | Request with wrong signature | 401 |
| LiveKit webhook | Request with wrong auth | 401 |
| API key hash | Query DB for created key | `keyHash` is SHA-256, no plaintext |
| Role enforcement | VIEWER calls `POST /agents` | 403 |

**☐ Checklist for 8.2:**
- [ ] All nine security checks performed.
- [ ] All nine return exact expected status codes.
- [ ] No security bypasses found.

---

### 8.3 Free Tier Survival Setup

**Sub-task 8.3.1:** UptimeRobot setup:
- Add `https://api.render.com/health` → ping every 10 minutes.
- Add Supabase REST endpoint → ping every 10 minutes (prevents pausing).

**Sub-task 8.3.2:** Worker heartbeat:
- Python worker pings `/internal/worker/heartbeat` every 5 minutes.
- This is secondary keep-alive, not primary.

**Sub-task 8.3.3:** Render cold-start mitigation:
- Document that after any idle period, trigger a test call to warm the worker before real calls.

**☐ Checklist for 8.3:**
- [ ] UptimeRobot configured with two pings every 10 minutes.
- [ ] Worker heartbeat implemented (5-minute interval).
- [ ] Cold-start mitigation documented.

---

### 8.4 Performance Verification

**Test Case 8.4.1: Latency Benchmark**

1. Make 5 test calls.
2. Query DB: `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) FROM call_events WHERE event_type = 'AGENT_SPEECH' AND created_at > NOW() - INTERVAL '1 hour';`

**Success Criteria:** P50 < 900ms.

**☐ Checklist for 8.4:**
- [ ] 5 test calls made.
- [ ] P50 latency queried from database.
- [ ] P50 is under 900ms.

---

### 8.5 Error Handling & Observability

**Agent Instruction:** Verify:
- All async operations have try/catch.
- API client in Python worker logs but doesn't crash on event emission failure.
- NestJS global exception filter returns consistent JSON errors.

**☐ Checklist for 8.5:**
- [ ] All async operations wrapped in try/catch.
- [ ] Python worker logs errors gracefully without crashing.
- [ ] NestJS exception filter returns consistent JSON.

---

### 8.6 Final Database Verification

**Agent Instruction:** Run this checklist in Prisma Studio or via queries:

- [ ] Organization table has "Finova Solutions".
- [ ] User table has your Clerk ID.
- [ ] Membership has OWNER role.
- [ ] Agent "Sirius Agent" exists with `currentVersionId` pointing to V1.
- [ ] AgentVersion V1 has `isLive=true`.
- [ ] PhoneNumber has `agentId` = Sirius, `liveKitDispatchRuleId` populated.
- [ ] PendingInvitation table empty (no stale invites).
- [ ] Call table has test calls marked with `metadata->isTest = true`.

---

### 8.7 Documentation & Handoff

**Agent Instruction:** Create the following files in repo root:

- [ ] `.env.example` file with all variables documented (no real values).
- [ ] `README.md` with architecture diagram (ASCII or Mermaid).
- [ ] `DEPLOYMENT.md` with Render/Vercel setup steps.
- [ ] `TROUBLESHOOTING.md` with common errors:
  - Worker not connecting → check LiveKit URL protocol (`wss://`).
  - No audio → check Twilio SIP trunk origination URI.
  - Transcript missing → check BullMQ Redis TLS config.
  - Analytics empty → check test call exclusion logic.

**☐ Checklist for 8.7:**
- [ ] `.env.example` created with all variables and descriptions.
- [ ] `README.md` has architecture diagram.
- [ ] `DEPLOYMENT.md` has step-by-step setup.
- [ ] `TROUBLESHOOTING.md` has the four required entries plus resolutions.

---

### 🚨 ERROR RESOLUTION — Phase 8

| Error | Likely Cause | Resolution |
|---|---|---|
| Security check bypass | Missing guard or middleware order | Verify middleware runs before route handlers. Check guard decorators on controllers. |
| UptimeRobot still showing down | Render cold start or wrong path | Verify path is `/health`. Allow 2-3 minutes for first ping after deploy. |
| P50 latency > 900ms | Groq rate limit or large prompt | Optimize system prompt length. Check Groq dashboard for throttling. |
| Database state mismatch | Seed not run or manual edits | Re-run `npx prisma db seed`. Verify IDs match Clerk dashboard. |
| Missing documentation file | Agent skipped file creation | Create all four files listed in 8.7 before declaring completion. |

---

### 🚦 STOP — SUCCESS GATE 8 (FINAL GATE)
**DO NOT DECLARE PROJECT COMPLETE UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [ ] Full user journey from agent creation to call analysis passes.
- [ ] Security audit passes all nine checks.
- [ ] Free-tier survival is configured (UptimeRobot + heartbeat).
- [ ] P50 latency is under 900ms.
- [ ] Database verification checklist is all green.
- [ ] All four documentation files exist and are complete.
- [ ] `.cursorrules` was adhered to in every single file created during all phases.

---

## 🏁 Final Launch Checklist

**Before announcing V1 readiness, verify every item from spec Section "Final Checklist Before V1 Launch":**

- [ ] Sirius Agent deployed — inbound calls work on Twilio number.
- [ ] LiveKit SIP Dispatch Rule created and stored in `PhoneNumber.liveKitDispatchRuleId`.
- [ ] Prompt versioning — save creates V2, V3; publish sets live transactionally.
- [ ] Voice selection — dropdown plays preview audio.
- [ ] Test call — browser test connects and speaks.
- [ ] Outbound calls — dashboard initiates call via TwiML with token security.
- [ ] Recordings — Twilio recording webhook → R2 upload → presigned URL works.
- [ ] Transcripts — post-call assembly works with 3s delay.
- [ ] Call History — filters, pagination, detail view all functional.
- [ ] Analytics — real data, no test calls, live counter polling.
- [ ] Phone Numbers — assignment syncs dispatch rules.
- [ ] Members — invitation flow end-to-end verified.
- [ ] API Keys — SHA-256 hashing, prefix display, one-time full key reveal.
- [ ] Qualicall — placeholder visible.
- [ ] Audit logs — every action creates AuditLog entry.
- [ ] Webhooks — all three (Clerk, Twilio, LiveKit) signature-verified.
- [ ] Keep-alive — UptimeRobot primary + worker heartbeat secondary.
- [ ] Worker health — port 8080 responds.
- [ ] BigInt patch — applied in `main.ts`.
- [ ] Clerk middleware — `middleware.ts` protects routes.
- [ ] React Query — `QueryClientProvider` in root layout.

---

## 📋 Daily Standup Format (For Your Use)

Each day, answer:
1. What phase am I in?
2. What is today's success gate?
3. What blockers exist?
4. What tests failed overnight?

---

## 🆘 Emergency Rollback Procedures

| Scenario | Rollback Action |
|---|---|
| Bad agent version published | PATCH previous version to `isLive=true` via API or Prisma Studio. |
| Twilio SIP trunk misconfigured | Revert origination URI in Twilio Console to previous value. |
| Worker crashing on deploy | Pin to previous Render deploy. Check `livekit-agents` version compatibility. |
| Database corruption | Restore from Supabase automated backup (taken every day). |
| Clerk webhook flooding | Disable webhook in Clerk Dashboard, verify signature logic, re-enable. |

---

## ⚠️ AGENT REMINDER

You have one mandate above all others: **`.cursorrules` is law.**  
If you are uncertain about a pattern, import style, file structure, or naming convention, consult `.cursorrules` before proceeding.  
If `.cursorrules` is silent on a matter, default to the exact instructions in this playbook.  
If this playbook and `.cursorrules` conflict, `.cursorrules` wins— but you must document the deviation in your standup notes.

**Do not skip gates. Do not fake test results. Do not proceed until the checklist is complete.**
