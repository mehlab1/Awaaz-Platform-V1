from collections.abc import Awaitable, Callable


async def end_call(
    request_end: Callable[[str], Awaitable[None]],
) -> str:
    await request_end("assistant requested end_call tool")
    return "Thanks for calling. Goodbye."
