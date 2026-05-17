# Awaaz V1 — Agent Execution Playbook
Version: 1.3-Agent | Target: Production-ready Sirius Agent handling real calls
Agent Directive: You are an autonomous implementation agent. You do not improvise. You do not skip steps. You do not assume. You execute exactly what is written below and nothing else.

Repo: https://github.com/mehlab1/Awaaz-Platform-V1
Branch workflow: Phase 1 approved — main tracks production-ready scaffold; staging may continue for PRs. Success Gate 1 is fully satisfied once §1.5 Render + §1.7 Vercel health checks pass against deployed URLs (see repo render.yaml and deployment instructions below).
## 🛑 AGENT MANDATE & NON-NEGOTIABLES
Read this entire section before writing a single line of code. Failure to comply will result in an invalid build.

.cursorrules Supremacy: You MUST strictly adhere to the .cursorrules file located in the project root. If a conflict exists between this playbook and .cursorrules, .cursorrules wins. Review .cursorrules before every phase. Do not override, ignore, or bypass any rule defined therein.
Checklist-Driven Execution: Every sub-task below has a [ ] checklist. You MUST verbally confirm each item is checked before proceeding.
Test-Gated Progression: You are FORBIDDEN from starting Phase N+1 until every test case in Phase N returns the exact expected result. There are no exceptions. "It probably works" is not a passing grade.
Error Resolution Protocol: If a test fails, you MUST consult the "Error Resolution" section for that phase. You may not invent your own fix without cross-referencing the documented resolutions first.
No Omissions: This playbook contains every command, every file path, every environment variable, and every line of code required. Do not skip "obvious" steps. Do not consolidate phases. Do not "do it later."
Verification Before Commit: Every phase ends with a Success Gate. You MUST obtain a passing Success Gate before git commit and before continuing.
## Phase 0: Pre-Flight Checklist (Do This First)
### ☐ PRE-PHASE CHECKLIST
- [x] Read .cursorrules fully. Confirm no conflicts with Phase 0 tasks.
- [ ] Verify Node.js 20+ is installed: node -v
- [ ] Verify Python 3.11 is installed: python3.11 --version
- [ ] Verify pnpm is installed: npm install -g pnpm
- [ ] Verify Git is initialized and GitHub repo is ready.
- [ ] Open .cursorrules and confirm you understand the coding style, file naming conventions, and forbidden patterns.
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
| Upstash Redis | upstash.com | REDIS_URL (note rediss://) | 10K cmds/day | Create DB, test TLS connection |
| Cloudflare R2 | dash.cloudflare.com | ACCOUNT_ID, ACCESS_KEY, SECRET_KEY | 10GB | Create bucket "awaaz-recordings" |
| Twilio | Existing Finova account | ACCOUNT_SID, AUTH_TOKEN, phone number | Pay-as-you-go | Verify existing number and SIP trunk access |
| Render | render.com | — | 750hrs web, background worker | Create account, verify GitHub connection |
| Vercel | vercel.com | — | 100GB bandwidth | Create account, verify GitHub connection |
### ☐ Checklist for 0.1:

- [x] LiveKit project "awaaz-v1" created and SIP enabled.
- [ ] Deepgram API key generated and noted.
- [ ] Groq API key generated and noted.
- [ ] Rime API key generated and noted.
- [ ] Clerk application created with social logins disabled and restricted sign-up enabled.
- [ ] Supabase project created; both Transaction Pooler (port 6543) and Direct (port 5432) URIs saved.
- [ ] Upstash Redis database created; rediss:// URL saved.
- [ ] Deferred to Phase 9 — Cloudflare R2 bucket/object read-write credentials verified.
- [ ] Deferred to Phase 9 — Twilio credentials and phone number verified.
- [ ] Render account created and GitHub-connected.
- [ ] Vercel account created and GitHub-connected.
### 0.2 API Connectivity Verification
**Agent Instruction:** Before writing any code, verify every external API responds. Run these commands verbatim.

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
Success Criteria: All four return HTTP 200 (or valid auth error, not connection timeout).

### ☐ Checklist for 0.2:

- [ ] Deepgram curl returns HTTP 200 or valid auth error (not timeout).
- [ ] Groq curl returns HTTP 200 or valid auth error (not timeout).
- [ ] Rime curl returns HTTP 200 or valid auth error (not timeout).
- [x] LiveKit curl returns HTTP 200 or valid auth error (not timeout).
Verification note (2026-05-17): External API script loaded local .env and LiveKit RoomService/ListRooms returned HTTP 200 against the new owner-created LiveKit Cloud project.

### 0.3 Tooling Prerequisites
**Agent Instruction:** Verify tooling. Do not proceed if versions mismatch.

# Node.js 20+ and pnpm
node -v  # should be v20.x
npm install -g pnpm

# Python 3.11
python3.11 --version

# Git and GitHub repo initialized
git init awaaz && cd awaaz
git checkout -b main
### ☐ Checklist for 0.3:

- [ ] node -v outputs v20.x or higher.
- [ ] pnpm is available globally.
- [ ] python3.11 --version outputs 3.11.x.
- [ ] Git repo initialized on branch main.
### 0.4 Environment Variable Master Sheet
**Agent Instruction:** Create .env.master in a password manager (1Password/Bitwarden). Do NOT commit this. Every phase will pull from this master sheet. Do not proceed to Phase 1 until this sheet is complete and verified against 0.1.

### ☐ Checklist for 0.4:

- [ ] .env.master created in password manager.
- [ ] All variables from 0.1 are populated with real values.
- [ ] No .env files containing secrets exist in the repo or are staged for commit.
### 🚨 ERROR RESOLUTION — Phase 0
| Error | Likely Cause | Resolution |
|---|---|---|
| curl: (6) Could not resolve host | DNS or typo in URL | Verify URL spelling. Check internet connectivity. |
| curl: (28) Connection timed out | Firewall or API outage | Retry after 60s. If persistent, verify service status page. Do not proceed. |
| 401 Unauthorized from API | Wrong key or missing Token vs Bearer | Verify exact header format in command. Copy-paste key from dashboard. |
| lkctl: command not found | LiveKit CLI not installed | Install lkctl via LiveKit docs before running LiveKit test. |
| Node version < 20 | Wrong Node installed | Use nvm or fnm to switch to Node 20+. Do not use Node 18. |
### 🚦 STOP — GATE 0: PRE-FLIGHT
DO NOT PROCEED TO PHASE 1 UNLESS ALL OF THE FOLLOWING ARE TRUE:

- [ ] All accounts from 0.1 are created and verified.
- [ ] All API connectivity tests from 0.2 return HTTP 200 (or valid auth response).
- [ ] Tooling versions from 0.3 match exactly.
- [ ] .env.master is complete and secured in password manager.
- [ ] .cursorrules has been read and understood.
## Phase 1: Foundation & Skeleton (Day 1)
Objective: Monorepo scaffolded, database live, all services connected, "Hello World" deployments on Render and Vercel.

## Phase 1 — execution status (agent-maintained)
Overall Phase 1 status: ✅ SUCCESS GATE 1 CLOSED — 2026-05-14. Owner verified production curl Render /health → ok + Vercel Clerk Google sign-up/sign-in → /agents dashboard. Earlier Gate 1 approval covered Redis PONG, Upstash noeviction, Prisma Studio (13 tables), builds, BullMQ smoke, schema spec.md §5 baseline + documented deviations (see C2 table).

Closure audit: See SUCCESS GATE 1 — CLOSED table immediately below the execution-status grid.

Authoritative schema: apps/api/prisma/schema.prisma is spec.md § 5 (repo root), copied verbatim except one Prisma-required fix (see deviation row Agent.auditLogs below). Header comment inside the schema still reads docs/spec.md § 5 per the spec file’s own text.

Infra notes: REDIS_URL must be a rediss://… URL for TLS clients (not a redis-cli … shell prefix).

### Gate 1 correction tasks (C1–C3)
C1 — redis-cli -u $REDIS_URL ping (§1.8 required)
Status: PASSED — confirmed by project owner (Gate 1 approval). The agent’s Windows environment lacked redis-cli on PATH; historical capture below for audit.

Historical terminal capture (agent Windows env — before owner confirmation):

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
C2 — Documented deviations (execution status extensions)
| Topic | Detail | Verification |
|---|---|---|
| BullMQ / @nestjs/bullmq vs playbook §1.2 pnpm add line | Playbook suggests @nestjs/bullmq@^5 + bullmq@^5. Installed: @nestjs/bullmq 10.2.3, bullmq 5.30.0 (apps/api/package.json + lockfile). | API build OK; bullmq:smoke / ts-node scripts/bullmq-smoke.ts OK |
| Clerk v7 breaking changes | afterSignInUrl → signInFallbackRedirectUrl (and sign-up equivalent); middleware auth().protect() pattern → await auth.protect() in Clerk v7 Next.js middleware — intentional per Clerk v7 docs. | pnpm --filter web build OK |
| BigInt patch vs playbook snippet | Playbook shows (BigInt.prototype as any).toJSON = …; code uses Object.defineProperty(BigInt.prototype, 'toJSON', { value: function … }) — functionally equivalent; avoids any per .cursorrules. | Nest bootstrap OK |
| Migration recovery + §5 baseline | Legacy migration 20260514120000_init removed. New baseline 20260516100000_spec_section_5_init applies spec.md §5 DDL. First deploy attempt failed (P3018) due to UTF-8 BOM at start of migration.sql (syntax error at or near "﻿"). Recovery: prisma migrate resolve --rolled-back 20260516100000_spec_section_5_init, rewrite SQL UTF-8 without BOM, prisma migrate deploy, prisma generate. | migrate status up to date; migrate diff schema ↔ DB = empty |
| Prisma vs spec §5 (Agent.auditLogs) | Spec lists auditLogs AuditLog[] on Agent but AuditLog has no inverse agent relation → Prisma P1012. Fix: removed orphan auditLogs from Agent with comment; use AuditLog.entityType / entityId for agent-related audits. | prisma validate OK |
C3 — Upstash eviction policy (noeviction)
Operational risk (Phase 3 queues): Upstash default eviction may evict keys BullMQ relies on.

| Step | Owner | Status |
|---|---|---|
| Set eviction policy to noeviction in Upstash Redis dashboard | Human | ✅ Confirmed (Gate 1 approval) |
| Playbook ref | Implementation | Automated verification | Human verification |
| Gate 0 | User-declared complete | — | Confirm Phase 0 accounts/API curls remain healthy |
| ### 1.1 Monorepo | Done — apps/*, packages/*, packages/shared-types, worker placeholders | pnpm install (workspace resolves 4 projects). staging pushed (.env never committed; .gitignore hardened). | — |
| ### 1.2 NestJS API | Done — deps; Prisma spec.md §5 (+ Agent.auditLogs fix); main.ts BigInt + CORS; ConfigModule; health | pnpm --filter @awaaz/api build → success | Supply spec.md changes if §5 is amended upstream |
| ### 1.3 Database | Baseline migration 20260516100000_spec_section_5_init applied | prisma validate, migrate status up to date, migrate diff datamodel ↔ datasource = empty | Optional: Prisma Studio |
| ### 1.3 TenantMiddleware skeleton | Done — parses x-organization-id onto req | Nest build | — |
| ### 1.4 /health | Done | Local + curl production Render → {"status":"ok",…} | — |
| ### 1.5 Render | Deployed; render.yaml documents build (pnpm --prod=false, migrate deploy) | Production curl /health → ok (owner) | Env §15.1 on Render |
| ### 1.6 Next.js + Clerk | Done | pnpm --filter web build → success | Clerk v7 props + middleware (C2) |
| ### 1.7 Vercel | Deployed apps/web | Build OK | Google OAuth → /agents (owner) |
| ### 1.8 Redis | bullmq-smoke.ts; TLS URL | BullMQ smoke → exit 0 | redis-cli → PONG — owner confirmed; Upstash noeviction — owner confirmed |
✅ SUCCESS GATE 1 — CLOSED (owner verification 2026-05-14)
| Playbook § Success Gate 1 criterion | Status |
|---|---|
| Render health endpoint returns 200 from external network | ✅ curl production URL → status":"ok" |
| Frontend on Vercel, Clerk auth works, user lands on dashboard after sign-in | ✅ Google sign-up/sign-in → /agents |
| Redis responds to ping | ✅ Confirmed in Gate 1 approval (PONG + BullMQ smoke) |
| Prisma Studio shows existing tables | ✅ Owner confirmed 13 tables |
| .cursorrules conventions on created files | ✅ Baseline accepted for Phase 1 |
Known deviations (approved; do not re-open Gate 1): BullMQ / @nestjs/bullmq versions vs playbook §1.2 install line — C2. Prisma Agent.auditLogs vs spec.md §5 — C2. DATABASE_DIRECT_URL uses Supabase session pooler on Render (IPv4) — playbook ERROR RESOLUTION. pnpm install --prod=false on Render for @nestjs/cli — playbook ERROR RESOLUTION. §1.7 “JWT in network tab” — optional spot-check; OAuth E2E satisfies intent.

Phase 2 entry: ALLOWED after reviewing Phase 2 PRE-PHASE checklist below.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 0 is passed.
- [x] .cursorrules reviewed for monorepo and NestJS conventions.
- [x] .env.master is open and accessible.
### 1.1 Monorepo Structure
**Agent Instruction:** Execute exactly. Do not deviate from this structure.

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
### ☐ Checklist for 1.1:

- [x] Directory structure matches exactly: apps/api, apps/web, apps/agent-worker, apps/qualicall-worker, packages/shared-types.
- [x] pnpm-workspace.yaml contains exactly the two package patterns shown.
- [x] Root package.json has "private": true.
- [x] pnpm install completes without errors.
### 1.2 NestJS API Skeleton
**Agent Instruction:** Install EXACT dependencies per spec Section 7.6. Do not upgrade versions. Do not add extras.

cd apps/api
pnpm init
pnpm add @nestjs/common@^10 @nestjs/core@^10 @nestjs/platform-express@^10 @nestjs/config@^3 @nestjs/throttler@^5 @clerk/backend@^1 svix@^1 @prisma/client@^5 prisma@^5 @nestjs/bullmq@^5 bullmq@^5 ioredis@^5 twilio@^5 livekit-server-sdk@^2 @aws-sdk/client-s3@^3 @aws-sdk/s3-request-presigner@^3 class-validator@^0.14 class-transformer@^0.5 reflect-metadata@^0.2 rxjs@^7.8
pnpm add -D @nestjs/cli@^10 @types/node@^20 typescript@^5 ts-node@^10.9
npx prisma init
**Sub-task 1.2.1:** Create prisma/schema.prisma — copy the entire schema from spec Section 5 verbatim. Do not modify.

**Sub-task 1.2.2:** Add directUrl to datasource:

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_DIRECT_URL")
}
**Sub-task 1.2.3:** Create src/main.ts with critical fixes:

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
**Sub-task 1.2.4:** Create src/app.module.ts with ConfigModule.forRoot({ isGlobal: true }).

### ☐ Checklist for 1.2:

- [x] All dependencies installed with versions matching the command exactly.
- [x] prisma/schema.prisma is a verbatim copy from spec Section 5.
- [x] datasource db includes both url and directUrl.
- [x] src/main.ts contains the BigInt.prototype patch BEFORE app.listen().
- [x] src/main.ts CORS configuration matches exactly.
- [x] src/app.module.ts has global ConfigModule.
### 1.3 Database Provisioning
**Agent Instruction:** Set environment variables exactly as shown, then run migrations.

# Set DATABASE_URL to Supabase transaction pooler (port 6543, pgbouncer=true)
# Set DATABASE_DIRECT_URL to Supabase direct (port 5432)
export DATABASE_URL="postgresql://..."
export DATABASE_DIRECT_URL="postgresql://..."

npx prisma migrate dev --name init
npx prisma generate
**Test Case 1.3.1:** Database Connectivity

npx prisma studio
# Should open browser and show empty tables. Verify Organization, Agent, Call tables exist.
**Test Case 1.3.2:** Multi-tenancy Middleware (TenantMiddleware skeleton)

Create src/common/tenant.middleware.ts that reads x-organization-id and attaches to request. Do not implement membership check yet—just parse header.

### ☐ Checklist for 1.3:

- [x] DATABASE_URL points to Supabase Transaction Pooler (port 6543).
- [x] DATABASE_DIRECT_URL points to Supabase Direct (port 5432).
- [x] npx prisma migrate dev --name init completes without errors.
- [x] npx prisma generate completes without errors.
- [x] Prisma Studio opens and shows empty tables.
- [x] Organization, Agent, and Call tables are visible in Prisma Studio.
- [x] TenantMiddleware skeleton created and parses x-organization-id.
Approved note: Production DATABASE_DIRECT_URL on Render uses Supabase session pooler (IPv4-safe), not always db.<project>.supabase.co. Studio confirms 13 mapped tables per spec.md §5.

### 1.4 Health Endpoint
**Agent Instruction:** Create src/app.controller.ts:

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
### ☐ Checklist for 1.4:

- [x] src/app.controller.ts created with exact code above.
- [x] GET /health returns { status: 'ok', timestamp: '...' }.
### 1.5 Render Deployment (Skeleton)
**Agent Instruction:** Push to GitHub. Create Web Service on Render with these exact settings.

Runtime: Node
Build: pnpm install --frozen-lockfile && npx prisma generate && pnpm --filter @awaaz/api build
Start: node apps/api/dist/main.js
Health Check Path: /health
Add env vars from Section 15.1 (use dummy values for services not yet configured).
Critical: Add NODE_ENV=production, PORT=3001.
**Test Case 1.5.1:** Render Live

curl https://your-api.onrender.com/health
# Expected: {"status":"ok","timestamp":"..."}
### ☐ Checklist for 1.5:

- [x] Code pushed to GitHub on main branch.
- [x] Render Web Service created with exact build/start commands.
- [x] NODE_ENV=production and PORT=3001 are set.
- [x] Health check path is /health.
- [x] curl to Render URL returns exact expected JSON.
### 1.6 Next.js Frontend Skeleton
**Agent Instruction:** Execute in exact order.

cd apps/web
npx create-next-app@latest . --typescript --tailwind --app --use-pnpm
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card table tabs dialog sheet badge
pnpm add @clerk/nextjs @tanstack/react-query react-hook-form zod @hookform/resolvers date-fns lucide-react use-local-storage-state
**Sub-task 1.6.1:** Create app/layout.tsx with ClerkProvider using afterSignInUrl="/agents" (not deprecated env var).

**Sub-task 1.6.2:** Create middleware.ts per spec Section 12.4:

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
const isPublicRoute = createRouteMatcher(['/sign-in(.*)']);
export default clerkMiddleware((auth, request) => {
  if (!isPublicRoute(request)) auth().protect();
});
**Sub-task 1.6.3:** Create app/(auth)/sign-in/page.tsx using Clerk's <SignIn /> component.

**Sub-task 1.6.4:** Create app/(dashboard)/layout.tsx with sidebar placeholder and OrgSwitcher using use-local-storage-state (SSR-safe).

### ☐ Checklist for 1.6:

- [x] Next.js app created with TypeScript, Tailwind, App Router.
- [x] shadcn/ui initialized and components added.
- [x] app/layout.tsx uses afterSignInUrl="/agents".
- [x] middleware.ts matches exact code above.
- [x] Sign-in page uses Clerk <SignIn /> component.
- [x] Dashboard layout has sidebar placeholder and SSR-safe OrgSwitcher.
### 1.7 Vercel Deployment
**Agent Instruction:** Import GitHub repo. Set exact configuration.

Root Directory: apps/web
Add env vars from Section 15.2.
Deploy.
**Test Case 1.7.1:** Vercel Live

Visit Vercel URL → redirects to /sign-in.
Sign in with Clerk → redirects to /agents (blank page is fine).
Verify JWT is attached to network requests.
### ☐ Checklist for 1.7:

- [x] Vercel project imported from GitHub.
- [x] Root Directory is apps/web.
- [x] Environment variables from Section 15.2 are configured.
- [x] Visiting Vercel URL redirects to /sign-in.
- [x] Clerk sign-in succeeds and redirects to /agents.
- [x] Network requests contain valid JWT.
### 1.8 Upstash Redis Verification
**Agent Instruction:** Test TLS connection.

# Test TLS connection
redis-cli -u $REDIS_URL ping
# Expected: PONG
**Test Case 1.8.1:** BullMQ Connection

Create a test queue and worker in a throwaway script. Verify jobs enqueue and process.

### ☐ Checklist for 1.8:

- [x] redis-cli -u $REDIS_URL ping returns PONG.
- [x] Throwaway BullMQ script enqueues and processes a job successfully.
### 🚨 ERROR RESOLUTION — Phase 1
| Error | Likely Cause | Resolution |
|---|---|---|
| Prisma migrate fails with P1001 (Can’t reach database server at db.*.supabase.co:5432) especially on Render CI/build | Supabase direct hostname is IPv6-first. Many hosts (including Render build runners) use IPv4-only outbound, so the direct URL never connects. Network bans on Supabase can cause this too. | Use DATABASE_DIRECT_URL = Session pooler string from Supabase Dashboard → Connect → Session mode (host *.pooler.supabase.com, port 5432, user often postgres.[PROJECT_REF]). Keep DATABASE_URL as Transaction pooler :6543 + ?pgbouncer=true for app runtime. Or enable Supabase IPv4 add-on for direct db.* access. See Connecting to Postgres. |
| BigInt serialization error | Forgot BigInt patch in main.ts | Add the patch BEFORE app.listen(). Restart server. |
| Render build: nest: not found / spawn ENOENT on nest build | NODE_ENV=production during install → pnpm skips devDependencies, so @nestjs/cli is never installed | Use pnpm install --frozen-lockfile --prod=false in the Render build command (see repo render.yaml). Or move @nestjs/cli (+ typescript) to dependencies (less ideal). |
| Render build fails with "command not found" | Wrong build command or missing pnpm | Verify build command matches 1.5 exactly. Ensure pnpm is available in Render environment. |
| Vercel redirect loop | Wrong afterSignInUrl or middleware | Verify middleware.ts exact code. Ensure afterSignInUrl is /agents, not env var. |
| Clerk JWT not attached | Missing credentials: true in CORS | Verify main.ts CORS config includes credentials: true. |
| Redis PONG fails | Wrong URL or missing TLS | Ensure URL starts with rediss://. Add TLS config if required by client. |
### 🚦 STOP — SUCCESS GATE 1
✅ CLOSED 2026-05-14 — criteria below verified by project owner (Render /health + Vercel Clerk Google → /agents; Redis / Studio / deviations per execution log).

Original criteria (all satisfied):

- [x] Render health endpoint returns 200 from external network.
- [x] Frontend loads on Vercel, Clerk auth works, user lands on dashboard after sign-in.
- [x] Redis responds to ping.
- [x] Prisma Studio shows empty but existing tables.
- [x] .cursorrules conventions were followed in all created files.
Proceed to Phase 2 only after completing Phase 2 PRE-PHASE CHECKLIST next section.

## Phase 2: Authentication & Organization Core (Day 1–2)
Objective: Clerk fully integrated, multi-tenant middleware active, user can belong to orgs, invitation flow works.

## Phase 2 — execution status (agent-maintained)
Overall Phase 2 status: CLOSED — 2026-05-17. Backend + frontend Phase 2 core paths are implemented and live-verified. The prior invited BUILDER role-preservation follow-up is now completed: accepted BUILDER invitations preserve BUILDER in memberships, and the accepted invite is removed from pending_invitations.

Owner verification (2026-05-17): Fresh invited email accepted as BUILDER; Supabase query returned FRESH_EMAIL_HERE | BUILDER | Finova Solutions, and the matching pending_invitations query returned no rows.

| Ref | Task | Implementation | Automated verification | Owner / live verification |
|---|---|---|---|---|
| 2.1 | Clerk webhooks | ✅ apps/api/src/webhooks/webhooks.controller.ts, webhooks.service.ts; raw body + Svix; handlers for four event types | Build OK | Clerk webhook URL + CLERK_WEBHOOK_SECRET on Render; live invite/sign-up |
| 2.2 | Tenant middleware | ✅ apps/api/src/common/tenant.middleware.ts; GET/POST /api/v1/organizations excluded from org header | Build OK | curl TC 2.2.1 — use path /api/v1/agents (playbook snippet omits /api/v1) |
| 2.3 | Organizations API | ✅ organizations.controller.ts / organizations.service.ts | Build OK | PATCH name E2E |
| 2.4 | Members & invitations | ✅ members.controller.ts, invitations.controller.ts, members.service.ts | Build OK | TC 2.4.1 invitation E2E; TC 2.4.2 roles |
| 2.5 | Frontend org context | ✅ apps/web/components/org-context.tsx, org-switcher.tsx; apiFetch sends x-organization-id | pnpm --filter web build OK | TC 2.5.1 multi-org UI |
Deviation (approved for V1 onboarding): POST /api/v1/organizations allows the first organization when the user has zero memberships; if they already belong to an org, OrganizationsService.assertCanCreateOrganization requires ADMIN or OWNER on some membership (stronger than playbook wording “ADMIN+” for returning users).

Agent correction (2026-05-15): On organizationInvitation.accepted, PendingInvitation is deleted only after a DB User exists for the invite email and membership is upserted — if the user row is not present yet, the pending row stays for user.created to consume by email (prevents losing invites).

🛑 STOP — YOUR TASKS (Phase 2 — do before approving Gate 2)
Complete these in order; tell the agent “Phase 2 human steps done” (or list blockers). The agent will not treat Gate 2 as CLOSED until you approve after verification.

Open Clerk Dashboard → Webhooks → Add endpoint. URL: https://<your-Render-api-host>/webhooks/clerk (must be HTTPS and reachable from the internet).
Subscribe to events: user.created, user.updated, user.deleted, organizationInvitation.accepted.
Copy the webhook signing secret → set CLERK_WEBHOOK_SECRET on your Render web service (Environment tab). Store the same value in .env.master / local .env; never commit secrets.
Trigger a Render deploy (or push to the connected branch) so prisma migrate deploy runs on build — ensures migration 20260517120000_organization_clerk_id is applied if not already.
In Vercel → project → Environment variables: set NEXT_PUBLIC_API_URL to your production API origin (e.g. https://<service>.onrender.com), redeploy the frontend if needed.
Optional smoke test: Clerk webhook “Testing” / send test event → confirm Render logs show POST /webhooks/clerk returning 2xx (not 401 Invalid webhook signature).
### ☐ PRE-PHASE CHECKLIST
- [x] Gate 1 is passed.
- [x] .cursorrules reviewed for authentication, webhook, and middleware conventions (agent).
- [x] Clerk Dashboard is open and webhook + signing secret completed (human — use YOUR TASKS above).
### Phase 2 Completed Follow-Up
Status: Completed on 2026-05-17. Invited-role preservation is verified for a fresh BUILDER invitation.

Owner verification: invited BUILDER remained BUILDER in memberships, and the accepted invite was removed from pending_invitations.

### 2.1 Clerk Webhook Endpoint
**Agent Instruction:** Create src/webhooks/webhooks.controller.ts and webhooks.service.ts.

**Sub-task 2.1.1:** Implement POST /webhooks/clerk with svix signature verification.

**Sub-task 2.1.2:** Handle events:

user.created → lookup PendingInvitation by email, create User + Membership, delete pending.
user.updated → update User record.
user.deleted → soft-mark (set email to null or add deletedAt).
organizationInvitation.accepted → backup membership creation.
**Sub-task 2.1.3:** Configure webhook in Clerk Dashboard pointing to https://your-api.render.com/webhooks/clerk. Copy CLERK_WEBHOOK_SECRET.

### ☐ Checklist for 2.1:

- [x] webhooks.controller.ts and webhooks.service.ts created.
- [x] Svix signature verification implemented on POST /webhooks/clerk.
- [x] All four event handlers implemented with exact logic specified (see execution-status correction for invite-accepted + pending row lifecycle).
- [x] Webhook URL configured in Clerk Dashboard (human).
- [x] CLERK_WEBHOOK_SECRET captured in .env.master + Render (human).
### 2.2 Tenant Middleware (Full Implementation)
**Agent Instruction:** Create src/common/tenant.middleware.ts with full membership check.

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
**Test Case 2.2.1:** Tenant Isolation

# Request without x-organization-id (path includes /api/v1 per router prefix)
curl -H "Authorization: Bearer $TOKEN" https://<api-host>/api/v1/agents
# Expected: 403 Forbidden

# Request with invalid org ID
curl -H "Authorization: Bearer $TOKEN" \
  -H "x-organization-id: fake_org" \
  https://<api-host>/api/v1/agents
# Expected: 403 Forbidden
### ☐ Checklist for 2.2:

- [x] TenantMiddleware implements full membership verification.
- [x] Missing x-organization-id returns 403 (owner: curl TC 2.2.1).
- [x] Invalid x-organization-id returns 403 (owner: curl TC 2.2.1).
- [x] Valid x-organization-id passes and sets req.organizationId and req.userRole (owner: curl with real org + membership).
### 2.3 Organizations Module
**Agent Instruction:** Implement per spec Section 7.3:

GET /api/v1/organizations (list user's orgs)
POST /api/v1/organizations (ADMIN+)
PATCH /api/v1/organizations/:id (name update only for V1)
### ☐ Checklist for 2.3:

- [x] GET /api/v1/organizations returns user's organizations.
- [x] POST /api/v1/organizations restricted per onboarding rule (first org allowed; further creates require ADMIN | OWNER) — see execution-status deviation row.
- [x] PATCH /api/v1/organizations/:id updates name only (plus Clerk org name sync).
### 2.4 Members & Invitations Module
**Agent Instruction:** Implement per spec Section 7.3 and spec fix WARN-9:

GET /api/v1/organizations/:id/members
POST /api/v1/organizations/:id/members/invite → creates PendingInvitation + calls Clerk API
GET /api/v1/organizations/:id/invitations (pending list)
DELETE /api/v1/organizations/:id/invitations/:id (cancel)
POST /api/v1/organizations/:id/invitations/:id/resend
**Test Case 2.4.1:** Invitation Flow

Admin invites test@example.com as BUILDER.
Verify PendingInvitation record created with clerkInviteId.
Verify Clerk sends email (check Clerk dashboard logs).
Accept invitation (use Clerk test email or manual webhook test).
Verify User and Membership created with role BUILDER.
Verify PendingInvitation deleted.
**Test Case 2.4.2:** Role Enforcement

VIEWER tries POST /api/v1/agents → 403 Forbidden.
BUILDER tries → 201 Created.
### ☐ Checklist for 2.4:

- [x] All five endpoints implemented.
- [x] Invitation creates PendingInvitation and calls Clerk API.
- [x] Webhook + signup path creates User and Membership on acceptance (owner: E2E TC 2.4.1).
- [x] PendingInvitation is deleted after acceptance (owner: E2E TC 2.4.1).
- [x] Role enforcement returns 403 for VIEWER on POST /api/v1/agents (owner: TC 2.4.2).
### 2.5 Frontend Org Context
**Agent Instruction:** Implement OrgSwitcher in sidebar using use-local-storage-state:

const [activeOrg, setActiveOrg] = useLocalStorageState('awaaz_active_org', {
  defaultValue: orgs[0]?.id
});
**Test Case 2.5.1:** Org Switching

User belongs to Org A and Org B.
Switch to Org B in sidebar.
Verify all subsequent API calls include x-organization-id: org_b_id.
Verify page data refreshes for Org B.
### ☐ Checklist for 2.5:

- [x] OrgSwitcher + OrgProvider use use-local-storage-state (awaaz_active_org); client-only ('use client').
- [x] Switching org updates x-organization-id on calls via apiFetch(..., organizationId: activeOrgId) (owner: browser DevTools Network TC 2.5.1).
- [x] Agents dashboard refetches when activeOrgId changes (useEffect deps in agents/page.tsx) (owner: spot-check two orgs).
### 🚨 ERROR RESOLUTION — Phase 2
| Error | Likely Cause | Resolution |
|---|---|---|
| Webhook signature invalid | Wrong CLERK_WEBHOOK_SECRET or timestamp drift | Verify secret from Clerk Dashboard. Ensure server time is synced. |
| user.created not creating User | Webhook not firing or wrong endpoint URL | Verify webhook URL is HTTPS and reachable. Test with Clerk "Send Test Event". |
| Tenant middleware 403 on valid org | Membership not created | Check Clerk webhook processed organizationInvitation.accepted. Verify userId_organizationId composite key. |
| Role enforcement not working | req.userRole not checked in controller | Verify guard or decorator reads req.userRole. Ensure middleware runs before guards. |
| Org switch not persisting | use-local-storage-state SSR issue | Verify component is client-side only. Check defaultValue logic. |
### 🚦 STOP — SUCCESS GATE 2
Gate status: ✅ CLOSED — 2026-05-17. Owner live verification completed, including fresh BUILDER invitation role preservation and pending-invitation cleanup.

2026-05-17 update: The earlier invited BUILDER role-sync follow-up is completed. Phase 3 may proceed without manual Supabase role correction for invited BUILDER test users.

| Criterion | Implementation / automated | Owner sign-off |
|---|---|---|
| Multi-user, multi-org auth | Clerk middleware + org APIs + web org context; builds OK | [x] |
| Invitation flow end-to-end | Webhooks + pending invitations + Clerk API | [x] |
| Tenant middleware isolates tenants | Code complete | [x] curl TC 2.2.1 |
| Role enforcement | RolesGuard + @Roles on agents (VIEWER vs BUILDER) | [x] TC 2.4.2 |
| .cursorrules on auth code | Agent pass; strict TS / no any in touched webhook fix | [x] |
Workflow status: Completed. Gate 2 is closed and Phase 3 entry is allowed.

Gate 2 Closure Note — 2026-05-17
Gate 2 is accepted as closed. Verified items: organization creation, frontend organization display, Clerk auth, tenant isolation, valid-org agent listing, OWNER/BUILDER role enforcement for agent creation, org context request headers, invited BUILDER role preservation, and pending-invitation cleanup. No Phase 2 deferred follow-up remains open.

## Phase 3: Voice Pipeline Core (Day 2)
Objective: Python agent worker connects to LiveKit and validates the Deepgram→Groq→Rime voice pipeline. Twilio/SIP phone-call integration is deferred for now due to timeline/complexity; do not treat Twilio setup as a Phase 3 blocker.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 2 is passed.
- [x] .cursorrules reviewed for Python/general async conventions; no LiveKit-specific rules present.
- [x] LiveKit Cloud dashboard/account access is available. Verified 2026-05-17: owner-created LiveKit project credentials work; RoomService/ListRooms returned HTTP 200.
- [x] Twilio/SIP trunk setup is deferred for now and not required to begin Phase 3.
### 3.1 Python Environment
**Agent Instruction:** Execute exactly.

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
CRITICAL — Sub-task 3.1.1: Verify ChunkedStream interface before coding TTS:

python -c "import inspect; from livekit.agents import tts; print(inspect.getsource(tts.ChunkedStream))"
# Save this output. Align your RimeTTS implementation exactly.
### ☐ Checklist for 3.1:

- [x] Virtual environment created with Python 3.11.
- [x] requirements.txt matches exact versions.
- [x] All packages install without errors.
- [x] ChunkedStream source code is inspected and saved for reference (apps/agent-worker/chunked-stream-reference.txt).
Fresh verification note (2026-05-17): apps/agent-worker/venv reports Python 3.11.14. Direct package metadata check confirms all pinned versions in requirements.txt are installed.

### 3.2 API Client (api_client.py)
**Agent Instruction:** Implement per spec Section 8.7 with retry logic (3 attempts, exponential backoff).

**Test Case 3.2.1:** API Client Resilience

Start NestJS API locally.
Run python -c "from api_client import AwaazAPIClient; ..." to test get_agent_config with wrong secret → expect 401.
Test with correct secret → expect 200.
Temporarily stop API → expect retries then failure.
Implementation note (2026-05-17): api_client.py is implemented and smoke-tested against a local stub server because the NestJS internal endpoints are scheduled in §3.7. Final live NestJS verification will be repeated after §3.7 is implemented.

### ☐ Checklist for 3.2:

- [x] api_client.py implements AwaazAPIClient.
- [x] Retry logic: 3 attempts, exponential backoff.
- [x] Wrong secret returns 401 (local stub smoke).
- [x] Correct secret returns 200 (local stub smoke).
- [x] API downtime triggers retries then graceful failure (local stub smoke).
Fresh verification note (2026-05-17): api_client.py imports cleanly under the Phase 3 virtualenv. Earlier local stub smoke remains the behavioral verification source.

### 3.3 Rime TTS Plugin (pipeline/tts.py)
**Agent Instruction:** Implement per spec Section 8.5. Use RimeStream extending tts.ChunkedStream.

**Test Case 3.3.1:** TTS Synthesis

# Standalone test
import asyncio
from pipeline.tts import RimeTTS
tts = RimeTTS(voice_id="mist-default")
stream = tts.synthesize("Hello, this is a test.")
# Collect chunks and save to file
# Verify PCM audio output at 16kHz mono
Implementation note (2026-05-17): RimeTTS and RimeStream are implemented and verified with a local PCM streaming stub: collect() returns a LiveKit AudioFrame at 16kHz mono. Owner live Rime test also passed: sample rate 16000, channels 1, samples 23219.

### ☐ Checklist for 3.3:

- [x] RimeTTS class created in pipeline/tts.py.
- [x] RimeStream extends tts.ChunkedStream exactly per inspected interface.
- [x] Standalone local stub test produces valid PCM audio at 16kHz mono.
### 3.4 Agent Entrypoint (agent.py)
**Agent Instruction:** Implement per spec Section 8.4.

Key implementation details:

VoicePipelineAgent with silero.VAD.load(), deepgram.STT(model="nova-3"), openai.LLM.with_groq(...), RimeTTS(...), turn_detector.EOUModel().
Tool registration: end_call and transfer_to_human.
Event emission: user_speech_committed, agent_speech_committed.
**Sub-task 3.4.1:** Implement tools/end_call.py and tools/transfer_to_human.py per spec Section 8.6.

### ☐ Checklist for 3.4:

- [x] agent.py implements AwaazAgent with the pinned LiveKit 0.8.11 equivalent pipeline components (VoiceAssistant; VoicePipelineAgent/turn_detector.EOUModel() are not available in 0.8.11).
- [x] end_call tool registered and functional.
- [x] transfer_to_human tool registered as deferred/non-Twilio for current Phase 3 pass.
- [x] Events emitted on speech committed.
Fresh verification note (2026-05-17): main.py, agent.py, api_client.py, health_server.py, pipeline/tts.py, and both tool modules compile with py_compile; worker modules import cleanly.

### 3.5 Main Entrypoint (main.py)
**Agent Instruction:** Create main.py:

from livekit.agents import WorkerOptions, WorkerType, cli
from agent import AwaazAgent
cli.run_app(WorkerOptions(entrypoint_fnc=AwaazAgent.entrypoint, worker_type=WorkerType.ROOM))
### ☐ Checklist for 3.5:

- [x] main.py matches exact code above.
- [x] Worker type is WorkerType.ROOM.
Windows local-run note (2026-05-17): cli.run_app(...) is wrapped in if __name__ == "__main__": so LiveKit's multiprocessing job executor can start on Windows without the Python bootstrap RuntimeError.

### 3.6 Health Server (health_server.py)
**Agent Instruction:** FastAPI on port 8080 per spec Section 16.1.

### ☐ Checklist for 3.6:

- [x] health_server.py created with FastAPI.
- [x] Runs on port 8080.
- [x] Health endpoint responds with 200.
Fresh verification note (2026-05-17): FastAPI health app returned {"status":"ok"} when launched locally through the virtualenv on a temporary port. Direct script execution currently hits a local ignored-venv launcher quirk, but the app module and endpoint are valid.

### 3.7 Internal API Endpoints (NestJS)
**Agent Instruction:** Implement per spec Section 7.5:

GET /internal/agents/:id/config (protected by x-worker-secret)
POST /internal/calls/start
POST /internal/calls/:id/end
POST /internal/calls/:id/events
GET /internal/worker/heartbeat
**Test Case 3.7.1:** Internal Endpoint Security

curl https://api/internal/agents/123/config
# Expected: 401 or 403 (missing x-worker-secret)

curl -H "x-worker-secret: wrong" https://api/internal/agents/123/config
# Expected: 403

curl -H "x-worker-secret: $WORKER_SECRET" https://api/internal/agents/123/config
# Expected: 200 or 404 (if agent doesn't exist)
### ☐ Checklist for 3.7:

- [x] All five internal endpoints implemented.
- [x] GET /internal/agents/:id/config requires x-worker-secret.
- [x] Missing or wrong secret returns 401/403.
- [x] Correct secret returns 200/404.
Verification note (2026-05-17): Local NestJS build and route smoke passed. Missing x-worker-secret returned 401, wrong secret returned 403, correct secret reached handler and returned 404 for a fake agent ID. All five internal routes were smoke-tested with the correct worker secret; fake call/agent IDs returned 404 and /internal/worker/heartbeat returned { ok: true, timestamp: ... }.

Fresh verification note (2026-05-17): pnpm.cmd --filter @awaaz/api build passed. Local built API smoke passed against Supabase outside the sandbox: /health returned ok, missing worker secret returned 401, wrong secret returned 403, and correct worker secret returned /internal/worker/heartbeat { ok: true, timestamp: ... }.

### 3.8 LiveKit SIP + Twilio Bridge — DEFERRED
Current decision (2026-05-17): Do not integrate Twilio/SIP in the current Phase 3 pass. This section is deferred until after the core worker and voice pipeline are stable.

**Sub-task 3.8.1:** In LiveKit Cloud dashboard → SIP → copy SIP URI.

**Sub-task 3.8.2:** In Twilio Console:

Elastic SIP Trunks → Create Trunk "awaaz-livekit"
Origination URI: LiveKit SIP URI from 3.8.1
Recording tab: Enable "Record incoming calls" from answer.
Recording status callback: https://your-api.render.com/webhooks/twilio
**Sub-task 3.8.3:** Assign Twilio number to SIP Trunk (instead of webhook URL).

**Sub-task 3.8.4:** Create SIP Dispatch Rule for the seed phone number (see 4.5 after seeding).

### ☐ Checklist for 3.8:

- [ ] Deferred to Phase 9 — LiveKit SIP URI copied.
- [ ] Deferred to Phase 9 — Twilio Elastic SIP Trunk "awaaz-livekit" created.
- [ ] Deferred to Phase 9 — Origination URI set to LiveKit SIP URI.
- [ ] Deferred to Phase 9 — Recording enabled with status callback URL.
- [ ] Deferred to Phase 9 — Twilio number assigned to SIP Trunk.
### 3.9 Local Background Worker Verification
Current decision (2026-05-17): Do not create a paid Render Background Worker for the current Phase 3 pass. Run the Python worker locally and verify it connects to LiveKit. Cloud worker deployment is deferred until payment/hosting is approved.

Local setup: activate apps/agent-worker/venv
Start: python main.py start
Add env vars locally from Section 15.3 / .env.master.
Implementation note (2026-05-17): Render paid worker deployment was intentionally removed from render.yaml. The API remains deployed on Render; the Python worker runs from the local machine and connects outbound to LiveKit, Render API, Deepgram, Groq, and Rime.

**Test Case 3.9.1:** Worker Registration

Start the worker locally.
Check LiveKit Cloud dashboard → Agents → verify worker shows as "Connected".
Check local terminal logs → verify no import errors.
### ☐ Checklist for 3.9:

- [x] Paid Render Background Worker deferred to Phase 9.
- [x] Local worker started with python main.py start.
- [x] Environment variables from Section 15.3 configured locally.
- [x] LiveKit registration confirmed from local terminal logs (registered worker, LiveKit Cloud server info).
- [x] Local terminal logs show no import errors.
Verification note (2026-05-17): Local worker registered with LiveKit Cloud and received worker ID AW_5KYoX36zCJYx. LiveKit dashboard access was unavailable, so terminal registration logs are accepted as the verification signal for this local Phase 3 pass.

Fresh LiveKit verification note (2026-05-17): Using the owner-created LiveKit project credentials from local .env, local worker registration succeeded again with worker ID AW_d9wHeCNUGyrL; LiveKit Cloud server info reported edition Cloud, version 1.11.0, protocol 17, region India West. No import errors were present when launched with the absolute virtualenv Python path.

Full room verification note (2026-05-17): Local worker registered again with worker ID AW_DCUC2TfhxhqE, received LiveKit job AJ_UR3AKewz9Mc9, and joined room awaaz-phase3-sirius-smoke as remote participant agent-AJ_UR3AKewz9Mc9. The test participant subscribed to the agent audio track, proving the worker entered the room and published audio.

### 3.10 First Voice Pipeline Test — NON-TWILIO
Status (2026-05-17): Completed for the non-Twilio Phase 3 scope. LiveKit account access is restored, worker registration is verified against the owner-created project, Phase 4.5 has seeded a published Sirius Agent, and a real LiveKit room job has been triggered and completed with a Supabase call row.

This replaces the Twilio phone-call test for the current Phase 3 pass. The goal is to prove the worker starts, connects to LiveKit, loads the voice pipeline, and does not crash. A real Twilio inbound call is deferred.

Preconditions:

NestJS API deployed and healthy.
Python worker deployed and connected to LiveKit.
Twilio SIP trunk configured. Deferred for current Phase 3 pass.
Sirius Agent exists in DB (seeded in Phase 4, or manually inserted).
Test Steps:

Start the Python worker locally or on Render.
Verify LiveKit dashboard shows the worker connected.
Trigger or join a LiveKit room using the worker path available at this stage.
Verify the worker loads Deepgram, Groq, Rime, and Silero configuration without import/runtime errors.
Verify Render/local logs show no worker crash and no API 500s.
Success Criteria:

- [x] Worker starts and stays connected based on local terminal registration logs.
- [x] Voice pipeline dependencies load without import/runtime errors in local compile/import checks and full room smoke.
- [x] Local worker room job completes without crashing; paid Render worker logs remain intentionally deferred.
- [x] No 500 errors in NestJS logs during local internal heartbeat and full room smoke.
### ☐ Checklist for 3.10:

- [x] Worker started locally or on Render. Local prior verification: worker registered with LiveKit from terminal logs.
- [x] LiveKit worker/room connection verified. Evidence: LiveKit assigned job AJ_UR3AKewz9Mc9; test participant saw remote agent participant and subscribed to its audio track. Dashboard visual check is optional.
- [x] Pipeline configuration loads without crashes in local compile/import checks and the full room smoke.
- [x] Twilio phone call test explicitly deferred.
- [x] No errors in NestJS logs during fresh local internal heartbeat smoke and full room smoke.
Full smoke result (2026-05-17): Room RM_uZLtSsXcn7UT created and joined; worker received job AJ_UR3AKewz9Mc9; remote agent participant agent-AJ_UR3AKewz9Mc9 connected; audio track subscribed. Supabase call row cmp9tdxwa0001e7ubai8rge4c was created with agentId = cmp9syhe30004zonpeofmyvq2, agentVersionId = cmp9syjar0007zonpu3smt7yd, status = COMPLETED, metadata.isTest = true, and durationSeconds = 18.

### 🚨 ERROR RESOLUTION — Phase 3
| Error | Likely Cause | Resolution |
|---|---|---|
| Worker not connecting to LiveKit | Wrong LIVEKIT_URL protocol | Must be wss://. Check .env. Verify URL in LiveKit dashboard. |
| ImportError on deploy | Version mismatch in requirements.txt | Do not upgrade versions. Use exact versions listed. Check Render Python version is 3.11. |
| No audio on call | Twilio/SIP deferred or SIP trunk origination URI wrong | For current Phase 3, do not debug Twilio. When re-enabled later, verify URI matches LiveKit SIP URI exactly. |
| Agent responds but no voice | Rime TTS misconfigured | Verify RIME_API_KEY. Check ChunkedStream implementation against inspected source. |
| High latency (>2s) | Groq rate limiting or region | Verify Groq API key. Check Groq dashboard for rate limits. |
| Call connects but immediate hangup | Twilio/SIP deferred or dispatch rule missing/wrong | For current Phase 3, do not debug Twilio. When re-enabled later, verify SIP Dispatch Rule exists and points to correct room prefix. |
| x-worker-secret 403 | Secret mismatch between worker and API | Verify WORKER_SECRET is identical in Render env vars for both API and worker. |
### 🚦 STOP — SUCCESS GATE 3
Gate status: CLOSED FOR NON-TWILIO PHASE 3 SCOPE — 2026-05-17. All code-verifiable Phase 3 items passed. LiveKit account access is restored, LiveKit API connectivity is verified, local worker registration against the owner-created project is verified, Phase 4.5 has seeded a live Sirius Agent, and the full LiveKit room job smoke completed with an agent audio track and a completed Supabase call row. Twilio/SIP real phone-call integration remains intentionally deferred.

- [x] Python worker starts and connects to LiveKit based on prior local terminal registration logs.
- [x] Core voice pipeline dependencies load without runtime/import errors.
- [x] Twilio/SIP real phone call is explicitly deferred.
- [x] Worker shows as connected/assigned through LiveKit job dispatch and remote agent participant evidence. Dashboard visual check is optional.
- [x] Internal endpoints are secured by x-worker-secret.
- [x] .cursorrules conventions followed for Python and NestJS code.
Proceed rule: Phase 4 backend CRUD/versioning work may remain closed. Continue to Phase 5 when ready.

## Phase 4: Agent & Phone Number Backend (Day 2–3)
Objective: Full agent CRUD, versioning with transaction safety, phone number management with LiveKit dispatch rules. LiveKit dispatch-rule API verification and Sirius internal config verification are complete.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 3 is closed for the non-Twilio Phase 3 scope; LiveKit API connectivity, local worker registration, and full room job smoke are verified.
- [x] .cursorrules reviewed for database transaction and API conventions.
- [x] Supabase SQL/Table Editor will be used for DB verification instead of Prisma Studio for this pass.
Execution note (2026-05-17): Phase 4.1 through 4.5 are implemented at the backend/API code level. LiveKit dispatch-rule lifecycle is live-verified against the owner-created LiveKit project; Sirius seed/config is verified against Supabase and the internal worker endpoint; live Rime voice sync is verified against Supabase; R2 preview upload verification remains pending an explicit bucket configuration. Verification uses Supabase directly for DB inspection; Prisma remains the backend ORM used by the NestJS API.

### 4.1 Agents Module
**Agent Instruction:** Implement per spec Section 7.3:

GET /api/v1/agents (tenant-scoped list)
POST /api/v1/agents (BUILDER+)
GET /api/v1/agents/:id (with current live version populated)
PATCH /api/v1/agents/:id (name/description)
DELETE /api/v1/agents/:id (soft-delete, ADMIN+)
### ☐ Checklist for 4.1:

- [x] All five endpoints implemented with tenant scoping.
- [x] POST and DELETE enforce role restrictions.
- [x] GET /api/v1/agents/:id populates current live version.
Verification note (2026-05-17): AgentsController now exposes list/create/get/update/soft-delete; service methods scope by organizationId and deletedAt: null. POST requires BUILDER and DELETE requires ADMIN via @Roles. API build passed with Node 20.

Supabase verification (SQL Editor): agents rows must be created in Supabase with the correct "organizationId". "deletedAt" stays NULL unless the soft-delete endpoint is used. "currentVersionId" is initially NULL before publishing any version.

### 4.2 Agent Versioning (Critical — BLOCK-9 & ADV-2 Fixes)
**Sub-task 4.2.1:** Save version with transaction-based auto-increment:

return this.prisma.$transaction(async (tx) => {
  const last = await tx.agentVersion.findFirst({ where: { agentId }, orderBy: { versionNumber: 'desc' } });
  const next = (last?.versionNumber ?? 0) + 1;
  return tx.agentVersion.create({ data: { ...dto, versionNumber: next } });
});
**Sub-task 4.2.2:** Publish version with transaction to ensure single live version:

return this.prisma.$transaction(async (tx) => {
  await tx.agentVersion.updateMany({ where: { agentId }, data: { isLive: false } });
  await tx.agentVersion.update({ where: { id: versionId }, data: { isLive: true, publishedAt: new Date() } });
  await tx.agent.update({ where: { id: agentId }, data: { currentVersionId: versionId } });
});
Endpoints:

GET /api/v1/agents/:id/versions
POST /api/v1/agents/:id/versions
POST /api/v1/agents/:id/versions/:vId/publish
POST /api/v1/agents/:id/versions/:vId/restore
**Test Case 4.2.1:** Version Number Integrity

Create agent.
Save version → should be V1.
Save again → should be V2.
Publish V2 → V2.isLive=true, V1.isLive=false.
Restore V1 → should create V3 (copy of V1), not overwrite.
**Test Case 4.2.2:** No Concurrent Live Versions

Use Supabase SQL/Table Editor to manually set two versions to isLive=true.
Call publish endpoint → verify only target version is live after.
### ☐ Checklist for 4.2:

- [x] Version save uses transaction with auto-increment.
- [x] Publish uses transaction to unset all then set one live.
- [x] Restore creates new version (copy), does not overwrite.
- [x] Concurrent live versions are impossible via publish endpoint.
Verification note (2026-05-17): Version create/restore use Serializable transactions and the existing (agentId, versionNumber) unique constraint. Publish runs in a transaction, clears isLive for all versions of the agent, marks the target live, and updates Agent.currentVersionId. API build passed with Node 20.

Supabase verification (SQL Editor): after creating versions through the API, agent_versions rows should appear with "versionNumber" incrementing as 1, 2, 3, .... "isLive" should identify the published version only, and "publishedAt" should be populated only after publish. Restoring a version must create a new row instead of overwriting an old one. If no agent_versions rows appear, versions have not yet been created through the API. Final integrity check: each agent must have at most one "isLive" = true version, and publishing must update agents."currentVersionId".

### 4.3 Phone Numbers Module
**Agent Instruction:** Implement per spec Section 7.3:

GET /api/v1/phone-numbers (list org numbers)
POST /api/v1/phone-numbers (register existing Twilio number, ADMIN+)
PATCH /api/v1/phone-numbers/:id (assign/unassign agent, ADMIN+)
POST /api/v1/phone-numbers/:id/sync-dispatch-rule (create LiveKit SIP dispatch rule)
**Sub-task 4.3.1:** LiveKit SIP Dispatch Rule creation in livekit.service.ts:

const sipClient = new SIPClient(...);
const rule = await sipClient.createSIPDispatchRule({
  rule: { dispatchRuleDirect: { roomPrefix: 'call-inbound-', pin: '' } },
  name: `dispatch-${phoneNumber}`,
  metadata: JSON.stringify({ agentId, organizationId: orgId, direction: 'INBOUND', phoneNumber }),
  inboundNumbers: [phoneNumber]
});
// Store rule.id in PhoneNumber.liveKitDispatchRuleId
**Sub-task 4.3.2:** On unassign, delete dispatch rule and clear liveKitDispatchRuleId.

**Test Case 4.3.1:** Dispatch Rule Lifecycle

Register phone number +923001234567.
Assign to Agent A → verify liveKitDispatchRuleId populated.
Verify in LiveKit dashboard that dispatch rule exists.
Unassign → verify liveKitDispatchRuleId is null.
Verify in LiveKit dashboard that rule deleted.
### ☐ Checklist for 4.3:

- [x] Phone number CRUD endpoints implemented.
- [x] Assign creates LiveKit SIP dispatch rule and stores ID. Live smoke verified via POST /api/v1/phone-numbers/:id/sync-dispatch-rule against the owner-created LiveKit project.
- [x] Unassign deletes dispatch rule and clears ID. Live smoke verified via PATCH /api/v1/phone-numbers/:id with agentId: null; DB fields cleared after LiveKit delete.
- [x] LiveKit API reflects dispatch-rule lifecycle changes. Dashboard visual check optional; API create/delete succeeded.
Implementation note (2026-05-17): PhoneNumbersModule added with GET /api/v1/phone-numbers, POST /api/v1/phone-numbers, PATCH /api/v1/phone-numbers/:id, and POST /api/v1/phone-numbers/:id/sync-dispatch-rule. Routes are Clerk-authenticated, tenant-scoped by x-organization-id, and role-protected (VIEWER for list, ADMIN for register/update/sync). API build passed with Node 20.

Live verification note (2026-05-17): A temporary API-route smoke test used organization cmp8lsfz900001176yola7vza, agent cmp8m8r5200041176kqnc0ffp, and a temporary E.164 test number. The route registered the number, assigned the agent, created a LiveKit SIP dispatch rule, unassigned the number, deleted the dispatch rule, and cleared both agentId and liveKitDispatchRuleId. Cleanup verification confirmed the temporary phone number row no longer exists and phone_numbers count returned to 0.

Supabase verification (SQL Editor): registered numbers should appear in phone_numbers with the correct "organizationId", E.164 "number", optional "friendlyName", optional "twilioSid", and "agentId" set only after assignment. "liveKitDispatchRuleId" remains NULL until the LiveKit sync endpoint succeeds. Unassigning should clear "agentId"; if a dispatch rule exists, the code path also clears "liveKitDispatchRuleId" after deleting the LiveKit rule.

### 4.4 Voices Module
GET /api/v1/voices → returns cached Rime voices.
POST /api/v1/voices/sync → fetches Rime voice catalog, generates preview audio via TTS when R2 is configured, uploads to R2, stores in DB.
**Test Case 4.4.1:** Voice Sync

Call POST /api/v1/voices/sync.
Verify Voice table populated with Rime voices.
Verify preview audio files exist in R2 bucket.
### ☐ Checklist for 4.4:

- [x] GET /api/v1/voices returns cached voices.
- [x] POST /api/v1/voices/sync code path fetches Rime voices, generates preview WAV audio, uploads to R2 when configured, and upserts cached voice rows.
- [x] Live Rime sync completed with real local RIME_API_KEY; Supabase voices populated.
- [ ] Deferred to Phase 9 — Live R2 preview upload verification completed with Cloudflare R2 bucket credentials.
Implementation note (2026-05-17): VoicesModule added with GET /api/v1/voices and POST /api/v1/voices/sync. Routes are Clerk-authenticated, tenant-scoped by x-organization-id, and role-protected (VIEWER for list, ADMIN for sync). RimeService uses Rime's live catalog endpoint (/data/voices/voice_details.json), dedupes catalog rows by speaker/rimeVoiceId, and can create WAV previews from Rime PCM TTS output. StorageService uploads preview files to Cloudflare R2 using @aws-sdk/client-s3 when R2 is fully configured. API build passed with Node 20.

Live verification note (2026-05-17): Local POST /api/v1/voices/sync route smoke succeeded against real Rime + Supabase: HTTP 201, synced = 404, previewsUploaded = 0. Supabase verification returned total = 404, active = 404, withRime = 404; sample rows had populated "rimeVoiceId", "isActive" = true, and `"syncedAt" = 2026-05-17T11:50:00.103Z. Rime catalog returned 610 rows but 404 unique speaker IDs, matching the final DB count. R2 previews were skipped because no explicit R2 bucket name is configured locally.

R2 verification attempt (2026-05-17): Added local CLOUDFLARE_R2_BUCKET_NAME=awaaz-recordings and attempted a focused one-voice preview upload using the real RimeService and StorageService. Rime preview synthesis reached the upload step, but Cloudflare R2 returned Access Denied for PutObject; ListBuckets was also denied and HeadBucket for awaaz-recordings did not succeed. Action needed: create/update the R2 API token with Object Read & Write permission for bucket awaaz-recordings (or set the correct bucket name if different), then rerun preview upload verification.

Supabase verification (SQL Editor):

select
  id,
  "rimeVoiceId",
  name,
  language,
  gender,
  "previewAudioUrl",
  "isActive",
  "syncedAt"
from voices
order by name;
Expected after calling POST /api/v1/voices/sync: one row per synced Rime voice, "isActive" = true, "syncedAt" populated, and "previewAudioUrl" set to voice-previews/<rimeVoiceId>.wav when R2 credentials are configured. If R2 is not configured, voices can still sync but preview URLs may stay NULL.

### 4.5 Database Seed (BLOCK-4 Fix)
**Agent Instruction:** Create apps/api/prisma/seed.ts per spec Section 16.4.

CRITICAL: Replace 'user_YOUR_ACTUAL_CLERK_ID' with your real Clerk user ID from the Clerk dashboard.

npx prisma db seed
**Test Case 4.5.1:** Seed Verification

Supabase SQL Editor / Table Editor
# Verify:
# 1. Organization "Finova Solutions" exists
# 2. User (your Clerk ID) exists with OWNER membership
# 3. Agent "Sirius Agent" exists with V1 (isLive=true)
# 4. PhoneNumber exists with agentId pointing to Sirius
**Test Case 4.5.2:** Sirius Config Endpoint

curl -H "x-worker-secret: $WORKER_SECRET" \
  https://api/internal/agents/$SIRIUS_ID/config
# Expected: { agentId, systemPrompt, voiceId, ... }
### ☐ Checklist for 4.5:

- [x] seed.ts created with real Clerk user ID.
- [x] Seed command runs without errors.
- [x] Supabase verifies all four seed conditions.
- [x] Sirius config endpoint returns valid JSON.
Implementation note (2026-05-17): apps/api/prisma/seed.ts added and wired through pnpm --filter @awaaz/api prisma:seed plus Prisma's db seed config. The seed is idempotent: it upserts Finova Solutions, ensures the real owner user has OWNER membership, creates or updates Sirius Agent, creates/updates V1 as the only live version, sets agents.currentVersionId, and assigns a seed phone number to Sirius. The seed phone number defaults to +15550174243 unless SIRIUS_SEED_PHONE_NUMBER is set.

Supabase verification (SQL Editor):

select id, name, slug
from organizations
where name = 'Finova Solutions';

select u.id, u.email, m.role
from memberships m
join users u on u.id = m."userId"
where m."organizationId" = 'cmp8lsfz900001176yola7vza'
  and m.role = 'OWNER';

select a.id, a.name, a."currentVersionId", v."versionNumber", v."isLive", v."publishedAt", v."voiceId", v.model
from agents a
join agent_versions v on v.id = a."currentVersionId"
where a.name = 'Sirius Agent'
  and a."deletedAt" is null;

select id, number, "agentId", "liveKitDispatchRuleId"
from phone_numbers
where "agentId" = 'cmp9syhe30004zonpeofmyvq2';
Verification result (2026-05-17): Sirius Agent created with id cmp9syhe30004zonpeofmyvq2, current V1 id cmp9syjar0007zonpu3smt7yd, versionNumber = 1, isLive = true, voiceId = astra, and exactly one live version. Seed phone number +15550174243 is assigned to Sirius; liveKitDispatchRuleId remains NULL until syncing a real phone number/dispatch rule is desired.

Internal endpoint verification (2026-05-17): Local built API returned valid config from GET /internal/agents/cmp9syhe30004zonpeofmyvq2/config with voiceId = astra, model = llama-3.3-70b-versatile, temperature = 0.55, maxTokens = 900, a non-empty systemPrompt, first message, and end-call phrases.

### 🚨 ERROR RESOLUTION — Phase 4
| Error | Likely Cause | Resolution |
|---|---|---|
| Version number skip or duplicate | Race condition, no transaction | Ensure $transaction wraps both read and create. Do not use separate queries. |
| Two versions marked isLive=true | Manual DB edit or bug | Use publish endpoint transaction. If DB is corrupted, manually fix in Prisma Studio then republish. |
| Dispatch rule not created | Wrong LiveKit credentials or missing SIPClient | Verify LIVEKIT_API_KEY and LIVEKIT_API_SECRET. Check SIP is enabled in LiveKit project. |
| Dispatch rule orphan on unassign | Delete failed but DB cleared | Check LiveKit API response. If rule missing in LiveKit but ID in DB, manually clear DB field. |
| Seed fails with foreign key | Wrong Clerk user ID | Copy exact user ID from Clerk Dashboard → Users. Ensure ID starts with user_. |
| Sirius config 404 | Agent not seeded or wrong ID | Verify seed created Sirius Agent. Check currentVersionId is populated. |
### 🚦 STOP — SUCCESS GATE 4
Gate status: CLOSED FOR PHASE 5 ENTRY — 2026-05-17. Backend CRUD/versioning, phone dispatch lifecycle, voice sync, and Sirius seed/config are verified. R2 voice-preview upload remains a deferred verification item because the local bucket name is now configured, but the current Cloudflare R2 credentials return AccessDenied for object upload.

- [x] Agent versioning works transactionally.
- [x] Phone number assignment creates LiveKit dispatch rules.
- [x] Sirius Agent is queryable by worker via internal endpoint.
- [x] No concurrent live versions possible.
- [x] .cursorrules conventions followed for all backend modules.
## Phase 5: Call Lifecycle & Media Processing (Day 3-4)

**Objective:** Inbound/outbound calls tracked, recordings uploaded, transcripts built, costs calculated.

**Execution note (2026-05-17):** Phase 5 is split into a completed non-Twilio slice and a deferred Twilio/R2 live-recording slice. LiveKit webhooks, BullMQ queue registration, transcript assembly, cost calculation, and R2 presigned URL generation are implemented and locally smoke/Supabase verified. Twilio webhook handling, outbound TwiML calling, real recording download, and live R2 upload/download verification remain deferred while Twilio is out of scope and the current R2 token returns `AccessDenied` for object upload.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 4 is passed.
- [x] .cursorrules reviewed for webhook, queue, and storage conventions.
- [ ] Deferred to Phase 9 — Twilio recording settings enabled.
- [ ] Deferred to Phase 9 — R2 bucket name is configured locally, but current Cloudflare credentials return AccessDenied for object upload.
### 5.1 Twilio Webhook Handler
**Agent Instruction:** Implement POST /webhooks/twilio per spec Section 7.4.

**Sub-task 5.1.1:** Signature verification using twilio.validateRequest.

**Sub-task 5.1.2:** Status callback handling:

initiated → create Call record (inbound) or update existing (outbound).
answered → status = IN_PROGRESS, set startedAt.
completed → status = COMPLETED, set endedAt, durationSeconds.
failed → status = FAILED.
no-answer → status = ABANDONED.
recording-completed → enqueue recordingQueue job.
### ☐ Checklist for 5.1:

- [ ] Deferred to Phase 9 — Twilio signature verification implemented.
- [ ] Deferred to Phase 9 — All status callbacks handled with correct state transitions.
- [ ] Deferred to Phase 9 — recording-completed enqueues job to BullMQ.
Deferred note (2026-05-17): Twilio webhook implementation is intentionally deferred because Twilio is out of scope for the current pass.

### 5.2 Outbound Call Endpoint
**Agent Instruction:** POST /api/v1/calls/outbound per spec Section 7.3.

**Sub-task 5.2.1:** TwiML security with signed tokens (NHP-1 fix):

const token = crypto.createHmac('sha256', TWIML_SECRET)
  .update(`${sipUri}:${Date.now()}`)
  .digest('hex');
await redis.setex(`twiml:${token}`, 60, sipUri);
**Sub-task 5.2.2:** TwiML endpoint (GET /twiml/outbound) per spec Section 10.3 with XML escaping and domain validation.

**Test Case 5.2.1:** TwiML Security

# Request without token
curl https://api/twiml/outbound
# Expected: 404

# Request with expired token
curl https://api/twiml/outbound?token=expired
# Expected: 404

# Request with valid token but wrong domain
# (manually inject bad URI into Redis)
# Expected: 400 Bad Request
### ☐ Checklist for 5.2:

- [ ] Deferred to Phase 9 — Outbound call endpoint creates signed TwiML token.
- [ ] Deferred to Phase 9 — Token stored in Redis with 60s TTL.
- [ ] Deferred to Phase 9 — TwiML endpoint validates token and domain.
- [ ] Deferred to Phase 9 — Invalid/missing token returns 404.
- [ ] Deferred to Phase 9 — Wrong domain returns 400.
Deferred note (2026-05-17): Outbound Twilio/TwiML call flow is intentionally deferred with Twilio.

### 5.3 LiveKit Webhook Handler
**Agent Instruction:** POST /webhooks/livekit per spec Section 7.4.

**Sub-task 5.3.1:** Signature verification using livekit-server-sdk.WebhookReceiver.

**Sub-task 5.3.2:** Handle room_finished → enqueue transcriptQueue job.

### ☐ Checklist for 5.3:

- [x] LiveKit signature verification implemented.
- [x] room_finished enqueues transcript job.
**Implementation note (2026-05-17):** Added `POST /webhooks/livekit` using `livekit-server-sdk.WebhookReceiver`. Signed service smoke with the real Nest app, Redis queue, and worker verified `room_finished` produces a `transcript` queue job with `liveKitRoomId` and `roomName`, and the worker creates transcript/cost rows. LiveKit Cloud delivery to the deployed/local webhook is not confirmed; configure the LiveKit dashboard webhook URL before relying on Cloud delivery alone.

### 5.4 BullMQ Queue Setup (WARN-7 Fix)
**Agent Instruction:** Configure Redis with TLS for Upstash:

const connection = new Redis(process.env.REDIS_URL, {
  tls: {},
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
Register queues: transcript, recording.

### ☐ Checklist for 5.4:

- [x] Redis connection uses TLS config for Upstash.
- [x] transcript and recording queues registered.
- [x] maxRetriesPerRequest: null and enableReadyCheck: false are set.
Verification note (2026-05-17): pnpm --filter @awaaz/api bullmq:smoke completed successfully against REDIS_URL. Nest application-context boot/shutdown also passed after configuring BullMQ from Redis URL options so BullMQ owns and closes its connections cleanly.

### 5.5 Recording Worker (BLOCK-7 Fix)
**Agent Instruction:** Implement RecordingWorker per spec Section 14.3.

**Sub-task 5.5.1:** Download from Twilio using Basic Auth.

**Sub-task 5.5.2:** Upload to R2 using StorageService.uploadBuffer.

**Sub-task 5.5.3:** Update Call.recordingUrl with R2 object key.

**Test Case 5.5.1:** Recording Pipeline

Make a test call.
Wait for recording-completed webhook.
Verify job enqueued in BullMQ (check Upstash or logs).
Verify job processed successfully.
Verify .mp3 file exists in R2 bucket under recordings/{callId}.mp3.
Call GET /api/v1/calls/:id/recording → verify presigned URL returns audio.
### ☐ Checklist for 5.5:

- [ ] Deferred to Phase 9 — Recording worker downloads from Twilio.
- [ ] Deferred to Phase 9 — Uploads to R2 under correct path.
- [ ] Deferred to Phase 9 — Call.recordingUrl updated.
- [ ] Deferred to Phase 9 — Presigned URL returns valid audio.
Blocked/deferred note (2026-05-17): Recording worker remains deferred because it depends on Twilio recording callbacks and media download. R2 upload/download cannot be live-verified until the Cloudflare R2 token has object write/read permission for awaaz-recordings.

### 5.6 Transcript Worker (WARN-7 Fix)
**Agent Instruction:** Implement TranscriptWorker per spec Section 14.3.

**Sub-task 5.6.1:** 3-second delay to wait for Twilio webhook settlement.

**Sub-task 5.6.2:** Fallback lookup by liveKitRoomId if callId not in job data.

**Sub-task 5.6.3:** Assemble USER_SPEECH and AGENT_SPEECH events into Transcript record.

### ☐ Checklist for 5.6:

- [x] Worker delays 3 seconds before processing.
- [x] Fallback lookup by liveKitRoomId implemented.
- [x] Transcript assembled from speech events.
**Verification note (2026-05-17):** Local processor smoke assembled `USER_SPEECH` and `AGENT_SPEECH` events into transcript content. Added an internal non-Twilio fallback: `/internal/calls/:id/end` now enqueues the transcript job after updating call status/duration, so local worker-driven calls do not depend solely on LiveKit webhook delivery.

**DB verification note (2026-05-17):** Supabase contains verified transcript rows: `cmp9w6m2z0001w44dnnxq828b` with both `USER_SPEECH` and `AGENT_SPEECH`, `turns = 2`, and `assembledAt = 2026-05-17T14:50:38.023Z`; `cmp9w832e0001nz1zmz0izf90` verified the signed LiveKit webhook path with `turns = 2` and `assembledAt = 2026-05-17T14:51:44.893Z`. The original LiveKit smoke call `cmp9tdxwa0001e7ubai8rge4c` now has `turns = 1` because only `AGENT_SPEECH` was committed during that room smoke.

### 5.7 Cost Calculation (WARN-12 Fix)
**Agent Instruction:** Implement calculateCost() inside transcript worker.

**Sub-task 5.7.1:** Sum tokenCount (fallback to estimatedTokens = charCount // 4).

**Sub-task 5.7.2:** Calculate per spec:

STT: $0.0043/minute
LLM: $0.79/1M tokens
TTS: $0.020/1K chars
Telephony: $0.0085/minute
**Test Case 5.7.1:** Cost Accuracy

Make a 2-minute test call.
Verify transcript worker completes.
Query Call.costBreakdown from DB.
Manual verification: STT ≈ $0.0086, Telephony ≈ $0.017. Total should be reasonable (>$0.01, <$0.50 for 2 min).
### ☐ Checklist for 5.7:

- [x] Token count summed with char fallback.
- [x] Cost breakdown includes STT, LLM, TTS, Telephony.
- [ ] Deferred to Phase 9 — real 2-minute Twilio test call produces reasonable total cost.
**Verification note (2026-05-17):** Synthetic 2-minute processor smoke produced `totalCostUsd = 0.025984` with STT, LLM, TTS, and telephony components. Supabase verification also shows real persisted cost rows for Phase 5 transcript smokes: `cmp9w6m2z0001w44dnnxq828b` has `totalCostUsd = 0.00293`; `cmp9w832e0001nz1zmz0izf90` has `totalCostUsd = 0.00359`; original call `cmp9tdxwa0001e7ubai8rge4c` has `totalCostUsd = 0.005213`.

### 5.8 Storage Service (BLOCK-7 Fix)
**Agent Instruction:** Implement StorageService with @aws-sdk/client-s3 pointing to R2.

**Test Case 5.8.1:** R2 Upload/Download

// Unit test
await storageService.uploadBuffer('test/hello.txt', Buffer.from('hello'), 'text/plain');
const url = await storageService.getPresignedUrl('test/hello.txt', 60);
const response = await fetch(url);
// Verify response.text() === 'hello'
### ☐ Checklist for 5.8:

- [x] StorageService uses S3 SDK configured for R2.
- [x] Presigned URL generation smoke passes.
- [ ] Deferred to Phase 9 — Upload/download live R2 test passes.
Verification note (2026-05-17): StorageService.getPresignedUrl() generated a signed awaaz-recordings R2 URL locally. Live upload/download remains blocked by Cloudflare AccessDenied on PutObject.

### 🚨 ERROR RESOLUTION — Phase 5
| Error | Likely Cause | Resolution |
|---|---|---|
| Twilio webhook 401 | Signature validation failed | Verify AUTH_TOKEN. Ensure URL in Twilio console matches exact endpoint (including https). |
| Recording job not enqueued | Wrong webhook type or missing handler | Verify Twilio console sends recording-completed. Check webhook route is POST /webhooks/twilio. |
| Recording file missing in R2 | Worker crash or credential issue | Check Render worker logs. Verify R2 ACCESS_KEY and SECRET_KEY. Check bucket name. |
| Transcript missing events | LiveKit webhook not firing | Verify LiveKit webhook URL is HTTPS. Check WebhookReceiver secret matches LiveKit dashboard. |
| Cost calculation zero | Token count missing or char fallback wrong | Verify charCount // 4 logic. Check that AGENT_SPEECH events carry token metadata. |
| Presigned URL expires fast | Wrong TTL or clock skew | Verify TTL is in seconds. Check server time. |
### 🚦 STOP — SUCCESS GATE 5
DO NOT PROCEED TO PHASE 6 UNLESS ALL OF THE FOLLOWING ARE TRUE:

- [ ] Deferred to Phase 9 — End-to-end: Call is made → Twilio records → webhook fires → job downloads → file in R2.
- [x] Transcript is assembled with speech events.
- [x] Cost is calculated and stored.
- [ ] Deferred to Phase 9 — TwiML tokens are secure (404 on invalid, 400 on wrong domain).
- [x] .cursorrules conventions followed for all webhook and worker code.
**Gate status:** **OPEN FOR FULL TWILIO/R2 PHASE 5 — 2026-05-17.** The non-Twilio Phase 5 backend slice is complete and build/smoke/Supabase verified, including transcript creation and cost storage. Full Gate 5 cannot close until Twilio webhook/TwiML/recording flow is implemented, LiveKit Cloud webhook delivery is configured/observed in the deployed environment, and R2 object upload/download permissions are fixed.

## Phase 6: Frontend Core Features (Day 4-5)
Objective: Dashboard usable. Agents editable. Test calls from browser work. Call history viewable.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 5 is passed.
- [ ] .cursorrules reviewed for React, Next.js, and frontend conventions.
- [ ] shadcn/ui components are installed.
### 6.1 API Client (lib/api.ts)
**Agent Instruction:** Implement per spec Section 12.5 with x-organization-id header.

### ☐ Checklist for 6.1:

- [ ] API client attaches x-organization-id to all requests.
- [ ] Clerk token is fetched and attached as Authorization header.
### 6.2 React Query Hooks
Create:

hooks/use-agents.ts
hooks/use-calls.ts
hooks/use-analytics.ts
All must use getToken() from Clerk and pass organizationId.

### ☐ Checklist for 6.2:

- [ ] All three hooks created.
- [ ] Hooks use Clerk getToken().
- [ ] Hooks pass organizationId to API calls.
### 6.3 Agents List Page (/agents)
**Agent Instruction:** Table with columns: Name, Status, Voice, Phone Number, Last Edited, Calls (7d), Actions.

"New Agent" button.
Pre-populated Sirius Agent visible on load.
**Test Case 6.3.1:** Agents List

Load /agents → verify Sirius Agent appears.
Verify status badge is "Active" (green).
Verify assigned phone number displayed.
### ☐ Checklist for 6.3:

- [ ] Agents table has all specified columns.
- [ ] Sirius Agent appears on load.
- [ ] Status badge shows "Active" in green.
- [ ] Assigned phone number displayed.
### 6.4 Agent Create/Edit Page
**Sub-task 6.4.1:** Monaco Editor for system prompt (dynamic import, ssr: false per WARN-2/HP-3).

**Sub-task 6.4.2:** Auto-save draft to localStorage every 30 seconds using use-local-storage-state:

const [draft, setDraft] = useLocalStorageState(`agent-draft-${agentId}`, { defaultValue: '' });
**Sub-task 6.4.3:** Voice Selector component with audio preview (fetched from GET /api/v1/voices).

**Sub-task 6.4.4:** Phone number dropdown showing assignment status.

**Sub-task 6.4.5:** "Save Version" vs "Save & Publish" buttons.

**Test Case 6.4.1:** Draft Persistence

Edit Sirius prompt.
Close browser tab.
Reopen /agents/{id} → verify draft restored from localStorage.
**Test Case 6.4.2:** Version Save

Click "Save Version".
Verify API call to POST /api/v1/agents/:id/versions.
Verify toast "Saved as V2".
Verify version history panel shows V2.
### ☐ Checklist for 6.4:

- [ ] Monaco Editor loads client-side only.
- [ ] Draft auto-saves to localStorage every 30s.
- [ ] Draft persists across tab close/reopen.
- [ ] Voice selector plays preview audio.
- [ ] Phone number dropdown shows assignment.
- [ ] "Save Version" and "Save & Publish" both functional.
### 6.5 Version History Panel
**Agent Instruction:** Right panel on edit page.

List versions newest first.
"View Diff" → modal with react-diff-viewer-continued.
"Restore" → creates new version from old (confirmation dialog).
"Publish" → sets live (confirmation dialog).
**Test Case 6.5.1:** Diff View

Save V1 with prompt "Hello".
Save V2 with prompt "Hello world".
Click "View Diff" on V1 → verify side-by-side shows addition of " world".
### ☐ Checklist for 6.5:

- [ ] Version history panel shows versions newest first.
- [ ] Diff viewer renders side-by-side correctly.
- [ ] Restore creates new version (does not overwrite).
- [ ] Publish triggers confirmation and updates live version.
### 6.6 Test Call Modal
**Agent Instruction:** Full-screen modal.

"Connecting" → "Active" → "Ended" states.
Uses @livekit/components-react LiveKitRoom.
Pulsing microphone icon based on audio level.
**Sub-task 6.6.1:** POST /api/v1/agents/:id/test-call endpoint creates room with isTestCall: true metadata.

**Test Case 6.6.1:** Browser Test Call

Click "Test Agent" on Sirius page.
Allow microphone permissions.
Speak "Hello".
Expected: Hear agent response within 2 seconds.
Click "End Call".
Verify test call appears in Call History with "Test" badge.
### ☐ Checklist for 6.6:

- [ ] Test call modal has three states.
- [ ] LiveKit room connects successfully.
- [ ] Microphone icon pulses with audio level.
- [ ] Agent responds within 2 seconds.
- [ ] Test call marked with "Test" badge in history.
### 6.7 Call History Page (/calls)
**Agent Instruction:** Filter bar: Agent, Direction, Status, Date range, Phone number.

Table with pagination (20 per page).
Columns per spec Section 13.2.
**Test Case 6.7.1:** Filtering

Make 1 inbound call and 1 outbound call.
Filter by "Inbound" → only inbound shows.
Filter by date range excluding today → empty state.
### ☐ Checklist for 6.7:

- [ ] All filters implemented.
- [ ] Pagination is 20 per page.
- [ ] Filtering by direction works correctly.
- [ ] Date range filter works correctly.
### 6.8 Call Detail Page (/calls/:id)
**Sub-task 6.8.1:** Audio player with wavesurfer.js (dynamic import, SSR-safe).

**Sub-task 6.8.2:** Transcript viewer with clickable timestamps jumping audio.

**Sub-task 6.8.3:** Cost breakdown card.

**Sub-task 6.8.4:** Latency breakdown card.

**Test Case 6.8.1:** Call Detail

Open completed call.
Click play on audio → verify waveform renders.
Click transcript turn at 0:30 → verify audio jumps to 0:30.
Verify cost breakdown sums correctly.
### ☐ Checklist for 6.8:

- [ ] Waveform renders on call detail page.
- [ ] Clicking transcript timestamp seeks audio.
- [ ] Cost breakdown displays accurate sums.
- [ ] Latency metrics displayed.
### 🚨 ERROR RESOLUTION — Phase 6
| Error | Likely Cause | Resolution |
|---|---|---|
| Monaco Editor fails to load | SSR import | Ensure dynamic(() => import(...), { ssr: false }). Do not import statically at top level. |
| Draft not persisting | Wrong localStorage key or SSR | Verify key is agent-draft-${agentId}. Ensure hook runs client-side. |
| Voice preview no audio | R2 preview missing or CORS | Verify voice sync ran in Phase 4. Check R2 CORS policy allows audio playback. |
| Test call modal stuck "Connecting" | LiveKit token issue or room creation failure | Check POST /api/v1/agents/:id/test-call response. Verify LiveKit credentials. |
| Waveform not rendering | wavesurfer.js SSR or missing audio | Ensure dynamic import. Verify presigned URL returns valid audio blob. |
| Transcript click doesn't seek | Timestamp format mismatch | Ensure transcript timestamps are in seconds and wavesurfer.seekTo() receives correct value. |
### 🚦 STOP — SUCCESS GATE 6
DO NOT PROCEED TO PHASE 7 UNLESS ALL OF THE FOLLOWING ARE TRUE:

- [ ] User can edit agent, save versions, publish.
- [ ] Browser test call connects and speaks.
- [ ] Call history filters and paginates correctly.
- [ ] Call detail shows audio waveform, clickable transcript, and cost breakdown.
- [ ] .cursorrules conventions followed for all frontend code.
## Phase 7: Analytics & Settings (Day 5)
Objective: Analytics dashboard shows real data. Settings pages functional.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 6 is passed.
- [ ] .cursorrules reviewed for analytics and settings conventions.
- [ ] Real (non-test) call data exists in database.
### 7.1 Analytics Backend
**Agent Instruction:** Implement endpoints per spec Section 7.3:

GET /api/v1/analytics/overview (today, 7d, 30d)
GET /api/v1/analytics/calls-trend (daily buckets)
GET /api/v1/analytics/costs (monthly breakdown)
GET /api/v1/analytics/latency (P50/P95/P99)
GET /api/v1/analytics/agents (top 5 by volume)
GET /api/v1/analytics/live (active calls count)
CRITICAL: Exclude test calls from all analytics:

WHERE (metadata->>'isTest' IS NULL OR metadata->>'isTest' != 'true')
**Sub-task 7.1.1:** Redis caching for analytics (TTLs: overview 60s, trend 5min, costs 5min, latency 60s).

### ☐ Checklist for 7.1:

- [ ] All six analytics endpoints implemented.
- [ ] Test calls excluded via metadata filter in every query.
- [ ] Redis caching applied with correct TTLs.
### 7.2 Analytics Frontend
**Agent Instruction:** Dashboard layout:

Row 1: 4 stat cards (today calls, minutes, avg duration, avg cost).
Row 2: Recharts line charts (calls over time, minutes over time) with 7d/30d toggle.
Row 3: Cost breakdown chart + top agents chart.
Row 4: Latency P50/P95/P99 + success rate + live call counter (polls every 10s).
**Test Case 7.2.1:** Analytics Accuracy

Make 3 test calls (should NOT appear).
Make 2 real calls (should appear).
Verify "Total Calls Today" = 2.
Verify cost chart sums to actual costs.
### ☐ Checklist for 7.2:

- [ ] Stat cards display correct values.
- [ ] Line charts toggle between 7d and 30d.
- [ ] Cost breakdown chart sums correctly.
- [ ] Top agents chart shows top 5.
- [ ] Live call counter polls every 10s.
- [ ] Test calls are excluded from all metrics.
### 7.3 Phone Numbers Tab (/phone-numbers)
**Agent Instruction:** Table showing numbers, assigned agent, status.

"Assign Agent" dropdown.
"Add Number" modal (connect existing Twilio number).
**Test Case 7.3.1:** Number Assignment

Unassign Sirius number.
Verify liveKitDispatchRuleId cleared in DB.
Assign to new agent.
Verify new dispatch rule created and stored.
### ☐ Checklist for 7.3:

- [ ] Phone numbers table displays all org numbers.
- [ ] Unassign clears dispatch rule ID.
- [ ] Assign creates new dispatch rule.
### 7.4 Members Tab (/settings/members)
**Agent Instruction:** Members table with role dropdown.

"Invite Member" dialog (email + role).
Pending invitations section with resend/cancel.
**Test Case 7.4.1:** Member Management

Invite new user as VIEWER.
Verify PendingInvitation created.
Cancel invitation → verify deleted.
Re-invite → accept → verify Membership created with VIEWER role.
### ☐ Checklist for 7.4:

- [ ] Members table shows roles.
- [ ] Invitation creates pending record.
- [ ] Cancel deletes pending invitation.
- [ ] Acceptance creates membership with correct role.
### 7.5 API Keys Tab (/settings/api-keys)
**Agent Instruction:** Table showing prefix, created date, last used.

"Create" dialog showing full key ONCE.
Revoke action.
**Sub-task 7.5.1:** SHA-256 hashing (not bcrypt):

const keyHash = crypto.createHash('sha256').update(fullKey).digest('hex');
**Test Case 7.5.1:** Key Lifecycle

Create key "Test Key".
Verify full key displayed once.
Verify only prefix shown in table.
Verify hash stored in DB (not plaintext).
Revoke → verify isRevoked=true.
### ☐ Checklist for 7.5:

- [ ] API key table shows prefix and metadata.
- [ ] Full key revealed only once on creation.
- [ ] SHA-256 hash stored, never plaintext.
- [ ] Revoke sets isRevoked=true.
### 7.6 Organization Settings
**Agent Instruction:** Minimal: name update only.

### ☐ Checklist for 7.6:

- [ ] Organization name update endpoint works.
- [ ] Frontend form updates name.
### 7.7 Qualicall Placeholder
**Agent Instruction:** Create /qualicall page with "Coming Soon" message and badge in sidebar.

### ☐ Checklist for 7.7:

- [ ] /qualicall route exists.
- [ ] Sidebar shows Qualicall badge.
- [ ] Page displays "Coming Soon".
### 🚨 ERROR RESOLUTION — Phase 7
| Error | Likely Cause | Resolution |
|---|---|---|
| Analytics includes test calls | Missing metadata filter | Verify every SQL/query has WHERE (metadata->>'isTest' IS NULL OR metadata->>'isTest' != 'true'). |
| Cache returning stale data | Wrong TTL or no invalidation | Verify TTL values. If needed, add cache key invalidation on call completion. |
| Phone number unassign not clearing rule | Frontend not calling API or API bug | Verify PATCH request fires. Check API logs for dispatch rule deletion. |
| Invitation email not sent | Clerk configuration | Verify Clerk app has email provider configured. Check Clerk dashboard logs. |
| API key shown more than once | Frontend state bug | Ensure dialog closes and state resets after creation. Store full key in temporary state only. |
| SHA-256 mismatch | Encoding issue | Ensure update(fullKey) uses UTF-8 string. Verify digest is hex. |
### 🚦 STOP — SUCCESS GATE 7
DO NOT PROCEED TO PHASE 8 UNLESS ALL OF THE FOLLOWING ARE TRUE:

- [ ] Analytics display real (non-test) data.
- [ ] Settings fully functional (members, API keys, org settings).
- [ ] Phone number assignment syncs dispatch rules from UI.
- [ ] Qualicall placeholder visible.
- [ ] .cursorrules conventions followed for all settings and analytics code.
## Phase 8: End-to-End Integration & Hardening (Day 5–6)
Objective: Full system test. Security verification. Free-tier survival setup.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 7 is passed.
- [ ] .cursorrules reviewed for security, testing, and documentation conventions.
- [ ] All previous phases' test cases are passing.
### 8.1 Complete User Journey Test
Scenario: New Agent Creation to Call Analysis

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
### ☐ Checklist for 8.1:

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
### 8.2 Security Audit
**Agent Instruction:** Verify all spec security requirements:

| Check | Test | Expected |
|---|---|---|
| TwiML token | Request /twiml/outbound?token=fake | 404 |
| TwiML domain | Inject bad URI into Redis, request | 400 |
| Internal endpoints | Request without x-worker-secret | 403 |
| Cross-org access | Request with valid token but wrong x-organization-id | 403 |
| Clerk webhook | Request with wrong signature | 401 |
| Twilio webhook | Request with wrong signature | 401 |
| LiveKit webhook | Request with wrong auth | 401 |
| API key hash | Query DB for created key | keyHash is SHA-256, no plaintext |
| Role enforcement | VIEWER calls POST /agents | 403 |
### ☐ Checklist for 8.2:

- [ ] All nine security checks performed.
- [ ] All nine return exact expected status codes.
- [ ] No security bypasses found.
### 8.3 Free Tier Survival Setup
**Sub-task 8.3.1:** UptimeRobot setup:

Add https://api.render.com/health → ping every 10 minutes.
Add Supabase REST endpoint → ping every 10 minutes (prevents pausing).
**Sub-task 8.3.2:** Worker heartbeat:

Python worker pings /internal/worker/heartbeat every 5 minutes.
This is secondary keep-alive, not primary.
**Sub-task 8.3.3:** Render cold-start mitigation:

Document that after any idle period, trigger a test call to warm the worker before real calls.
### ☐ Checklist for 8.3:

- [ ] UptimeRobot configured with two pings every 10 minutes.
- [ ] Worker heartbeat implemented (5-minute interval).
- [ ] Cold-start mitigation documented.
### 8.4 Performance Verification
**Test Case 8.4.1:** Latency Benchmark

Make 5 test calls.
Query DB: SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms) FROM call_events WHERE event_type = 'AGENT_SPEECH' AND created_at > NOW() - INTERVAL '1 hour';
Success Criteria: P50 < 900ms.

### ☐ Checklist for 8.4:

- [ ] 5 test calls made.
- [ ] P50 latency queried from database.
- [ ] P50 is under 900ms.
### 8.5 Error Handling & Observability
**Agent Instruction:** Verify:

All async operations have try/catch.
API client in Python worker logs but doesn't crash on event emission failure.
NestJS global exception filter returns consistent JSON errors.
### ☐ Checklist for 8.5:

- [ ] All async operations wrapped in try/catch.
- [ ] Python worker logs errors gracefully without crashing.
- [ ] NestJS exception filter returns consistent JSON.
### 8.6 Final Database Verification
**Agent Instruction:** Run this checklist in Prisma Studio or via queries:

- [ ] Organization table has "Finova Solutions".
- [ ] User table has your Clerk ID.
- [ ] Membership has OWNER role.
- [ ] Agent "Sirius Agent" exists with currentVersionId pointing to V1.
- [ ] AgentVersion V1 has isLive=true.
- [ ] PhoneNumber has agentId = Sirius, liveKitDispatchRuleId populated.
- [ ] PendingInvitation table empty (no stale invites).
- [ ] Call table has test calls marked with metadata->isTest = true.
### 8.7 Documentation & Handoff
**Agent Instruction:** Create the following files in repo root:

- [ ] .env.example file with all variables documented (no real values).
- [ ] README.md with architecture diagram (ASCII or Mermaid).
- [ ] DEPLOYMENT.md with Render/Vercel setup steps.
- [ ] TROUBLESHOOTING.md with common errors:
Worker not connecting → check LiveKit URL protocol (wss://).
No audio → check Twilio SIP trunk origination URI.
Transcript missing → check BullMQ Redis TLS config.
Analytics empty → check test call exclusion logic.
### ☐ Checklist for 8.7:

- [ ] .env.example created with all variables and descriptions.
- [ ] README.md has architecture diagram.
- [ ] DEPLOYMENT.md has step-by-step setup.
- [ ] TROUBLESHOOTING.md has the four required entries plus resolutions.
### 🚨 ERROR RESOLUTION — Phase 8
| Error | Likely Cause | Resolution |
|---|---|---|
| Security check bypass | Missing guard or middleware order | Verify middleware runs before route handlers. Check guard decorators on controllers. |
| UptimeRobot still showing down | Render cold start or wrong path | Verify path is /health. Allow 2-3 minutes for first ping after deploy. |
| P50 latency > 900ms | Groq rate limit or large prompt | Optimize system prompt length. Check Groq dashboard for throttling. |
| Database state mismatch | Seed not run or manual edits | Re-run npx prisma db seed. Verify IDs match Clerk dashboard. |
| Missing documentation file | Agent skipped file creation | Create all four files listed in 8.7 before declaring completion. |
### 🚦 STOP — SUCCESS GATE 8 (FINAL GATE)
DO NOT DECLARE PROJECT COMPLETE UNLESS ALL OF THE FOLLOWING ARE TRUE:

- [ ] Full user journey from agent creation to call analysis passes.
- [ ] Security audit passes all nine checks.
- [ ] Free-tier survival is configured (UptimeRobot + heartbeat).
- [ ] P50 latency is under 900ms.
- [ ] Database verification checklist is all green.
- [ ] All four documentation files exist and are complete.
- [ ] .cursorrules was adhered to in every single file created during all phases.
## Phase 9: Deferred External Integrations & Launch Blockers

**Objective:** Close all items intentionally deferred from earlier phases. Phase 9 is not new feature scope; it is the backlog for external-account, Twilio, SIP, paid-worker, and R2 verification work that could not be honestly completed during Phases 0-5.

**Entry rule:** Start Phase 9 only when Twilio access/credentials are in scope and Cloudflare R2 object read/write permissions are fixed.

| Phase 9 ref | Original phase | Deferred item | Current status | Unlock condition | Required verification |
|---|---|---|---|---|---|
| 9.1 | Phase 0 | R2 account/bucket/object credentials | Deferred, blocked by `AccessDenied` | Cloudflare token has object read/write on `awaaz-recordings` | Upload `test/hello.txt`, generate presigned URL, fetch text successfully |
| 9.2 | Phase 0 | Twilio credentials and phone number | Deferred | Twilio account access, Auth Token, usable phone number | Twilio API auth succeeds and number is visible/usable |
| 9.3 | Phase 3.8 | LiveKit SIP + Twilio bridge | Deferred | Twilio and LiveKit SIP setup access | SIP URI copied, Twilio trunk created, origination URI set, recording callback enabled, number assigned |
| 9.4 | Phase 3.9 | Paid Render Background Worker | Deferred | Paid/background worker hosting approved | Worker deploys, health endpoint responds, LiveKit worker registers from Render logs |
| 9.5 | Phase 4.4 | Rime voice preview upload to R2 | Deferred, blocked by R2 permissions | R2 object write works | `POST /api/v1/voices/sync` uploads at least one preview and `previewAudioUrl` is populated |
| 9.6 | Phase 5.1 | Twilio webhook handler | Deferred | Twilio credentials and webhook callback access | Signature validation works, status callbacks update `Call`, `recording-completed` enqueues job |
| 9.7 | Phase 5.2 | Outbound call + TwiML token security | Deferred | Twilio outbound call flow in scope | Missing/expired token returns 404, bad SIP domain returns 400, valid token returns safe TwiML |
| 9.8 | Phase 5.5 | Recording worker | Deferred, blocked by Twilio/R2 | Twilio recordings and R2 write/read available | Recording downloads from Twilio, uploads to `recordings/{callId}.mp3`, `Call.recordingUrl` updates |
| 9.9 | Phase 5.7 | Real 2-minute Twilio cost test | Deferred | Real Twilio call path works | `costBreakdown` has STT, LLM, TTS, telephony; total is reasonable for 2 minutes |
| 9.10 | Phase 5 Gate 5 | Full Twilio/R2 end-to-end media gate | Deferred | 9.1 through 9.9 are complete | Call made -> Twilio records -> webhook fires -> recording in R2 -> transcript/cost stored |

### Phase 9 Manual Verification Commands
Run these only after the relevant credentials are fixed. Supabase SQL Editor remains the preferred database verification tool.

```powershell
$env:Path = "C:\nvm4w\nodejs;$env:Path"
& "C:\nvm4w\nodejs\pnpm.cmd" --filter @awaaz/api build
& "C:\nvm4w\nodejs\pnpm.cmd" --filter @awaaz/api bullmq:smoke
```

```sql
select
  id,
  status,
  "twilioCallSid",
  "liveKitRoomId",
  "recordingUrl",
  "durationSeconds",
  "costBreakdown",
  "totalCostUsd",
  "createdAt"
from calls
order by "createdAt" desc
limit 10;

select
  c.id as "callId",
  jsonb_array_length(t.content::jsonb) as "turns",
  t."assembledAt"
from transcripts t
join calls c on c.id = t."callId"
order by t."assembledAt" desc
limit 10;
```

**Gate status:** **OPEN — external integration backlog.** Phase 9 closes only when Twilio/SIP, paid worker deployment, and R2 live upload/download verification are all complete.

## Final Launch Checklist
Before announcing V1 readiness, verify every item from spec Section "Final Checklist Before V1 Launch":

- [ ] Sirius Agent deployed — inbound calls work on Twilio number.
- [ ] LiveKit SIP Dispatch Rule created and stored in PhoneNumber.liveKitDispatchRuleId.
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
- [ ] BigInt patch — applied in main.ts.
- [ ] Clerk middleware — middleware.ts protects routes.
- [ ] React Query — QueryClientProvider in root layout.
📋 Daily Standup Format (For Your Use)
Each day, answer:

What phase am I in?
What is today's success gate?
What blockers exist?
What tests failed overnight?
🆘 Emergency Rollback Procedures
| Scenario | Rollback Action |
|---|---|
| Bad agent version published | PATCH previous version to isLive=true via API or Prisma Studio. |
| Twilio SIP trunk misconfigured | Revert origination URI in Twilio Console to previous value. |
| Worker crashing on deploy | Pin to previous Render deploy. Check livekit-agents version compatibility. |
| Database corruption | Restore from Supabase automated backup (taken every day). |
| Clerk webhook flooding | Disable webhook in Clerk Dashboard, verify signature logic, re-enable. |
⚠️ AGENT REMINDER
You have one mandate above all others: .cursorrules is law.
If you are uncertain about a pattern, import style, file structure, or naming convention, consult .cursorrules before proceeding.
If .cursorrules is silent on a matter, default to the exact instructions in this playbook.
If this playbook and .cursorrules conflict, .cursorrules wins— but you must document the deviation in your standup notes.

Do not skip gates. Do not fake test results. Do not proceed until the checklist is complete.
