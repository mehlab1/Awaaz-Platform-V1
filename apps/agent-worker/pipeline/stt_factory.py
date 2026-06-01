import asyncio
import json
import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass
from urllib.parse import urlencode

import websockets
from livekit.agents import stt, utils
from livekit.agents.utils import AudioBuffer
from livekit.plugins import deepgram, openai


logger = logging.getLogger(__name__)

RUNTIME_STT_PROVIDER_DEEPGRAM = "deepgram"
RUNTIME_STT_PROVIDER_ASSEMBLYAI = "assemblyai"
RUNTIME_STT_PROVIDER_GROQ_WHISPER = "groq-whisper"
RUNTIME_STT_PROVIDERS = frozenset(
    {
        RUNTIME_STT_PROVIDER_DEEPGRAM,
        RUNTIME_STT_PROVIDER_ASSEMBLYAI,
        RUNTIME_STT_PROVIDER_GROQ_WHISPER,
    },
)
DEFAULT_STT_PROVIDER = RUNTIME_STT_PROVIDER_DEEPGRAM
DEFAULT_DEEPGRAM_MODEL = "nova-2-conversationalai"
DEFAULT_ASSEMBLYAI_MODEL = "universal-streaming-v2"
DEFAULT_GROQ_WHISPER_MODEL = "whisper-large-v3-turbo"
SUPPORTED_STT_MODELS_BY_PROVIDER = {
    RUNTIME_STT_PROVIDER_DEEPGRAM: frozenset(
        {"nova-2-conversationalai", "nova-2", "nova-3"},
    ),
    RUNTIME_STT_PROVIDER_ASSEMBLYAI: frozenset({"universal-streaming-v2"}),
    RUNTIME_STT_PROVIDER_GROQ_WHISPER: frozenset(
        {"whisper-large-v3-turbo", "whisper-large-v3"},
    ),
}
GROQ_OPENAI_BASE_URL = "https://api.groq.com/openai/v1"
ASSEMBLYAI_REALTIME_WS_URL = "wss://api.assemblyai.com/v2/realtime/ws"


@dataclass(frozen=True)
class SttRuntimeSelection:
    provider_id: str
    model_id: str
    api_key: str | None
    key_fingerprint: str | None
    metadata_provider_id: str | None


def build_stt(config: Mapping[str, object], selection: SttRuntimeSelection | None = None) -> stt.STT:
    resolved = selection or parse_stt_runtime_selection(config)
    log_stt_selection(resolved)

    if resolved.provider_id not in RUNTIME_STT_PROVIDERS:
        raise ValueError(
            f"STT provider {resolved.provider_id} is not enabled in worker runtime."
        )
    supported_models = SUPPORTED_STT_MODELS_BY_PROVIDER.get(resolved.provider_id)
    if supported_models and resolved.model_id not in supported_models:
        raise ValueError(
            f"Unsupported {resolved.provider_id} STT model: {resolved.model_id}"
        )

    if resolved.provider_id == RUNTIME_STT_PROVIDER_ASSEMBLYAI:
        api_key = resolved.api_key or _first_env(
            "FINOVA_ASSEMBLYAI_API_KEY",
            "ASSEMBLYAI_API_KEY",
        )
        if not api_key:
            raise ValueError(
                "FINOVA_ASSEMBLYAI_API_KEY or ASSEMBLYAI_API_KEY is required for AssemblyAI STT"
            )
        return AssemblyAIStreamingSTT(
            api_key=api_key,
            model=resolved.model_id,
            sample_rate=int_env("ASSEMBLYAI_SAMPLE_RATE", 48000),
            end_utterance_silence_threshold=int_env(
                "ASSEMBLYAI_END_UTTERANCE_SILENCE_MS",
                500,
            ),
        )

    if resolved.provider_id == RUNTIME_STT_PROVIDER_GROQ_WHISPER:
        api_key = resolved.api_key or _first_env("FINOVA_GROQ_API_KEY", "GROQ_API_KEY")
        if not api_key:
            raise ValueError(
                "FINOVA_GROQ_API_KEY or GROQ_API_KEY is required for Groq Whisper STT"
            )
        return openai.STT(
            model=resolved.model_id,
            base_url=GROQ_OPENAI_BASE_URL,
            api_key=api_key,
            language=os.getenv("GROQ_WHISPER_LANGUAGE", "en"),
        )

    api_key = resolved.api_key or _first_env(
        "FINOVA_DEEPGRAM_API_KEY",
        "DEEPGRAM_API_KEY",
    )
    if not api_key:
        raise ValueError(
            "FINOVA_DEEPGRAM_API_KEY or DEEPGRAM_API_KEY is required for Deepgram STT"
        )

    return deepgram.STT(
        model=resolved.model_id,
        language=os.getenv("DEEPGRAM_LANGUAGE", "en-US"),
        interim_results=True,
        no_delay=True,
        endpointing_ms=int_env("DEEPGRAM_ENDPOINTING_MS", 25),
        api_key=api_key,
    )


def parse_stt_runtime_selection(config: Mapping[str, object]) -> SttRuntimeSelection:
    pipeline = _mapping_value(config, "pipeline")
    pipeline_stt = _mapping_value(pipeline, "stt") if pipeline else None
    credentials = _mapping_value(config, "credentials")
    credentials_stt = _mapping_value(credentials, "stt") if credentials else None
    metadata = _mapping_value(config, "metadata")

    provider_id = _normalize_provider_id(
        _string_value(pipeline_stt, "providerId")
        or _string_value(metadata, "sttProviderId")
        or DEFAULT_STT_PROVIDER,
    )
    model_id = (
        _string_value(pipeline_stt, "model")
        or _string_value(metadata, "sttModel")
        or _default_model_for_provider(provider_id)
    )
    api_key = _string_value(credentials_stt, "apiKey")
    key_fingerprint = _string_value(credentials_stt, "keyFingerprint") or _string_value(
        metadata,
        "sttKeyFingerprint",
    )
    metadata_provider_id = _string_value(metadata, "sttProviderId")

    return SttRuntimeSelection(
        provider_id=provider_id,
        model_id=model_id,
        api_key=api_key,
        key_fingerprint=key_fingerprint,
        metadata_provider_id=metadata_provider_id,
    )


def log_stt_selection(selection: SttRuntimeSelection) -> None:
    logger.info(
        "stt_provider_selected provider=%s metadata_provider=%s model=%s key=%s",
        selection.provider_id,
        selection.metadata_provider_id or selection.provider_id,
        selection.model_id,
        "provided" if selection.api_key else "env",
    )
    if selection.key_fingerprint:
        logger.info("stt_key_fingerprint fingerprint=%s", selection.key_fingerprint)


class AssemblyAIStreamingSTT(stt.STT):
    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        sample_rate: int = 48000,
        end_utterance_silence_threshold: int = 500,
        buffer_size_seconds: float = 0.05,
    ) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True,
                interim_results=True,
            ),
        )
        self._api_key = api_key
        self._model = model
        self._sample_rate = sample_rate
        self._end_utterance_silence_threshold = end_utterance_silence_threshold
        self._buffer_size_seconds = buffer_size_seconds

    async def recognize(
        self,
        buffer: AudioBuffer,
        *,
        language: str | None = None,
    ) -> stt.SpeechEvent:
        raise NotImplementedError("AssemblyAI runtime STT supports streaming only")

    def stream(self, *, language: str | None = None) -> stt.SpeechStream:
        return AssemblyAISpeechStream(
            api_key=self._api_key,
            model=self._model,
            sample_rate=self._sample_rate,
            end_utterance_silence_threshold=self._end_utterance_silence_threshold,
            buffer_size_seconds=self._buffer_size_seconds,
            language=language or "en",
        )


class AssemblyAISpeechStream(stt.SpeechStream):
    _CLOSE_MSG = json.dumps({"terminate_session": True})

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        sample_rate: int,
        end_utterance_silence_threshold: int,
        buffer_size_seconds: float,
        language: str,
    ) -> None:
        super().__init__()
        self._api_key = api_key
        self._model = model
        self._sample_rate = sample_rate
        self._end_utterance_silence_threshold = end_utterance_silence_threshold
        self._buffer_size_seconds = buffer_size_seconds
        self._language = language

    @utils.log_exceptions(logger=logger)
    async def _main_task(self) -> None:
        params = {
            "sample_rate": self._sample_rate,
            "encoding": "pcm_s16le",
            "disable_partial_transcripts": "false",
        }
        url = f"{ASSEMBLYAI_REALTIME_WS_URL}?{urlencode(params)}"
        headers = {"Authorization": self._api_key}

        async with websockets.connect(url, extra_headers=headers) as ws:
            closing = False

            async def send_task() -> None:
                nonlocal closing
                await ws.send(
                    json.dumps(
                        {
                            "end_utterance_silence_threshold": (
                                self._end_utterance_silence_threshold
                            ),
                        },
                    ),
                )
                samples_per_buffer = max(
                    1,
                    round(self._sample_rate * self._buffer_size_seconds),
                )
                audio_bstream = utils.audio.AudioByteStream(
                    sample_rate=self._sample_rate,
                    num_channels=1,
                    samples_per_channel=samples_per_buffer,
                )
                async for frame in self._input_ch:
                    if isinstance(frame, self._FlushSentinel):
                        output_frames = audio_bstream.flush()
                    else:
                        output_frames = audio_bstream.write(frame.data.tobytes())
                    for output_frame in output_frames:
                        await ws.send(output_frame.data.tobytes())

                closing = True
                await ws.send(AssemblyAISpeechStream._CLOSE_MSG)

            async def recv_task() -> None:
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=5)
                    except asyncio.TimeoutError:
                        if closing:
                            return
                        continue
                    except websockets.ConnectionClosed:
                        if closing:
                            return
                        raise

                    if not isinstance(raw, str):
                        continue
                    self._process_message(json.loads(raw), closing)

            tasks = [
                asyncio.create_task(send_task(), name="assemblyai_send"),
                asyncio.create_task(recv_task(), name="assemblyai_recv"),
            ]
            try:
                await asyncio.gather(*tasks)
            finally:
                await utils.aio.gracefully_cancel(*tasks)

    def _process_message(self, data: dict[str, object], closing: bool) -> None:
        message_type = str(data.get("message_type") or "")
        if message_type == "SessionBegins":
            self._event_ch.send_nowait(
                stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH),
            )
            return

        if message_type == "PartialTranscript":
            text = str(data.get("text") or "").strip()
            if text:
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.INTERIM_TRANSCRIPT,
                        alternatives=[self._speech_data(data, text)],
                    ),
                )
            return

        if message_type == "FinalTranscript":
            text = str(data.get("text") or "").strip()
            if text:
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=stt.SpeechEventType.FINAL_TRANSCRIPT,
                        alternatives=[self._speech_data(data, text)],
                    ),
                )
            return

        if message_type == "SessionTerminated" and closing:
            return

        if message_type == "RealtimeError":
            raise RuntimeError(f"AssemblyAI STT error: {data.get('error') or data}")

        logger.debug("assemblyai_stt_event_ignored type=%s payload=%s", message_type, data)

    def _speech_data(self, data: dict[str, object], text: str) -> stt.SpeechData:
        words = data.get("words")
        start_time = 0.0
        end_time = 0.0
        if isinstance(words, list) and words:
            first = words[0] if isinstance(words[0], dict) else {}
            last = words[-1] if isinstance(words[-1], dict) else {}
            start_time = _float_value(first.get("start")) / 1000
            end_time = _float_value(last.get("end")) / 1000

        return stt.SpeechData(
            language=self._language,
            start_time=start_time,
            end_time=end_time,
            confidence=_float_value(data.get("confidence")),
            text=text,
        )


def int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid integer env %s=%r; using %s", name, raw, default)
        return default


def _mapping_value(
    source: Mapping[str, object] | None,
    key: str,
) -> dict[str, object] | None:
    if source is None:
        return None
    value = source.get(key)
    if not isinstance(value, dict):
        return None
    return {str(item_key): item_value for item_key, item_value in value.items()}


def _string_value(
    source: Mapping[str, object] | None,
    key: str,
) -> str | None:
    if source is None:
        return None
    value = source.get(key)
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed or None


def _normalize_provider_id(provider_id: str) -> str:
    return provider_id.strip().lower() or DEFAULT_STT_PROVIDER


def _default_model_for_provider(provider_id: str) -> str:
    if provider_id == RUNTIME_STT_PROVIDER_ASSEMBLYAI:
        return DEFAULT_ASSEMBLYAI_MODEL
    if provider_id == RUNTIME_STT_PROVIDER_GROQ_WHISPER:
        return DEFAULT_GROQ_WHISPER_MODEL
    return DEFAULT_DEEPGRAM_MODEL


def _float_value(value: object) -> float:
    if isinstance(value, (int, float)):
        return float(value)
    return 0.0


def _first_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return value.strip()
    return None
