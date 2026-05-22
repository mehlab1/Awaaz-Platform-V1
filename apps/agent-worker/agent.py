import asyncio
import json
import logging
import os
import time
from collections.abc import AsyncIterable, Mapping

from livekit.agents import AutoSubscribe, JobContext, llm
from livekit.agents.llm import ChatContext, LLMStream
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

        rime = RimeTTS(
            voice_id=required_string(config, "voiceId", "mist-default"),
            model_id=required_string(config, "voiceModelId", "mistv2"),
            language=required_string(config, "voiceLang", "eng"),
        )
        timing = PipelineTiming()
        assistant = create_assistant(config, rime, AwaazTools(ctx), timing)
        register_events(assistant, api, call_id)

        async def shutdown() -> None:
            if call_id:
                await api.end_call(call_id, {"reason": "room shutdown"})
            await rime.aclose()
            await api.aclose()

        ctx.add_shutdown_callback(shutdown)
        participant = await ctx.wait_for_participant()
        assistant.start(ctx.room, participant)
        register_timing_events(assistant, timing)

        first_message = string_value(config, "firstMessage")
        if first_message:
            await assistant.say(first_message, allow_interruptions=True)


def create_assistant(
    config: Mapping[str, object],
    rime: RimeTTS,
    tools: AwaazTools,
    timing: "PipelineTiming",
) -> VoiceAssistant:
    chat_ctx = ChatContext()
    chat_ctx.append(text=string_value(config, "systemPrompt", ""), role="system")
    return VoiceAssistant(
        vad=silero.VAD.load(
            min_speech_duration=float_env("LIVEKIT_VAD_MIN_SPEECH_SECONDS", 0.04),
            min_silence_duration=float_env("LIVEKIT_VAD_MIN_SILENCE_SECONDS", 0.15),
            padding_duration=float_env("LIVEKIT_VAD_PADDING_SECONDS", 0.05),
            activation_threshold=float_env("LIVEKIT_VAD_ACTIVATION_THRESHOLD", 0.45),
        ),
        stt=deepgram.STT(
            model=os.getenv("DEEPGRAM_MODEL", "nova-2-conversationalai"),
            language=os.getenv("DEEPGRAM_LANGUAGE", "en-US"),
            interim_results=True,
            no_delay=True,
            endpointing_ms=int_env("DEEPGRAM_ENDPOINTING_MS", 25),
        ),
        llm=openai.LLM.with_groq(
            model=required_string(config, "model", "llama-3.1-8b-instant"),
        ),
        tts=rime,
        chat_ctx=chat_ctx,
        fnc_ctx=tools,
        allow_interruptions=True,
        interrupt_speech_duration=float_env(
            "LIVEKIT_INTERRUPT_SPEECH_SECONDS",
            0.25,
        ),
        interrupt_min_words=0,
        preemptive_synthesis=True,
        before_llm_cb=timing.before_llm,
        before_tts_cb=timing.before_tts,
    )


class PipelineTiming:
    def __init__(self) -> None:
        self.turn_id = 0
        self.user_started_at: float | None = None
        self.user_stopped_at: float | None = None
        self.final_transcript_at: float | None = None
        self.llm_started_at: float | None = None
        self.first_llm_token_at: float | None = None
        self.llm_finished_at: float | None = None
        self.tts_text_started_at: float | None = None
        self.playback_started_at: float | None = None

    def mark_user_started(self) -> None:
        self.turn_id += 1
        self.user_started_at = time.monotonic()
        self.user_stopped_at = None
        self.final_transcript_at = None
        self.llm_started_at = None
        self.first_llm_token_at = None
        self.llm_finished_at = None
        self.tts_text_started_at = None
        self.playback_started_at = None
        logger.info("voice_turn_started turn=%s", self.turn_id)

    def mark_user_stopped(self) -> None:
        self.user_stopped_at = time.monotonic()
        logger.info(
            "voice_user_stopped turn=%s speech_ms=%s",
            self.turn_id,
            elapsed_ms(self.user_started_at, self.user_stopped_at),
        )

    def mark_final_transcript(self, text: str) -> None:
        self.final_transcript_at = time.monotonic()
        logger.info(
            "voice_stt_final turn=%s chars=%s since_user_start_ms=%s since_user_stop_ms=%s text=%r",
            self.turn_id,
            len(text),
            elapsed_ms(self.user_started_at, self.final_transcript_at),
            elapsed_ms(self.user_stopped_at, self.final_transcript_at),
            text[:120],
        )

    def before_llm(
        self,
        assistant: VoiceAssistant,
        chat_ctx: ChatContext,
    ) -> LLMStream:
        self.llm_started_at = time.monotonic()
        user_text = ""
        if chat_ctx.messages:
            user_text = message_text(chat_ctx.messages[-1])
        logger.info(
            "voice_llm_start turn=%s user_chars=%s since_final_ms=%s since_user_stop_ms=%s",
            self.turn_id,
            len(user_text),
            elapsed_ms(self.final_transcript_at, self.llm_started_at),
            elapsed_ms(self.user_stopped_at, self.llm_started_at),
        )
        stream = assistant.llm.chat(
            chat_ctx=chat_ctx,
            fnc_ctx=assistant.fnc_ctx,
            temperature=0.3,
            parallel_tool_calls=False,
        )
        return TimedLLMStream(stream, self)

    def before_tts(
        self,
        _assistant: VoiceAssistant,
        text: str | AsyncIterable[str],
    ) -> str | AsyncIterable[str]:
        if isinstance(text, str):
            self.mark_tts_text_started(text)
            self.mark_tts_text_finished(len(text))
            return text
        return self._timed_tts_text(text)

    async def _timed_tts_text(
        self,
        source: AsyncIterable[str],
    ) -> AsyncIterable[str]:
        chars = 0
        async for segment in source:
            if segment and self.tts_text_started_at is None:
                self.mark_tts_text_started(segment)
            chars += len(segment)
            yield segment
        self.mark_tts_text_finished(chars)

    def mark_first_llm_token(self) -> None:
        self.first_llm_token_at = time.monotonic()
        logger.info(
            "voice_llm_first_token turn=%s llm_first_token_ms=%s since_user_stop_ms=%s",
            self.turn_id,
            elapsed_ms(self.llm_started_at, self.first_llm_token_at),
            elapsed_ms(self.user_stopped_at, self.first_llm_token_at),
        )

    def mark_llm_finished(self) -> None:
        self.llm_finished_at = time.monotonic()
        logger.info(
            "voice_llm_done turn=%s llm_total_ms=%s since_user_stop_ms=%s",
            self.turn_id,
            elapsed_ms(self.llm_started_at, self.llm_finished_at),
            elapsed_ms(self.user_stopped_at, self.llm_finished_at),
        )

    def mark_tts_text_started(self, text: str) -> None:
        self.tts_text_started_at = time.monotonic()
        logger.info(
            "voice_tts_text_start turn=%s since_llm_start_ms=%s since_first_llm_token_ms=%s preview=%r",
            self.turn_id,
            elapsed_ms(self.llm_started_at, self.tts_text_started_at),
            elapsed_ms(self.first_llm_token_at, self.tts_text_started_at),
            text[:80],
        )

    def mark_tts_text_finished(self, chars: int) -> None:
        logger.info(
            "voice_tts_text_done turn=%s chars=%s since_tts_text_start_ms=%s",
            self.turn_id,
            chars,
            elapsed_ms(self.tts_text_started_at, time.monotonic()),
        )

    def mark_playback_started(self) -> None:
        self.playback_started_at = time.monotonic()
        logger.info(
            "voice_playback_started turn=%s total_from_user_stop_ms=%s total_from_final_ms=%s since_llm_start_ms=%s",
            self.turn_id,
            elapsed_ms(self.user_stopped_at, self.playback_started_at),
            elapsed_ms(self.final_transcript_at, self.playback_started_at),
            elapsed_ms(self.llm_started_at, self.playback_started_at),
        )

    def mark_playback_stopped(self) -> None:
        logger.info(
            "voice_playback_stopped turn=%s playback_ms=%s total_turn_ms=%s",
            self.turn_id,
            elapsed_ms(self.playback_started_at, time.monotonic()),
            elapsed_ms(self.user_started_at, time.monotonic()),
        )


class TimedLLMStream(LLMStream):
    def __init__(self, inner: LLMStream, timing: PipelineTiming) -> None:
        super().__init__(chat_ctx=inner.chat_ctx, fnc_ctx=inner.fnc_ctx)
        self._inner = inner
        self._timing = timing
        self._saw_first_token = False
        self._finished = False

    @property
    def function_calls(self):
        return self._inner.function_calls

    async def aclose(self) -> None:
        await self._inner.aclose()
        await super().aclose()

    async def __anext__(self):
        try:
            chunk = await self._inner.__anext__()
        except StopAsyncIteration:
            if not self._finished:
                self._finished = True
                self._timing.mark_llm_finished()
            raise

        content = chunk.choices[0].delta.content if chunk.choices else None
        if content and not self._saw_first_token:
            self._saw_first_token = True
            self._timing.mark_first_llm_token()
        return chunk


def register_timing_events(
    assistant: VoiceAssistant,
    timing: PipelineTiming,
) -> None:
    assistant.on("user_started_speaking", lambda: timing.mark_user_started())
    assistant.on("user_stopped_speaking", lambda: timing.mark_user_stopped())
    assistant.on("agent_started_speaking", lambda: timing.mark_playback_started())
    assistant.on("agent_stopped_speaking", lambda *args: timing.mark_playback_stopped())

    human_input = getattr(assistant, "_human_input", None)
    if human_input is None:
        logger.warning("Voice timing could not attach to human input events")
        return

    def on_final_transcript(event: object) -> None:
        alternatives = getattr(event, "alternatives", [])
        text = alternatives[0].text if alternatives else ""
        timing.mark_final_transcript(text)

    human_input.on("final_transcript", on_final_transcript)


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
    payload: dict[str, object] = {
        "liveKitRoomId": await ctx.room.sid,
        "agentId": string_value(config, "agentId"),
        "organizationId": string_value(config, "organizationId"),
        "direction": string_value(room_metadata, "direction", "INBOUND"),
        "fromNumber": string_value(room_metadata, "fromNumber", ""),
        "toNumber": string_value(room_metadata, "toNumber", ""),
        "metadata": dict(room_metadata),
    }
    room_name = (
        string_value(room_metadata, "liveKitRoomName")
        or string_value(room_metadata, "roomName")
        or room_name_from_context(ctx)
    )
    if room_name:
        payload["liveKitRoomName"] = room_name
    return payload


def room_name_from_context(ctx: JobContext) -> str | None:
    room_name = getattr(ctx.room, "name", None)
    return room_name if isinstance(room_name, str) and room_name else None


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


def elapsed_ms(start: float | None, end: float | None) -> int | None:
    if start is None or end is None:
        return None
    return max(0, round((end - start) * 1000))


def int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid integer env %s=%r; using %s", name, raw, default)
        return default


def float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning("Invalid float env %s=%r; using %s", name, raw, default)
        return default
