# Troubleshooting

Use this guide for the current non-Twilio deployment. Phase 9 covers Twilio/PSTN/R2 recording work.

## Worker Not Connecting

Symptoms:

- Browser test call does not connect to an agent.
- LiveKit room is created but no worker joins.
- Worker logs show LiveKit connection failures.

Checks:

- `LIVEKIT_URL` should use the expected protocol for the worker/SDK, commonly `wss://...` for agent connection.
- `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` must match the same LiveKit project used by the API.
- `LIVEKIT_AGENT_NAME` should match the dispatch/worker name expected by browser test calls.
- `AWAAZ_API_URL` should point to the deployed API for worker internal callbacks.
- `WORKER_SECRET` must match on API and worker.

Resolution:

- Align LiveKit env vars across API and worker.
- Restart the worker after env changes.
- Re-run a browser test call after Render/worker cold start.

## No Audio

Current scope:

- Browser test-call audio should work through LiveKit browser flow.
- Real PSTN audio through Twilio SIP is Phase 9.
- Recording playback and real waveform/audio playback from R2 are Phase 9.

Checks:

- Browser microphone permission is allowed.
- LiveKit credentials match between API and worker.
- For future Twilio/PSTN work, verify the Twilio SIP trunk origination URI and LiveKit SIP setup.

Resolution:

- For browser tests, refresh and rerun the test call after checking mic permission.
- For Twilio/PSTN no-audio issues, keep the fix in Phase 9 and verify SIP trunk configuration there.

## Transcript Missing

Symptoms:

- Call row exists, but transcript is empty or not assembled.
- Call detail shows fallback states.

Checks:

- `REDIS_URL` is configured and uses the correct TLS scheme for the provider.
- BullMQ queues can connect.
- LiveKit `room_finished` webhook is configured and signed correctly.
- Transcript worker logs do not show queue or API callback failures.

Resolution:

- Fix Redis TLS/config first.
- Verify LiveKit webhook auth.
- Re-run a browser test call.
- If the missing transcript depends on Twilio recording ingestion, defer to Phase 9.

## Analytics Empty

Symptoms:

- `/analytics` loads but shows zeroes.
- Call history has rows but analytics does not count them.

Checks:

- Analytics intentionally excludes test calls where `metadata.isTest` or `metadata.isTestCall` is true.
- Verify at least one real non-test call row exists for the organization.
- Confirm frontend sends the correct `x-organization-id`.
- Confirm API logs do not show auth/tenant errors.

Resolution:

- Use real non-test data for analytics verification.
- Do not count browser test calls as analytics production volume.
- If only test calls exist, zero analytics can be expected.

## Invalid Or Expired Token

Symptoms:

- Deployed web shows API error `Invalid or expired token`.
- API returns `401` before tenant checks.

Checks:

- Vercel `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and Render `CLERK_SECRET_KEY` are from the same Clerk app/environment.
- User has signed out and signed in again after env changes.
- Render was redeployed after Clerk env changes.

Resolution:

- Align Clerk keys.
- Redeploy Render and Vercel.
- Sign out, hard refresh, and sign in again.

## Internal Endpoint Returns 401 Or 403

Expected behavior:

- Missing `x-worker-secret`: `403`.
- Invalid `x-worker-secret`: `403`.
- Missing `WORKER_SECRET` server config: `500`.

Checks:

- Render has `WORKER_SECRET`.
- Worker sends `x-worker-secret`.
- API is redeployed with the latest `InternalAuthGuard`.

Resolution:

- Add/align `WORKER_SECRET`.
- Redeploy API and worker.

## Supabase P1001 Connection Error

Symptoms:

- Prisma reports `Can't reach database server`.
- TCP port test may pass, but Prisma still cannot connect.

Checks:

- `DATABASE_URL` should use Supabase transaction pooler for runtime.
- Include `sslmode=require`.
- Include `pgbouncer=true` for the transaction pooler URL.
- Include a conservative `connection_limit=1` on free-tier deployments.
- For `DATABASE_DIRECT_URL`, use a Supabase direct/session-pooler URL that works from the host network.

Resolution:

- Prefer Supabase pooler URLs on IPv4-only hosts.
- Redeploy after changing Render env vars.

## API Keys Look Wrong

Expected behavior:

- Full key appears only once at creation.
- Table shows prefix only.
- DB stores `keyHash` as a 64-character SHA-256 hex string.
- Plaintext full key is never stored.

Resolution:

- If plaintext appears anywhere after dialog close, treat it as a security bug.
- Revoke test keys after verification.

## Free-Tier Monitor Down

Symptoms:

- UptimeRobot reports the Render API down.
- First API request after idle is slow or times out.
- Web monitor passes but API-backed pages briefly show loading or auth/API errors.

Checks:

- API monitor URL should be `https://awaaz-api-nxae.onrender.com/health`.
- Monitor interval should be 10 minutes.
- Expected API health response is HTTP `200` with `status: "ok"`.
- Web monitor should target the deployed Vercel root URL, not an authenticated dashboard route.
- `/internal/worker/heartbeat` should not be used as a public monitor; without `x-worker-secret`, `403` is expected.

Resolution:

- Allow 2-3 minutes after a Render cold start or redeploy.
- Re-run `Invoke-RestMethod https://awaaz-api-nxae.onrender.com/health`.
- If `/health` fails after warm-up, check Render logs before changing app code.
- For demos, run one browser test call after idle to warm the current non-Twilio path.

## Known Backlog

`New Agent` create UI is intentionally disabled. The API exists, but dashboard creation is not wired yet.

## Phase 9 Deferrals

The following are not Phase 8 blockers:

- Twilio/PSTN inbound/outbound calls.
- Twilio webhook production flow.
- R2 recording upload/download.
- Voice preview playback.
- Real recording waveform/audio playback.
- Live PSTN worker hardening.
