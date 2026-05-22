# Deferred Features Implementation Guide

## Purpose

Roadmap for **remaining** external launch work. Most items originally listed here are now **implemented** — see [ARCHITECTURE.md](./ARCHITECTURE.md) for the live system.

## Completed (removed from active deferral)

| Category | Status |
|----------|--------|
| Browser LiveKit test calls + Test Agent modal | **Done** |
| Render API + Render Python agent-worker | **Done** (`render.yaml`) |
| LiveKit Egress → Cloudflare R2 browser recordings | **Done** |
| Transcripts, costs, latency metrics + BullMQ/fallback | **Done** |
| Redis safe mode + Upstash recovery | **Done** |
| R2 presigned playback, CORS, WaveSurfer | **Verified** |
| Agent CRUD, versioning, publish, analytics, settings | **Done** |
| Barge-in, graceful end, worker telemetry | **Done** |

## Still deferred

| Category | Guide section |
|----------|---------------|
| Twilio/PSTN + LiveKit SIP production routing | §1 below |
| Twilio webhooks + Twilio recording → R2 | §1 below |

---

## Source trace (historical)

The playbook originally collapsed external work into three categories. **Current status:**

| Category | Status |
|----------|--------|
| Twilio/PSTN integration | **Deferred** |
| Cloudflare R2 + browser recording playback | **Complete** |
| Render agent-worker deployment | **Complete** |

## Overall recommended order (remaining work)

1. Twilio/PSTN and LiveKit SIP production routing.
2. Twilio recording ingestion into the verified R2 bucket.

Worker deployment and R2 storage are production-ready for browser preview traffic.

---

# 1) Twilio/PSTN + LiveKit SIP + Call Lifecycle

## Feature Name

Twilio/PSTN telephony with LiveKit SIP routing, inbound/outbound call handling, Twilio webhook processing, TwiML security, and production call lifecycle verification.

## Why It Was Deferred

The playbook marks this as deferred because it depends on external telephony accounts, SIP trunk configuration, verified phone numbers, real callback signatures, and production cost/latency validation. Those checks cannot be completed safely as part of the current non-Twilio / browser-only completion pass.

## Current System State

- The app already supports browser-based LiveKit test calls.
- The API already has call, transcript, analytics, and internal worker plumbing for the current scope.
- The phone number and LiveKit side of the product exist in the UI and backend structure, but real PSTN routing is not production-verified.
- Non-Twilio Rime preview playback is already in place for the current scope.

## What Is Already Partially Implemented

- LiveKit browser test-call flow exists.
- Call rows, transcripts, cost calculations, and analytics work for the current non-PSTN scope.
- Phone number assignment UI and LiveKit dispatch concepts already exist in the product surface.
- Worker-facing internal API auth exists through `WORKER_SECRET`.

## Exact Missing Components

| Missing component | What it must do |
|---|---|
| Twilio account and numbers | Own a real number, trunk, and verified credentials for live PSTN traffic |
| SIP trunking | Connect Twilio to LiveKit SIP routing for inbound and outbound calls |
| Twilio webhook handlers | Process status callbacks, recordings, failures, and signature checks |
| TwiML outbound endpoint | Mint secure short-lived tokens and return validated TwiML |
| Production call lifecycle | Persist inbound, outbound, answered, failed, abandoned, completed, and recording events end-to-end |
| Production analytics coverage | Measure real outbound/inbound PSTN traffic separately from browser test calls |
| Security validation | Verify Twilio signatures, token expiry, domain validation, and replay resistance |
| Operational QA | Confirm live voice quality, latency, retries, and failure recovery on real calls |

## Required Services and Accounts

| Service | Purpose |
|---|---|
| Twilio | PSTN numbers, SIP trunk, call routing, call/recording callbacks |
| LiveKit Cloud | SIP bridge, agent dispatch, call room orchestration |
| Upstash Redis | Token cache, BullMQ queues, short-lived TwiML state, retries |
| Render or equivalent app hosting | API and worker runtime for live production traffic |
| Domain/DNS provider | Public callback URLs, TLS, and stable webhook endpoints |

## Required Environment Variables

The current repo already uses these core variables for the adjacent systems:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `REDIS_URL`
- `WORKER_SECRET`
- `NEXT_PUBLIC_API_URL`
- `FRONTEND_URL`

Phase 9 Twilio work should add or confirm the following variables:

| Env var | Purpose |
|---|---|
| `TWILIO_ACCOUNT_SID` | Twilio API account identification |
| `TWILIO_AUTH_TOKEN` | Twilio signature verification and API auth |
| `TWILIO_PHONE_NUMBER` | Primary production number used for inbound/outbound routing |
| `TWILIO_SIP_TRUNK_SID` | SIP trunk reference if the implementation stores the trunk directly |
| `TWILIO_RECORDING_STATUS_CALLBACK_URL` | Recording callback destination |
| `TWILIO_STATUS_CALLBACK_URL` | General call status callback destination |
| `TWIML_SECRET` | Short-lived signed token creation for outbound TwiML flows |
| `PUBLIC_APP_URL` or `FRONTEND_URL` | URL used in callback links and redirects |
| `AWAAZ_API_URL` | Worker -> API base URL if different in production |

## Required Frontend Work

| Area | Required work |
|---|---|
| Phone numbers UI | Show real Twilio numbers, trunk/dispatch state, and assignment status |
| Call history | Distinguish browser test calls from real PSTN inbound/outbound calls |
| Call detail page | Show Twilio recording state, PSTN status transitions, and audio availability |
| Admin surfaces | Add visible indicators for live PSTN readiness, Twilio callback health, and dispatch-rule sync |
| Error UX | Show explicit states for signature failures, missing callbacks, no-answer, abandoned, and failed calls |

## Required Backend / API Work

| Area | Required work |
|---|---|
| `POST /webhooks/twilio` | Verify signatures, parse event types, and update call state transitions |
| `POST /api/v1/calls/outbound` | Start outbound PSTN calls, mint short-lived TwiML tokens, and persist call records |
| `GET /twiml/outbound` | Validate token, TTL, and domain before returning TwiML |
| SIP routing | Ensure LiveKit SIP dispatch rules point real numbers into the correct room prefix |
| Recording callbacks | Capture recording-completed events and enqueue post-processing jobs |
| Call state machine | Persist initiated, answered, in-progress, failed, no-answer, completed, abandoned, and recording states |
| Security | Reject invalid signatures, expired tokens, bad domain values, and replay attempts |

## Required Database / Schema Work

Likely schema additions or validation work:

| Entity | Needed fields or behavior |
|---|---|
| `Call` | Twilio SID, direction, status transitions, startedAt, endedAt, durationSeconds, recordingUrl, telephony cost breakdown, provider metadata |
| `PhoneNumber` | Twilio number identity, assignment target, LiveKit dispatch rule id, routing status |
| `CallEvent` or equivalent | Optional event log for webhook transitions, retries, and callback diagnostics |
| `Transcript` | Confirm call linkage for PSTN calls and event ordering |
| Analytics queries | Exclude browser test rows when reporting real PSTN metrics |

## Required Worker / Agent Changes

| Area | Required work |
|---|---|
| PSTN session handling | Accept LiveKit SIP-mediated jobs for real phone calls |
| Event emission | Emit call lifecycle events from speech and call state changes |
| Retry handling | Recover from transient API/Redis/LiveKit failures without dropping the call |
| Telemetry | Log call SID, room id, provider, and state transitions in a structured way |

## Required Infrastructure / Deployment Changes

| Area | Required work |
|---|---|
| Public callbacks | Stable HTTPS callback URLs for Twilio and LiveKit |
| TLS | Valid certs for webhook endpoints and any TwiML endpoints |
| Firewall / egress | Allow API and worker to reach Twilio and LiveKit services |
| Secrets management | Store Twilio secrets outside the repository and rotate them safely |
| Release process | Ensure callback routes are deployed before number cutover |

## Required Third-Party Integrations

| Integration | Purpose |
|---|---|
| Twilio voice + SIP | Real PSTN traffic and recording callbacks |
| LiveKit SIP | Bridge PSTN into the agent room architecture |
| Redis / BullMQ | Queue post-call work and cache short-lived tokens |
| Monitoring / alerting | Alert on callback failures, trunk failures, and call drops |

## Required Testing / Verification Steps

| Test | What must pass |
|---|---|
| Webhook signature test | Invalid or missing signatures are rejected |
| Inbound PSTN test | A real phone call reaches the agent through Twilio and LiveKit SIP |
| Outbound PSTN test | The app initiates a call out to a phone number and connects correctly |
| Call lifecycle test | initiated -> answered -> completed / failed / abandoned states persist correctly |
| Recording callback test | recording-completed triggers the correct downstream job |
| TwiML security test | Invalid or expired tokens return 404 and bad domains return 400 |
| Analytics test | Real PSTN rows appear in production reporting while browser test rows remain excluded |
| Latency test | Measure real call response latency under production load |

## Expected User Flow After Implementation

1. Admin registers a real Twilio phone number.
2. Admin assigns the number to an agent and syncs the LiveKit dispatch rule.
3. An inbound caller dials the number.
4. Twilio routes the call to LiveKit SIP.
5. The worker joins the room, the agent speaks, and the call state updates in the app.
6. If recording is enabled, the recording callback fires and the media pipeline stores the call audio.
7. The call appears in call history, analytics, and the call detail page with playable media.

## Known Risks / Challenges

| Risk | Why it matters |
|---|---|
| Twilio signature mistakes | Causes false webhook rejects and broken call state transitions |
| Token expiry / replay | Outbound TwiML must be short-lived and resistant to replay |
| SIP misrouting | Wrong room prefix or trunk config breaks inbound or outbound call delivery |
| Callback ordering | Webhooks may arrive out of order and require idempotent updates |
| Production latency | PSTN adds real network delays and must be tested under load |
| Rate limits / retries | Twilio and LiveKit failures must not crash the active call path |
| Analytics contamination | Browser test rows must stay excluded from PSTN metrics |

## Recommended Implementation Order

1. Provision Twilio number, auth token, and SIP trunk.
2. Implement and verify Twilio webhook signature handling.
3. Implement outbound TwiML token minting and validation.
4. Wire inbound and outbound call state persistence.
5. Sync LiveKit SIP dispatch rules for the assigned phone number.
6. Add recording callbacks and downstream job processing.
7. Verify live PSTN QA, analytics, and operational observability.

## Estimated Complexity

High.

## Local Development Steps

1. Keep the API and browser app running locally.
2. Use browser LiveKit test calls as the local substitute for PSTN while Twilio is not yet live.
3. Add Twilio webhook handlers behind feature flags or stub URLs.
4. Use request replay fixtures for callback payloads.
5. Test signature verification and state transitions with recorded webhook samples.

## Production Deployment Steps

1. Deploy API endpoints and confirm HTTPS callback URLs.
2. Configure Twilio webhook URLs and SIP trunk settings.
3. Add the real Twilio environment variables to production secrets.
4. Cut over the real number only after inbound and outbound test calls pass.
5. Monitor callback failures, call drops, and latency.
6. Confirm analytics excludes browser test calls and includes only production PSTN traffic.

## Architecture Notes

- Twilio should never be the source of truth for business state; the API database should own the canonical call record.
- Webhooks must be idempotent because Twilio and LiveKit can retry events.
- The outbound TwiML token should be short-lived, single-use, and scoped to the exact SIP target.
- LiveKit dispatch rules should be treated as operational state and should be reconciled if they drift.

## Verification Checklist

- [ ] Twilio account, phone number, and SIP trunk are provisioned.
- [ ] Real inbound PSTN calls reach the agent.
- [ ] Real outbound PSTN calls connect successfully.
- [ ] Twilio signature verification rejects forged callbacks.
- [ ] Recording callbacks update call state and enqueue post-processing.
- [ ] Call history shows real PSTN rows correctly.
- [ ] Analytics exclude browser test calls and include production PSTN rows.

---

# 2) Cloudflare R2 Media Pipeline, Recordings, and Voice Preview Storage

## Feature Name

Cloudflare R2-backed media pipeline for recordings, presigned playback, waveform-enabled call detail playback, and stored voice preview assets.

## Why It Was Deferred

This was originally deferred because playback and recording verification required real R2 credentials, bucket configuration, CORS, and uploaded media objects. Those storage prerequisites are now complete. Remaining deferred work in this area is limited to Twilio/PSTN recording ingestion into R2, real call recording lifecycle, and optional stored preview generation if the product chooses to persist preview assets.

## Current System State

- The API already has an S3-compatible storage service abstraction.
- The call detail UI already expects a recording URL and can render a waveform player when playable audio exists.
- Non-R2 voice preview playback already works by generating audio directly through the backend.
- The browser test flow can create calls even when no recording is present.
- Cloudflare R2 bucket `awaaz-recordings`, Render env vars, upload/download, HeadObject, presigned HEAD/GET/range, CORS, bytes-matched WAV retrieval, and WaveSurfer readiness are verified.

## What Is Already Partially Implemented

- `StorageService` exists and is wired to R2-compatible configuration.
- The UI has a call waveform player and recording area.
- Voice preview playback exists through backend-generated Rime audio.
- `recordingUrl` is already part of the call detail display contract.
- `GET /api/v1/calls/:id/recording` is compatible with backend-minted presigned R2 URLs when `Call.recordingUrl` contains a valid object key.

## Exact Missing Components

| Missing component | What it must do |
|---|---|
| Twilio/PSTN recording ingest | Store real PSTN call recordings in verified R2 storage with deterministic keys |
| Real recording lifecycle | Download Twilio recording media, upload it to R2, update `Call.recordingUrl`, and expose playback in call detail |
| Voice preview storage | Persist preview audio objects if storage-backed previews are enabled; the R2 storage path itself is verified |
| Real recording waveform QA | Verify waveform rendering and seeking on actual Twilio-ingested recordings |
| Retention lifecycle | Manage object retention, deletion, and lifecycle policies |
| Fallback UX | Gracefully show unavailable media if the object is missing or expired |

## Required Services and Accounts

| Service | Purpose |
|---|---|
| Cloudflare R2 | Object storage for recordings and stored voice previews |
| Cloudflare dashboard / bucket management | Bucket policy, CORS, lifecycle, and access key control |
| Twilio | Source recordings for PSTN calls if recording ingest is enabled |
| Browser / CDN access | Playback over HTTP(S) or presigned URLs |
| Render or equivalent API hosting | To serve signed URL generation and recording metadata |

## Required Environment Variables

The repo already contains these R2-related variables:

- `CLOUDFLARE_R2_ACCOUNT_ID`
- `CLOUDFLARE_R2_ACCESS_KEY`
- `CLOUDFLARE_R2_SECRET_KEY`
- `CLOUDFLARE_R2_BUCKET_NAME`

The implementation may also need the following supporting values:

| Env var | Purpose |
|---|---|
| `R2_ACCESS_KEY` / `R2_SECRET_KEY` | Optional alias compatibility if older config paths are kept |
| `R2_BUCKET_NAME` | Optional alias compatibility |
| `PUBLIC_ASSET_BASE_URL` | If you serve any stored media through a public CDN or proxy |
| `FRONTEND_URL` | If preview or recording links depend on frontend-origin checks |

## Required Frontend Work

| Area | Required work |
|---|---|
| Voice selector | Show whether preview audio is stored or generated live |
| Agent editor | Support preview playback from R2-backed media when enabled |
| Call detail page | Render audio player and waveform only when a valid playable recording URL exists |
| Empty states | Show clear `Recording unavailable` or `Preview unavailable` messaging |
| Download actions | Optional admin actions for retrieving recordings or preview assets |

## Required Backend / API Work

| Area | Required work |
|---|---|
| Upload flow | Store generated preview audio or call recordings as objects in R2 |
| Presigned URL flow | Generate short-lived URLs for playback and download |
| Recording metadata | Track object key, mime type, duration, and provenance |
| Retrieval flow | Return a clean playback response for call detail and voice preview screens |
| Lifecycle flow | Delete or archive media when retention rules require it |
| CORS / content headers | Return audio-friendly headers for browser playback |

## Required Database / Schema Work

| Entity | Needed fields or behavior |
|---|---|
| `Call` | `recordingUrl`, `recordingObjectKey`, `recordingMimeType`, `recordingStatus`, `recordingDurationSeconds` |
| `Voice` | Optional preview object key, preview URL, preview mime type, preview status |
| `CallMedia` or equivalent | Optional normalized table for media provenance, storage provider, object key, checksum, and retention state |
| `Retention policy` | Optional fields or config to control how long recordings live in R2 |

## Required Worker / Agent Changes

| Area | Required work |
|---|---|
| Recording worker | Download source media if needed and upload it to R2 |
| Preview worker | Generate preview assets and store them when storage-backed previews are enabled |
| Waveform support | Provide enough metadata or audio consistency to build accurate waveforms |
| Error handling | Handle missing objects, expired URLs, and storage failures without breaking the call detail page |

## Required Infrastructure / Deployment Changes

| Area | Required work |
|---|---|
| Bucket config | Create the R2 bucket and configure object access |
| CORS | Allow the frontend to request and play audio objects safely |
| Signed URL expiry | Choose TTLs that are long enough for playback but short enough for security |
| Lifecycle / retention | Decide whether to keep recordings indefinitely or expire them after a policy window |
| Security | Protect direct object writes and ensure only the API can mint usable presigned URLs |

## Required Third-Party Integrations

| Integration | Purpose |
|---|---|
| Cloudflare R2 | Storage for recordings and preview assets |
| Twilio | Optional source of production recording media |
| Browser audio stack | Playback and waveform rendering |
| CDN / proxy layer | Optional if you want public media caching |

## Required Testing / Verification Steps

| Test | What must pass |
|---|---|
| Upload test | Store a sample object in R2 and confirm it exists |
| Presigned URL test | Fetch the object through a signed URL and confirm the content matches |
| Browser playback test | Audio plays in the frontend without CORS or MIME issues |
| Waveform test | The waveform component renders and seeks correctly |
| Recording lifecycle test | A PSTN call produces a recording object, and the UI can play it |
| Preview storage test | Stored voice preview objects are discoverable and playable |
| Retention test | Expired or deleted objects are handled gracefully |

## Expected User Flow After Implementation

1. A call completes or a voice preview is generated.
2. The backend uploads the media to R2.
3. The API issues a playable presigned URL or a safe proxy URL.
4. The frontend shows an audio player and waveform.
5. The user can scrub the waveform, replay the call, or inspect the preview.
6. When retention expires, the UI falls back to an unavailable state instead of breaking.

## Known Risks / Challenges

| Risk | Why it matters |
|---|---|
| Bad object keys | Breaks call playback and makes media hard to reconcile |
| CORS mistakes | Causes playback failures in the browser |
| Expired presigned URLs | Can look like missing media even when the object exists |
| Storage drift | If object and DB state diverge, playback becomes unreliable |
| Retention policy confusion | Media may disappear unexpectedly if lifecycle rules are too aggressive |
| Large media files | Recording size and bandwidth can increase costs and delay playback |

## Recommended Implementation Order

1. Wire Twilio/PSTN call recordings into the recording lifecycle.
2. Upload real call recordings into the verified R2 bucket and update `Call.recordingUrl`.
3. Wire voice preview storage if stored previews are still desired.
4. Verify call-detail waveform playback with an actual Twilio-ingested recording.
5. Add retention rules and operational reporting.

## Estimated Complexity

Medium to High.

## Local Development Steps

1. Use the existing local `StorageService` configuration path and a safe dev bucket or mocked R2 target.
2. Upload a small text or audio file and confirm the presigned URL returns the same content.
3. Use a synthetic sample recording to validate the waveform player.
4. Test the frontend empty state by removing the media URL.
5. Verify that storage errors do not crash the call detail page.

## Production Deployment Steps

1. Keep the verified R2 bucket `awaaz-recordings` private and preserve the CORS/range configuration.
2. Ensure production API deployments keep the configured R2 env vars.
3. Deploy Twilio/PSTN recording ingestion when that Phase 9 work starts.
4. Verify the first real PSTN recording object can be played from the frontend through `GET /api/v1/calls/:id/recording`.
5. Add retention/lifecycle policies and monitor storage growth.

## Architecture Notes

- Media objects should be treated as immutable once uploaded.
- The database should store the object key and playback metadata, not the audio payload itself.
- Presigned URLs should be generated only by the backend, never by the browser.
- A call or preview should always have a graceful no-media fallback in the UI.
- If waveform generation is asynchronous, the UI should distinguish `media exists` from `waveform ready`.

## Verification Checklist

- [x] R2 bucket `awaaz-recordings` and credentials/env are provisioned.
- [x] R2 upload/download smoke test passes.
- [x] HeadObject passes.
- [x] Presigned HEAD returns `200`.
- [x] Presigned full GET returns `200`.
- [x] Presigned range GET returns `206`.
- [x] Bytes match uploaded WAV.
- [x] Browser CORS, `Accept-Ranges`, and `Content-Range` headers are correct.
- [x] WaveSurfer browser playback readiness is verified for a valid presigned R2 audio URL.
- [x] Backend endpoint `GET /api/v1/calls/:id/recording` is compatible with backend-minted presigned URLs.
- [ ] Twilio/PSTN recording ingestion uploads real call recordings into R2.
- [ ] Real call recording lifecycle updates `Call.recordingUrl` and plays in call detail.
- [ ] Voice preview objects are playable if stored previews are enabled.
- [ ] Missing or expired objects fall back to a safe empty state.
- [ ] Retention behavior is documented and tested.

---

# 3) Render `agent-worker` Cloud Deployment — ✅ COMPLETE

> **Status:** Implemented. See [DEPLOYMENT.md §4](./DEPLOYMENT.md), [render.yaml](./render.yaml), [apps/agent-worker/README.md](./apps/agent-worker/README.md). The section below is retained for historical handoff context only.

## Feature Name

Production deployment of the Python `agent-worker` on Render, including LiveKit connectivity, monitoring, and operational recovery.

## Current System State (implemented)

- Render background worker `awaaz-agent-worker` in `render.yaml`
- Worker connects to LiveKit; browser Test Agent exercises production path
- Internal API via `AWAAZ_API_URL` + `WORKER_SECRET`; **no Redis**
- Barge-in, graceful end, speech/latency telemetry implemented in `agent.py`

## Verification Checklist

- [x] Cloud worker deployed on Render
- [x] LiveKit dashboard shows worker connected (verify per environment)
- [x] Browser test calls work end-to-end
- [x] Documented in ARCHITECTURE.md + DEPLOYMENT.md

---

# Appendix: Compact Deferred Scope Map

| Source playbook area | Status | Guide section |
|---|---|---|
| Phase 3.8 | **Deferred** | Twilio/PSTN + LiveKit SIP |
| Phase 3.9 | **Complete** | DEPLOYMENT.md §4, ARCHITECTURE.md |
| Phase 3.10 | **Deferred** | Twilio/PSTN + LiveKit SIP |
| Phase 4.3 / 8.6 | **Deferred** (SIP routing) | Twilio/PSTN + LiveKit SIP |
| Phase 4.4 / 6.4 | **Complete** (R2 browser recordings) | ARCHITECTURE.md |
| Phase 5.1 | **Deferred** | Twilio/PSTN + LiveKit SIP |
| Phase 5.2 | **Deferred** | Twilio/PSTN + LiveKit SIP |
| Phase 5.5 | **Deferred** (Twilio ingest); R2 path verified | Twilio/PSTN recording lifecycle |
| Phase 5.8 | **Complete** | ARCHITECTURE.md |
| Phase 6.7 / 7.2 | **Deferred** | Twilio/PSTN + LiveKit SIP |
| Phase 6.8 | **Complete** (browser R2 playback) | ARCHITECTURE.md |
| Phase 8.1 | **Deferred** | Twilio/PSTN recording lifecycle |
| Phase 8.2 | **Deferred** | Twilio/PSTN + LiveKit SIP |
| Phase 8.3 / final checklist | **Complete** (worker on Render) | DEPLOYMENT.md §4 |
| Phase 8.4 | PSTN latency benchmark | Twilio/PSTN + LiveKit SIP |
