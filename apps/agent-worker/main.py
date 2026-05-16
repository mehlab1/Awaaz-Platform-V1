from livekit.agents import WorkerOptions, WorkerType, cli

from agent import AwaazAgent


cli.run_app(
    WorkerOptions(
        entrypoint_fnc=AwaazAgent.entrypoint,
        worker_type=WorkerType.ROOM,
    ),
)
