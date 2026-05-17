import os

from livekit.agents import WorkerOptions, WorkerType, cli

from agent import AwaazAgent

_opts = dict(
    entrypoint_fnc=AwaazAgent.entrypoint,
    worker_type=WorkerType.ROOM,
)
_agent_nm = os.getenv("LIVEKIT_AGENT_NAME", "").strip()
if _agent_nm:
    _opts["agent_name"] = _agent_nm

if __name__ == "__main__":
    cli.run_app(WorkerOptions(**_opts))
