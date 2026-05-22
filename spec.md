# Awaaz V1 — Platform Specification
**Version:** 1.1 | **Status:** Domain/API reference (schema, contracts)

> **Runtime architecture (current):** See [ARCHITECTURE.md](./ARCHITECTURE.md) for deployment topology, browser preview flow, Redis safe mode, R2 recordings, and env vars. This spec remains the source of truth for **Prisma schema** and **API contracts**; some overview sections predate the completed browser-preview + Render worker stack.

**Path in repo:** `spec.md`
**Referenced by:** Playbook §1.2.1 — copy `prisma/schema.prisma` verbatim from Section 5 of this document.

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Architecture](#2-architecture)
3. [Domain Model Overview](#3-domain-model-overview)
4. [Roles & Permissions](#4-roles--permissions)
5. [Prisma Schema (Source of Truth)](#5-prisma-schema-source-of-truth)
6. [Internal API Contract](#6-internal-api-contract)
7. [Public REST API](#7-public-rest-api)
8. [Python Agent Worker](#8-python-agent-worker)
9. [Webhook Contracts](#9-webhook-contracts)
10. [TwiML Security Model](#10-twiml-security-model)
11. [Cost Calculation](#11-cost-calculation)
12. [Frontend Architecture](#12-frontend-architecture)
13. [Call History & Detail](#13-call-history--detail)
14. [Queue Workers](#14-queue-workers)
15. [Environment Variables](#15-environment-variables)
16. [Seed Data & Keep-Alive](#16-seed-data--keep-alive)

---

## 1. Platform Overview

Awaaz V1 is a multi-tenant AI voice agent platform. Organizations configure agents, run **browser LiveKit test calls**, review call history (transcripts, latency, R2 recordings), and monitor analytics.

**Production path (implemented):** Browser → LiveKit → Python worker → Nest internal API → Postgres / Redis / R2.

**Deferred path:** Twilio PSTN → LiveKit SIP → same worker pipeline.

**Core services:**
- **`apps/api`** — NestJS REST API (Node 20, TypeScript)
- **`apps/web`** — Next.js 15 App Router frontend (TypeScript, Tailwind, shadcn/ui)
- **`apps/agent-worker`** — Python 3.11 LiveKit agent (Deepgram STT → Groq LLM → Rime TTS)
- **`apps/qualicall-worker`** — Placeholder, future QA scoring worker
- **`packages/shared-types`** — Shared TypeScript types across apps

**Infrastructure:**
- Database: Supabase PostgreSQL (Prisma ORM)
- Queue: Upstash Redis + BullMQ
- Storage: Cloudflare R2
- Auth: Clerk
- Telephony: Twilio Elastic SIP Trunk → LiveKit SIP
- Deployments: Render (API + workers), Vercel (frontend)

---

## 2. Architecture

```
Caller (PSTN)
    │
    ▼
Twilio Number
    │ SIP
    ▼
Twilio Elastic SIP Trunk "awaaz-livekit"
    │ SIP
    ▼
LiveKit SIP Dispatch Rule (per phone number)
    │ WebRTC Room
    ▼
Python Agent Worker (Render Background Worker)
    │  ├─ Deepgram STT (nova-3)
    │  ├─ Groq LLM (llama-3.3-70b-versatile)
    │  └─ Rime TTS (custom ChunkedStream)
    │
    │ HTTP (x-worker-secret)
    ▼
NestJS API (Render Web Service)
    │  ├─ Prisma → Supabase PostgreSQL
    │  ├─ BullMQ → Upstash Redis
    │  └─ R2 (recordings)
    │
    ▼
Next.js Frontend (Vercel)
    └─ Clerk Auth (JWT)
```

---

## 3. Domain Model Overview

| Entity | Description |
|---|---|
| `Organization` | Top-level multi-tenant boundary. All data is scoped to an org. |
| `User` | Clerk-authenticated user. One user can belong to many orgs. |
| `Membership` | Join table: User ↔ Organization with a `Role`. |
| `PendingInvitation` | Holds invitation state before user accepts (links to Clerk invite). |
| `Agent` | A named AI voice agent. Has a current live `AgentVersion`. |
| `AgentVersion` | Immutable snapshot: system prompt, voice, model settings, version number. |
| `PhoneNumber` | Twilio number registered to an org. Can be assigned to one `Agent`. |
| `Call` | A single call event — inbound or outbound. Tracks status, duration, cost. |
| `CallEvent` | Individual speech turns within a call (USER_SPEECH, AGENT_SPEECH). |
| `Transcript` | Assembled transcript record linked to a Call. |
| `Voice` | Cached Rime voice entry with preview audio URL. |
| `AuditLog` | Immutable log of every user action (create, update, delete, publish). |
| `ApiKey` | SHA-256 hashed API key for programmatic access. |

---

## 4. Roles & Permissions

| Role | Level | Capabilities |
|---|---|---|
| `OWNER` | 40 | Full access. Can delete org. Assigned on org creation. |
| `ADMIN` | 30 | Manage members, API keys, phone numbers. Cannot delete org. |
| `BUILDER` | 20 | Create/edit/publish agents. Cannot manage members. |
| `VIEWER` | 10 | Read-only. Cannot create, edit, or delete anything. |

**Rule:** Any endpoint that mutates data checks `req.userRole` against the minimum role. VIEWER is always read-only.

---

## 5. Prisma Schema (Source of Truth)

> **Agent Instruction (§1.2.1):** Copy the entire block below verbatim into `apps/api/prisma/schema.prisma`. Do not rename fields, change types, or alter enum values. The `datasource db` block must include both `url` and `directUrl` as shown. *(Repository layout: this file lives at project root as `spec.md`; header comments below may say `docs/spec.md` — treat both as the same §5 source.)*

```prisma
// ============================================================
// Awaaz V1 — Authoritative Prisma Schema
// Source of truth: docs/spec.md § 5
// DO NOT MODIFY field names, types, or enum values without
// updating this spec file and creating a new migration.
// ============================================================

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_DIRECT_URL")
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

enum Role {
  OWNER
  ADMIN
  BUILDER
  VIEWER
}

enum CallStatus {
  INITIATED
  IN_PROGRESS
  COMPLETED
  FAILED
  ABANDONED
}

enum CallDirection {
  INBOUND
  OUTBOUND
}

enum EventType {
  USER_SPEECH
  AGENT_SPEECH
  CALL_STARTED
  CALL_ENDED
  TRANSFER_INITIATED
  ERROR
}

enum AuditAction {
  CREATED
  UPDATED
  DELETED
  PUBLISHED
  RESTORED
  INVITED
  REVOKED
  ASSIGNED
  UNASSIGNED
}

// ─────────────────────────────────────────────
// ORGANIZATION
// ─────────────────────────────────────────────

model Organization {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  memberships       Membership[]
  pendingInvitations PendingInvitation[]
  agents            Agent[]
  phoneNumbers      PhoneNumber[]
  calls             Call[]
  apiKeys           ApiKey[]
  auditLogs         AuditLog[]

  @@map("organizations")
}

// ─────────────────────────────────────────────
// USER
// ─────────────────────────────────────────────

model User {
  id        String   @id  // Clerk user ID (e.g. "user_...")
  email     String?  @unique
  firstName String?
  lastName  String?
  imageUrl  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships Membership[]
  auditLogs   AuditLog[]

  @@map("users")
}

// ─────────────────────────────────────────────
// MEMBERSHIP
// ─────────────────────────────────────────────

model Membership {
  id             String   @id @default(cuid())
  userId         String
  organizationId String
  role           Role     @default(VIEWER)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([userId, organizationId])
  @@map("memberships")
}

// ─────────────────────────────────────────────
// PENDING INVITATION
// ─────────────────────────────────────────────

model PendingInvitation {
  id             String   @id @default(cuid())
  organizationId String
  email          String
  role           Role     @default(VIEWER)
  clerkInviteId  String?  @unique
  createdAt      DateTime @default(now())
  expiresAt      DateTime?

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@unique([organizationId, email])
  @@map("pending_invitations")
}

// ─────────────────────────────────────────────
// AGENT
// ─────────────────────────────────────────────

model Agent {
  id               String   @id @default(cuid())
  organizationId   String
  name             String
  description      String?
  isActive         Boolean  @default(true)
  currentVersionId String?  @unique
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  deletedAt        DateTime?  // soft-delete

  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  currentVersion AgentVersion? @relation("CurrentVersion", fields: [currentVersionId], references: [id])
  versions       AgentVersion[] @relation("AgentVersions")
  phoneNumbers   PhoneNumber[]
  calls          Call[]
  // Prisma: omit `auditLogs` here — `AuditLog` has no `agentId` / inverse relation; use entityType/entityId.

  @@map("agents")
}

// ─────────────────────────────────────────────
// AGENT VERSION
// ─────────────────────────────────────────────

model AgentVersion {
  id            String   @id @default(cuid())
  agentId       String
  versionNumber Int
  systemPrompt  String   @db.Text
  voiceId       String
  model         String   @default("llama-3.3-70b-versatile")
  temperature   Float    @default(0.7)
  maxTokens     Int      @default(1024)
  firstMessage  String?
  endCallPhrases String[] @default([])
  isLive        Boolean  @default(false)
  publishedAt   DateTime?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  agent           Agent   @relation("AgentVersions", fields: [agentId], references: [id], onDelete: Cascade)
  agentAsCurrent  Agent?  @relation("CurrentVersion")
  calls           Call[]

  @@unique([agentId, versionNumber])
  @@map("agent_versions")
}

// ─────────────────────────────────────────────
// PHONE NUMBER
// ─────────────────────────────────────────────

model PhoneNumber {
  id                    String   @id @default(cuid())
  organizationId        String
  agentId               String?
  number                String   @unique   // E.164 format, e.g. "+923001234567"
  friendlyName          String?
  twilioSid             String?  @unique
  liveKitDispatchRuleId String?
  isActive              Boolean  @default(true)
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  agent        Agent?        @relation(fields: [agentId], references: [id], onDelete: SetNull)
  calls        Call[]

  @@map("phone_numbers")
}

// ─────────────────────────────────────────────
// CALL
// ─────────────────────────────────────────────

model Call {
  id               String        @id @default(cuid())
  organizationId   String
  agentId          String?
  agentVersionId   String?
  phoneNumberId    String?
  direction        CallDirection
  status           CallStatus    @default(INITIATED)
  fromNumber       String?
  toNumber         String?
  twilioCallSid    String?       @unique
  liveKitRoomId    String?       @unique
  startedAt        DateTime?
  endedAt          DateTime?
  durationSeconds  Int?
  recordingUrl     String?       // R2 object key, not full URL
  costBreakdown    Json?
  totalCostUsd     Float?
  metadata         Json?         // includes isTest: true for browser test calls
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  organization Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  agent        Agent?         @relation(fields: [agentId], references: [id], onDelete: SetNull)
  agentVersion AgentVersion?  @relation(fields: [agentVersionId], references: [id], onDelete: SetNull)
  phoneNumber  PhoneNumber?   @relation(fields: [phoneNumberId], references: [id], onDelete: SetNull)
  events       CallEvent[]
  transcript   Transcript?

  @@index([organizationId, createdAt])
  @@index([agentId, createdAt])
  @@index([status])
  @@index([direction])
  @@map("calls")
}

// ─────────────────────────────────────────────
// CALL EVENT
// ─────────────────────────────────────────────

model CallEvent {
  id         String    @id @default(cuid())
  callId     String
  eventType  EventType
  content    String?   @db.Text
  speaker    String?   // "user" | "agent"
  latencyMs  Int?
  tokenCount Int?
  startedAt  DateTime?
  endedAt    DateTime?
  durationMs Int?
  metadata   Json?
  createdAt  DateTime  @default(now())

  call Call @relation(fields: [callId], references: [id], onDelete: Cascade)

  @@index([callId, eventType])
  @@index([callId, createdAt])
  @@map("call_events")
}

// ─────────────────────────────────────────────
// TRANSCRIPT
// ─────────────────────────────────────────────

model Transcript {
  id          String   @id @default(cuid())
  callId      String   @unique
  content     Json     // Array of { speaker, text, startedAt, endedAt, latencyMs }
  assembledAt DateTime @default(now())
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  call Call @relation(fields: [callId], references: [id], onDelete: Cascade)

  @@map("transcripts")
}

// ─────────────────────────────────────────────
// VOICE
// ─────────────────────────────────────────────

model Voice {
  id             String   @id @default(cuid())
  rimeVoiceId    String   @unique   // Rime's internal voice identifier
  name           String
  description    String?
  language       String   @default("en")
  gender         String?
  previewAudioUrl String?  // R2 presigned-compatible key
  isActive       Boolean  @default(true)
  syncedAt       DateTime @default(now())
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@map("voices")
}

// ─────────────────────────────────────────────
// API KEY
// ─────────────────────────────────────────────

model ApiKey {
  id             String   @id @default(cuid())
  organizationId String
  name           String
  keyPrefix      String                   // First 8 chars, displayed in UI
  keyHash        String   @unique         // SHA-256 of full key — never store plaintext
  isRevoked      Boolean  @default(false)
  lastUsedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)

  @@index([organizationId])
  @@map("api_keys")
}

// ─────────────────────────────────────────────
// AUDIT LOG
// ─────────────────────────────────────────────

model AuditLog {
  id             String      @id @default(cuid())
  organizationId String
  userId         String?
  action         AuditAction
  entityType     String      // "Agent" | "AgentVersion" | "PhoneNumber" | "Member" | "ApiKey" | etc.
  entityId       String?
  metadata       Json?       // snapshot of changed fields or context
  ipAddress      String?
  userAgent      String?
  createdAt      DateTime    @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  user         User?         @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

---

## 6. Internal API Contract

All internal endpoints are protected by the `x-worker-secret` header. The worker secret must match `WORKER_SECRET` env var on both the API and agent-worker services.

### `GET /internal/agents/:id/config`

Returns the live agent configuration for the worker to use when a call arrives.

**Response:**
```json
{
  "agentId": "cuid",
  "organizationId": "cuid",
  "systemPrompt": "string",
  "voiceId": "string",
  "model": "llama-3.3-70b-versatile",
  "temperature": 0.7,
  "maxTokens": 1024,
  "firstMessage": "string | null",
  "endCallPhrases": ["goodbye", "end call"]
}
```

### `POST /internal/calls/start`

Called by worker when a LiveKit room is joined. Creates or updates the `Call` record.

**Body:**
```json
{
  "liveKitRoomId": "string",
  "agentId": "string",
  "organizationId": "string",
  "direction": "INBOUND | OUTBOUND",
  "fromNumber": "string",
  "toNumber": "string",
  "metadata": {}
}
```

### `POST /internal/calls/:id/end`

Called by worker when a LiveKit room ends.

**Body:**
```json
{
  "endedAt": "ISO string",
  "durationSeconds": 120
}
```

### `POST /internal/calls/:id/events`

Called by worker to emit speech events.

**Body:**
```json
{
  "eventType": "USER_SPEECH | AGENT_SPEECH",
  "content": "string",
  "speaker": "user | agent",
  "latencyMs": 450,
  "tokenCount": 120,
  "startedAt": "ISO string",
  "endedAt": "ISO string"
}
```

### `POST /internal/worker/heartbeat`

Called every 5 minutes by the Python worker to confirm liveness.

**Response:** `{ "ok": true }`

---

## 7. Public REST API

All public endpoints require:
- `Authorization: Bearer <clerk_jwt>` header
- `x-organization-id: <org_id>` header (enforced by `TenantMiddleware`)

Base path: `/api/v1`

### Organizations
| Method | Path | Min Role | Description |
|---|---|---|---|
| GET | `/organizations` | VIEWER | List user's organizations |
| POST | `/organizations` | ADMIN | Create organization |
| PATCH | `/organizations/:id` | ADMIN | Update name |
| GET | `/organizations/:id/members` | VIEWER | List members |
| POST | `/organizations/:id/members/invite` | ADMIN | Invite member |
| GET | `/organizations/:id/invitations` | ADMIN | List pending invitations |
| DELETE | `/organizations/:id/invitations/:invId` | ADMIN | Cancel invitation |
| POST | `/organizations/:id/invitations/:invId/resend` | ADMIN | Resend invitation email |

### Agents
| Method | Path | Min Role | Description |
|---|---|---|---|
| GET | `/agents` | VIEWER | List org agents |
| POST | `/agents` | BUILDER | Create agent |
| GET | `/agents/:id` | VIEWER | Get agent with live version |
| PATCH | `/agents/:id` | BUILDER | Update name/description |
| DELETE | `/agents/:id` | ADMIN | Soft-delete agent |
| GET | `/agents/:id/versions` | VIEWER | List versions (newest first) |
| POST | `/agents/:id/versions` | BUILDER | Save new version |
| POST | `/agents/:id/versions/:vId/publish` | BUILDER | Publish version (transactional) |
| POST | `/agents/:id/versions/:vId/restore` | BUILDER | Restore (creates new version) |
| POST | `/agents/:id/test-call` | BUILDER | Create browser test call room |

### Phone Numbers
| Method | Path | Min Role | Description |
|---|---|---|---|
| GET | `/phone-numbers` | VIEWER | List org numbers |
| POST | `/phone-numbers` | ADMIN | Register Twilio number |
| PATCH | `/phone-numbers/:id` | ADMIN | Assign/unassign agent |
| POST | `/phone-numbers/:id/sync-dispatch-rule` | ADMIN | Create/update LiveKit dispatch rule |

### Calls
| Method | Path | Min Role | Description |
|---|---|---|---|
| GET | `/calls` | VIEWER | List calls (filtered, paginated 20/page) |
| GET | `/calls/:id` | VIEWER | Call detail |
| GET | `/calls/:id/recording` | VIEWER | Presigned R2 URL for recording |
| POST | `/calls/outbound` | BUILDER | Initiate outbound call |

### Voices
| Method | Path | Min Role | Description |
|---|---|---|---|
| GET | `/voices` | VIEWER | List cached voices |
| POST | `/voices/sync` | ADMIN | Sync from Rime, upload previews to R2 |

### Analytics
| Method | Path | Min Role | Description |
|---|---|---|---|
| GET | `/analytics/overview` | VIEWER | Today / 7d / 30d summary |
| GET | `/analytics/calls-trend` | VIEWER | Daily call buckets |
| GET | `/analytics/costs` | VIEWER | Monthly cost breakdown |
| GET | `/analytics/latency` | VIEWER | P50 / P95 / P99 latency |
| GET | `/analytics/agents` | VIEWER | Top 5 agents by volume |
| GET | `/analytics/live` | VIEWER | Active call count (polls every 10s) |

### API Keys
| Method | Path | Min Role | Description |
|---|---|---|---|
| GET | `/api-keys` | ADMIN | List keys (prefix only, never hash) |
| POST | `/api-keys` | ADMIN | Create key (returns full key ONCE) |
| DELETE | `/api-keys/:id` | ADMIN | Revoke key |

### TwiML (public, token-protected)
| Method | Path | Description |
|---|---|---|
| GET | `/twiml/outbound` | Returns TwiML for outbound calls; requires valid signed token query param |

---

## 8. Python Agent Worker

### 8.1 Stack

| Component | Package | Version |
|---|---|---|
| Agent framework | `livekit-agents` | 0.8.11 |
| STT | `livekit-plugins-deepgram` | 0.6.5 |
| LLM | `livekit-plugins-openai` | 0.8.3 (Groq via `with_groq`) |
| VAD | `livekit-plugins-silero` | 0.6.4 |
| HTTP client | `httpx` | 0.27.2 |
| Validation | `pydantic` | 2.9.2 |
| Health server | `fastapi` + `uvicorn` | 0.115.0 / 0.30.0 |
| Env | `python-dotenv` | 1.0.1 |

### 8.2 Pipeline

```
Silero VAD → Deepgram STT (nova-3) → Groq LLM (llama-3.3-70b-versatile) → Rime TTS
```

- TTS implementation: `RimeTTS` class using `RimeStream extends tts.ChunkedStream`.
- Audio format: PCM 16kHz mono.
- Turn detection: `turn_detector.EOUModel()`.

### 8.3 Agent Config Fetch

On room join, the worker calls `GET /internal/agents/:id/config` with `x-worker-secret` to fetch the live system prompt, voice, and model settings. The `agentId` is extracted from the LiveKit room metadata (set by dispatch rule).

### 8.4 Entrypoint (`agent.py`)

```python
class AwaazAgent:
    @staticmethod
    async def entrypoint(ctx: JobContext):
        # 1. Fetch agent config from API
        # 2. Build VoicePipelineAgent with fetched config
        # 3. Register tools: end_call, transfer_to_human
        # 4. Emit events to /internal/calls/:id/events on speech committed
        # 5. Call /internal/calls/start on room join
        # 6. Call /internal/calls/:id/end on room_finished
```

### 8.5 Rime TTS (`pipeline/tts.py`)

- Class: `RimeTTS(tts.TTS)`
- Stream class: `RimeStream(tts.ChunkedStream)`
- API endpoint: `POST https://users.rime.ai/v1/rime-tts`
- **Critical:** Inspect `tts.ChunkedStream` source before implementing — align interface exactly.

### 8.6 Tools

**`end_call`** — Gracefully ends the LiveKit room session.  
**`transfer_to_human`** — Initiates SIP transfer to a human agent number.

### 8.7 API Client (`api_client.py`)

```python
class AwaazAPIClient:
    # Retry: 3 attempts, exponential backoff (1s, 2s, 4s)
    # Header: x-worker-secret on all requests
    async def get_agent_config(self, agent_id: str) -> dict: ...
    async def start_call(self, payload: dict) -> dict: ...
    async def end_call(self, call_id: str, payload: dict) -> None: ...
    async def emit_event(self, call_id: str, payload: dict) -> None: ...
    async def heartbeat(self) -> None: ...
```

### 8.8 Main Entrypoint (`main.py`)

```python
from livekit.agents import WorkerOptions, WorkerType, cli
from agent import AwaazAgent
cli.run_app(WorkerOptions(entrypoint_fnc=AwaazAgent.entrypoint, worker_type=WorkerType.ROOM))
```

---

## 9. Webhook Contracts

### 9.1 Clerk Webhook (`POST /webhooks/clerk`)

Verified using `svix` signature verification with `CLERK_WEBHOOK_SECRET`.

| Event | Action |
|---|---|
| `user.created` | Lookup `PendingInvitation` by email → create `User` + `Membership` → delete `PendingInvitation` |
| `user.updated` | Update `User` record |
| `user.deleted` | Soft-mark user (set `email = null`) |
| `organizationInvitation.accepted` | Backup: create `Membership` if not already exists |

### 9.2 Twilio Webhook (`POST /webhooks/twilio`)

Verified using `twilio.validateRequest` with `TWILIO_AUTH_TOKEN`.

| Status | Action |
|---|---|
| `initiated` | Create `Call` record (INBOUND) or update existing (OUTBOUND) |
| `answered` | `status = IN_PROGRESS`, set `startedAt` |
| `completed` | `status = COMPLETED`, set `endedAt`, `durationSeconds` |
| `failed` | `status = FAILED` |
| `no-answer` | `status = ABANDONED` |
| `recording-completed` | Enqueue job to `recordingQueue` (BullMQ) |

### 9.3 LiveKit Webhook (`POST /webhooks/livekit`)

Verified using `livekit-server-sdk` `WebhookReceiver`.

| Event | Action |
|---|---|
| `room_finished` | Enqueue job to `transcriptQueue` (BullMQ) with `liveKitRoomId` |

---

## 10. TwiML Security Model

Outbound calls use a signed token flow to prevent SSRF and unauthorized SIP dial injection.

1. `POST /api/v1/calls/outbound` — API creates HMAC-SHA256 token:
   ```
   token = HMAC-SHA256(TWIML_SECRET, `${sipUri}:${Date.now()}`)
   redis.setex(`twiml:${token}`, 60, sipUri)  // 60s TTL
   ```
2. Token passed to Twilio as `statusCallbackUrl`.
3. `GET /twiml/outbound?token=<token>` — API:
   - Validates token exists in Redis (404 if missing/expired).
   - Validates SIP URI domain against allowlist (400 if wrong domain).
   - Deletes token from Redis (one-time use).
   - Returns TwiML with XML-escaped `<Dial><Sip>` element.

---

## 11. Cost Calculation

Costs are calculated by the `TranscriptWorker` after every call. All values stored in `Call.costBreakdown` (JSON) and `Call.totalCostUsd` (Float).

| Component | Rate |
|---|---|
| STT (Deepgram) | $0.0043 / minute |
| LLM (Groq) | $0.79 / 1M tokens |
| TTS (Rime) | $0.020 / 1K characters |
| Telephony (Twilio) | $0.0085 / minute |

**Token count:** Use `CallEvent.tokenCount` where available. Fallback: `estimatedTokens = charCount // 4`.

**`costBreakdown` JSON shape:**
```json
{
  "sttUsd": 0.0086,
  "llmUsd": 0.0043,
  "ttsUsd": 0.012,
  "telephonyUsd": 0.017,
  "totalUsd": 0.0419
}
```

---

## 12. Frontend Architecture

### 12.1 Stack

- Next.js 14 App Router
- TypeScript + Tailwind CSS
- shadcn/ui component library
- Clerk (`@clerk/nextjs`) for auth
- React Query (`@tanstack/react-query`) for server state
- `react-hook-form` + `zod` for form validation
- `use-local-storage-state` for SSR-safe local storage
- Monaco Editor (dynamic import, `ssr: false`)
- `wavesurfer.js` (dynamic import, `ssr: false`)
- `@livekit/components-react` for test call modal
- `react-diff-viewer-continued` for version diffs
- Recharts for analytics charts

### 12.2 App Router Structure

```
apps/web/
├── app/
│   ├── layout.tsx              # ClerkProvider, QueryClientProvider
│   ├── (auth)/
│   │   └── sign-in/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Sidebar + OrgSwitcher
│   │   ├── agents/
│   │   │   ├── page.tsx        # Agents list table
│   │   │   └── [id]/page.tsx   # Agent edit + version history
│   │   ├── calls/
│   │   │   ├── page.tsx        # Call history with filters
│   │   │   └── [id]/page.tsx   # Call detail: audio, transcript, cost
│   │   ├── analytics/page.tsx
│   │   ├── phone-numbers/page.tsx
│   │   ├── qualicall/page.tsx  # "Coming Soon" placeholder
│   │   └── settings/
│   │       ├── members/page.tsx
│   │       ├── api-keys/page.tsx
│   │       └── organization/page.tsx
├── middleware.ts               # Clerk route protection
├── lib/
│   └── api.ts                  # API client with Clerk token + x-organization-id
└── hooks/
    ├── use-agents.ts
    ├── use-calls.ts
    └── use-analytics.ts
```

### 12.3 OrgSwitcher

```typescript
const [activeOrg, setActiveOrg] = useLocalStorageState('awaaz_active_org', {
  defaultValue: orgs[0]?.id
});
```

All API calls include `x-organization-id: activeOrg`.

### 12.4 Clerk Middleware (`middleware.ts`)

```typescript
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)']);

export default clerkMiddleware((auth, req) => {
  if (!isPublicRoute(req)) auth().protect();
});

export const config = {
  matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)','/(api|trpc)(.*)'],
};
```

### 12.5 API Client (`lib/api.ts`)

```typescript
// Attaches Clerk JWT and active org to every request
export async function apiClient(path: string, options: RequestInit = {}) {
  const token = await getToken(); // from useAuth() or getAuth()
  const orgId = getActiveOrg();   // from useLocalStorageState
  return fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-organization-id': orgId,
      ...options.headers,
    },
  });
}
```

---

## 13. Call History & Detail

### 13.1 Filters (Call History Page)

- Agent (dropdown)
- Direction (INBOUND / OUTBOUND)
- Status (INITIATED / IN_PROGRESS / COMPLETED / FAILED / ABANDONED)
- Date range (from / to)
- Phone number

### 13.2 Table Columns

| Column | Source |
|---|---|
| Date / Time | `Call.createdAt` |
| Direction | `Call.direction` badge |
| From | `Call.fromNumber` |
| To | `Call.toNumber` |
| Agent | `Call.agent.name` |
| Duration | `Call.durationSeconds` formatted |
| Status | `Call.status` badge |
| Cost | `Call.totalCostUsd` |
| Test | `Call.metadata.isTest` badge |
| Actions | Detail link |

### 13.3 Analytics — Test Call Exclusion

Every analytics query MUST include:
```sql
WHERE (metadata->>'isTest' IS NULL OR metadata->>'isTest' != 'true')
```

### 13.4 Analytics Cache TTLs

| Endpoint | Redis TTL |
|---|---|
| `/analytics/overview` | 60 seconds |
| `/analytics/calls-trend` | 5 minutes |
| `/analytics/costs` | 5 minutes |
| `/analytics/latency` | 60 seconds |
| `/analytics/agents` | 60 seconds |
| `/analytics/live` | Not cached (real-time) |

---

## 14. Queue Workers

### 14.1 Redis Connection (Upstash TLS)

```typescript
const connection = new Redis(process.env.REDIS_URL, {
  tls: {},
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
```

### 14.2 Queues

| Queue name | Trigger | Worker class |
|---|---|---|
| `transcript` | `room_finished` LiveKit event | `TranscriptWorker` |
| `recording` | `recording-completed` Twilio event | `RecordingWorker` |

### 14.3 TranscriptWorker

1. Delay 3 seconds (wait for Twilio webhook settlement).
2. Lookup `Call` by `callId` from job data; fallback by `liveKitRoomId`.
3. Fetch all `CallEvent` where `eventType IN (USER_SPEECH, AGENT_SPEECH)` ordered by `createdAt`.
4. Assemble `Transcript.content` array: `[{ speaker, text, startedAt, endedAt, latencyMs }]`.
5. Calculate cost breakdown (see Section 11).
6. Update `Call.costBreakdown`, `Call.totalCostUsd`.
7. Create `Transcript` record.

### 14.4 RecordingWorker

1. Download recording from Twilio using Basic Auth (`TWILIO_ACCOUNT_SID:TWILIO_AUTH_TOKEN`).
2. Upload buffer to R2 via `StorageService.uploadBuffer('recordings/{callId}.mp3', buffer, 'audio/mpeg')`.
3. Update `Call.recordingUrl` with R2 object key (not full URL).

### 14.5 StorageService

Uses `@aws-sdk/client-s3` configured with Cloudflare R2 endpoint:

```typescript
new S3Client({
  region: 'auto',
  endpoint: `https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
})
```

Presigned URLs use `@aws-sdk/s3-request-presigner`.

---

## 15. Environment Variables

### 15.1 NestJS API (`apps/api`)

```env
# Server
NODE_ENV=production
PORT=3001
FRONTEND_URL=https://your-app.vercel.app

# Database
DATABASE_URL=postgresql://...@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true
DATABASE_DIRECT_URL=postgresql://...@aws-0-region.supabase.com:5432/postgres

# Redis (Upstash — must start with rediss://)
REDIS_URL=rediss://...

# Clerk
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_WEBHOOK_SECRET=whsec_...

# LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+923001234567

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_SECRET_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET_NAME=awaaz-recordings

# Worker security
WORKER_SECRET=<random 64-char hex string>
TWIML_SECRET=<random 64-char hex string>
```

### 15.2 Next.js Frontend (`apps/web`)

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_SECRET_KEY=sk_live_...
NEXT_PUBLIC_API_URL=https://your-api.onrender.com
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud
```

### 15.3 Python Agent Worker (`apps/agent-worker`)

```env
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
DEEPGRAM_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
RIME_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWAAZ_API_URL=https://your-api.onrender.com
WORKER_SECRET=<same value as API WORKER_SECRET>
```

---

## 16. Seed Data & Keep-Alive

### 16.1 Health Endpoints

| Service | Path | Port |
|---|---|---|
| NestJS API | `GET /health` | 3001 |
| Python Worker | `GET /health` (FastAPI) | 8080 |

### 16.2 Keep-Alive Strategy

- **Primary:** UptimeRobot pings both health endpoints every 10 minutes.
- **Secondary:** Python worker calls `POST /internal/worker/heartbeat` every 5 minutes.
- **Cold-start mitigation:** After any idle period, trigger a test call to warm the worker before real calls.

### 16.3 Latency Target

P50 agent response latency (from `AGENT_SPEECH` events) must be **< 900ms**.

Query:
```sql
SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY latency_ms)
FROM call_events
WHERE event_type = 'AGENT_SPEECH'
  AND created_at > NOW() - INTERVAL '1 hour';
```

### 16.4 Seed (`apps/api/prisma/seed.ts`)

Seed creates the minimal required state for a working Finova Solutions deployment:

1. **Organization:** `{ name: 'Finova Solutions', slug: 'finova-solutions' }`
2. **User:** `{ id: 'user_YOUR_ACTUAL_CLERK_ID', email: 'your@email.com', firstName: 'Your', lastName: 'Name' }`
3. **Membership:** User → Organization with role `OWNER`
4. **Voice:** Default Rime voice `{ rimeVoiceId: 'mist-default', name: 'Mist (Default)' }` (placeholder until voice sync runs)
5. **Agent:** `{ name: 'Sirius Agent', organizationId: <org.id>, isActive: true }`
6. **AgentVersion V1:**
   ```
   {
     agentId: <agent.id>,
     versionNumber: 1,
     systemPrompt: "You are Sirius, a helpful AI voice assistant for Finova Solutions...",
     voiceId: "mist-default",
     model: "llama-3.3-70b-versatile",
     temperature: 0.7,
     maxTokens: 1024,
     firstMessage: "Hello! How can I help you today?",
     endCallPhrases: ["goodbye", "end call", "hang up"],
     isLive: true,
     publishedAt: new Date()
   }
   ```
7. **Agent:** Update `currentVersionId` → AgentVersion V1 id
8. **PhoneNumber:** `{ number: '+923001234567', organizationId: <org.id>, agentId: <agent.id>, friendlyName: 'Finova Main Line' }`

> **CRITICAL:** Replace `'user_YOUR_ACTUAL_CLERK_ID'` with your real Clerk user ID before running `npx prisma db seed`.

### 16.5 Final Database Verification Checklist

After seeding, verify in Prisma Studio:

- [ ] `Organization` table has "Finova Solutions"
- [ ] `User` table has your Clerk ID
- [ ] `Membership` has `role = OWNER`
- [ ] `Agent` "Sirius Agent" exists with `isActive = true`
- [ ] `AgentVersion` V1 has `isLive = true` and `publishedAt` set
- [ ] `Agent.currentVersionId` points to V1
- [ ] `PhoneNumber` has `agentId` pointing to Sirius Agent
- [ ] `PhoneNumber.liveKitDispatchRuleId` populated (after Phase 4 dispatch rule creation)
- [ ] `PendingInvitation` table is empty (no stale invites)
- [ ] `Call` table has test calls marked with `metadata->>'isTest' = 'true'`

---

*End of Awaaz V1 Platform Specification — docs/spec.md*
