# agent-worker

Python LiveKit voice agent for Awaaz browser test calls and (future) SIP sessions.

**Pipeline:** Deepgram STT → Groq LLM → Rime TTS
**Features:** barge-in/interruption, graceful `end_call`, speech event + latency telemetry to Nest internal API
**Redis:** not used — all persistence via HTTP to the API

Full architecture: [../../ARCHITECTURE.md](../../ARCHITECTURE.md)

## Local run

Loads repo-root `.env` automatically (`main.py`).

```bash
cd apps/agent-worker
pip install -r requirements.txt
python main.py start
```

Requires local or deployed API reachable at `AWAAZ_API_URL` with matching `WORKER_SECRET`.

## Render deployment

| Setting | Value |
|---------|--------|
| Type | Background Worker |
| Name | `awaaz-agent-worker` |
| Root | `apps/agent-worker` |
| Python | 3.11.9 (`runtime.txt`; set `PYTHON_VERSION=3.11.9` if needed) |
| Build | `pip install -r requirements.txt` |
| Start | `python main.py start` |

### Required environment

| Variable | Purpose |
|----------|---------|
| `LIVEKIT_URL` | LiveKit project (same as API) |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | Auth |
| `LIVEKIT_AGENT_NAME` | Must match API test-call dispatch |
| `AWAAZ_API_URL` | Render API base URL |
| `WORKER_SECRET` | Header `x-worker-secret` |
| `DEEPGRAM_API_KEY` | STT |
| `GROQ_API_KEY` | LLM |
| `RIME_API_KEY` | TTS |

Do **not** configure `REDIS_URL` on this service.

### Verification

1. LiveKit Cloud → Agents → status **Connected**
2. Dashboard → Test Agent → two-way audio
3. Logs: config load, `USER_SPEECH` / `AGENT_SPEECH` events, clean shutdown

## Internal API calls

Defined in `api_client.py`:

- `GET /internal/agents/:id/config` — live published version
- `POST /internal/calls/start`
- `POST /internal/calls/:id/events`
- `POST /internal/calls/:id/end`

## Optional tuning

See `.env.example` worker section: VAD, interrupt thresholds, final playback drain, Deepgram/Rime chunk settings.

Historical phase notes: [../../Awaaz_V1_Agent_Execution_Playbook.md](../../Awaaz_V1_Agent_Execution_Playbook.md) §3.
