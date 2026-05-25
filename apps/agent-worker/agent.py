import asyncio
import json
import logging
import os
import re
import time
from datetime import datetime, timezone
from collections.abc import AsyncIterable, Mapping
from dataclasses import dataclass

from livekit.agents import AutoSubscribe, JobContext, llm
from livekit.agents.llm import ChatContext, LLMStream
from livekit.agents.voice_assistant import VoiceAssistant
from livekit.plugins import deepgram, openai, silero

from api_client import AwaazAPIClient
from pipeline.tts import RimeTTS
from tools.end_call import end_call
from tools.transfer_to_human import transfer_to_human


logger = logging.getLogger(__name__)

IDLE_WARNING_MESSAGE = "Are you still there?"
IDLE_END_MESSAGE = "I'll go ahead and end the session now. Have a great day."
MAX_DURATION_MESSAGE = (
    "We've reached the maximum session time, so I'll end the call now. Thank you."
)
CONTROL_TOPIC = "awaaz.call.control"


def canonical_end_reason(reason: str | None) -> str:
    normalized = (reason or "").strip().lower().replace(" ", "_")
    if normalized in {
        "goal_completed",
        "user_goodbye",
        "idle_timeout",
        "manual_user_end",
        "max_duration",
        "technical_disconnect",
    }:
        return normalized
    if normalized in {"frontend_end_session", "frontend_requested_end", "manual_end"}:
        return "manual_user_end"
    if normalized in {"assistant_requested_end_call_tool", "assistant_end_call"}:
        return "goal_completed"
    if normalized in {"user_closing_utterance", "goodbye", "bye"}:
        return "user_goodbye"
    if normalized in {"room_shutdown", "worker_shutdown", "disconnect", "disconnected"}:
        return "technical_disconnect"
    return normalized or "technical_disconnect"


def ended_by_for_reason(reason: str) -> str:
    if reason == "manual_user_end":
        return "user"
    if reason == "technical_disconnect":
        return "system"
    return "agent"


class AwaazTools(llm.FunctionContext):
    def __init__(self, lifecycle: "CallLifecycle") -> None:
        self._lifecycle = lifecycle
        super().__init__()

    @llm.ai_callable(description="End the current call when the user is done.")
    async def end_call(self) -> str:
        self._lifecycle.mark_tool_started("end_call")
        try:
            return await end_call(self._lifecycle.request_end)
        finally:
            self._lifecycle.mark_tool_finished("end_call")

    @llm.ai_callable(description="Transfer the current call to a human team member.")
    async def transfer_to_human(self) -> str:
        self._lifecycle.mark_tool_started("transfer_to_human")
        try:
            return await transfer_to_human()
        finally:
            self._lifecycle.mark_tool_finished("transfer_to_human")


class CallLifecycle:
    def __init__(self, ctx: JobContext, call_id: str | None) -> None:
        self._ctx = ctx
        self._call_id = call_id
        self._room_name = room_name_from_context(ctx) or ""
        self._speech_events = None
        self._assistant: VoiceAssistant | None = None
        self._end_requested = False
        self._end_requested_at: float | None = None
        self._end_requested_iso: str | None = None
        self._end_reason_code: str | None = None
        self._end_reason_text: str | None = None
        self._ended_by: str | None = None
        self._room_disconnected_iso: str | None = None
        self._wait_for_final_playback = True
        self._playback_active = False
        self._playbacks_after_end_request = 0
        self._llm_active = False
        self._tts_active = False
        self._stt_pending = False
        self._stt_pending_since: float | None = None
        self._tool_active_count = 0
        self._reconnecting = False
        self._policy_prompt_active = False
        self._idle_warning_active = False
        self._idle_warning_at: float | None = None
        self._idle_warning_iso: str | None = None
        self._shutdown_started = False
        self._finish_task: asyncio.Task[None] | None = None
        self._timeout_task: asyncio.Task[None] | None = None
        self._idle_task: asyncio.Task[None] | None = None
        self._max_duration_task: asyncio.Task[None] | None = None
        self._started_at = time.monotonic()
        self._last_activity_at = self._started_at
        self._last_activity_name = "call_started"
        self._drain_seconds = float_env("LIVEKIT_FINAL_PLAYBACK_DRAIN_SECONDS", 0.75)
        self._timeout_seconds = float_env(
            "LIVEKIT_FINAL_RESPONSE_TIMEOUT_SECONDS",
            18.0,
        )
        self._idle_warning_seconds = max(
            1.0,
            float_env("LIVEKIT_IDLE_WARNING_SECONDS", 20.0),
        )
        self._idle_end_seconds = max(
            self._idle_warning_seconds + 1.0,
            float_env("LIVEKIT_IDLE_END_SECONDS", 30.0),
        )
        self._max_call_seconds = max(
            1.0,
            float_env("LIVEKIT_MAX_CALL_SECONDS", 1800.0),
        )
        self._stt_finalization_timeout_seconds = max(
            1.0,
            float_env("LIVEKIT_STT_FINALIZATION_TIMEOUT_SECONDS", 8.0),
        )

    def set_speech_events(self, speech_events: object) -> None:
        self._speech_events = speech_events

    def set_assistant(self, assistant: VoiceAssistant) -> None:
        self._assistant = assistant

    def start_policies(self) -> None:
        if self._idle_task is None or self._idle_task.done():
            self._idle_task = asyncio.create_task(self._idle_loop())
        if self._max_duration_task is None or self._max_duration_task.done():
            self._max_duration_task = asyncio.create_task(self._max_duration_loop())
        logger.info(
            "idle_warning_scheduled callId=%s room=%s warning_seconds=%s end_seconds=%s max_seconds=%s",
            self._call_id,
            self._room_name,
            self._idle_warning_seconds,
            self._idle_end_seconds,
            self._max_call_seconds,
        )

    async def request_end(
        self,
        reason: str,
        *,
        wait_for_final_playback: bool = True,
        ended_by: str | None = None,
    ) -> bool:
        if self._shutdown_started:
            logger.info(
                "call_end_request_ignored_after_shutdown call_id=%s reason=%s",
                self._call_id,
                reason,
            )
            return False

        if not self._end_requested:
            reason_code = canonical_end_reason(reason)
            phase_at_request = self.current_phase()
            self._end_requested = True
            self._end_requested_at = time.monotonic()
            self._end_requested_iso = utc_now_iso()
            self._end_reason_code = reason_code
            self._end_reason_text = reason
            self._ended_by = ended_by or ended_by_for_reason(reason_code)
            self._wait_for_final_playback = wait_for_final_playback
            self._playbacks_after_end_request = 0
            self._cancel_policy_tasks()
            self._publish_session_state(
                "ENDING",
                "Ending session...",
                reason=reason_code,
            )
            logger.info(
                "call_end_requested callId=%s room=%s reason=%s phase=%s "
                "elapsed_seconds=%s playback_active=%s wait_for_final_playback=%s "
                "timeout_seconds=%s",
                self._call_id,
                self._room_name,
                reason_code,
                phase_at_request,
                round(time.monotonic() - self._started_at, 3),
                self._playback_active,
                self._wait_for_final_playback,
                self._timeout_seconds,
            )
            logger.info(
                "call_end_authoritative call_id=%s reason=%s owner=worker",
                self._call_id,
                reason,
            )
            self._timeout_task = asyncio.create_task(self._finish_after_timeout())
            if not self._wait_for_final_playback and not self._playback_active:
                self._schedule_finish("end requested while idle")
            return True

        logger.info(
            "call_end_request_already_pending call_id=%s reason=%s playback_active=%s",
            self._call_id,
            reason,
            self._playback_active,
        )
        return False

    def mark_activity(self, name: str) -> None:
        if self._end_requested or self._shutdown_started:
            return
        self._last_activity_at = time.monotonic()
        self._last_activity_name = name
        if self._idle_warning_active:
            self._idle_warning_active = False
            self._publish_session_state("LIVE", None)
        logger.info(
            "conversation_activity_detected callId=%s room=%s phase=%s activity=%s elapsed_seconds=%s",
            self._call_id,
            self._room_name,
            self.current_phase(),
            name,
            round(self._last_activity_at - self._started_at, 3),
        )

    def mark_user_started(self) -> None:
        self._stt_pending = True
        self._stt_pending_since = time.monotonic()
        self.mark_activity("user_speech_started")

    def mark_user_finalized(self) -> None:
        self._stt_pending = False
        self._stt_pending_since = None
        self.mark_activity("user_speech_finalized")

    def mark_llm_started(self) -> None:
        self._llm_active = True
        self.mark_activity("llm_response_started")

    def mark_llm_finished(self) -> None:
        self._llm_active = False
        self.mark_activity("llm_response_finished")

    def mark_tts_started(self) -> None:
        self._tts_active = True
        if not self._policy_prompt_active:
            self.mark_activity("tts_started")

    def mark_tts_finished(self) -> None:
        self._tts_active = False
        if not self._policy_prompt_active:
            self.mark_activity("tts_finished")

    def mark_tool_started(self, tool_name: str) -> None:
        self._tool_active_count += 1
        self.mark_activity(f"tool_started:{tool_name}")

    def mark_tool_finished(self, tool_name: str) -> None:
        self._tool_active_count = max(0, self._tool_active_count - 1)
        self.mark_activity(f"tool_finished:{tool_name}")

    def mark_barge_in(self, reason: str) -> None:
        self.mark_activity(f"barge_in:{reason}")

    def mark_reconnecting(self) -> None:
        self._reconnecting = True
        self.mark_activity("room_reconnecting")

    def mark_reconnected(self) -> None:
        self._reconnecting = False
        self.mark_activity("room_reconnected")

    def mark_playback_started(self) -> None:
        self._playback_active = True
        if self._end_requested:
            self._playbacks_after_end_request += 1
        elif not self._policy_prompt_active:
            self.mark_activity("agent_playback_started")
        logger.info(
            "playback_confirmed_started call_id=%s end_requested=%s "
            "playbacks_after_end_request=%s",
            self._call_id,
            self._end_requested,
            self._playbacks_after_end_request,
        )

    def mark_playback_stopped(self, interrupted: bool) -> None:
        self._playback_active = False
        if not self._end_requested and not self._policy_prompt_active:
            self.mark_activity(
                "agent_playback_interrupted" if interrupted else "agent_playback_finished"
            )
        logger.info(
            "playback_confirmed_finished call_id=%s interrupted=%s end_requested=%s since_end_request_ms=%s",
            self._call_id,
            interrupted,
            self._end_requested,
            elapsed_ms(self._end_requested_at, time.monotonic()),
        )
        if (
            self._end_requested
            and not interrupted
            and (
                self._playbacks_after_end_request > 0
                or not self._wait_for_final_playback
            )
        ):
            self._schedule_finish("final response playback completed")
        elif self._end_requested and not interrupted:
            logger.info(
                "call_end_waiting_for_final_response_playback call_id=%s",
                self._call_id,
            )

    def _schedule_finish(self, reason: str) -> None:
        if self._shutdown_started:
            return
        if self._finish_task is not None and not self._finish_task.done():
            return
        self._finish_task = asyncio.create_task(self.finish(reason))

    async def _finish_after_timeout(self) -> None:
        await asyncio.sleep(self._timeout_seconds)
        if self._shutdown_started:
            return
        logger.warning(
            "call_end_timeout_waiting_for_final_playback call_id=%s playback_active=%s timeout_seconds=%s",
            self._call_id,
            self._playback_active,
            self._timeout_seconds,
        )
        await self.finish("end requested timeout")

    async def finish(self, reason: str) -> None:
        if self._shutdown_started:
            return
        self._shutdown_started = True
        self._cancel_policy_tasks()

        current_task = asyncio.current_task()
        if self._timeout_task is not None and self._timeout_task is not current_task:
            self._timeout_task.cancel()

        logger.info(
            "final_response_flush_timing call_id=%s reason=%s drain_seconds=%s since_end_request_ms=%s",
            self._call_id,
            reason,
            self._drain_seconds,
            elapsed_ms(self._end_requested_at, time.monotonic()),
        )
        await asyncio.sleep(self._drain_seconds)
        logger.info(
            "call_end_playback_drained call_id=%s reason=%s",
            self._call_id,
            reason,
        )

        flush = getattr(self._speech_events, "flush", None)
        if callable(flush):
            await flush(timeout_seconds=5.0)

        logger.info("room_close_requested call_id=%s reason=%s", self._call_id, reason)
        try:
            await self._ctx.room.disconnect()
            self._room_disconnected_iso = utc_now_iso()
            logger.info(
                "call_end_room_disconnected callId=%s room=%s reason=%s elapsed_seconds=%s",
                self._call_id,
                self._room_name,
                self._end_reason_code or canonical_end_reason(reason),
                round(time.monotonic() - self._started_at, 3),
            )
        except Exception:
            logger.warning(
                "room_disconnect_failed call_id=%s reason=%s",
                self._call_id,
                reason,
                exc_info=True,
            )
        self._ctx.shutdown(reason)

    def end_call_payload(self, fallback_reason: str) -> dict[str, object]:
        reason = self._end_reason_code or canonical_end_reason(fallback_reason)
        ended_by = self._ended_by or ended_by_for_reason(reason)
        lifecycle: dict[str, object] = {}
        if self._idle_warning_iso:
            lifecycle["idleWarningAt"] = self._idle_warning_iso
        if self._end_requested_iso:
            lifecycle["endRequestedAt"] = self._end_requested_iso
        if self._room_disconnected_iso:
            lifecycle["roomDisconnectedAt"] = self._room_disconnected_iso
        if self._end_reason_text:
            lifecycle["endReasonText"] = self._end_reason_text
        return {
            "reason": reason,
            "metadata": {
                "endReason": reason,
                "endedBy": ended_by,
                "lifecycle": lifecycle,
            },
        }

    def current_phase(self) -> str:
        if self._end_requested:
            return "ending"
        if self._reconnecting:
            return "reconnecting"
        if self._playback_active:
            return "speaking"
        if self._llm_active:
            return "generating"
        if self._tts_active:
            return "synthesizing"
        if self._tool_active_count > 0:
            return "tool_running"
        if self._stt_pending:
            return "stt_pending"
        return "idle"

    def _is_busy(self) -> bool:
        if self._stt_pending and self._stt_pending_since is not None:
            pending_for = time.monotonic() - self._stt_pending_since
            if pending_for > self._stt_finalization_timeout_seconds:
                logger.warning(
                    "stt_finalization_timeout callId=%s pending_seconds=%s",
                    self._call_id,
                    round(pending_for, 3),
                )
                self._stt_pending = False
                self._stt_pending_since = None
        return (
            self._playback_active
            or self._llm_active
            or self._tts_active
            or self._tool_active_count > 0
            or self._stt_pending
            or self._reconnecting
            or self._policy_prompt_active
            or self._end_requested
        )

    def _cancel_policy_tasks(self) -> None:
        current_task = asyncio.current_task()
        for task in (self._idle_task, self._max_duration_task):
            if task is not None and task is not current_task and not task.done():
                task.cancel()

    async def _idle_loop(self) -> None:
        try:
            while not self._end_requested and not self._shutdown_started:
                await asyncio.sleep(0.5)
                if self._is_busy():
                    continue
                now = time.monotonic()
                idle_for = now - self._last_activity_at
                if not self._idle_warning_active and idle_for >= self._idle_warning_seconds:
                    self._idle_warning_active = True
                    self._idle_warning_at = now
                    self._idle_warning_iso = utc_now_iso()
                    logger.info(
                        "idle_warning_triggered callId=%s room=%s phase=%s elapsed_seconds=%s idle_seconds=%s",
                        self._call_id,
                        self._room_name,
                        self.current_phase(),
                        round(now - self._started_at, 3),
                        round(idle_for, 3),
                    )
                    self._publish_session_state(
                        "IDLE",
                        "Agent is checking if you're still there.",
                        reason="idle_warning",
                    )
                    await self._say_policy_prompt(
                        IDLE_WARNING_MESSAGE,
                        prompt_name="idle_warning",
                        allow_interruptions=True,
                    )
                    continue
                if idle_for >= self._idle_end_seconds:
                    logger.warning(
                        "idle_end_triggered callId=%s room=%s phase=%s elapsed_seconds=%s idle_seconds=%s",
                        self._call_id,
                        self._room_name,
                        self.current_phase(),
                        round(now - self._started_at, 3),
                        round(idle_for, 3),
                    )
                    won = await self.request_end(
                        "idle_timeout",
                        wait_for_final_playback=True,
                        ended_by="agent",
                    )
                    if won:
                        await self._say_policy_prompt(
                            IDLE_END_MESSAGE,
                            prompt_name="idle_timeout",
                            allow_interruptions=False,
                        )
                    return
        except asyncio.CancelledError:
            return

    async def _max_duration_loop(self) -> None:
        try:
            await asyncio.sleep(self._max_call_seconds)
            if self._end_requested or self._shutdown_started:
                return
            logger.warning(
                "call_end_requested reason=max_duration callId=%s room=%s phase=%s elapsed_seconds=%s",
                self._call_id,
                self._room_name,
                self.current_phase(),
                round(time.monotonic() - self._started_at, 3),
            )
            won = await self.request_end(
                "max_duration",
                wait_for_final_playback=True,
                ended_by="agent",
            )
            if won:
                await self._wait_for_prompt_slot(timeout_seconds=30.0)
                await self._say_policy_prompt(
                    MAX_DURATION_MESSAGE,
                    prompt_name="max_duration",
                    allow_interruptions=False,
                )
        except asyncio.CancelledError:
            return

    async def _wait_for_prompt_slot(self, timeout_seconds: float) -> None:
        deadline = time.monotonic() + timeout_seconds
        while time.monotonic() < deadline:
            if not (
                self._playback_active
                or self._llm_active
                or self._tts_active
                or self._tool_active_count > 0
                or self._reconnecting
            ):
                return
            await asyncio.sleep(0.2)

    async def _say_policy_prompt(
        self,
        text: str,
        *,
        prompt_name: str,
        allow_interruptions: bool,
    ) -> None:
        assistant = self._assistant
        if assistant is None:
            logger.warning(
                "policy_prompt_skipped_no_assistant callId=%s prompt=%s",
                self._call_id,
                prompt_name,
            )
            return
        self._policy_prompt_active = True
        try:
            await assistant.say(text, allow_interruptions=allow_interruptions)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning(
                "policy_prompt_failed callId=%s prompt=%s",
                self._call_id,
                prompt_name,
                exc_info=True,
            )
        finally:
            self._policy_prompt_active = False

    def _publish_session_state(
        self,
        phase: str,
        message: str | None,
        *,
        reason: str | None = None,
    ) -> None:
        participant = getattr(self._ctx.room, "local_participant", None)
        publish_data = getattr(participant, "publish_data", None)
        if not callable(publish_data):
            return

        payload = {
            "type": "session_state",
            "phase": phase,
            "message": message,
            "reason": reason,
            "callId": self._call_id,
            "elapsedSeconds": round(time.monotonic() - self._started_at, 3),
        }

        async def publish() -> None:
            try:
                await publish_data(
                    json.dumps(payload),
                    reliable=True,
                    topic=CONTROL_TOPIC,
                )
            except Exception:
                logger.debug("session_state_publish_failed", exc_info=True)

        asyncio.create_task(publish())


class AwaazAgent:
    @staticmethod
    async def entrypoint(ctx: JobContext) -> None:
        await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_ALL)
        register_room_debug_events(ctx.room)

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
        voice_id = required_string(config, "voiceId", "mist-default")
        voice_model_id = required_string(config, "voiceModelId", "mistv2")
        voice_lang = required_string(config, "voiceLang", "eng")
        logger.info(
            "voice_config_loaded agent_id=%s call_id=%s agent_version_id=%s "
            "stored_voice_id=%s rime_speaker=%s model=%s lang=%s",
            agent_id,
            call_id,
            string_value(config, "agentVersionId"),
            string_value(config, "voiceId"),
            voice_id,
            voice_model_id,
            voice_lang,
        )

        rime = RimeTTS(
            voice_id=voice_id,
            model_id=voice_model_id,
            language=voice_lang,
        )
        timing = PipelineTiming()
        lifecycle = CallLifecycle(ctx, call_id)
        timing.set_lifecycle(lifecycle)
        assistant = create_assistant(config, rime, AwaazTools(lifecycle), timing)
        lifecycle.set_assistant(assistant)
        register_call_control_events(ctx.room, lifecycle, call_id)
        register_lifecycle_room_events(ctx.room, lifecycle)
        if room_metadata.get("endRequestedAt"):
            asyncio.create_task(
                lifecycle.request_end(
                    string_value(room_metadata, "endRequestedReason", "manual_user_end")
                    or "manual_user_end",
                    wait_for_final_playback=False,
                    ended_by="user",
                )
            )
        speech_events = register_events(
            assistant,
            api,
            call_id,
            timing,
            lifecycle,
            string_list(config, "endCallPhrases"),
        )
        lifecycle.set_speech_events(speech_events)

        async def shutdown() -> None:
            logger.info("worker_shutdown_callback_started call_id=%s", call_id)
            await speech_events.flush()
            if call_id:
                await api.end_call(
                    call_id,
                    lifecycle.end_call_payload("technical_disconnect"),
                )
                logger.info(
                    "call_end_backend_completed callId=%s reason=%s",
                    call_id,
                    lifecycle.end_call_payload("technical_disconnect").get("reason"),
                )
            await rime.aclose()
            await api.aclose()

        ctx.add_shutdown_callback(shutdown)
        participant = await ctx.wait_for_participant()
        logger.info(
            "livekit_wait_for_participant identity=%s sid=%s kind=%s",
            participant_identity(participant),
            participant_sid(participant),
            participant_kind(participant),
        )
        assistant.start(ctx.room, participant)
        register_timing_events(assistant, timing, lifecycle)
        lifecycle.start_policies()

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
    base_prompt = string_value(config, "systemPrompt", "")
    lifecycle_prompt = (
        "When the conversation has clearly reached its goal, the user says goodbye, "
        "or the user indicates they are done, politely close your final response and "
        "call the end_call tool. Do not say you are ending the session unless you are "
        "ready for the call to end."
    )
    chat_ctx.append(
        text=f"{base_prompt}\n\n{lifecycle_prompt}" if base_prompt else lifecycle_prompt,
        role="system",
    )
    vad_min_speech = float_env("LIVEKIT_VAD_MIN_SPEECH_SECONDS", 0.04)
    vad_min_silence = float_env("LIVEKIT_VAD_MIN_SILENCE_SECONDS", 0.15)
    vad_padding = float_env("LIVEKIT_VAD_PADDING_SECONDS", 0.05)
    vad_activation = float_env("LIVEKIT_VAD_ACTIVATION_THRESHOLD", 0.45)
    interrupt_speech_duration = float_env(
        "LIVEKIT_INTERRUPT_SPEECH_SECONDS",
        0.35,
    )
    interrupt_min_words = int_env("LIVEKIT_INTERRUPT_MIN_WORDS", 1)
    logger.info(
        "voice_interruption_config interrupt_speech_seconds=%s interrupt_min_words=%s "
        "vad_min_speech=%s vad_min_silence=%s vad_padding=%s vad_activation=%s "
        "deepgram_endpointing_ms=%s",
        interrupt_speech_duration,
        interrupt_min_words,
        vad_min_speech,
        vad_min_silence,
        vad_padding,
        vad_activation,
        int_env("DEEPGRAM_ENDPOINTING_MS", 25),
    )
    return VoiceAssistant(
        vad=silero.VAD.load(
            min_speech_duration=vad_min_speech,
            min_silence_duration=vad_min_silence,
            padding_duration=vad_padding,
            activation_threshold=vad_activation,
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
        interrupt_speech_duration=interrupt_speech_duration,
        interrupt_min_words=interrupt_min_words,
        preemptive_synthesis=True,
        before_llm_cb=timing.before_llm,
        before_tts_cb=timing.before_tts,
    )


class SpeechEventSink:
    def __init__(
        self,
        api: AwaazAPIClient,
        call_id: str | None,
    ) -> None:
        self._api = api
        self._call_id = call_id
        self._tasks: set[asyncio.Task[None]] = set()

    def emit(
        self,
        event_type: str,
        message: llm.ChatMessage,
        latency_ms: int | None = None,
        timing_payload: dict[str, object] | None = None,
        metadata: dict[str, object] | None = None,
    ) -> None:
        if not self._call_id:
            return

        text = message_text(message).strip()
        if not text:
            return

        payload: dict[str, object] = {
            "eventType": event_type,
            "text": text,
        }
        if timing_payload:
            payload.update(timing_payload)
        if latency_ms is not None:
            payload["latencyMs"] = latency_ms
        if metadata:
            payload["metadata"] = metadata

        task = asyncio.create_task(self._api.emit_event(self._call_id, payload))
        self._tasks.add(task)
        logger.info(
            "speech_event_emit_queued type=%s chars=%s latency_ms=%s metadata=%s pending=%s",
            event_type,
            len(text),
            latency_ms,
            metadata or {},
            len(self._tasks),
        )
        task.add_done_callback(self._on_emit_done)

    async def flush(self, timeout_seconds: float = 8.0) -> None:
        await asyncio.sleep(0)
        deadline = time.monotonic() + timeout_seconds
        while True:
            pending = [task for task in self._tasks if not task.done()]
            if not pending:
                return
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                logger.warning(
                    "Timed out waiting for %s speech event(s) to persist",
                    len(pending),
                )
                return
            _, still_pending = await asyncio.wait(pending, timeout=remaining)
            if still_pending:
                logger.warning(
                    "Timed out waiting for %s speech event(s) to persist",
                    len(still_pending),
                )
                return

    def _on_emit_done(self, task: asyncio.Task[None]) -> None:
        self._tasks.discard(task)
        if task.cancelled():
            logger.warning("Speech event persistence was cancelled")
            return
        error = task.exception()
        if error is not None:
            logger.warning("Failed to emit speech event", exc_info=error)


@dataclass
class UserTurnTiming:
    turn_id: int
    started_at: float
    started_at_iso: str
    stopped_at: float | None = None
    stopped_at_iso: str | None = None
    final_transcript_at: float | None = None
    final_transcript_at_iso: str | None = None


@dataclass
class ResponseTiming:
    response_id: int
    turn_id: int
    user_started_at: float | None
    user_started_at_iso: str | None
    user_stopped_at: float | None
    user_stopped_at_iso: str | None
    final_transcript_at: float | None
    final_transcript_at_iso: str | None
    llm_started_at: float | None = None
    llm_started_at_iso: str | None = None
    first_llm_token_at: float | None = None
    first_llm_token_at_iso: str | None = None
    llm_finished_at: float | None = None
    llm_finished_at_iso: str | None = None
    tts_text_started_at: float | None = None
    tts_text_started_at_iso: str | None = None
    tts_text_finished_at_iso: str | None = None
    playback_started_at: float | None = None
    playback_started_at_iso: str | None = None
    playback_stopped_at: float | None = None
    playback_stopped_at_iso: str | None = None
    interrupted: bool = False

    def response_reference_at(self) -> float | None:
        return self.user_stopped_at or self.final_transcript_at or self.user_started_at


class PipelineTiming:
    def __init__(self) -> None:
        self.turn_id = 0
        self.response_id = 0
        self.current_user: UserTurnTiming | None = None
        self.active_response: ResponseTiming | None = None
        self.last_response: ResponseTiming | None = None
        self.barge_in_requested_at: float | None = None
        self.barge_in_reason: str | None = None
        self._lifecycle: CallLifecycle | None = None

    def set_lifecycle(self, lifecycle: CallLifecycle) -> None:
        self._lifecycle = lifecycle

    def mark_user_started(self) -> None:
        self.turn_id += 1
        self.current_user = UserTurnTiming(
            turn_id=self.turn_id,
            started_at=time.monotonic(),
            started_at_iso=utc_now_iso(),
        )
        if self._lifecycle is not None:
            self._lifecycle.mark_user_started()
        logger.info("voice_turn_started turn=%s", self.turn_id)

    def mark_user_stopped(self) -> None:
        if self.current_user is None:
            self.mark_user_started()
        assert self.current_user is not None
        self.current_user.stopped_at = time.monotonic()
        self.current_user.stopped_at_iso = utc_now_iso()
        logger.info(
            "voice_user_stopped turn=%s speech_ms=%s",
            self.current_user.turn_id,
            elapsed_ms(self.current_user.started_at, self.current_user.stopped_at),
        )

    def mark_final_transcript(self, text: str) -> None:
        if self.current_user is None:
            self.mark_user_started()
        assert self.current_user is not None
        self.current_user.final_transcript_at = time.monotonic()
        self.current_user.final_transcript_at_iso = utc_now_iso()
        if self._lifecycle is not None:
            self._lifecycle.mark_user_finalized()
        logger.info(
            "voice_stt_final turn=%s chars=%s since_user_start_ms=%s since_user_stop_ms=%s text=%r",
            self.current_user.turn_id,
            len(text),
            elapsed_ms(self.current_user.started_at, self.current_user.final_transcript_at),
            elapsed_ms(self.current_user.stopped_at, self.current_user.final_transcript_at),
            text[:120],
        )

    def before_llm(
        self,
        assistant: VoiceAssistant,
        chat_ctx: ChatContext,
    ) -> LLMStream:
        response = self._new_response()
        response.llm_started_at = time.monotonic()
        response.llm_started_at_iso = utc_now_iso()
        if self._lifecycle is not None:
            self._lifecycle.mark_llm_started()
        user_text = ""
        if chat_ctx.messages:
            user_text = message_text(chat_ctx.messages[-1])
        logger.info(
            "voice_llm_start turn=%s response=%s user_chars=%s since_final_ms=%s since_user_stop_ms=%s",
            response.turn_id,
            response.response_id,
            len(user_text),
            elapsed_ms(response.final_transcript_at, response.llm_started_at),
            elapsed_ms(response.user_stopped_at, response.llm_started_at),
        )
        stream = assistant.llm.chat(
            chat_ctx=chat_ctx,
            fnc_ctx=assistant.fnc_ctx,
            temperature=0.3,
            parallel_tool_calls=False,
        )
        return TimedLLMStream(stream, self, response)

    def before_tts(
        self,
        _assistant: VoiceAssistant,
        text: str | AsyncIterable[str],
    ) -> str | AsyncIterable[str]:
        response = self._ensure_response()
        if isinstance(text, str):
            self.mark_tts_text_started(response, text)
            self.mark_tts_text_finished(response, len(text))
            return text
        return self._timed_tts_text(text, response)

    async def _timed_tts_text(
        self,
        source: AsyncIterable[str],
        response: ResponseTiming,
    ) -> AsyncIterable[str]:
        chars = 0
        finished = False
        try:
            async for segment in source:
                if segment and response.tts_text_started_at is None:
                    self.mark_tts_text_started(response, segment)
                chars += len(segment)
                yield segment
            finished = True
        finally:
            if response.tts_text_started_at is not None and not finished:
                self.mark_tts_text_finished(response, chars)
        if response.tts_text_started_at is not None:
            self.mark_tts_text_finished(response, chars)

    def mark_first_llm_token(self, response: ResponseTiming) -> None:
        response.first_llm_token_at = time.monotonic()
        response.first_llm_token_at_iso = utc_now_iso()
        logger.info(
            "voice_llm_first_token turn=%s response=%s llm_first_token_ms=%s since_user_stop_ms=%s",
            response.turn_id,
            response.response_id,
            elapsed_ms(response.llm_started_at, response.first_llm_token_at),
            elapsed_ms(response.user_stopped_at, response.first_llm_token_at),
        )

    def mark_llm_finished(self, response: ResponseTiming) -> None:
        if response.llm_finished_at is not None:
            return
        response.llm_finished_at = time.monotonic()
        response.llm_finished_at_iso = utc_now_iso()
        if self._lifecycle is not None:
            self._lifecycle.mark_llm_finished()
        logger.info(
            "voice_llm_done turn=%s response=%s llm_total_ms=%s since_user_stop_ms=%s",
            response.turn_id,
            response.response_id,
            elapsed_ms(response.llm_started_at, response.llm_finished_at),
            elapsed_ms(response.user_stopped_at, response.llm_finished_at),
        )

    def mark_tts_text_started(self, response: ResponseTiming, text: str) -> None:
        if response.tts_text_started_at is not None:
            return
        response.tts_text_started_at = time.monotonic()
        response.tts_text_started_at_iso = utc_now_iso()
        if self._lifecycle is not None:
            self._lifecycle.mark_tts_started()
        logger.info(
            "voice_tts_text_start turn=%s response=%s since_llm_start_ms=%s since_first_llm_token_ms=%s preview=%r",
            response.turn_id,
            response.response_id,
            elapsed_ms(response.llm_started_at, response.tts_text_started_at),
            elapsed_ms(response.first_llm_token_at, response.tts_text_started_at),
            text[:80],
        )

    def mark_tts_text_finished(self, response: ResponseTiming, chars: int) -> None:
        if response.tts_text_finished_at_iso is not None:
            return
        response.tts_text_finished_at_iso = utc_now_iso()
        if self._lifecycle is not None:
            self._lifecycle.mark_tts_finished()
        logger.info(
            "voice_tts_text_done turn=%s response=%s chars=%s since_tts_text_start_ms=%s",
            response.turn_id,
            response.response_id,
            chars,
            elapsed_ms(response.tts_text_started_at, time.monotonic()),
        )

    def mark_playback_started(self) -> None:
        response = self._ensure_response()
        response.playback_started_at = time.monotonic()
        response.playback_started_at_iso = utc_now_iso()
        logger.info(
            "voice_playback_started turn=%s response=%s total_from_user_stop_ms=%s total_from_final_ms=%s since_llm_start_ms=%s",
            response.turn_id,
            response.response_id,
            elapsed_ms(response.user_stopped_at, response.playback_started_at),
            elapsed_ms(response.final_transcript_at, response.playback_started_at),
            elapsed_ms(response.llm_started_at, response.playback_started_at),
        )

    def mark_playback_stopped(self, interrupted: bool = False) -> None:
        response = self._ensure_response()
        response.playback_stopped_at = time.monotonic()
        response.playback_stopped_at_iso = utc_now_iso()
        response.interrupted = interrupted
        self.last_response = response
        logger.info(
            "voice_playback_stopped turn=%s response=%s interrupted=%s first_audio_latency_ms=%s "
            "playback_ms=%s total_response_ms=%s total_turn_ms=%s",
            response.turn_id,
            response.response_id,
            interrupted,
            self.first_audio_latency_ms(response),
            elapsed_ms(response.playback_started_at, response.playback_stopped_at),
            self.total_response_ms(response),
            elapsed_ms(response.user_started_at, response.playback_stopped_at),
        )

    def mark_barge_in_requested(self, reason: str) -> None:
        self.barge_in_requested_at = time.monotonic()
        self.barge_in_reason = reason
        if self._lifecycle is not None:
            self._lifecycle.mark_barge_in(reason)

    def response_latency_ms(self) -> int | None:
        return self.first_audio_latency_ms(self._event_response())

    def first_audio_latency_ms(self, response: ResponseTiming | None) -> int | None:
        if response is None:
            return None
        return elapsed_ms(response.response_reference_at(), response.playback_started_at)

    def playback_duration_ms(self, response: ResponseTiming | None) -> int | None:
        if response is None:
            return None
        return elapsed_ms(response.playback_started_at, response.playback_stopped_at)

    def total_response_ms(self, response: ResponseTiming | None) -> int | None:
        if response is None:
            return None
        return elapsed_ms(response.response_reference_at(), response.playback_stopped_at)

    def agent_response_metrics(self) -> dict[str, object]:
        response = self._event_response()
        metrics: dict[str, object] = {}
        first_audio_latency_ms = self.first_audio_latency_ms(response)
        playback_duration_ms = self.playback_duration_ms(response)
        total_response_ms = self.total_response_ms(response)
        if first_audio_latency_ms is not None:
            metrics["firstAudioLatencyMs"] = first_audio_latency_ms
        if playback_duration_ms is not None:
            metrics["playbackDurationMs"] = playback_duration_ms
        if total_response_ms is not None:
            metrics["totalResponseMs"] = total_response_ms
        if response is not None:
            metrics["turnId"] = response.turn_id
            metrics["responseId"] = response.response_id
        return metrics

    def user_speech_payload(self) -> dict[str, object]:
        turn = self.current_user
        if turn is None:
            return {}
        return self._payload_window(
            turn.started_at_iso,
            turn.final_transcript_at_iso or turn.stopped_at_iso,
            turn.started_at,
            turn.final_transcript_at or turn.stopped_at,
        )

    def agent_speech_payload(self) -> dict[str, object]:
        response = self._event_response()
        if response is None:
            return {}
        start_iso = (
            response.playback_started_at_iso
            or response.tts_text_started_at_iso
            or response.llm_started_at_iso
        )
        end_iso = (
            response.playback_stopped_at_iso
            or response.tts_text_finished_at_iso
            or utc_now_iso()
        )
        return self._payload_window(
            start_iso,
            end_iso,
            response.playback_started_at
            or response.tts_text_started_at
            or response.llm_started_at,
            response.playback_stopped_at
            or response.tts_text_started_at
            or response.llm_started_at,
        )

    def agent_played_audio(self) -> bool:
        response = self._event_response()
        return bool(response and response.playback_started_at is not None)

    def consume_agent_response(self) -> None:
        self.last_response = None

    def _new_response(self) -> ResponseTiming:
        self.response_id += 1
        turn = self.current_user
        response = ResponseTiming(
            response_id=self.response_id,
            turn_id=turn.turn_id if turn else 0,
            user_started_at=turn.started_at if turn else None,
            user_started_at_iso=turn.started_at_iso if turn else None,
            user_stopped_at=turn.stopped_at if turn else None,
            user_stopped_at_iso=turn.stopped_at_iso if turn else None,
            final_transcript_at=turn.final_transcript_at if turn else None,
            final_transcript_at_iso=turn.final_transcript_at_iso if turn else None,
        )
        self.active_response = response
        return response

    def _ensure_response(self) -> ResponseTiming:
        if self.active_response is not None:
            return self.active_response
        return self._new_response()

    def _event_response(self) -> ResponseTiming | None:
        return self.last_response or self.active_response

    def _payload_window(
        self,
        started_at_iso: str | None,
        ended_at_iso: str | None,
        started_at_mono: float | None,
        ended_at_mono: float | None,
    ) -> dict[str, object]:
        payload: dict[str, object] = {}
        if started_at_iso:
            payload["startedAt"] = started_at_iso
        if ended_at_iso:
            payload["endedAt"] = ended_at_iso
        duration_ms = elapsed_ms(started_at_mono, ended_at_mono)
        if duration_ms is not None:
            payload["durationMs"] = duration_ms
        return payload


class TimedLLMStream(LLMStream):
    def __init__(
        self,
        inner: LLMStream,
        timing: PipelineTiming,
        response: ResponseTiming,
    ) -> None:
        super().__init__(chat_ctx=inner.chat_ctx, fnc_ctx=inner.fnc_ctx)
        self._inner = inner
        self._timing = timing
        self._response = response
        self._saw_first_token = False
        self._finished = False

    @property
    def function_calls(self):
        return self._inner.function_calls

    def _mark_finished_once(self) -> None:
        if not self._finished:
            self._finished = True
            self._timing.mark_llm_finished(self._response)

    async def aclose(self) -> None:
        try:
            await self._inner.aclose()
            await super().aclose()
        finally:
            self._mark_finished_once()

    async def __anext__(self):
        try:
            chunk = await self._inner.__anext__()
        except StopAsyncIteration:
            self._mark_finished_once()
            raise
        except Exception:
            self._mark_finished_once()
            raise

        content = chunk.choices[0].delta.content if chunk.choices else None
        if content and not self._saw_first_token:
            self._saw_first_token = True
            self._timing.mark_first_llm_token(self._response)
        return chunk


def register_room_debug_events(room: object) -> None:
    logger.info(
        "livekit_room_debug_attached name=%s metadata_chars=%s",
        getattr(room, "name", None),
        len(getattr(room, "metadata", "") or ""),
    )

    def log_participant(prefix: str, participant: object) -> None:
        logger.info(
            "%s identity=%s sid=%s kind=%s track_publications=%s",
            prefix,
            participant_identity(participant),
            participant_sid(participant),
            participant_kind(participant),
            len(getattr(participant, "track_publications", {}) or {}),
        )

    def log_publication(prefix: str, publication: object, participant: object | None = None) -> None:
        logger.info(
            "%s participant=%s source=%s sid=%s subscribed=%s muted=%s kind=%s",
            prefix,
            participant_identity(participant) if participant is not None else None,
            getattr(publication, "source", None),
            getattr(publication, "sid", None),
            getattr(publication, "subscribed", None),
            getattr(publication, "muted", None),
            getattr(publication, "kind", None),
        )

    on = getattr(room, "on", None)
    if not callable(on):
        logger.warning("LiveKit room debug could not attach; room has no on()")
        return

    on("connection_state_changed", lambda state: logger.info("livekit_room_connection_state=%s", state))
    on("reconnecting", lambda: logger.warning("livekit_room_reconnecting"))
    on("reconnected", lambda: logger.info("livekit_room_reconnected"))
    on("disconnected", lambda reason=None: logger.warning("livekit_room_disconnected reason=%s", reason))
    on("participant_connected", lambda participant: log_participant("livekit_participant_connected", participant))
    on("participant_disconnected", lambda participant: log_participant("livekit_participant_disconnected", participant))
    on("track_published", lambda publication, participant: log_publication("livekit_track_published", publication, participant))
    on("track_unpublished", lambda publication, participant: log_publication("livekit_track_unpublished", publication, participant))
    on("track_subscribed", lambda track, publication, participant: log_publication("livekit_track_subscribed", publication, participant))
    on("track_unsubscribed", lambda track, publication, participant: log_publication("livekit_track_unsubscribed", publication, participant))
    on("track_muted", lambda participant, publication: log_publication("livekit_track_muted", publication, participant))
    on("track_unmuted", lambda participant, publication: log_publication("livekit_track_unmuted", publication, participant))


def register_call_control_events(
    room: object,
    lifecycle: CallLifecycle,
    call_id: str | None,
) -> None:
    on = getattr(room, "on", None)
    if not callable(on):
        logger.warning("Call control could not attach; room has no on()")
        return

    def on_data_received(*args: object) -> None:
        packet = args[0] if args else None
        topic = getattr(packet, "topic", None)
        raw = getattr(packet, "data", None)

        # LiveKit Python event payloads have varied across releases. Support
        # both a packet object and the JS-like payload, participant, kind, topic
        # shape so call-ending control messages do not depend on one SDK minor.
        if topic is None and len(args) >= 4:
            topic = args[3]
        if raw is None and packet is not None:
            raw = packet

        if topic != "awaaz.call.control":
            return

        try:
            if isinstance(raw, bytes):
                payload = json.loads(raw.decode("utf-8"))
            elif isinstance(raw, str):
                payload = json.loads(raw)
            else:
                logger.warning("call_control_unreadable_payload call_id=%s", call_id)
                return
        except Exception:
            logger.warning("call_control_invalid_json call_id=%s", call_id, exc_info=True)
            return

        if not isinstance(payload, dict):
            return
        if payload.get("type") != "end_call":
            return

        incoming_call_id = payload.get("callId")
        if (
            call_id
            and isinstance(incoming_call_id, str)
            and incoming_call_id
            and incoming_call_id != call_id
        ):
            logger.warning(
                "call_control_call_id_mismatch expected=%s received=%s",
                call_id,
                incoming_call_id,
            )
            return

        reason = payload.get("reason")
        reason_text = reason if isinstance(reason, str) and reason else "manual_user_end"
        logger.info(
            "call_end_requested call_id=%s reason=%s source=livekit_data",
            call_id,
            reason_text,
        )
        asyncio.create_task(
            lifecycle.request_end(
                reason_text,
                wait_for_final_playback=False,
                ended_by="user",
            )
        )

    on("data_received", on_data_received)


def register_lifecycle_room_events(room: object, lifecycle: CallLifecycle) -> None:
    on = getattr(room, "on", None)
    if not callable(on):
        logger.warning("Call lifecycle could not attach to room events")
        return

    on("reconnecting", lambda: lifecycle.mark_reconnecting())
    on("reconnected", lambda: lifecycle.mark_reconnected())

    def on_disconnected(reason: object = None) -> None:
        logger.warning(
            "call_end_room_disconnected_observed reason=%s phase=%s",
            reason,
            lifecycle.current_phase(),
        )
        asyncio.create_task(
            lifecycle.request_end(
                "technical_disconnect",
                wait_for_final_playback=False,
                ended_by="system",
            )
        )

    on("disconnected", on_disconnected)


def register_timing_events(
    assistant: VoiceAssistant,
    timing: PipelineTiming,
    lifecycle: CallLifecycle,
) -> None:
    assistant.on("user_started_speaking", lambda: timing.mark_user_started())
    assistant.on("user_stopped_speaking", lambda: timing.mark_user_stopped())

    def on_agent_started() -> None:
        timing.mark_playback_started()
        lifecycle.mark_playback_started()

    def on_agent_stopped(interrupted: bool = False) -> None:
        active_speech = getattr(assistant, "_playing_speech", None)
        interrupted_value = bool(
            interrupted or getattr(active_speech, "interrupted", False),
        )
        timing.mark_playback_stopped(interrupted_value)
        lifecycle.mark_playback_stopped(interrupted_value)

    assistant.on("agent_started_speaking", on_agent_started)
    assistant.on(
        "agent_stopped_speaking",
        on_agent_stopped,
    )

    human_input = getattr(assistant, "_human_input", None)
    if human_input is None:
        logger.warning("Voice timing could not attach to human input events")
        return
    logger.info("voice_timing_attached_to_human_input")

    last_interim_log_at = 0.0

    def on_final_transcript(event: object) -> None:
        alternatives = getattr(event, "alternatives", [])
        text = alternatives[0].text if alternatives else ""
        timing.mark_final_transcript(text)

    def on_interim_transcript(event: object) -> None:
        nonlocal last_interim_log_at
        now = time.monotonic()
        if now - last_interim_log_at < 1.0:
            return
        last_interim_log_at = now
        alternatives = getattr(event, "alternatives", [])
        text = alternatives[0].text if alternatives else ""
        if text:
            logger.info(
                "voice_stt_interim turn=%s chars=%s text=%r",
                timing.turn_id,
                len(text),
                text[:100],
            )

    human_input.on("final_transcript", on_final_transcript)
    human_input.on("interim_transcript", on_interim_transcript)
    register_barge_in_events(assistant, human_input, timing)


def register_barge_in_events(
    assistant: VoiceAssistant,
    human_input: object,
    timing: PipelineTiming,
) -> None:
    opts = getattr(assistant, "_opts", None)
    interrupt_seconds = float(getattr(opts, "int_speech_duration", 0.35) or 0.35)
    min_words = int(getattr(opts, "int_min_words", 1) or 0)
    last_interim_text = ""
    user_started_at: float | None = None
    last_threshold_log_at = 0.0

    logger.info(
        "barge_in_monitor_attached interrupt_speech_seconds=%s interrupt_min_words=%s",
        interrupt_seconds,
        min_words,
    )

    def current_speech_duration() -> float:
        if user_started_at is None:
            return interrupt_seconds
        return max(0.0, time.monotonic() - user_started_at)

    def playing_speech() -> object | None:
        speech = getattr(assistant, "_playing_speech", None)
        if speech is None:
            return None
        if getattr(speech, "interrupted", False):
            return None
        if not getattr(speech, "allow_interruptions", False):
            return None
        return speech

    def transcript_text(event: object) -> str:
        alternatives = getattr(event, "alternatives", [])
        if not alternatives:
            return ""
        return getattr(alternatives[0], "text", "") or ""

    def count_words(text: str) -> int:
        tokenizer = getattr(getattr(opts, "transcription", None), "word_tokenizer", None)
        if tokenizer is not None:
            try:
                return len(tokenizer.tokenize(text=text))
            except Exception:
                logger.debug("barge_in_word_tokenizer_failed", exc_info=True)
        return len([word for word in text.strip().split() if word])

    def log_threshold_not_met(
        reason: str,
        text: str,
        words: int,
        speech_duration: float,
    ) -> None:
        nonlocal last_threshold_log_at
        now = time.monotonic()
        if now - last_threshold_log_at < 0.75:
            return
        last_threshold_log_at = now
        logger.info(
            "barge_in_threshold_not_met reason=%s words=%s min_words=%s "
            "speech_ms=%s required_speech_ms=%s text=%r",
            reason,
            words,
            min_words,
            round(speech_duration * 1000),
            round(interrupt_seconds * 1000),
            text[:100],
        )

    def request_interrupt(reason: str, text: str, speech_duration: float) -> None:
        speech = playing_speech()
        if speech is None:
            return

        words = count_words(text)
        if speech_duration < interrupt_seconds:
            log_threshold_not_met(reason, text, words, speech_duration)
            return
        if min_words > 0 and words < min_words:
            log_threshold_not_met(reason, text, words, speech_duration)
            return

        if text:
            setattr(assistant, "_transcribed_interim_text", text)

        timing.mark_barge_in_requested(reason)
        logger.warning(
            "barge_in_tts_cancellation_requested reason=%s words=%s speech_ms=%s "
            "turn=%s text=%r",
            reason,
            words,
            round(speech_duration * 1000),
            timing.turn_id,
            text[:120],
        )

        interrupt_if_possible = getattr(assistant, "_interrupt_if_possible", None)
        if callable(interrupt_if_possible):
            interrupt_if_possible()

        interrupted = bool(getattr(speech, "interrupted", False))
        if not interrupted:
            interrupt = getattr(speech, "interrupt", None)
            if callable(interrupt):
                interrupt()
                interrupted = bool(getattr(speech, "interrupted", False))

        logger.warning(
            "barge_in_agent_speech_interrupt_result interrupted=%s reason=%s turn=%s",
            interrupted,
            reason,
            timing.turn_id,
        )

    def on_start_of_speech(event: object) -> None:
        nonlocal user_started_at, last_interim_text
        user_started_at = time.monotonic()
        last_interim_text = ""
        if playing_speech() is not None:
            logger.info(
                "barge_in_user_speech_detected_during_agent_playback turn=%s",
                timing.turn_id,
            )

    def on_vad_updated(event: object) -> None:
        if playing_speech() is None:
            return
        speech_duration = float(
            getattr(event, "speech_duration", current_speech_duration()) or 0.0,
        )
        request_interrupt("vad_speech_duration", last_interim_text, speech_duration)

    def on_interim_transcript(event: object) -> None:
        nonlocal last_interim_text
        text = transcript_text(event).strip()
        if not text:
            return
        last_interim_text = text
        if playing_speech() is None:
            return
        logger.info(
            "barge_in_interim_transcript_during_agent_playback turn=%s words=%s text=%r",
            timing.turn_id,
            count_words(text),
            text[:120],
        )
        request_interrupt("interim_transcript", text, current_speech_duration())

    def on_final_transcript(event: object) -> None:
        text = transcript_text(event).strip()
        if not text or playing_speech() is None:
            return
        logger.info(
            "barge_in_final_transcript_during_agent_playback turn=%s words=%s text=%r",
            timing.turn_id,
            count_words(text),
            text[:120],
        )
        request_interrupt(
            "final_transcript",
            text,
            max(current_speech_duration(), interrupt_seconds),
        )

    def on_end_of_speech(_event: object) -> None:
        nonlocal user_started_at
        user_started_at = None

    human_input.on("start_of_speech", on_start_of_speech)
    human_input.on("vad_inference_done", on_vad_updated)
    human_input.on("interim_transcript", on_interim_transcript)
    human_input.on("final_transcript", on_final_transcript)
    human_input.on("end_of_speech", on_end_of_speech)


def register_events(
    assistant: VoiceAssistant,
    api: AwaazAPIClient,
    call_id: str | None,
    timing: PipelineTiming,
    lifecycle: CallLifecycle,
    end_call_phrases: list[str],
) -> SpeechEventSink:
    sink = SpeechEventSink(api, call_id)
    if not call_id:
        logger.warning("Call ID missing; speech events will not be emitted")
        return sink

    def on_user_speech(message: llm.ChatMessage) -> None:
        text = message_text(message)
        if (
            timing.barge_in_requested_at is not None
            and time.monotonic() - timing.barge_in_requested_at < 20
        ):
            logger.info(
                "barge_in_new_user_turn_accepted turn=%s reason=%s chars=%s",
                timing.turn_id,
                timing.barge_in_reason,
                len(text),
            )
        sink.emit("USER_SPEECH", message, timing_payload=timing.user_speech_payload())
        if is_closing_utterance(text, end_call_phrases):
            logger.info(
                "goodbye_intent_detected turn=%s chars=%s text=%r",
                timing.turn_id,
                len(text),
                text[:120],
            )
            asyncio.create_task(lifecycle.request_end("user_goodbye"))

    def on_agent_speech(message: llm.ChatMessage) -> None:
        if not timing.agent_played_audio():
            logger.info(
                "voice_agent_speech_not_persisted_no_playback turn=%s chars=%s",
                timing.turn_id,
                len(message_text(message)),
            )
            return
        latency_ms = timing.response_latency_ms()
        metrics = timing.agent_response_metrics()
        logger.info(
            "voice_agent_response_metrics turn=%s latency_ms=%s metrics=%s",
            timing.turn_id,
            latency_ms,
            metrics,
        )
        sink.emit(
            "AGENT_SPEECH",
            message,
            latency_ms,
            timing.agent_speech_payload(),
            {"metrics": metrics} if metrics else None,
        )
        timing.consume_agent_response()

    def on_agent_speech_interrupted(message: llm.ChatMessage) -> None:
        if not timing.agent_played_audio():
            logger.info(
                "voice_agent_interrupted_not_persisted_no_playback turn=%s chars=%s",
                timing.turn_id,
                len(message_text(message)),
            )
            return
        latency_ms = timing.response_latency_ms()
        metrics = timing.agent_response_metrics()
        logger.warning(
            "voice_agent_speech_interrupted turn=%s chars=%s latency_ms=%s metrics=%s",
            timing.turn_id,
            len(message_text(message)),
            latency_ms,
            metrics,
        )
        metadata: dict[str, object] = {"interrupted": True}
        if metrics:
            metadata["metrics"] = metrics
        sink.emit(
            "AGENT_SPEECH",
            message,
            latency_ms,
            timing.agent_speech_payload(),
            metadata,
        )
        timing.consume_agent_response()

    assistant.on("user_speech_committed", on_user_speech)
    assistant.on("agent_speech_committed", on_agent_speech)
    assistant.on("agent_speech_interrupted", on_agent_speech_interrupted)
    return sink


async def start_call_payload(
    ctx: JobContext,
    config: Mapping[str, object],
    room_metadata: Mapping[str, object],
) -> dict[str, object]:
    payload: dict[str, object] = {
        "callId": string_value(room_metadata, "callId", ""),
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


def string_list(source: Mapping[str, object], key: str) -> list[str]:
    value = source.get(key)
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def required_string(
    source: Mapping[str, object],
    key: str,
    default: str,
) -> str:
    value = source.get(key)
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed:
            return trimmed
    return default


def participant_identity(participant: object) -> str | None:
    value = getattr(participant, "identity", None)
    return value if isinstance(value, str) else None


def participant_sid(participant: object) -> str | None:
    value = getattr(participant, "sid", None)
    return value if isinstance(value, str) else None


def participant_kind(participant: object) -> str | None:
    value = getattr(participant, "kind", None)
    return str(value) if value is not None else None


def message_text(message: llm.ChatMessage) -> str:
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(item for item in content if isinstance(item, str))
    return ""


QUESTION_INTENT_RE = re.compile(
    r"\b(can|could|would|what|why|when|where|who|how|tell|explain|show|another)\b",
)
GENERIC_THANKS = {"thank you", "thanks", "thank you very much"}
DEFAULT_CLOSING_PHRASES = [
    "thank you goodbye",
    "thanks goodbye",
    "goodbye",
    "good bye",
    "bye",
    "bye bye",
    "that's all",
    "thats all",
    "no that's all",
    "no thats all",
    "thank you so much",
    "thanks so much",
    "okay thanks",
    "ok thanks",
    "i'm done",
    "im done",
    "i am done",
    "end the call",
    "hang up",
]


def is_closing_utterance(text: str, configured_phrases: list[str]) -> bool:
    normalized = normalize_utterance(text)
    if not normalized:
        return False

    has_question_intent = bool("?" in text or QUESTION_INTENT_RE.search(normalized))
    phrases = [*DEFAULT_CLOSING_PHRASES, *configured_phrases]
    for phrase in phrases:
        normalized_phrase = normalize_utterance(phrase)
        if not normalized_phrase:
            continue
        if normalized_phrase in GENERIC_THANKS:
            if normalized == normalized_phrase and not has_question_intent:
                return True
            continue
        if phrase_in_utterance(normalized, normalized_phrase):
            if has_question_intent and not is_explicit_hangup_phrase(normalized_phrase):
                continue
            return True
    return False


def normalize_utterance(text: str) -> str:
    normalized = text.lower().replace("'", "").replace("’", "")
    normalized = re.sub(r"[^a-z0-9]+", " ", normalized)
    return re.sub(r"\s+", " ", normalized).strip()


def phrase_in_utterance(text: str, phrase: str) -> bool:
    if text == phrase:
        return True
    return f" {phrase} " in f" {text} "


def is_explicit_hangup_phrase(phrase: str) -> bool:
    return phrase in {"end the call", "hang up", "goodbye", "good bye", "bye", "bye bye"}


def elapsed_ms(start: float | None, end: float | None) -> int | None:
    if start is None or end is None:
        return None
    return max(0, round((end - start) * 1000))


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


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
