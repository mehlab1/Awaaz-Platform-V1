import asyncio
import json
import logging
import time
from collections.abc import Mapping

from livekit.agents import AutoSubscribe, JobContext, llm
from livekit.agents.llm import ChatContext
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import deepgram, openai, silero

from api_client import AwaazAPIClient
from pipeline.tts import RimeTTS
from tools.end_call import end_call
from tools.transfer_to_human import transfer_to_human


logger = logging.getLogger(__name__)


class AwaazTools(llm.FunctionContext):
    def __init__(self, ctx: JobContext) -> None:
        self._ctx = ctx
        super().__init__()

    @llm.ai_callable(description="End the current call when the user is done.")
    async def end_call(self) -> str:
        return await end_call(self._ctx)

    @llm.ai_callable(description="Transfer the current call to a human team member.")
    async def transfer_to_human(self) -> str:
        return await transfer_to_human()


class AwaazAgent:
    @staticmethod
    async def entrypoint(ctx: JobContext) -> None:
        await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_ALL)

        room_metadata = parse_json_object(ctx.room.metadata)
        agent_id = string_value(room_metadata, "agentId")
        if not agent_id:
            raise ValueError("LiveKit room metadata must include agentId")

        api = AwaazAPIClient()
        config = await api.get_agent_config(agent_id)
        call = await api.start_call(
            await start_call_payload(ctx, config, room_metadata),
        )
        call_id = string_value(call, "id")

        rime = RimeTTS(voice_id=required_string(config, "voiceId", "mist-default"))
        assistant = create_assistant(config, rime, AwaazTools(ctx))
        register_events(assistant, api, call_id)

        async def shutdown() -> None:
            if call_id:
                await api.end_call(call_id, {"reason": "room shutdown"})
            await rime.aclose()
            await api.aclose()

        ctx.add_shutdown_callback(shutdown)
        participant = await ctx.wait_for_participant()
        assistant.start(ctx.room, participant)

        first_message = string_value(config, "firstMessage")
        if first_message:
            await assistant.say(first_message, allow_interruptions=True)


def create_assistant(
    config: Mapping[str, object],
    rime: RimeTTS,
    tools: AwaazTools,
) -> VoiceAssistant:
    chat_ctx = ChatContext()
    chat_ctx.append(text=string_value(config, "systemPrompt", ""), role="system")
    return VoiceAssistant(
        vad=silero.VAD.load(),
        stt=deepgram.STT(model="nova-3"),
        llm=openai.LLM.with_groq(
            model=required_string(config, "model", "llama-3.3-70b-versatile"),
        ),
        tts=rime,
        chat_ctx=chat_ctx,
        fnc_ctx=tools,
    )


def register_events(
    assistant: VoiceAssistant,
    api: AwaazAPIClient,
    call_id: str | None,
) -> None:
    if not call_id:
        logger.warning("Call ID missing; speech events will not be emitted")
        return

    def on_emit_done(task: asyncio.Task[None]) -> None:
        error = task.exception()
        if error is not None:
            logger.warning("Failed to emit speech event", exc_info=error)

    last_user_speech_at: float | None = None

    def emit(
        event_type: str,
        message: llm.ChatMessage,
        latency_ms: int | None = None,
    ) -> None:
        payload: dict[str, object] = {
            "eventType": event_type,
            "text": message_text(message),
        }
        if latency_ms is not None:
            payload["latencyMs"] = latency_ms

        task = asyncio.create_task(
            api.emit_event(
                call_id,
                payload,
            ),
        )
        task.add_done_callback(on_emit_done)

    def on_user_speech(message: llm.ChatMessage) -> None:
        nonlocal last_user_speech_at
        last_user_speech_at = time.monotonic()
        emit("USER_SPEECH", message)

    def on_agent_speech(message: llm.ChatMessage) -> None:
        latency_ms = None
        if last_user_speech_at is not None:
            latency_ms = max(0, round((time.monotonic() - last_user_speech_at) * 1000))
        emit("AGENT_SPEECH", message, latency_ms)

    assistant.on("user_speech_committed", on_user_speech)
    assistant.on("agent_speech_committed", on_agent_speech)


async def start_call_payload(
    ctx: JobContext,
    config: Mapping[str, object],
    room_metadata: Mapping[str, object],
) -> dict[str, object]:
    return {
        "liveKitRoomId": await ctx.room.sid,
        "agentId": string_value(config, "agentId"),
        "organizationId": string_value(config, "organizationId"),
        "direction": string_value(room_metadata, "direction", "INBOUND"),
        "fromNumber": string_value(room_metadata, "fromNumber", ""),
        "toNumber": string_value(room_metadata, "toNumber", ""),
        "metadata": dict(room_metadata),
    }


def parse_json_object(raw: str) -> dict[str, object]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("LiveKit room metadata is not valid JSON")
        return {}
    if not isinstance(parsed, dict):
        logger.warning("LiveKit room metadata must be a JSON object")
        return {}
    return {str(key): value for key, value in parsed.items()}


def string_value(
    source: Mapping[str, object],
    key: str,
    default: str | None = None,
) -> str | None:
    value = source.get(key)
    return value if isinstance(value, str) else default


def required_string(
    source: Mapping[str, object],
    key: str,
    default: str,
) -> str:
    value = source.get(key)
    return value if isinstance(value, str) else default


def message_text(message: llm.ChatMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(item for item in content if isinstance(item, str))
    return ""
