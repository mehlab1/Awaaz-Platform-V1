# Awaaz V1 — Agent Execution Playbook
**Version:** 1.4-Agent | **Target:** Production-ready Sirius Agent handling real calls
**Changelog (1.4):** Phase 6 closed + verified for **non‑Twilio scope**; deferrals consolidated in **Phase 9** (and §6.3 **New Agent** → Phase 7 backlog).

**Agent Directive:** You are an autonomous implementation agent. You do not improvise. You do not skip steps. You do not assume. You execute exactly what is written below and nothing else.

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

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 0 is passed.
- [ ] `.cursorrules` reviewed for monorepo and NestJS conventions.
- [ ] `.env.master` is open and accessible.

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
- [ ] Directory structure matches exactly: `apps/api`, `apps/web`, `apps/agent-worker`, `apps/qualicall-worker`, `packages/shared-types`.
- [ ] `pnpm-workspace.yaml` contains exactly the two package patterns shown.
- [ ] Root `package.json` has `"private": true`.
- [ ] `pnpm install` completes without errors.

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
- [ ] All dependencies installed with versions matching the command exactly.
- [ ] `prisma/schema.prisma` is a verbatim copy from spec Section 5.
- [ ] `datasource db` includes both `url` and `directUrl`.
- [ ] `src/main.ts` contains the `BigInt.prototype` patch BEFORE `app.listen()`.
- [ ] `src/main.ts` CORS configuration matches exactly.
- [ ] `src/app.module.ts` has global ConfigModule.

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
- [ ] `DATABASE_URL` points to Supabase Transaction Pooler (port 6543).
- [ ] `DATABASE_DIRECT_URL` points to Supabase Direct (port 5432).
- [ ] `npx prisma migrate dev --name init` completes without errors.
- [ ] `npx prisma generate` completes without errors.
- [ ] Prisma Studio opens and shows empty tables.
- [ ] `Organization`, `Agent`, and `Call` tables are visible in Prisma Studio.
- [ ] `TenantMiddleware` skeleton created and parses `x-organization-id`.

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
- [ ] `src/app.controller.ts` created with exact code above.
- [ ] `GET /health` returns `{ status: 'ok', timestamp: '...' }`.

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
- [ ] Code pushed to GitHub on `main` branch.
- [ ] Render Web Service created with exact build/start commands.
- [ ] `NODE_ENV=production` and `PORT=3001` are set.
- [ ] Health check path is `/health`.
- [ ] `curl` to Render URL returns exact expected JSON.

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
- [ ] Next.js app created with TypeScript, Tailwind, App Router.
- [ ] shadcn/ui initialized and components added.
- [ ] `app/layout.tsx` uses `afterSignInUrl="/agents"`.
- [ ] `middleware.ts` matches exact code above.
- [ ] Sign-in page uses Clerk `<SignIn />` component.
- [ ] Dashboard layout has sidebar placeholder and SSR-safe `OrgSwitcher`.

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
- [ ] Vercel project imported from GitHub.
- [ ] Root Directory is `apps/web`.
- [ ] Environment variables from Section 15.2 are configured.
- [ ] Visiting Vercel URL redirects to `/sign-in`.
- [ ] Clerk sign-in succeeds and redirects to `/agents`.
- [ ] Network requests contain valid JWT.

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
- [ ] `redis-cli -u $REDIS_URL ping` returns `PONG`.
- [ ] Throwaway BullMQ script enqueues and processes a job successfully.

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
- [ ] Render health endpoint returns 200 from external network.
- [ ] Frontend loads on Vercel, Clerk auth works, user lands on dashboard after sign-in.
- [ ] Redis responds to `ping`.
- [ ] Prisma Studio shows empty but existing tables.
- [ ] `.cursorrules` conventions were followed in all created files.

---

## Phase 2: Authentication & Organization Core (Day 1–2)

**Objective:** Clerk fully integrated, multi-tenant middleware active, user can belong to orgs, invitation flow works.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 1 is passed.
- [ ] `.cursorrules` reviewed for authentication, webhook, and middleware conventions.
- [ ] Clerk Dashboard is open and accessible.

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
- [ ] `webhooks.controller.ts` and `webhooks.service.ts` created.
- [ ] Svix signature verification implemented on `POST /webhooks/clerk`.
- [ ] All four event handlers implemented with exact logic specified.
- [ ] Webhook URL configured in Clerk Dashboard.
- [ ] `CLERK_WEBHOOK_SECRET` captured in `.env.master`.

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
- [ ] `TenantMiddleware` implements full membership verification.
- [ ] Missing `x-organization-id` returns 403.
- [ ] Invalid `x-organization-id` returns 403.
- [ ] Valid `x-organization-id` passes and sets `req.organizationId` and `req.userRole`.

---

### 2.3 Organizations Module

**Agent Instruction:** Implement per spec Section 7.3:

- `GET /api/v1/organizations` (list user's orgs)
- `POST /api/v1/organizations` (ADMIN+)
- `PATCH /api/v1/organizations/:id` (name update only for V1)

**☐ Checklist for 2.3:**
- [ ] `GET /api/v1/organizations` returns user's organizations.
- [ ] `POST /api/v1/organizations` is restricted to ADMIN+.
- [ ] `PATCH /api/v1/organizations/:id` updates name only.

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
- [ ] All five endpoints implemented.
- [ ] Invitation creates `PendingInvitation` and calls Clerk API.
- [ ] Webhook handler creates `User` and `Membership` on acceptance.
- [ ] `PendingInvitation` is deleted after acceptance.
- [ ] Role enforcement returns 403 for VIEWER on BUILDER+ endpoints.

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
- [ ] `OrgSwitcher` uses `use-local-storage-state` with SSR safety.
- [ ] Switching org updates `x-organization-id` header on all API calls.
- [ ] Page data refreshes upon org switch.

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
- [ ] Multi-user, multi-org auth works.
- [ ] Invitation flow is complete end-to-end.
- [ ] Tenant middleware blocks cross-org access (verified by curl tests).
- [ ] Role enforcement blocks unauthorized actions.
- [ ] `.cursorrules` conventions followed for all auth code.

---

## Phase 3: Voice Pipeline Core (Day 2)

**Objective:** Python agent worker connects to LiveKit, handles a real phone call, speaks with Deepgram→Groq→Rime pipeline.

### ☐ PRE-PHASE CHECKLIST
- [ ] Gate 2 is passed.
- [ ] `.cursorrules` reviewed for Python and LiveKit conventions.
- [ ] LiveKit Cloud SIP is enabled.
- [ ] Twilio SIP trunk access verified.

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
- [ ] Virtual environment created with Python 3.11.
- [ ] `requirements.txt` matches exact versions.
- [ ] All packages install without errors.
- [ ] `ChunkedStream` source code is inspected and saved for reference.

---

### 3.2 API Client (`api_client.py`)

**Agent Instruction:** Implement per spec Section 8.7 with retry logic (3 attempts, exponential backoff).

**Test Case 3.2.1: API Client Resilience**

1. Start NestJS API locally.
2. Run `python -c "from api_client import AwaazAPIClient; ..."` to test `get_agent_config` with wrong secret → expect 401.
3. Test with correct secret → expect 200.
4. Temporarily stop API → expect retries then failure.

**☐ Checklist for 3.2:**
- [ ] `api_client.py` implements `AwaazAPIClient`.
- [ ] Retry logic: 3 attempts, exponential backoff.
- [ ] Wrong secret returns 401.
- [ ] Correct secret returns 200.
- [ ] API downtime triggers retries then graceful failure.

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
- [ ] `RimeTTS` class created in `pipeline/tts.py`.
- [ ] `RimeStream` extends `tts.ChunkedStream` exactly per inspected interface.
- [ ] Standalone test produces valid PCM audio at 16kHz mono.

---

### 3.4 Agent Entrypoint (`agent.py`)

**Agent Instruction:** Implement per spec Section 8.4.

Key implementation details:
- `VoicePipelineAgent` with `silero.VAD.load()`, `deepgram.STT(model="nova-3")`, `openai.LLM.with_groq(...)`, `RimeTTS(...)`, `turn_detector.EOUModel()`.
- Tool registration: `end_call` and `transfer_to_human`.
- Event emission: `user_speech_committed`, `agent_speech_committed`.

**Sub-task 3.4.1:** Implement `tools/end_call.py` and `tools/transfer_to_human.py` per spec Section 8.6.

**☐ Checklist for 3.4:**
- [ ] `agent.py` implements `AwaazAgent` with exact pipeline components.
- [ ] `end_call` tool registered and functional.
- [ ] `transfer_to_human` tool registered and functional.
- [ ] Events emitted on speech committed.

---

### 3.5 Main Entrypoint (`main.py`)

**Agent Instruction:** Create `main.py`:

```python
from livekit.agents import WorkerOptions, WorkerType, cli
from agent import AwaazAgent
cli.run_app(WorkerOptions(entrypoint_fnc=AwaazAgent.entrypoint, worker_type=WorkerType.ROOM))
```

**☐ Checklist for 3.5:**
- [ ] `main.py` matches exact code above.
- [ ] Worker type is `WorkerType.ROOM`.

---

### 3.6 Health Server (`health_server.py`)

**Agent Instruction:** FastAPI on port 8080 per spec Section 16.1.

**☐ Checklist for 3.6:**
- [ ] `health_server.py` created with FastAPI.
- [ ] Runs on port 8080.
- [ ] Health endpoint responds with 200.

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
- [ ] All five internal endpoints implemented.
- [ ] `GET /internal/agents/:id/config` requires `x-worker-secret`.
- [ ] Missing or wrong secret returns 401/403.
- [ ] Correct secret returns 200/404.

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
- [ ] LiveKit SIP URI copied.
- [ ] Twilio Elastic SIP Trunk "awaaz-livekit" created.
- [ ] Origination URI set to LiveKit SIP URI.
- [ ] Recording enabled with status callback URL.
- [ ] Twilio number assigned to SIP Trunk.

---

### 3.9 Render Background Worker Deployment *(Deferred cloud verification to Phase 9)*

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

### 3.10 First Voice Call Test *(Deferred real Twilio call to Phase 9)*

**This is the make-or-break test for Phase 3.**

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
- [ ] Audio flows both ways clearly.
- [ ] Latency feels natural (sub-2-second response).
- [ ] No crashes in Render worker logs.
- [ ] No 500 errors in NestJS logs.

**☐ Checklist for 3.10:**
- [ ] Called Twilio number from mobile.
- [ ] Heard agent greeting.
- [ ] Agent responded to query within 2 seconds.
- [ ] Call ended gracefully.
- [ ] No errors in Render or NestJS logs.

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
**DO NOT PROCEED TO PHASE 4 UNLESS ALL OF THE FOLLOWING ARE TRUE:**
- [ ] A real phone call reaches the agent and speaks back.
- [ ] Audio is clear both ways.
- [ ] Response latency is sub-2-second.
- [ ] Worker shows "Connected" in LiveKit dashboard.
- [ ] Internal endpoints are secured by `x-worker-secret`.
- [ ] `.cursorrules` conventions followed for Python and NestJS code.

---

## Phase 4: Agent & Phone Number Backend (Day 2–3)

**Objective:** Full agent CRUD, versioning with transaction safety, phone number management with LiveKit dispatch rules.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 3 is passed for non-Twilio scope.
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

### 4.4 Voices Module *(R2 preview upload verification deferred to Phase 9)*

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
- [x] Gate 4 is passed for non-Twilio scope.
- [ ] `.cursorrules` reviewed for webhook, queue, and storage conventions.
- [ ] Twilio recording settings enabled.
- [ ] R2 bucket "awaaz-recordings" exists.

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
- [ ] Twilio signature verification implemented.
- [ ] All status callbacks handled with correct state transitions.
- [ ] `recording-completed` enqueues job to BullMQ.

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

## ✅ Current Project Status

- Phase 1: Closed.
- Phase 2: Closed.
- Phase 3: Closed for non-Twilio scope.
- Phase 4: Closed for Phase 5 entry.
- Phase 5 non-Twilio transcript/cost pipeline: Verified.
- **Phase 6: Closed for non-Twilio scope** (frontend core + browser LiveKit test path + `/calls` + `/calls/[id]`). See Phase 6 section for verification checklist and explicit deferrals.
- Phase 7.1 Analytics Backend: Verified for current non-Twilio scope.
- Phase 7.2 Analytics Frontend: Verified with deployed real/non-test analytics data.
- Phase 7.3 Phone Numbers Tab: Verified.
- Phase 7.4 Members Tab: Verified, including deployed invite/accept flow.
- Phase 7.5 API Keys Tab: Verified, including Supabase persistence/hash/revoke checks.
- Phase 7.6 Organization Settings: Verified, including Supabase persistence and `updatedAt`.
- Phase 7.7 Qualicall Placeholder: Verified on deployed web.
- **Gate 7: PASSED for current non-Twilio scope.** New Agent create button remains a known UI backlog item while intentionally disabled.
- **Phase 9:** Accumulates **Twilio/PSTN/R2‑recording/live worker** deferrals **and** Phase 6 items that depend on telephony uploads (recording-backed waveform E2E). See Phase 9 for unified backlog.

Baseline deferred backlog (expanded in **Phase 9**):
- Twilio SIP trunk + real inbound/outbound phone calls (Phase 3/9)
- Twilio webhook production flow (Phase 5/9)
- Recording worker live verification + PSTN recordings in R2 (Phase 5/9)
- R2 recording and preview pipeline verification beyond local/dev (Phase 4/9)
- Cloud Render / production background worker verification (Phase 3/9)
- **From Phase 6:** full “play recording” E2E when `recordingUrl` is populated from Twilio (not browser-only calls)

---

## Phase 6: Frontend Core Features (Day 4–5)

**STATUS: ✅ Verified & closed — non‑Twilio / non‑PSTN scope** (dashboard + agents + browser LiveKit test flow + call list/detail without Twilio recording ingest).
Anything requiring **Twilio recording → R2 object key → presigned playback** stays **Deferred → Phase 9**.

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
- [x] **Original instruction** listed `hooks/use-agents.ts`, `hooks/use-calls.ts`, `hooks/use-analytics.ts` — **not added as standalone files**. Behavior is verified via **`apiCall`**; **`useAnalytics` remains for Phase 7** when `/analytics` ships.

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
- [ ] **`Deferred — Phase 7 (UI backlog, not Twilio):`** **New Agent** — button exists but stays **disabled** until create-flow is wired (`POST /api/v1/agents` already implemented API-side).

---

**Current New Agent status:** `New Agent` create remains a known UI backlog item and is not part of the closed current non-Twilio Gate 7 scope.

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

**✅ Checklist for 6.4:**
- [x] Monaco Editor loads client-side only (`agent-system-prompt-editor.tsx` dynamic import).
- [x] Draft auto-saves to localStorage every 30s; key **`agent-draft-${agentId}`** (`agent-editor-client.tsx`).
- [x] Draft restores when reopening `/agents/[id]` (non-empty draft wins over baseline until cleared).
- [x] Voice selector + **`Play preview`** control renders and fails gracefully when no playable HTTP(S) URL exists.
- [ ] **Deferred → Phase 9:** actual voice preview playback. Backend currently stores `previewAudioUrl` as an R2 object key; frontend audio playback requires a presigned/static HTTP(S) URL.
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

**✅ Checklist for 6.6:**
- [x] Test call modal **Connecting → Active → Ended** (`test-call-modal.tsx`, `LiveKitRoom`, dynamic import `ssr: false` from agent editor).
- [x] LiveKit connect path implemented (`POST /api/v1/agents/:id/test-call`, `LiveKitBrowserTestService`, explicit agent dispatch); **runtime** depends on env + worker.
- [x] Microphone level visualization (`useTrackVolume` / pulsing mic).
- [x] Agent audio path is wired through the Deepgram/Groq/Rime stack; **~2s** response remains runtime/environment dependent.
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

> **Note:** Step 2–3 require a **`recordingUrl`** mintable via R2 — uncommon until Twilio ingest (**Deferred Phase 9**). Without audio, verify graceful **Recording unavailable** plus transcript/cost/latency.

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
| PSTN/SIP/Twilio recording → `recordingUrl` | Not in non‑Twilio scope | **Phase 9** |
| Outbound-heavy call history QA | Needs real outbound traffic | **Phase 9** |
| Voice preview playback | Backend stores R2 object key; frontend needs HTTP(S) URL/presign | **Phase 9** |
| **New Agent** button wired (create flow) | Known UI backlog; API exists; button intentionally disabled | Backlog (not part of closed current non-Twilio Gate 7) |
| Standalone React Query hooks files | Superseded by `OrgProvider.apiCall` | **Optional / Phase 7** with analytics |

---

### 🚨 ERROR RESOLUTION — Phase 6

| Error | Likely Cause | Resolution |
|---|---|---|
| Monaco Editor fails to load | SSR import | Ensure `dynamic(() => import(...), { ssr: false })`. Do not import statically at top level. |
| Draft not persisting | Wrong localStorage key or SSR | Verify key is `agent-draft-${agentId}`. Ensure hook runs client-side. |
| Voice preview no audio | Expected until preview object keys are exposed as playable HTTP(S) URLs | Deferred to Phase 9 unless a presigned preview endpoint is added. |
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
- Twilio recording ingest, R2 object from PSTN, production worker hardening → **Phase 9**
- Voice preview playback and recording waveform/audio playback from R2/Twilio recordings → **Phase 9**
- **New Agent** create UI → known UI backlog (see §6.3); not part of the closed current non-Twilio Gate 7 scope

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
2. Make 2 real calls (should appear).
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

**Gate 7 note:** Passed for the current non-Twilio scope after deployed verification. PSTN/Twilio live calls, R2 recordings, waveform playback, voice preview playback, and other external integration work remain deferred to Phase 9. The disabled `New Agent` button is a known UI backlog item and is not part of the closed non-Twilio Gate 7 scope.

---

## Phase 8: Non-Twilio Hardening & Handoff Prep (Day 5–6)

**Objective:** Harden the verified non-Twilio platform, run security/database checks, prepare handoff docs, and configure free-tier survival. Do **not** implement or verify Twilio/PSTN live calls, R2 recording upload/download, voice preview playback, or real recording waveform playback in Phase 8; those remain Phase 9.

**Phase 8 scope split:**
- **Do now:** `.cursorrules` review, non-Twilio security audit, final Supabase verification, README/DEPLOYMENT/TROUBLESHOOTING docs, and free-tier/UptimeRobot setup.
- **Deferred to Phase 9:** Twilio/PSTN live calls, Twilio webhook production flow, R2 recording upload/download, voice preview playback, recording waveform/audio playback from real recordings, and live PSTN performance checks.
- **Known backlog:** `New Agent` create UI remains intentionally disabled and is not part of the closed current non-Twilio Gate 7 or Phase 8 hardening scope.

**Recommended Phase 8 order:**
1. Review `.cursorrules` for security, testing, and documentation conventions.
2. Run 8.2 non-Twilio security audit.
3. Run 8.6 final database verification.
4. Update `README.md`, `DEPLOYMENT.md`, and `TROUBLESHOOTING.md`.
5. Set up free-tier survival checks / UptimeRobot.

### ☐ PRE-PHASE CHECKLIST
- [x] Gate 7 is passed (**current non-Twilio scope**; Phase 9 deferrals remain).
- [ ] `.cursorrules` reviewed for security, testing, and documentation conventions.
- [x] All previous phases' non-Twilio test cases are passing.
- [x] Phase 9 deferrals are explicitly out of Phase 8 scope.
- [x] `New Agent` create UI is recorded as known backlog, not a Phase 8 blocker.

---

### 8.1 Non-Twilio User Journey Regression

**Scenario: Existing Agent to Browser Test Call Analysis**

| Step | Action | Verification |
|---|---|---|
| 1 | Admin opens `/agents` | Seeded agent list renders; `New Agent` button may remain disabled as known backlog |
| 2 | Admin opens an existing agent | Editor, Monaco, version history, and phone assignment controls load |
| 3 | Admin edits prompt and saves V2 | Version history shows V2 |
| 4 | Admin publishes V2 | V2 is live |
| 5 | Admin runs browser test call | Browser LiveKit flow creates a completed Test call row |
| 6 | Admin opens `/calls` | Filters/table render and Test badge is present |
| 7 | Admin opens `/calls/:id` | Transcript, cost, latency, and graceful recording fallback render |
| 8 | Admin opens `/analytics` | Non-test analytics remain correct; test calls remain excluded |
| 9 | Viewer logs in | Viewer can read allowed pages and cannot perform admin/builder mutations |

**☐ Checklist for 8.1:**
**Out of scope for 8.1:** New Agent creation, real inbound PSTN calls, Twilio recording ingest, R2 recording playback, and waveform/audio verification from real recordings. These remain backlog/Phase 9 as noted above.

- [ ] Step 1: Existing seeded agent list visible; disabled `New Agent` noted as backlog.
- [ ] Step 2: Existing agent editor loads.
- [ ] Step 3: V2 saved and visible in history.
- [ ] Step 4: V2 published and live.
- [ ] Step 5: Browser test call completes and creates Test call row.
- [ ] Step 6: Call history filters/table render.
- [ ] Step 7: Call detail page renders transcript/cost/latency and graceful recording fallback.
- [ ] Step 8: Analytics still exclude test calls and reflect real non-test data.
- [ ] Step 9: Viewer role restricted to read-only behavior.

---

### 8.2 Security Audit

**Agent Instruction:** Verify current non-Twilio security requirements. Do not execute Twilio/PSTN/R2 production verification here; keep those checks in Phase 9.

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
- TwiML token/domain behavior for outbound PSTN flow.
- Twilio webhook signature verification with real Twilio callbacks.
- LiveKit/Twilio/R2 production recording webhook chain.
- Voice preview and recording presigned playback security.

**☐ Checklist for 8.2:**
- [ ] Current non-Twilio security checks performed.
- [ ] Current non-Twilio checks return expected status codes.
- [ ] No security bypasses found.
- [ ] Phase 9-only security checks remain deferred and documented.

---

### 8.3 Free Tier Survival Setup

**Sub-task 8.3.1:** UptimeRobot setup:
- Add deployed Render API `/health` URL and ping every 10 minutes.
- Add deployed Vercel web URL and ping every 10 minutes.
- Optional: add a safe Supabase REST endpoint ping only if credentials/security posture are acceptable.

**Sub-task 8.3.2:** Worker heartbeat:
- Current Phase 8 can document heartbeat expectations, but live production worker hardening remains Phase 9 unless the worker is already deployed and safe to verify.
- Python worker heartbeat to `/internal/worker/heartbeat` every 5 minutes is secondary keep-alive, not primary.

**Sub-task 8.3.3:** Render cold-start mitigation:
- Document that after any idle period, trigger a browser test call to warm non-Twilio flows. Real PSTN warm-up guidance remains Phase 9.

**☐ Checklist for 8.3:**
- [ ] UptimeRobot configured for deployed API `/health`.
- [ ] UptimeRobot configured for deployed web URL.
- [ ] Optional Supabase keepalive decision documented.
- [ ] Worker heartbeat status documented; implementation/deployed worker verification deferred to Phase 9 if not already live.
- [ ] Non-Twilio cold-start mitigation documented.

---

### 8.4 Performance Verification

**Test Case 8.4.1: Non-Twilio Browser Latency Benchmark**

1. Make 5 browser test calls.
2. Query DB: `SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "latencyMs") FROM call_events WHERE "eventType" = 'AGENT_SPEECH' AND "createdAt" > NOW() - INTERVAL '1 hour' AND "latencyMs" IS NOT NULL;`

**Success Criteria:** P50 < 900ms for current browser/non-Twilio flow. PSTN latency benchmarking remains Phase 9.

**☐ Checklist for 8.4:**
- [ ] 5 browser test calls made.
- [ ] P50 latency queried from database.
- [ ] P50 is under 900ms.
- [ ] PSTN/live-call latency benchmark remains deferred to Phase 9.

---

### 8.5 Error Handling & Observability

**Agent Instruction:** Verify:
- All async operations have try/catch.
- API client in Python worker logs but doesn't crash on event emission failure.
- NestJS global exception filter returns consistent JSON errors.
- Current deployed Render/Vercel logs show no Phase 7 regression errors during non-Twilio verification.
- Live PSTN worker observability remains Phase 9 unless the worker is already deployed and safe to verify.

**☐ Checklist for 8.5:**
- [ ] All async operations wrapped in try/catch.
- [ ] Python worker expectations documented; live worker crash behavior deferred to Phase 9 if not currently deployed.
- [ ] NestJS exception filter returns consistent JSON.
- [ ] Deployed non-Twilio verification logs reviewed.

---

### 8.6 Final Database Verification

**Agent Instruction:** Run this checklist in Prisma Studio or via queries:

- [ ] Organization table has "Finova Solutions".
- [ ] User table has your Clerk ID.
- [ ] Membership has OWNER role.
- [ ] Agent "Sirius Agent" exists with `currentVersionId` pointing to V1.
- [ ] AgentVersion V1 has `isLive=true`.
- [ ] PhoneNumber has `agentId` = Sirius, and `liveKitDispatchRuleId` is populated when LiveKit dispatch sync is configured.
- [ ] PendingInvitation table empty (no stale invites).
- [ ] Call table has browser test calls marked with `metadata->isTest = true` and/or `metadata->isTestCall = true`.
- [ ] API keys have `keyPrefix`, SHA-256 `keyHash`, no plaintext full key, and correct revoke state.
- [ ] Organization name and `updatedAt` reflect latest verified persistence check.
- [ ] No Phase 8 DB check requires Twilio recordings or R2 objects.

---

### 8.7 Documentation & Handoff

**Agent Instruction:** Create or update the following files in repo root:

- [ ] `.env.example` file with all variables documented (no real values).
- [ ] `README.md` with architecture diagram (ASCII or Mermaid).
- [ ] `DEPLOYMENT.md` with Render/Vercel setup steps.
- [ ] `TROUBLESHOOTING.md` with common errors:
  - Worker not connecting → check LiveKit URL protocol (`wss://`).
  - No audio → check Twilio SIP trunk origination URI.
  - Transcript missing → check BullMQ Redis TLS config.
  - Analytics empty → check test call exclusion logic.
- [ ] Documentation clearly separates current non-Twilio scope from Phase 9 Twilio/R2/PSTN deferrals.
- [ ] Documentation notes disabled `New Agent` create UI as known backlog.

**☐ Checklist for 8.7:**
- [ ] `.env.example` reviewed/updated with all variables and descriptions.
- [ ] `README.md` has architecture diagram.
- [ ] `DEPLOYMENT.md` has step-by-step setup.
- [ ] `TROUBLESHOOTING.md` has the four required entries plus resolutions.
- [ ] Phase 9 deferrals and `New Agent` backlog are documented accurately.

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
- [ ] Non-Twilio user journey regression passes.
- [ ] Current non-Twilio security audit passes.
- [ ] Free-tier survival is configured (UptimeRobot + heartbeat).
- [ ] Browser/non-Twilio P50 latency is under 900ms.
- [ ] Database verification checklist is all green.
- [ ] All four documentation files exist and are complete.
- [ ] `.cursorrules` was adhered to in every single file created during all phases.
- [ ] Phase 9 Twilio/R2/PSTN deferrals are still clearly documented.
- [ ] `New Agent` create UI remains explicitly documented as known backlog if still disabled.

---

## 🏁 Final Launch Checklist

**Before announcing V1 readiness, verify every item from spec Section "Final Checklist Before V1 Launch":**

**Scope note:** This final launch checklist includes Phase 9 items. Do not use Twilio/PSTN/R2/voice-preview items below to block Phase 8 non-Twilio hardening completion; they block full external V1 launch until Phase 9 is complete.

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


---

## Phase 9: Deferred External Integrations & Launch Blockers

**Objective:** Complete real telephony, Twilio production integration, and remaining R2 verification work after core platform completion.

### Deferred from earlier phases

#### From Phase 3
- LiveKit SIP + Twilio bridge
- Real inbound mobile phone call verification
- Paid Render background worker verification

#### From Phase 4
- R2 voice preview upload verification

#### From Phase 5
- Twilio webhook production flow
- Outbound TwiML flow
- Recording worker live verification
- Real recording upload/download verification
- Real telephony cost verification

#### From Phase 6 (Deferred — requires telephony/R2/worker hardening)
- **PSTN recording → R2 object key → `recordingUrl` population** so **Call Detail waveform** can be exercised on **production-like** audio (browser/LiveKit-only calls often have `recordingUrl = null` by design until Phase 9).
- **Filter / analytics test data** with meaningful **OUTBOUND** PSTN volume (direction filter QA beyond browser test calls).
- **End-to-end** “click play → hear Twilio recording” verification (pairs with Phase 5 recording worker + R2).
- **Optional infra:** hardened **R2 CORS / presigned GET** soak tests for voice **preview** and **recordings** in production tenants.

#### From Phase 6 (Deferred — UI backlog, not telephony)
- **Wire “New Agent”** on `/agents` to **`POST /api/v1/agents`** (API already exists); typically done alongside Phase 7 polish.

### Notes
- `New Agent` create remains a known UI backlog item; the button is intentionally disabled and is not part of the closed current non-Twilio Gate 7 scope.
- Core non-Twilio platform flow is verified through Phase 6 (dashboard, agents edit, browser test flow, `/calls`, `/calls/[id]`).
- LiveKit browser test flow, transcript pipeline, and cost pipeline are functional for **non-PSTN** calls; **Twilio/R2 recording** completes the story in this phase.
- Twilio work is intentionally isolated here so **Phase 6 dashboard milestones without PSTN** could ship first.

