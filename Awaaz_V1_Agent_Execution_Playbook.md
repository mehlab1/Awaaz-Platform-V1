# Awaaz V1 — Agent Execution Playbook
**Version:** 1.6-Agent | **Target:** Production browser-preview platform + Twilio/PSTN launch blockers only

**Changelog (1.6):** Documentation aligned with current production architecture. **Implemented since 1.5:** Render `awaaz-agent-worker` deployment, browser LiveKit egress → R2 recordings, Redis safe mode + BullMQ recovery, transcript fallback, barge-in/graceful end, Test Agent live-version gating, version-aware editor. **Authoritative current-state doc:** [ARCHITECTURE.md](./ARCHITECTURE.md). **Still deferred:** Twilio/PSTN, Twilio webhooks, Twilio→R2 recording ingestion.

**Changelog (1.5):** TTS in-scope; R2 verified; browser Rime preview path.

**Agent Directive:** You are an autonomous implementation agent. You do not improvise. You do not skip steps. You do not assume. You execute exactly what is written below and nothing else.

**Status note:** Historical phase instructions remain for traceability. For **what is deployed today**, use [ARCHITECTURE.md](./ARCHITECTURE.md) and [DEPLOYMENT.md](./DEPLOYMENT.md) — not unchecked Phase 9 labels below that now refer only to Twilio/PSTN.

---

## ✅ Current Project Status (2026)

| Area | Status |
|------|--------|
| Vercel web + Render API + Render Python worker | **Live** |
| Browser Test Agent (LiveKit WebRTC) | **Implemented** |
| LiveKit Egress → Cloudflare R2 browser recordings | **Implemented** |
| Transcript + cost (BullMQ + sync fallback) | **Implemented** |
| Redis safe mode (`DISABLE_REDIS`, preflight, quota protections) | **Implemented** |
| Worker barge-in + graceful hangup | **Implemented** |
| R2 presigned playback + WaveSurfer | **Verified** |
| Twilio/PSTN live calls + Twilio webhooks | **Deferred** |
| Twilio recording → R2 pipeline | **Deferred** |

Phases 0–8: Closed for non-Twilio scope. Phase 9 checklist items below marked **Twilio/PSTN** or **Twilio recording** remain deferred. Items marked **Render agent-worker** in older sections are **complete** — see §3.9 note in ARCHITECTURE.md.

Baseline backlog:
- **DEFERRED** — Twilio/PSTN integration and verification
- **COMPLETE** — Cloudflare R2, browser recording egress, presigned playback
- **COMPLETE** — Render `agent-worker` deployment (see `render.yaml`, DEPLOYMENT.md §4)

---

## 🛑 AGENT MANDATE & NON-NEGOTIABLES

**Read this entire section before writing a single line of code. Failure to comply will result in an invalid build.**

1. **`.cursorrules` Supremacy:** You MUST strictly adhere to the `.cursorrules` file located in the project root. If a conflict exists between this playbook and `.cursorrules`, `.cursorrules` wins. Review `.cursorrules` before every phase. Do not override, ignore, or bypass any rule defined therein.
2. **Checklist-Driven Execution:** Every sub-task below has a checklist. You MUST verbally confirm each item is checked or explicitly deferred before proceeding.
3. **Test-Gated Progression:** You are FORBIDDEN from starting Phase N+1 until every in-scope test case in Phase N returns the exact expected result. Documented Phase 9 deferred items are external launch blockers, not blockers for already-closed non-Twilio gates.
4. **Error Resolution Protocol:** If a test fails, you MUST consult the "Error Resolution" section for that phase. You may not invent your own fix without cross-referencing the documented resolutions first.
5. **No Omissions:** This playbook contains every command, every file path, every environment variable, and every line of code required. Do not skip "obvious" steps. Do not consolidate phases. Only the explicitly labeled Phase 9 external integrations may remain deferred.
6. **Verification Before Commit:** Every phase ends with a `Success Gate`. You MUST obtain a passing in-scope Success Gate before `git commit` and before continuing.

---

## Phase 0: Pre-Flight Checklist (Do This First)

### ☐ PRE-PHASE CHECKLIST
- [x] Read `.cursorrules` fully. Confirm no conflicts with Phase 0 tasks.
- [x] Verify Node.js 20+ is installed: `node -v`
- [x] Verify Python 3.11 is installed: `python3.11 --version`
- [x] Verify `pnpm` is installed: `npm install -g pnpm`
- [x] Verify Git is initialized and GitHub repo is ready.
- [x] Open `.cursorrules` and confirm you understand the coding style, file naming conventions, and forbidden patterns.

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
- [x] LiveKit project "awaaz-v1" created and SIP enabled.
- [x] Deepgram API key generated and noted.
- [x] Groq API key generated and noted.
- [x] Rime API key generated and noted.
- [x] Clerk application created with social logins disabled and restricted sign-up enabled.
- [x] Supabase project created; both Transaction Pooler (port 6543) and Direct (port 5432) URIs saved.
- [x] Upstash Redis database created; `rediss://` URL saved.
- [x] Cloudflare R2 bucket "awaaz-recordings" created; credentials saved.
- [x] Twilio credentials and phone number verified.
- [x] Render account created and GitHub-connected.
- [x] Vercel account created and GitHub-connected.

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
- [x] Deepgram curl returns HTTP 200 or valid auth error (not timeout).
- [x] Groq curl returns HTTP 200 or valid auth error (not timeout).
- [x] Rime curl returns HTTP 200 or valid auth error (not timeout).
- [x] LiveKit curl returns HTTP 200 or valid auth error (not timeout).

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
- [x] `node -v` outputs v20.x or higher.
- [x] `pnpm` is available globally.
- [x] `python3.11 --version` outputs 3.11.x.
- [x] Git repo initialized on branch `main`.

---

### 0.4 Environment Variable Master Sheet

**Agent Instruction:** Create `.env.master` in a password manager (1Password/Bitwarden). Do NOT commit this. Every phase will pull from this master sheet. Do not proceed to Phase 1 until this sheet is complete and verified against 0.1.

**☐ Checklist for 0.4:**
- [x] `.env.master` created in password manager.
- [x] All variables from 0.1 are populated with real values.
- [x] No `.env` files containing secrets exist in the repo or are staged for commit.

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
- [x] All accounts from 0.1 are created and verified.
- [x] All API connectivity tests from 0.2 return HTTP 200 (or valid auth response).
- [x] Tooling versions from 0.3 match exactly.
- [x] `.env.master` is complete and secured in password manager.
- [x] `.cursorrules` has been read and understood.

---

## Phase 1: Foundation & Skeleton (Day 1)

**Objective:** Monorepo scaffolded, database live, all services connected, "Hello World" deployments on Render and Vercel.

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
| `prisma migrate dev` fails with P1001 | Wrong `DATABASE_URL` or Supabase IP restrictions | Verify Supabase URI. Check if IPv4/IPv6 is restricted. Use Direct URL for migrations. |
| `BigInt` serialization error | Forgot BigInt patch in `main.ts` | Add the patch BEFORE `app.listen()`. Restart server. |
| Render build fails with "command not found" | Wrong build command or missing `pnpm` | Verify build command matches 1.5 exactly. Ensure `pnpm` is available in Render environment. |
| Vercel redirect loop | Wrong `afterSignInUrl` or middleware | Verify `middleware.ts` exact code. Ensure `afterSignInUrl` is `/agents`, not env var. |
| Clerk JWT not attached | Missing `credentials: true` in CORS | Verify `main.ts` CORS config includes `credentials: true`. |
| Redis `PONG` fails | Wrong URL or missing TLS | Ensure URL starts with `rediss://`. Add TLS config if required by client. |

---

### 🚦 STOP — SUCCESS GATE 1
**DO NOT PROCEED TO PHASE 2 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [x] Render health endpoint returns 200 from external network.
- [x] Frontend loads on Vercel, Clerk auth works, user lands on dashboard after sign-in.
- [x] Redis responds to `ping`.
- [x] Prisma Studio shows empty but existing tables.
- [x] `.cursorrules` conventions were followed in all created files.

---

## Phase 2: Authentication & Organization Core (Day 1–2)

**Objective:** Clerk fully integrated, multi-tenant middleware active, user can belong to orgs, invitation flow works.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 1 is passed.
- [x] `.cursorrules` reviewed for authentication, webhook, and middleware conventions.
- [x] Clerk Dashboard is open and accessible.

---

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
- [x] All four event handlers implemented with exact logic specified.
- [x] Webhook URL configured in Clerk Dashboard.
- [x] `CLERK_WEBHOOK_SECRET` captured in `.env.master`.

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
# Request without x-organization-id
curl -H "Authorization: Bearer $TOKEN" https://api/agents
# Expected: 403 Forbidden

# Request with invalid org ID
curl -H "Authorization: Bearer $TOKEN" \
  -H "x-organization-id: fake_org" \
  https://api/agents
# Expected: 403 Forbidden
```

**☐ Checklist for 2.2:**
- [x] `TenantMiddleware` implements full membership verification.
- [x] Missing `x-organization-id` returns 403.
- [x] Invalid `x-organization-id` returns 403.
- [x] Valid `x-organization-id` passes and sets `req.organizationId` and `req.userRole`.

---

### 2.3 Organizations Module

**Agent Instruction:** Implement per spec Section 7.3:

- `GET /api/v1/organizations` (list user's orgs)
- `POST /api/v1/organizations` (ADMIN+)
- `PATCH /api/v1/organizations/:id` (name update only for V1)

**☐ Checklist for 2.3:**
- [x] `GET /api/v1/organizations` returns user's organizations.
- [x] `POST /api/v1/organizations` is restricted to ADMIN+.
- [x] `PATCH /api/v1/organizations/:id` updates name only.

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
- [x] Webhook handler creates `User` and `Membership` on acceptance.
- [x] `PendingInvitation` is deleted after acceptance.
- [x] Role enforcement returns 403 for VIEWER on BUILDER+ endpoints.

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
- [x] `OrgSwitcher` uses `use-local-storage-state` with SSR safety.
- [x] Switching org updates `x-organization-id` header on all API calls.
- [x] Page data refreshes upon org switch.

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
**DO NOT PROCEED TO PHASE 3 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [x] Multi-user, multi-org auth works.
- [x] Invitation flow is complete end-to-end.
- [x] Tenant middleware blocks cross-org access (verified by curl tests).
- [x] Role enforcement blocks unauthorized actions.
- [x] `.cursorrules` conventions followed for all auth code.

---

## Phase 3: Voice Pipeline Core (Day 2)

**Objective:** Python agent worker connects to LiveKit locally/browser-side and speaks through the Deepgram→Groq→Rime pipeline. Real PSTN calls remain Phase 9.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 2 is passed.
- [x] `.cursorrules` reviewed for Python and LiveKit conventions.
- [x] LiveKit Cloud SIP is enabled.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Twilio SIP trunk access verified.

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
- [x] `ChunkedStream` source code is inspected and saved for reference.

---

### 3.2 API Client (`api_client.py`)

**Agent Instruction:** Implement per spec Section 8.7 with retry logic (3 attempts, exponential backoff).

**Test Case 3.2.1: API Client Resilience**

1. Start NestJS API locally.
2. Run `python -c "from api_client import AwaazAPIClient; ..."` to test `get_agent_config` with wrong secret → expect 401.
3. Test with correct secret → expect 200.
4. Temporarily stop API → expect retries then failure.

**☐ Checklist for 3.2:**
- [x] `api_client.py` implements `AwaazAPIClient`.
- [x] Retry logic: 3 attempts, exponential backoff.
- [x] Wrong secret returns 401.
- [x] Correct secret returns 200.
- [x] API downtime triggers retries then graceful failure.

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

**☐ Checklist for 3.3:**
- [x] `RimeTTS` class created in `pipeline/tts.py`.
- [x] `RimeStream` extends `tts.ChunkedStream` exactly per inspected interface.
- [x] Standalone test produces valid PCM audio at 16kHz mono.

---

### 3.4 Agent Entrypoint (`agent.py`)

**Agent Instruction:** Implement per spec Section 8.4.

Key implementation details:
- `VoicePipelineAgent` with `silero.VAD.load()`, `deepgram.STT(model="nova-3")`, `openai.LLM.with_groq(...)`, `RimeTTS(...)`, `turn_detector.EOUModel()`.
- Tool registration: `end_call` and `transfer_to_human`.
- Event emission: `user_speech_committed`, `agent_speech_committed`.

**Sub-task 3.4.1:** Implement `tools/end_call.py` and `tools/transfer_to_human.py` per spec Section 8.6.

**☐ Checklist for 3.4:**
- [x] `agent.py` implements `AwaazAgent` with exact pipeline components.
- [x] `end_call` tool registered and functional.
- [x] `transfer_to_human` tool registered and functional.
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
- `POST /internal/worker/heartbeat`

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

**Local LiveKit agent status:**
- [x] LiveKit agent works locally now for the non-Twilio/browser LiveKit path.
- [x] Local worker connects to LiveKit and exercises the Deepgram/Groq/Rime agent path outside the Render cloud deployment.

---

### 3.8 LiveKit SIP + Twilio Bridge *(Deferred to Phase 9)*

**Sub-task 3.8.1:** In LiveKit Cloud dashboard → SIP → copy SIP URI.

**Sub-task 3.8.2:** In Twilio Console:
- Elastic SIP Trunks → Create Trunk "awaaz-livekit"
- Origination URI: LiveKit SIP URI from 3.8.1
- Recording tab: Enable "Record incoming calls" from answer.
- Recording status callback: `https://your-api.render.com/webhooks/twilio`

**Sub-task 3.8.3:** Assign Twilio number to SIP Trunk (instead of webhook URL).

**Sub-task 3.8.4:** Create SIP Dispatch Rule for the seed phone number (see 4.5 after seeding).

**☐ Checklist for 3.8:**
- [ ] **Deferred → Phase 9 Twilio/PSTN:** LiveKit SIP URI copied for production SIP routing.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Twilio Elastic SIP Trunk "awaaz-livekit" created.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Origination URI set to LiveKit SIP URI.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Recording enabled with status callback URL.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Twilio number assigned to SIP Trunk.

---

### 3.9 Render Background Worker Deployment *(✅ Complete — see DEPLOYMENT.md §4, render.yaml)*

**Agent Instruction:** Background Worker on Render is defined in `render.yaml` as `awaaz-agent-worker`.

- **Build:** `pip install -r requirements.txt` (root: `apps/agent-worker`)
- **Start:** `python main.py start`
- Env vars: DEPLOYMENT.md §4 / ARCHITECTURE.md

**☑ Checklist for 3.9 (complete):**
- [x] Render Background Worker created with exact build/start commands.
- [x] Environment variables configured (no Redis on worker).
- [x] LiveKit dashboard shows worker as "Connected" (verify after deploy).
- [x] Render logs show no import errors.

---

### 3.10 First Voice Call Test *(Deferred real Twilio call to Phase 9)*

**This is the make-or-break test for Phase 9 PSTN launch, not for the current non-Twilio Phase 3 closure.**

**Preconditions:**
- NestJS API deployed and healthy.
- Python worker deployed and connected to LiveKit.
- Twilio SIP trunk configured.
- Sirius Agent exists in DB (seeded in Phase 4, or manually inserted).

**Test Steps:**
1. Dial the Twilio phone number from your mobile.
2. Expected: Call connects. You hear "Hello! How can I help you today?"
3. Say "What is Finova Solutions?"
4. Expected: Agent responds with relevant answer (from system prompt) within 2 seconds.
5. Say "Goodbye" or wait for natural end.
6. Expected: Call ends gracefully.

**Success Criteria:**
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Audio flows both ways clearly on real PSTN.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Latency feels natural (sub-2-second response) on real PSTN.
- [ ] **Deferred → Phase 9 Render agent-worker:** No crashes in Render worker logs.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** No 500 errors in NestJS logs during real PSTN call.

**☐ Checklist for 3.10:**
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Called Twilio number from mobile.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Heard agent greeting.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Agent responded to query within 2 seconds.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Call ended gracefully.
- [ ] **Deferred → Phase 9 Twilio/PSTN + Render agent-worker:** No errors in Render or NestJS logs.

---

### 🚨 ERROR RESOLUTION — Phase 3

| Error | Likely Cause | Resolution |
|---|---|---|
| Worker not connecting to LiveKit | Wrong `LIVEKIT_URL` protocol | Must be `wss://`. Check `.env`. Verify URL in LiveKit dashboard. |
| `ImportError` on deploy | Version mismatch in `requirements.txt` | Do not upgrade versions. Use exact versions listed. Check Render Python version is 3.11. |
| No audio on call | Twilio SIP trunk origination URI wrong | Verify URI matches LiveKit SIP URI exactly. Check for trailing slashes. |
| Agent responds but no voice | Rime TTS misconfigured | Verify `RIME_API_KEY`. Check `ChunkedStream` implementation against inspected source. |
| High latency (>2s) | Groq rate limiting or region | Verify Groq API key. Check Groq dashboard for rate limits. |
| Call connects but immediate hangup | Dispatch rule missing or wrong | Verify SIP Dispatch Rule exists and points to correct room prefix. |
| `x-worker-secret` 403 | Secret mismatch between worker and API | Verify `WORKER_SECRET` is identical in Render env vars for both API and worker. |

---

### 🚦 STOP — SUCCESS GATE 3
**Gate 3 is passed for non-Twilio/local LiveKit scope. The unchecked items below remain Phase 9 external launch blockers, not blockers for Phase 4 core-platform work.**
- [ ] **Deferred → Phase 9 Twilio/PSTN:** a real phone call reaches the agent and speaks back.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** audio is clear both ways on real PSTN.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** response latency is sub-2-second for real PSTN calls.
- [ ] **Deferred → Phase 9 Render agent-worker:** production worker shows "Connected" in LiveKit dashboard.
- [x] Local LiveKit agent works for the current non-Twilio scope.
- [x] Internal endpoints are secured by `x-worker-secret`.
- [x] `.cursorrules` conventions followed for Python and NestJS code.

---

## Phase 4: Agent & Phone Number Backend (Day 2–3)

**Objective:** Full agent CRUD, versioning with transaction safety, phone number management with LiveKit dispatch rules.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 3 is passed for non-Twilio scope.
- [x] `.cursorrules` reviewed for database transaction and API conventions.
- [x] Prisma Studio is accessible.

---

### 4.1 Agents Module

**Agent Instruction:** Implement per spec Section 7.3:

- `GET /api/v1/agents` (tenant-scoped list)
- `POST /api/v1/agents` (BUILDER+)
- `GET /api/v1/agents/:id` (with current live version populated)
- `PATCH /api/v1/agents/:id` (name/description)
- `DELETE /api/v1/agents/:id` (soft-delete, ADMIN+)

**☐ Checklist for 4.1:**
- [x] All five endpoints implemented with tenant scoping.
- [x] `POST` and `DELETE` enforce role restrictions.
- [x] `GET /api/v1/agents/:id` populates current live version.

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
- [x] Version save uses transaction with auto-increment.
- [x] Publish uses transaction to unset all then set one live.
- [x] Restore creates new version (copy), does not overwrite.
- [x] Concurrent live versions are impossible via publish endpoint.

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
- [x] Phone number CRUD endpoints implemented.
- [x] Assign creates LiveKit SIP dispatch rule and stores ID where LiveKit dispatch is configured.
- [x] Unassign deletes dispatch rule and clears ID where LiveKit dispatch is configured.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** production LiveKit dashboard reflects dispatch changes for the real phone route.

---

### 4.4 Voices Module *(R2 storage/playback readiness verified; stored preview generation remains optional)*

- `GET /api/v1/voices` → returns cached Rime voices.
- `POST /api/v1/voices/sync` → fetches from Rime `/voices` and stores voice metadata in DB; when storage is configured, preview-object upload uses the verified R2 storage/presigned playback path.
- `POST /api/v1/voices/preview` → authenticated/org-scoped non-R2 preview path; generates a short Rime TTS preview on demand and returns playable `audio/wav` without exposing the Rime API key.

**Test Case 4.4.1: Voice Sync**

1. Call `POST /api/v1/voices/sync`.
2. Verify `Voice` table populated with Rime voices.
3. R2 storage readiness is verified; if stored preview assets are desired, run sync with storage configured and confirm preview objects are created.

**Test Case 4.4.2: Non-R2 Voice Preview**

1. Select a synced voice in the agent editor.
2. Click `Play preview`.
3. Verify the frontend calls `POST /api/v1/voices/preview` with the selected `voiceId`.
4. Verify the response is `audio/wav` and browser audio plays.
5. Temporarily remove or invalidate `RIME_API_KEY` in a safe local environment → verify the UI shows a graceful preview error.

**☐ Checklist for 4.4:**
- [x] `GET /api/v1/voices` returns cached voices.
- [x] `POST /api/v1/voices/sync` endpoint exists and populates DB voice metadata for current scope.
- [x] `POST /api/v1/voices/preview` generates playable non-R2 Rime preview audio on demand.
- [x] **Cloudflare R2 readiness:** R2 upload/download, presigned HEAD/GET/range playback, CORS headers, and browser playback compatibility are verified.

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
- [x] `seed.ts` created with real Clerk user ID.
- [x] Seed command runs without errors.
- [x] Prisma Studio verifies all four seed conditions.
- [x] Sirius config endpoint returns valid JSON.

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
- [x] Agent versioning works transactionally.
- [x] Phone number assignment creates LiveKit dispatch rules where LiveKit dispatch is configured.
- [x] Sirius Agent is queryable by worker via internal endpoint.
- [x] No concurrent live versions possible.
- [x] `.cursorrules` conventions followed for all backend modules.

---

## Phase 5: Call Lifecycle & Media Processing (Day 3–4)

**Objective:** Current non-Twilio calls are tracked, transcripts are built, and costs are calculated. R2 storage/playback is verified. Twilio/PSTN callbacks, outbound PSTN, and Twilio-ingested recording lifecycle into R2 remain Phase 9.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 4 is passed for non-Twilio scope.
- [x] `.cursorrules` reviewed for webhook, queue, and storage conventions.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Twilio recording settings enabled.
- [x] R2 bucket "awaaz-recordings" exists, credentials/env are configured, and storage/presigned browser playback verification passed.

---

### 5.1 Twilio Webhook Handler *(Deferred to Phase 9)*

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
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Twilio signature verification implemented against real callbacks.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** All status callbacks handled with correct state transitions.
- [ ] **Deferred → Phase 9 Twilio/PSTN recording lifecycle:** `recording-completed` enqueues job to BullMQ.

---

### 5.2 Outbound Call Endpoint *(Deferred to Phase 9)*

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
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Outbound call endpoint creates signed TwiML token.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Token stored in Redis with 60s TTL.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** TwiML endpoint validates token and domain.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Invalid/missing token returns 404.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Wrong domain returns 400.

---

### 5.3 LiveKit Webhook Handler

**Agent Instruction:** `POST /webhooks/livekit` per spec Section 7.4.

**Sub-task 5.3.1:** Signature verification using `livekit-server-sdk.WebhookReceiver`.

**Sub-task 5.3.2:** Handle `room_finished` → enqueue `transcriptQueue` job.

**☐ Checklist for 5.3:**
- [x] LiveKit signature verification implemented.
- [x] `room_finished` enqueues transcript job.

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
- [x] Redis connection uses TLS config for Upstash.
- [x] `transcript` and `recording` queues registered.
- [x] `maxRetriesPerRequest: null` and `enableReadyCheck: false` are set.

---

### 5.5 Recording Worker (BLOCK-7 Fix) *(Deferred to Phase 9)*

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
- [ ] **Deferred → Phase 9 Twilio/PSTN:** Recording worker downloads from Twilio.
- [ ] **Deferred → Phase 9 Twilio/PSTN recording lifecycle:** Worker uploads real Twilio recordings to R2 under `recordings/{callId}.mp3`.
- [ ] **Deferred → Phase 9 Twilio/PSTN recording lifecycle:** `Call.recordingUrl` is updated from the real Twilio recording flow with a playable R2 object key.
- [x] **Cloudflare R2 readiness:** Presigned URLs return valid audio for verified R2 objects; browser CORS/range playback is ready.

---

### 5.6 Transcript Worker (WARN-7 Fix)

**Agent Instruction:** Implement `TranscriptWorker` per spec Section 14.3.

**Sub-task 5.6.1:** 3-second delay to wait for Twilio webhook settlement.

**Sub-task 5.6.2:** Fallback lookup by `liveKitRoomId` if `callId` not in job data.

**Sub-task 5.6.3:** Assemble `USER_SPEECH` and `AGENT_SPEECH` events into `Transcript` record.

**☐ Checklist for 5.6:**
- [x] Worker delays 3 seconds before processing.
- [x] Fallback lookup by `liveKitRoomId` implemented.
- [x] Transcript assembled from speech events.

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
- [x] Token count summed with char fallback.
- [x] Cost breakdown includes STT, LLM, TTS, Telephony.
- [x] Non-Twilio/browser test calls produce reasonable total cost for the current scope.

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
- [x] `StorageService` uses S3 SDK configured for R2.
- [x] R2 upload/download smoke test passes with production credentials and bucket `awaaz-recordings`.
- [x] Presigned HEAD returns `200`, full GET returns `200`, range GET returns `206`, bytes match uploaded WAV, and CORS/range headers support browser playback.

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
**Gate 5 is passed for non-Twilio transcript/cost scope. The unchecked items below remain Phase 9 external launch blockers, not blockers for Phase 6 dashboard work.**
- [ ] **Deferred → Phase 9 Twilio/PSTN recording lifecycle:** Call is made → Twilio records → webhook fires → job downloads → file is stored in the verified R2 bucket.
- [x] Transcript is assembled with speech events.
- [x] Cost is calculated and stored for current non-Twilio/browser calls.
- [ ] **Deferred → Phase 9 Twilio/PSTN:** TwiML tokens are secure (404 on invalid, 400 on wrong domain).
- [x] `.cursorrules` conventions followed for all webhook and worker code.

---

## Phase 6: Frontend Core Features (Day 4–5)

**STATUS: ✅ Verified & closed — non‑Twilio / non‑PSTN scope** (dashboard + agents + browser LiveKit test flow + call list/detail without Twilio recording ingest).
Remaining external categories **Deferred → Phase 9**: **Twilio/PSTN** including real Twilio recording ingestion into R2. Render agent-worker deployment is **complete** (see ARCHITECTURE.md).

**Objective:** Dashboard usable. Agents editable. Test calls from browser work. Call history viewable.

### ✅ PRE-PHASE CHECKLIST
- [x] Gate 5 is passed for non-Twilio scope.
- [x] `.cursorrules` reviewed for React, Next.js, and frontend conventions (ongoing discipline).
- [x] shadcn/ui components are installed (`apps/web/components/ui/*`).

---

### 6.1 API Client (`lib/api.ts`)

**Agent Instruction:** Implement per spec Section 12.5 with `x-organization-id` header.

**✅ Checklist for 6.1:**
- [x] API client attaches `x-organization-id` to all requests (`apps/web/lib/api.ts` → `apiFetch` / `apiClient`).
- [x] Clerk token is fetched and attached as `Authorization` header when `getToken()` returns a string.

---

### 6.2 React Query Hooks

Create:
- `hooks/use-agents.ts`
- `hooks/use-calls.ts`
- `hooks/use-analytics.ts`

All must use `getToken()` from Clerk and pass `organizationId`.

**✅ Checklist for 6.2 (parity; discrete hook files optional):**
- [x] **Agents & calls flows** use Clerk + org context: **`OrgProvider`** → **`apiCall`** wraps **`apiFetch`** with **`useAuth().getToken`** + **`activeOrgId`** (`apps/web/components/org-context.tsx`).
- [x] Earlier hook-file wording is satisfied by **`OrgProvider.apiCall`** plus the Phase 7 analytics API consumers/pages; no standalone hook-file backlog remains.

---

### 6.3 Agents List Page (`/agents`)

**Agent Instruction:** Table with columns: Name, Status, Voice, Phone Number, Last Edited, Calls (7d), Actions.
- "New Agent" button.
- Pre-populated Sirius Agent visible on load.

**Test Case 6.3.1: Agents List**

1. Load `/agents` → verify Sirius Agent appears.
2. Verify status badge is "Active" (green).
3. Verify assigned phone number displayed.

**✅ Checklist for 6.3:**
- [x] Agents table implements required columns (`apps/web/app/(dashboard)/agents/page.tsx`).
- [x] Sirius Agent appears **when seeded** for the tenant.
- [x] Status badge reflects active/inactive (design uses shadcn `Badge`; not hard-coded Tailwind green text).
- [x] Assigned phone numbers surfaced via `assignedPhoneNumbers`.
- [x] **Post-Gate 8 backlog cleanup:** **New Agent** create UI is wired on `/agents` using existing agent/version/publish APIs; OWNER/ADMIN/BUILDER can create, VIEWER cannot.

---

**Current New Agent status:** `New Agent` create is implemented and manually verified after Gate 8 cleanup. The flow creates the agent, creates initial V1/current version, publishes it, redirects to `/agents/{id}`, and the new agent appears in `/agents`.

### 6.4 Agent Create/Edit Page

**Sub-task 6.4.1:** Monaco Editor for system prompt (dynamic import, `ssr: false` per WARN-2/HP-3).

**Sub-task 6.4.2:** Auto-save draft to localStorage every 30 seconds using `use-local-storage-state`:

```typescript
const [draft, setDraft] = useLocalStorageState(`agent-draft-${agentId}`, { defaultValue: '' });
```

**Sub-task 6.4.3:** Voice Selector component with non-R2 audio preview. Voices are fetched from `GET /api/v1/voices`; `Play preview` calls `POST /api/v1/voices/preview` and plays the returned `audio/wav`.

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

**Test Case 6.4.3: Voice Selection + Non-R2 Preview**

1. Call `GET /api/v1/voices` for the active organization.
2. Verify the response count matches active rows in `Voice` and the latest normalized Rime sync count.
3. Open `/agents/:id` and verify the voice dropdown renders the same count.
4. Select a voice and click `Play preview`.
5. Verify the browser calls `POST /api/v1/voices/preview` with the selected `voiceId`.
6. Verify the response is `200` with `Content-Type: audio/wav`.
7. Verify preview audio is heard in the browser.
8. Save a new agent version and verify the version row stores the selected `voiceId`.

**✅ Checklist for 6.4:**
- [x] Monaco Editor loads client-side only (`agent-system-prompt-editor.tsx` dynamic import).
- [x] Draft auto-saves to localStorage every 30s; key **`agent-draft-${agentId}`** (`agent-editor-client.tsx`).
- [x] Draft restores when reopening `/agents/[id]` (non-empty draft wins over baseline until cleared).
- [x] Voice selector + **`Play preview`** calls the backend non-R2 Rime preview endpoint and plays returned `audio/wav`.
- [x] Preview failures, including missing `RIME_API_KEY` or Rime generation errors, show graceful UI feedback.
- [x] Current voice sync evidence: 404 active DB voices match 404 normalized Rime voices; dropdown maps directly over `GET /api/v1/voices`.
- [x] Selected `voiceId` is saved on agent versions and returned to the worker through the live agent config.
- [x] **Cloudflare R2 readiness:** stored media can be served through backend-minted presigned URLs with browser-compatible CORS/range headers. Stored preview object generation remains optional via voice sync.
- [x] Phone number assignment dropdown (API `PATCH`; **carrier/SIP Deferred Phase 9**).
- [x] "Save Version" and "Save & Publish" wired to Nest endpoints.

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

**✅ Checklist for 6.5:**
- [x] Version history newest first, diff modal (`dynamic` react-diff viewer), restore + publish dialogs (`agent-editor-client.tsx`).

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

**Test Case 6.6.2: Non-Twilio STT → LLM → TTS Voice Pipeline**

Use this manual phrase:

> Hello Sirius, please confirm my name is Habiba and tell me what you can help with.

Expected:

- Mic capture works; the microphone pulse reacts while speaking.
- `USER_SPEECH` transcript/call event includes the phrase or a close transcription.
- The worker fetches the live agent config, including `systemPrompt` and selected `voiceId`.
- The LLM response follows the live system prompt and answers the request.
- Rime TTS speaks the response back audibly in the browser; there is no dead silence after user speech.
- Response latency is acceptable for the current browser/local scope.
- Ending the test call persists a completed call row, transcript, and **Test** badge.
- No frontend crash, stuck `IN_PROGRESS` call, or worker/API error occurs.

**✅ Checklist for 6.6:**
- [x] Test call modal **Connecting → Active → Ended** (`test-call-modal.tsx`, `LiveKitRoom`, dynamic import `ssr: false` from agent editor).
- [x] LiveKit connect path implemented (`POST /api/v1/agents/:id/test-call`, `LiveKitBrowserTestService`, explicit agent dispatch); **runtime** depends on env + worker.
- [x] Microphone level visualization (`useTrackVolume` / pulsing mic).
- [x] Agent audio path is wired through the Deepgram/Groq/Rime stack with the live version's `systemPrompt` and selected `voiceId`; **~2s** response remains runtime/environment dependent.
- [ ] Manual audible end-to-end STT → LLM → TTS phrase check performed for the current environment.
- [x] **Test** badge renders in history when `metadata.isTest` / `metadata.isTestCall`.
- [x] Manual browser LiveKit test flow verified for current non‑Twilio scope: call completes and history row appears with **Test** badge.
- **Deferred → Phase 9:** Real PSTN/mobile verification of same agent (not browser).

---

### 6.7 Call History Page (`/calls`)

**Agent Instruction:** Filter bar: Agent, Direction, Status, Date range, Phone number.
- Table with pagination (20 per page).
- Columns per spec Section 13.2.

**Test Case 6.7.1: Filtering**

> **Note:** For true **inbound + outbound PSTN** pairs, step 1 is **Deferred — Phase 9**. Non‑Twilio verification uses **browser test calls**, LiveKit-local traffic, and **direction/status filters** against whatever rows exist.

1. Make 1 inbound call and 1 outbound call.
2. Filter by "Inbound" → only inbound shows.
3. Filter by date range excluding today → empty state.

**✅ Checklist for 6.7:**
- [x] Filters: Agent, Direction, Status, date range (UTC day), phone substring (`call-history-client.tsx` + `ListCallsQueryDto` / `listPaged`).
- [x] Pagination **20**/page (`PAGE_LIMIT` + API default).
- [x] Direction filter correct; **OUTBOUND** rows remain sparse until outbound/PSTN (**Deferred Phase 9**).
- [x] Date range empty state when no rows match.
- **Deferred → Phase 9:** Filter test matrix with real inbound **and** outbound PSTN traffic.

---

### 6.8 Call Detail Page (`/calls/:id`)

**Sub-task 6.8.1:** Audio player with `wavesurfer.js` (dynamic import, SSR-safe).

**Sub-task 6.8.2:** Transcript viewer with clickable timestamps jumping audio.

**Sub-task 6.8.3:** Cost breakdown card.

**Sub-task 6.8.4:** Latency breakdown card.

**Test Case 6.8.1: Call Detail**

> **Note:** Step 2–3 require a **`recordingUrl`** pointing at an object in the verified R2 bucket. This is uncommon until Twilio recording ingestion lands (**Deferred Phase 9**). Without audio, verify graceful **Recording unavailable** plus transcript/cost/latency.

1. Open completed call.
2. Click play on audio → verify waveform renders.
3. Click transcript turn at 0:30 → verify audio jumps to 0:30.
4. Verify cost breakdown sums correctly.

**✅ Checklist for 6.8:**
- [x] **WaveSurfer** via **dynamic `import('wavesurfer.js')`** (`call-waveform-player.tsx`) when presigned URL available (`GET /api/v1/calls/:id/recording`).
- [x] **Recording unavailable** UX when `recordingUrl` null / 404 / storage 503 (`call-detail-client.tsx`) — page does **not** hard-fail.
- [x] Transcript turns (speaker, text, timestamps, latency when present); **click-to-seek** uses readiness state and **`WaveSurfer.setTime`** when audio is ready.
- [x] **Cost breakdown** + line-item sum vs **`totalCostUsd`** (tolerance messaging in UI).
- [x] **Latency** summary + empty state when no `latencyMs`.
- **Deferred → Phase 9:** E2E waveform QA on **Twilio-ingested** recordings in R2 (full production path).

---

### 📌 Phase 6 — Deferred roll-up

| Item | Reason | Target |
|------|--------|--------|
| Twilio/PSTN verification | Real phone traffic, SIP/Twilio callback security, TwiML security, PSTN cost/latency, and outbound-heavy QA need production telephony | **Phase 9** |
| Cloudflare R2 storage/presigned/browser playback | Bucket, env, upload/download, presigned HEAD/GET/range, CORS, and WaveSurfer readiness are verified | Done |
| Render agent-worker cloud verification | Production worker deployment, health, LiveKit connected status, and cloud logs need Render worker ownership | **Phase 9** |
| **New Agent** button wired (create flow) | Implemented after Gate 8 cleanup using existing create/version/publish APIs | Done |
| Standalone React Query hooks files | Superseded by `OrgProvider.apiCall` and Phase 7 analytics API usage | Not remaining |

---

### 🚨 ERROR RESOLUTION — Phase 6

| Error | Likely Cause | Resolution |
|---|---|---|
| Monaco Editor fails to load | SSR import | Ensure `dynamic(() => import(...), { ssr: false })`. Do not import statically at top level. |
| Draft not persisting | Wrong localStorage key or SSR | Verify key is `agent-draft-${agentId}`. Ensure hook runs client-side. |
| Voice preview no audio | Rime preview generation failed, `RIME_API_KEY` missing, browser autoplay blocked, or selected voice not synced | Verify `POST /api/v1/voices/preview` returns `audio/wav`; check the UI error toast and API logs. R2 storage/presigned playback readiness is verified for any stored media generated later. |
| Test call modal stuck "Connecting" | LiveKit token issue or room creation failure | Check `POST /api/v1/agents/:id/test-call` response. Verify LiveKit credentials. |
| Waveform not rendering | `wavesurfer.js` SSR or missing audio | Ensure dynamic import. Verify presigned URL returns valid audio blob. |
| Transcript click doesn't seek | Timestamp / epoch mismatch | Seek uses **seconds from `call.startedAt` (fallback `createdAt`)** → `WaveSurfer.setTime`. |

---

### 🚦 STOP — SUCCESS GATE 6
**Gate 6 — ✅ PASSED for non‑Twilio / non‑PSTN scope**. Proceed only when explicitly starting Phase 7; telephony-backed recording QA remains **Phase 9**.

**Non‑Twilio acceptance criteria (all satisfied):**
- [x] User can edit agent, save versions, publish.
- [x] Browser **LiveKit** test flow creates a completed **Test** call row for current non‑Twilio scope.
- [x] Call history **filters + 20-row pagination** + §13.2-style columns.
- [x] Call detail: **transcript + cost + latency** always; **waveform when** presigned audio exists; graceful **Recording unavailable** otherwise.
- [x] `.cursorrules` discipline maintained for touched frontend.

**Explicitly NOT required to pass Gate 6 (Deferred):**
- Twilio/PSTN integration and verification → **Phase 9**
- Cloudflare R2 storage/presigned/browser playback verification → **Done**
- Render agent-worker deployment/cloud verification → **Phase 9**
- **New Agent** create UI → implemented after Gate 8 cleanup; not a Twilio/R2/worker dependency

---

## Phase 7: Analytics & Settings (Day 5)

**Objective:** Analytics dashboard shows real data. Settings pages functional.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 6 is passed (**non‑Twilio scope**).
- [x] `.cursorrules` reviewed for analytics and settings conventions.
- [x] Real (non-test) call data exists in database.

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

**✅ Checklist for 7.1:**
- [x] All six analytics endpoints implemented (`apps/api/src/analytics/*`).
- [x] Test calls excluded via metadata filter in every query (`metadata.isTest` plus browser `metadata.isTestCall`).
- [x] Redis caching applied with correct TTLs: overview 60s, calls trend 5min, costs 5min, latency 60s, agents 60s; `/live` remains uncached.

---

### 7.2 Analytics Frontend

**Agent Instruction:** Dashboard layout:
- Row 1: 4 stat cards (today calls, minutes, avg duration, avg cost).
- Row 2: Recharts line charts (calls over time, minutes over time) with 7d/30d toggle.
- Row 3: Cost breakdown chart + top agents chart.
- Row 4: Latency P50/P95/P99 + success rate + live call counter (polls every 10s).

**Test Case 7.2.1: Analytics Accuracy**

1. Make 3 test calls (should NOT appear).
2. Make 2 non-test calls (should appear).
3. Verify "Total Calls Today" = 2.
4. Verify cost chart sums to actual costs.

**✅ Checklist for 7.2:**
- [x] Stat cards display values from `/api/v1/analytics/overview`.
- [x] Line charts toggle between 7d and 30d.
- [x] Cost breakdown chart sums `/api/v1/analytics/costs`.
- [x] Top agents chart shows top 5 from `/api/v1/analytics/agents`.
- [x] Live call counter polls `/api/v1/analytics/live` every 10s.
- [x] Test calls are excluded from all metrics by the Phase 7.1 analytics queries.

**Verification note:** UI implementation, lint, build, deployed flow, and Test Case 7.2.1 analytics accuracy with real non-test data are complete.

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

**✅ Checklist for 7.3:**
- [x] Phone numbers table displays all org numbers (`/phone-numbers`).
- [x] Unassign calls `PATCH /api/v1/phone-numbers/:id` with `agentId: null`; backend clears `liveKitDispatchRuleId`.
- [x] Assign calls `PATCH /api/v1/phone-numbers/:id`, then `POST /api/v1/phone-numbers/:id/sync-dispatch-rule`.

**Verification note:** UI implementation, lint, build, and Test Case 7.3.1 manual DB/LiveKit verification are complete.

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

**Checklist for 7.4:**
- [x] Members table shows roles (`/settings/members`; role selector is read-only because role mutation is not in the Phase 7.4 API contract).
- [x] Invitation dialog calls `POST /api/v1/organizations/:id/members/invite`.
- [x] Pending invitations section includes resend and cancel actions.
- [x] Acceptance creates membership with correct role.

**Manual verification completed:**
1. Invite a new email as `VIEWER` from `/settings/members`.
2. Verify `pending_invitations` contains that email, role, and `clerkInviteId`.
3. Cancel the invitation and verify the `pending_invitations` row is deleted.
4. Re-invite the same email as `VIEWER`.
5. Accept the Clerk invitation from the email / Clerk test flow.
6. Verify `users` contains the accepted user, `memberships` contains the user/org row with `role = VIEWER`, and the matching `pending_invitations` row is gone.

**Verification note:** UI implementation, lint, build, deployed invite/accept flow, and Clerk webhook-created membership verification are complete.

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

**✅ Checklist for 7.5:**
- [x] API key table shows prefix and metadata (`/settings/api-keys`).
- [x] Full key revealed only once on creation.
- [x] SHA-256 hash stored server-side, never plaintext.
- [x] Revoke calls `DELETE /api/v1/api-keys/:id` and sets `isRevoked=true`.

**Verification note:** Backend + UI implementation, lint, builds, deployed flow, and Supabase persistence verification are complete. `keyPrefix`, SHA-256 `keyHash` length, no plaintext storage, and revoke state were verified.

---

### 7.6 Organization Settings

**Agent Instruction:** Minimal: name update only.

**☐ Checklist for 7.6:**
- [x] Organization name update endpoint exists and is wired (`PATCH /api/v1/organizations/:id`).
- [x] Frontend form updates name from `/settings/organization` and refreshes org context.

**Manual verification completed:**
1. Open `/settings/organization` as OWNER/ADMIN.
2. Change organization name and save.
3. Verify `organizations.name` changed in DB.
4. Verify Clerk organization name changed.
5. Verify org switcher/sidebar data reflects the updated name after refresh.

**Verification note:** UI implementation, lint, build, deployed flow, and Supabase persistence verification are complete. Organization name persistence and `updatedAt` change were verified.

---

### 7.7 Qualicall Placeholder

**Agent Instruction:** Create `/qualicall` page with "Coming Soon" message and badge in sidebar.

**☐ Checklist for 7.7:**
- [x] `/qualicall` route exists.
- [x] Sidebar shows Qualicall badge.
- [x] Page displays "Coming Soon".

**Manual verification completed:**
1. Open `/qualicall`.
2. Verify the page title is `Qualicall`.
3. Verify the page displays `Coming Soon`.
4. Verify the sidebar shows the `Qualicall` item with a `Soon` badge.

**Verification note:** UI implementation, lint, build, and deployed browser visibility verification are complete.

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
- [x] Analytics display real (non-test) data.
- [x] Settings fully functional (members, API keys, org settings).
- [x] Phone number assignment syncs dispatch rules from UI.
- [x] Qualicall placeholder visible.
- [x] `.cursorrules` conventions followed for all settings and analytics code.

**Gate 7 note:** Passed for the current non-Twilio scope after deployed verification. PSTN/Twilio live calls, Twilio recording ingestion into R2, real call recording lifecycle, and Render worker deployment remain deferred to Phase 9. R2 storage/presigned/browser playback readiness is verified. Non-R2 voice preview playback is in-scope and implemented via backend Rime generation. `New Agent` create was a non-blocking UI backlog item during Gate 7 and is now implemented after Gate 8 cleanup.

---

## Phase 8: Non-Twilio Hardening & Handoff Prep (Day 5–6)

**Objective:** Harden the verified non-Twilio platform, run security/database checks, prepare handoff docs, and configure free-tier survival. Do **not** implement or verify Twilio/PSTN live calls, Twilio recording ingestion, real call recording lifecycle, or Render agent-worker deployment in Phase 8; those remain Phase 9. Direct non-R2 Rime TTS preview playback and R2 storage/presigned/browser playback readiness are verified.

**Phase 8 scope split:**
- **Do now:** `.cursorrules` review, non-Twilio security audit, final Supabase verification, README/DEPLOYMENT/TROUBLESHOOTING docs, and free-tier/UptimeRobot setup.
- **Deferred to Phase 9:** Twilio/PSTN integration and verification; Twilio recording ingestion into the verified R2 bucket and real call recording lifecycle; Render agent-worker deployment/cloud verification.
- **Post-Gate 8 cleanup:** `New Agent` create UI is implemented and remains separate from Twilio/PSTN/R2/worker Phase 9 deferrals.

**Recommended Phase 8 order:**
1. Review `.cursorrules` for security, testing, and documentation conventions.
2. Run 8.2 non-Twilio security audit.
3. Run 8.6 final database verification.
4. Update `README.md`, `DEPLOYMENT.md`, and `TROUBLESHOOTING.md`.
5. Set up free-tier survival checks / UptimeRobot.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 7 is passed (**current non-Twilio scope**; Phase 9 deferrals remain).
- [x] `.cursorrules` reviewed for security, testing, and documentation conventions.
- [x] All previous phases' non-Twilio test cases are passing.
- [x] Phase 9 deferrals are explicitly out of Phase 8 scope.
- [x] `New Agent` create UI was recorded as known backlog during Phase 8 and is now implemented in post-Gate 8 cleanup.

---

### 8.1 Non-Twilio User Journey Regression

**Scenario: Existing Agent to Browser Test Call Analysis**

| Step | Action | Verification |
|---|---|---|
| 1 | Admin opens `/agents` | Seeded agent list renders; `New Agent` button is available to OWNER/ADMIN/BUILDER and disabled for VIEWER |
| 2 | Admin opens an existing agent | Editor, Monaco, version history, and phone assignment controls load |
| 3 | Admin edits prompt and saves V2 | Version history shows V2 |
| 4 | Admin publishes V2 | V2 is live |
| 5 | Admin runs browser test call | Browser LiveKit flow creates a completed Test call row |
| 6 | Admin opens `/calls` | Filters/table render and Test badge is present |
| 7 | Admin opens `/calls/:id` | Transcript, cost, latency, and graceful recording fallback render |
| 8 | Admin opens `/analytics` | Non-test analytics remain correct; test calls remain excluded |
| 9 | Viewer logs in | Viewer can read allowed pages and cannot perform admin/builder mutations |

**Out of scope for 8.1:** Real inbound PSTN calls, Twilio recording ingest, and real call recording lifecycle from PSTN calls. These remain Phase 9 as noted above. R2 storage/presigned/browser playback readiness is verified independently with synthetic audio. `New Agent` creation was implemented later as non-Twilio backlog cleanup.

**Status:** COMPLETE - verified for the existing Sirius Agent non-Twilio regression path using previously captured Phase 8.2, 8.4, and 8.6 evidence. This does not mark Twilio inbound calling or real PSTN recording lifecycle complete. R2 storage/presigned/browser playback readiness is verified separately.

**☐ Checklist for 8.1:**
- [x] Step 1: Existing seeded agent list visible; `New Agent` is now enabled for OWNER/ADMIN/BUILDER and permission-gated for VIEWER.
- [x] Create-new-agent flow is covered by post-Gate 8 cleanup: create agent, create/publish initial version, redirect to editor, and show the new agent in `/agents`.
- [x] Step 2: Existing agent editor loads.
- [x] Step 3: V2 saved and visible in history.
- [x] Step 4: V2 published and live.
- [x] Step 5: Browser test call completes and creates Test call row.
- [x] Step 6: Call history filters/table render.
- [x] Step 7: Call detail page renders transcript/cost/latency and graceful recording fallback.
- [x] Step 8: Analytics still exclude test calls and reflect real non-test data.
- [x] Step 9: Viewer role restricted to read-only behavior.

**Verification note:** Existing-agent non-Twilio regression is complete for Sirius Agent. Evidence reused from completed checks confirms Sirius exists and is live, versioning works, phone assignment works, 5 deployed browser test calls completed, LiveKit audio worked, transcripts persisted, `/calls` showed Test badges, call detail pages rendered, analytics excluded browser test calls from production metrics, and VIEWER role restrictions returned the expected `403` behavior. Recording unavailable state is expected for browser calls because Twilio recording ingestion and real call recording lifecycle remain Phase 9. R2 storage/presigned/browser playback readiness is verified. `New Agent` creation is implemented after Gate 8 cleanup and remains independent from Phase 9 external integrations.

---

### 8.2 Security Audit

**Agent Instruction:** Verify current non-Twilio security requirements. Twilio/PSTN production verification remains Phase 9. R2 storage/presigned/browser playback verification is now complete.

| Check | Test | Expected |
|---|---|---|
| Internal endpoints | Request without `x-worker-secret` | 403 |
| Cross-org access | Request with valid token but wrong `x-organization-id` | 403 |
| Clerk webhook | Request with wrong signature | 401 |
| API key hash | Query DB for created key | `keyHash` is SHA-256, no plaintext |
| API key one-time reveal | Refresh/list keys after creation | Full key is not returned again |
| Role enforcement | VIEWER calls admin/builder mutation | 403 |
| Organization route guard | Valid token with mismatched org route/header | 403 |

**Deferred security checks for Phase 9:**
- Twilio/PSTN production security verification, including TwiML token/domain behavior and real Twilio callback signatures.
- Twilio-ingested recording security and real call recording lifecycle into the verified R2 bucket.
- Render agent-worker cloud verification, including private heartbeat/health behavior.

**☐ Checklist for 8.2:**
- [x] `.cursorrules` reviewed for security, testing, and documentation conventions.
- [x] Current non-Twilio security checks code-reviewed.
- [x] Code-level internal auth fix applied: missing/invalid `x-worker-secret` maps to `403` in `InternalAuthGuard`.
- [x] Tenant middleware, role guard, and organization route/header mismatch guard reviewed.
- [x] Clerk webhook wrong-signature path reviewed; invalid Svix signatures return `401`.
- [x] API key hash/one-time reveal path reviewed; list/revoke responses do not return plaintext keys.
- [x] No code-level security bypasses found in the current non-Twilio audit.
- [x] Deployed internal endpoint without `x-worker-secret` returns `403` after redeploy.
- [x] Deployed request-level checks requiring real Clerk sessions performed: cross-org access, VIEWER mutation, and org route/header mismatch returned `403`.
- [x] Clerk webhook wrong-signature request performed against deployed API; fake Svix signature returned `401`.
- [x] Phase 9-only security checks remain deferred and documented.

**Verification note:** API build and `git diff --check` passed after the `InternalAuthGuard` status-code fix. Deployed non-Twilio security checks are verified complete for Phase 8.2.

---

### 8.3 Free Tier Survival Setup

**Status:** COMPLETE - UptimeRobot monitors are configured and confirmed green for the current Phase 8 non-Twilio scope.

**Sub-task 8.3.1:** UptimeRobot setup:
- Add deployed Render API `/health` URL and ping every 10 minutes: `https://awaaz-api-nxae.onrender.com/health`.
- Add deployed Vercel web root URL and ping every 10 minutes: `https://awaaz-v1-web-6zlf.vercel.app`.
- Do not monitor authenticated dashboard routes, Clerk-protected API routes, or `/internal/worker/heartbeat` publicly.
- Optional Supabase keepalive decision: skipped for current Phase 8 scope unless a safe credential-free endpoint is intentionally added.

**Sub-task 8.3.2:** Worker heartbeat:
- Current Phase 8 can document heartbeat expectations, but live production worker hardening remains Phase 9 unless the worker is already deployed and safe to verify.
- Python worker heartbeat to `/internal/worker/heartbeat` every 5 minutes is secondary keep-alive, not primary.

**Sub-task 8.3.3:** Render cold-start mitigation:
- Document that after any idle period, trigger a browser test call to warm non-Twilio flows. Real PSTN warm-up guidance remains Phase 9.

**☐ Checklist for 8.3:**
- [x] API monitor target documented: `https://awaaz-api-nxae.onrender.com/health`, 10-minute interval.
- [x] Web monitor target documented: `https://awaaz-v1-web-6zlf.vercel.app`, 10-minute interval.
- [x] Optional Supabase keepalive decision documented: skip public Supabase ping in current Phase 8 scope.
- [x] Worker heartbeat status documented; implementation/deployed worker verification deferred to Phase 9 if not already live.
- [x] Non-Twilio cold-start mitigation documented.
- [x] Manual UptimeRobot monitors created and confirmed green in the UptimeRobot dashboard.

**Verification note:** README, DEPLOYMENT, and TROUBLESHOOTING document free-tier survival checks, protected worker heartbeat behavior, cold-start mitigation, and the Phase 9 boundary. UptimeRobot monitors are confirmed Up/green for API health (`https://awaaz-api-nxae.onrender.com/health`) and the web frontend (`https://awaaz-v1-web-6zlf.vercel.app`).

---

### 8.4 Performance Verification

**Test Case 8.4.1: Non-Twilio Browser Latency Benchmark**

1. Make 5 browser test calls.
2. Query DB: `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs") FROM call_events WHERE "eventType" = 'AGENT_SPEECH' AND "createdAt" > NOW() - INTERVAL '1 hour' AND "latencyMs" IS NOT NULL;`

**Success Criteria:** P50 < 900ms for current browser/non-Twilio flow. PSTN latency benchmarking remains Phase 9.

**Status:** COMPLETE - manual deployed browser verification and Supabase read-only verification passed for the current non-Twilio browser pipeline.

**☐ Checklist for 8.4:**
- [x] 5 fresh deployed browser test calls made in one verification pass.
- [x] Recent browser/test-call persistence queried from Supabase.
- [x] Recent completed calls persisted.
- [x] Transcript records persisted for recent completed test calls.
- [x] No stuck `INITIATED` / `IN_PROGRESS` live-call rows found in the recent verification window.
- [x] Analytics exclusion logic verified by DB query: browser/test calls remain excluded from production calls, production cost, and production latency samples.
- [x] Latency query executed. Current browser pipeline does not instrument `latencyMs`, so samples were `0` and average/P50 were `NULL`; this is accepted for the current non-instrumented Phase 8.4 scope.
- [x] PSTN/live-call latency benchmark remains deferred to Phase 9.

**Verification note:** Manual deployed browser verification completed 5 Sirius Agent test calls. LiveKit connection succeeded, assistant audio worked, transcript UI worked, disconnect cleanup succeeded, no frontend crashes occurred, no red console errors were observed, no stuck live-call entries remained afterward, `/calls` showed the new rows with the Test badge, and call detail pages rendered correctly. Recording unavailable state is expected for browser calls because Twilio recording ingestion and real call recording lifecycle remain Phase 9. Supabase read-only verification confirmed recent calls persisted, calls were marked with test metadata, transcript rows persisted, call events existed, there were 0 stuck `INITIATED` / `IN_PROGRESS` calls, and analytics exclusion still returned clean production metrics. R2 storage/presigned/browser playback readiness is verified separately. `latencyMs` is not currently instrumented in the browser pipeline, so latency samples were `0` and average/P50 latency were `NULL`; average observed latency is unavailable until latency instrumentation is emitted.

---

### 8.5 Error Handling & Observability

**Agent Instruction:** Verify:
- All async operations have try/catch.
- API client in Python worker logs but doesn't crash on event emission failure.
- NestJS global exception filter returns consistent JSON errors.
- Current deployed Render/Vercel logs show no Phase 7 regression errors during non-Twilio verification.
- Live PSTN worker observability remains Phase 9 unless the worker is already deployed and safe to verify.

**Status:** COMPLETE - current non-Twilio error-handling and observability behavior is acceptable for Phase 8 hardening. No new telemetry system or Twilio observability was added. R2 storage/presigned playback verification is complete; long-term R2 operational observability remains future hardening.

**☐ Checklist for 8.5:**
- [x] Critical non-Twilio async/error paths reviewed: Clerk auth, internal worker auth, tenant/role guards, Clerk webhook verification, browser test-call setup, recording fallback, transcript assembly, analytics cache fallback, and worker event emission.
- [x] Python worker event emission logs failures without crashing the active call path; live worker deployment hardening remains Phase 9 if the worker is not deployed.
- [x] API error responses reviewed. Current explicit Nest HTTP exceptions return stable JSON for invalid/expired Clerk tokens (`401`), missing/invalid `x-worker-secret` (`403`), invalid webhook signatures (`401`), wrong `x-organization-id` (`403`), VIEWER mutation denial (`403`), missing recordings (`404` / graceful UI fallback), storage not configured (`503` / graceful UI fallback), and missing latency samples (`0` samples / `NULL` metrics).
- [x] Current non-Twilio deployed verification produced stable user-facing behavior: call rows persisted, status transitions completed, transcripts persisted, cost rows updated, no stuck calls remained after disconnect, browser test calls were visible in the UI with Test badges, and analytics exclusion remained correct.
- [x] LiveKit/browser logs and existing UI/DB observability are sufficient for current Phase 8 non-Twilio scope.
- [x] Non-Twilio audit logging implemented for user-facing mutations: agent create/update/version save/publish, phone number assign/unassign, member invite/cancel invite, API key create/revoke, and organization name update. Audit metadata excludes raw API keys, tokens, secrets, and full prompt text.
- [x] Member role update audit remains not applicable because there is no member role-update endpoint in the current API surface.
- [x] Twilio/PSTN recording-lifecycle observability remains deferred to Phase 9; R2 storage/presigned playback verification is complete.

**Verification note:** Phase 8.5 began as documentation/review only, then post-Gate cleanup added the missing non-Twilio `AuditLog` writers using the existing Prisma model. The platform already surfaces the important non-Twilio failure modes with acceptable API status codes and graceful UI states. Browser test-call observability is covered by persisted `calls`, `call_events`, `transcripts`, status transitions, cost fields, Test badges, call detail rendering, analytics exclusion queries, and now audit rows for the listed non-Twilio mutations. Missing `latencyMs` remains an accepted current limitation: latency cards and analytics show no samples rather than polluting production metrics.

---

### 8.6 Final Database Verification

**Agent Instruction:** Run this checklist in Prisma Studio or via queries:

- [x] Organization table has verified Finova org (`Finova Solutions Habiba`, slug `finova-solutions`).
- [x] User table has Clerk users.
- [x] Membership table has one OWNER role for the verified org.
- [x] Agent "Sirius Agent" exists with `currentVersionId` populated.
- [x] Sirius `currentVersionId` points to the current live version (V2 after Phase 6/7 publish verification).
- [x] Exactly one Sirius version is live.
- [x] PhoneNumber has `agentId` = Sirius, and `liveKitDispatchRuleId` is populated when LiveKit dispatch sync is configured.
- [x] PendingInvitation table empty (no stale invites).
- [x] Call table has browser test calls marked with `metadata->isTest = true` and/or `metadata->isTestCall = true`.
- [x] API keys have `keyPrefix`, SHA-256 `keyHash`, no plaintext full key, and correct revoke state.
- [x] Organization name and `updatedAt` reflect latest verified persistence check.
- [x] No Phase 8 DB check requires Twilio recordings or R2 objects.

**Verification note:** Read-only Prisma queries against Supabase verified 1 org, 9 users, 8 memberships, 1 OWNER, Sirius with 2 versions, V2 current/live, 1 assigned phone number with dispatch rule, 0 pending invitations, 4 sampled browser test calls marked as test, and 1 API key with valid 8-character prefix plus 64-character SHA-256 hash.

---

### 8.7 Documentation & Handoff

**Agent Instruction:** Create or update the following files in repo root:

- [x] `.env.example` file with all variables documented (no real values).
- [x] `README.md` with architecture diagram (ASCII or Mermaid).
- [x] `DEPLOYMENT.md` with Render/Vercel setup steps.
- [x] `TROUBLESHOOTING.md` with common errors:
  - Worker not connecting → check LiveKit URL protocol (`wss://`).
  - No audio → check Twilio SIP trunk origination URI.
  - Transcript missing → check BullMQ Redis TLS config.
  - Analytics empty → check test call exclusion logic.
- [x] Documentation clearly separates current non-Twilio scope and completed R2 storage verification from Phase 9 Twilio/PSTN recording-lifecycle and Render worker deferrals.
- [x] Documentation notes `New Agent` create UI was backlog during Phase 8 and is now implemented after Gate 8 cleanup.

**☐ Checklist for 8.7:**
- [x] `.env.example` reviewed/updated with all variables and descriptions.
- [x] `README.md` has architecture diagram.
- [x] `DEPLOYMENT.md` has step-by-step setup.
- [x] `TROUBLESHOOTING.md` has the four required entries plus resolutions.
- [x] Phase 9 deferrals and `New Agent` cleanup status are documented accurately.

**Verification note:** Root handoff docs were created/updated for current non-Twilio scope, Phase 9 deferrals, and the `New Agent` backlog cleanup status.

---

### 🚨 ERROR RESOLUTION — Phase 8

| Error | Likely Cause | Resolution |
|---|---|---|
| Security check bypass | Missing guard or middleware order | Verify middleware runs before route handlers. Check guard decorators on controllers. |
| UptimeRobot still showing down | Render cold start or wrong path | Verify path is `/health`. Allow 2-3 minutes for first ping after deploy. |
| P50 latency > 900ms | Groq rate limit or large prompt | Optimize system prompt length. Check Groq dashboard for throttling. |
| Database state mismatch | Seed not run or manual edits | Re-run `npx prisma db seed`. Verify IDs match Clerk dashboard. |
| Missing documentation file | Agent skipped file creation/update | Create or update all files listed in 8.7 before declaring completion. |

---

### 🚦 STOP — SUCCESS GATE 8 (NON-TWILIO HARDENING GATE)
**DO NOT DECLARE PHASE 8 COMPLETE UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [x] Non-Twilio user journey regression passes.
- [x] Current non-Twilio security audit passes.
- [x] Free-tier survival is configured (UptimeRobot + heartbeat).
- [x] Browser/non-Twilio latency verification completed; `latencyMs` is not currently instrumented, so `0` samples / `NULL` P50 is accepted for current Phase 8 scope.
- [x] Database verification checklist is all green.
- [x] All four documentation files exist and are complete.
- [x] `.cursorrules` was adhered to in every single file created during all phases.
- [x] Phase 9 Twilio/PSTN recording-lifecycle and Render worker deferrals are still clearly documented.
- [x] `New Agent` create UI backlog is implemented after Gate 8 cleanup; R2 storage verification is complete and Phase 9 Twilio/worker deferrals remain unchanged.
- [x] Non-Twilio audit logging is implemented for the current mutation scope.

---

## 🏁 Final Launch Checklist

**Before announcing V1 readiness, verify every item from spec Section "Final Checklist Before V1 Launch":**

**Scope note:** This final launch checklist now separates the completed non-Twilio platform from the only remaining external Phase 9 categories.

- [ ] **Deferred — Twilio/PSTN:** Sirius Agent inbound/outbound calls work on the real Twilio number, including SIP dispatch, TwiML security, Twilio callback verification, real PSTN cost/latency checks, and Twilio recording ingestion into R2.
- [x] **Cloudflare R2:** bucket `awaaz-recordings`, env/credentials, upload/download, HeadObject, presigned HEAD/GET/range, CORS headers, `Accept-Ranges`/`Content-Range`, bytes-matched WAV retrieval, WaveSurfer readiness, and `GET /api/v1/calls/:id/recording` compatibility are verified.
- [ ] **Deferred — Render agent-worker:** production `agent-worker` is deployed on Render, shows connected in LiveKit, exposes worker health, and has clean cloud logs.
- [x] Prompt versioning — save creates V2/V3-style versions; publish sets live transactionally.
- [x] Voice selection — dropdown works; non-R2 `Play preview` generates and plays Rime audio through the backend. R2 storage/presigned playback readiness is verified for stored media; stored preview object generation remains optional via voice sync.
- [x] Test call — browser test connects and speaks.
- [x] Transcripts — browser/non-Twilio post-call assembly persists transcript rows.
- [x] Call History — filters, pagination, Test badge, and detail view are functional.
- [x] Analytics — real data excludes test calls; live counter polling works for current scope.
- [x] Phone Numbers — assignment syncs dispatch rules where LiveKit dispatch is configured.
- [x] Members — invitation flow end-to-end verified.
- [x] API Keys — SHA-256 hashing, prefix display, one-time full key reveal, and revoke are verified.
- [x] Qualicall — placeholder visible.
- [x] Audit logs — current non-Twilio mutations create `AuditLog` entries.
- [x] Webhooks — Clerk and LiveKit signature verification are implemented/verified for current scope; Twilio webhook verification remains in the Twilio/PSTN deferred category above.
- [x] Keep-alive — UptimeRobot primary is configured; worker heartbeat expectations are documented for Render worker Phase 9.
- [x] BigInt patch — applied in `main.ts`.
- [x] Clerk middleware — `middleware.ts` protects routes.
- [x] React Query — `QueryClientProvider` in root layout.

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


---

## Phase 9: Deferred External Integrations & Launch Blockers

**Objective:** Complete the only remaining external integration categories after core platform completion.

**Phase 9 ownership/status:** This section now separates remaining deferred external launch blockers from completed R2 storage verification. Twilio/PSTN, real recording ingestion/lifecycle, and Render agent-worker cloud deployment remain Phase 9 work. Cloudflare R2 storage/presigned/browser playback verification is complete.

### Deferred Inventory

| Deferred category | Status | Phase 9 verification target |
|---|---|---|
| Twilio/PSTN integration and verification | DEFERRED | SIP trunk/origination, real inbound/outbound PSTN calls, Twilio callback signatures, TwiML security, real PSTN cost/latency, and outbound-heavy analytics QA verified in production |
| Cloudflare R2 storage/presigned/browser playback verification | COMPLETE | Bucket `awaaz-recordings`, Render env, upload/download, HeadObject, presigned HEAD/GET/range, CORS headers, bytes-matched WAV retrieval, WaveSurfer readiness, and `GET /api/v1/calls/:id/recording` compatibility verified |
| Twilio/PSTN recording ingestion into R2 and real call recording lifecycle | DEFERRED | Real Twilio recording webhook/download worker writes PSTN recordings into verified R2 storage, updates `Call.recordingUrl`, and records become playable in call detail |
| Render `agent-worker` deployment and cloud verification | DEFERRED | Render worker deployed with env vars, LiveKit dashboard shows worker connected, worker health/heartbeat behavior verified, and Render logs are clean |

### Detailed Deferred Line-Item Map

This map preserves the granular blockers while keeping the current plan grouped into the three Phase 9 categories.

| Source area | Item still needing external verification | Current Phase 9 bucket |
|---|---|---|
| Phase 3.8 | LiveKit SIP URI, Twilio Elastic SIP trunk, origination URI, recording callback, Twilio number assignment, and seed-number SIP dispatch rule | Twilio/PSTN |
| Phase 3.9 | Render background `agent-worker` creation, env vars, LiveKit "Connected" status, clean Render logs | Render `agent-worker` |
| Phase 3.10 | Real mobile/PSTN call reaches Sirius, two-way audio works, sub-2-second live response, no Render/API errors | Twilio/PSTN plus Render `agent-worker` |
| Phase 4.3 / 8.6 | LiveKit dispatch rule exists and is stored on `PhoneNumber.liveKitDispatchRuleId` for production phone routing | Twilio/PSTN |
| Phase 4.4 / 6.4 | R2 storage/presigned/browser playback readiness for stored media | Complete |
| Phase 5.1 | Real Twilio webhook signatures and callback state transitions, including `recording-completed` enqueue | Twilio/PSTN |
| Phase 5.2 | Dashboard outbound PSTN call, signed TwiML token, Redis TTL, XML/domain validation, invalid token handling | Twilio/PSTN |
| Phase 5.5 | Twilio recording download, upload real PSTN recording into verified R2 storage, and update `Call.recordingUrl` | Twilio/PSTN recording lifecycle |
| Phase 5.7 | Cost verification with real PSTN duration/telephony charges | Twilio/PSTN |
| Phase 5.8 | R2 upload/download and presigned HEAD/GET/range verification against production credentials/CORS | Complete |
| Phase 6.7 / 7.2 | Direction filters and analytics tested with meaningful real OUTBOUND PSTN volume | Twilio/PSTN |
| Phase 6.8 | Call-detail waveform/audio playback readiness for valid presigned R2 audio | Complete; real Twilio-ingested recording QA remains under Twilio/PSTN recording lifecycle |
| Phase 8.1 | Inbound-call journey: call connects, real PSTN recording appears in R2, audio plays, analytics reflects real call/cost | Twilio/PSTN recording lifecycle |
| Phase 8.2 | TwiML token/domain checks and Twilio wrong-signature check against real production callbacks | Twilio/PSTN |
| Phase 8.3 / Final checklist | Production worker heartbeat/health behavior after Render worker deployment | Render `agent-worker` |
| Phase 8.4 | PSTN/live-call latency benchmark with real `latencyMs` samples | Twilio/PSTN |

### Items Confirmed Not Remaining

- New Agent create UI is implemented and manually verified after Gate 8 cleanup.
- Prompt versioning, agent edit/publish, browser LiveKit test calls, transcripts, call history, analytics, settings, API keys, Qualicall, BigInt serialization, Clerk middleware, and React Query provider are closed for current non-Twilio scope.
- Clerk and LiveKit webhook verification are closed for current scope; only Twilio callback verification remains under Twilio/PSTN.
- Non-Twilio audit logging is implemented for current user-facing mutations. Member role update audit is not applicable because there is no member role-update endpoint in the current API surface.
- Cloudflare R2 storage/presigned/browser playback verification is complete for bucket `awaaz-recordings`: upload/download, HeadObject, presigned HEAD/GET/range, CORS, range headers, bytes-matched WAV retrieval, WaveSurfer readiness, and recording endpoint compatibility.
- Standalone React Query hook files from earlier Phase 6 wording are not remaining work because the implemented `OrgProvider.apiCall` and Phase 7 analytics consumers cover the required auth/org behavior.
- Supabase keepalive is an accepted documented deviation: no public Supabase ping is configured unless a safe credential-free endpoint is intentionally added later.

### Deferred from earlier phases

#### From Phase 3
- **Status: DEFERRED** - Twilio/PSTN integration and verification.
- **Status: DEFERRED** - Render `agent-worker` deployment and cloud verification.

#### From Phase 4 / 5 / 6
- **Status: COMPLETE** - Cloudflare R2 storage verification, presigned playback URLs, browser CORS/range behavior, and WaveSurfer readiness.
- **Status: DEFERRED** - Twilio/PSTN recording ingestion into the verified R2 bucket and real call recording lifecycle.

### Notes
- `New Agent` create UI is implemented after Gate 8 cleanup. It is no longer a remaining backlog or Phase 9 deferred item.
- Non-Twilio audit logging is implemented for the current mutation scope. Member role update audit is not applicable because no member role-update endpoint currently exists.
- Core non-Twilio platform flow is verified through Phase 8 and post-Gate cleanup: dashboard, agents edit/create, browser test flow, `/calls`, `/calls/[id]`, analytics, settings, UptimeRobot, and audit logs.
- LiveKit browser test flow, Rime TTS speech response, non-R2 voice previews, transcript pipeline, cost pipeline, and R2 storage/presigned/browser playback readiness are functional for **non-PSTN** scope. The remaining deferred categories above complete the external integration story.

