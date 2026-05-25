from collections.abc import Awaitable, Callable


async def end_call(
    request_end: Callable[[str], Awaitable[bool]],
) -> str:
    await request_end("goal_completed")
    return "Thanks for calling. Goodbye."
