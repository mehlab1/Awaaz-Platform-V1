from livekit.agents import JobContext


async def end_call(ctx: JobContext) -> str:
    await ctx.room.disconnect()
    ctx.shutdown("call ended by assistant")
    return "The call has been ended."
