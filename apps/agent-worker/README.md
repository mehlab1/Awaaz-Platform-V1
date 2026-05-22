# agent-worker

Python LiveKit agent worker. Scaffolded in Phase 1; implemented in Phase 3 per `Awaaz_V1_Agent_Execution_Playbook.md`.

Local runs load the repo-root `.env` automatically from `main.py`, so `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_AGENT_NAME`, `AWAAZ_API_URL`, and `WORKER_SECRET` can stay in `../../.env`.

## Render

Render must build this service from `apps/agent-worker`, so the Python version pin needs to live beside this README as `runtime.txt`. This repo uses `python-3.11.9` here to avoid the Python 3.14 build path that forces `watchfiles` to compile from source.

If Render still ignores `runtime.txt`, set `PYTHON_VERSION=3.11.9` in the service environment or choose Python 3.11.9 in the Render dashboard for the worker service.
