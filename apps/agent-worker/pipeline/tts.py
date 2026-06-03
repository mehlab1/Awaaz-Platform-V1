import asyncio
import logging
import os
import re
import time
from collections.abc import Callable, Mapping

import httpx
from livekit import rtc
from livekit.agents import tts, utils


logger = logging.getLogger(__name__)

RIME_TTS_URL = "https://users.rime.ai/v1/rime-tts"
RIME_SAMPLE_RATE = 16_000
RIME_CHANNELS = 1
PCM_BYTES_PER_SAMPLE = 2
# Defaults favor fast barge-in while leaving enough text for natural Rime prosody.
# Keep RIME_TTS_FIRST_CHUNK_CHARS/RIME_TTS_CHUNK_CHARS env overrides available.
DEFAULT_FIRST_CHUNK_CHARS = 24
DEFAULT_CHUNK_CHARS = 48
DEFAULT_IDLE_FLUSH_SECONDS = 0.35
SENTENCE_BOUNDARY_RE = re.compile(r"^(.+?[.!?])(\s+|$)", re.DOTALL)
WHITESPACE_RE = re.compile(r"\s+")
TtsMetricCallback = Callable[[str, Mapping[str, object]], None]


def emit_tts_metric(
    callback: TtsMetricCallback | None,
    event: str,
    **fields: object,
) -> None:
    if callback is None:
        return
    try:
        callback(event, {key: value for key, value in fields.items() if value is not None})
    except Exception:
        logger.debug("tts_metric_callback_failed event=%s", event, exc_info=True)


class RimeTTS(tts.TTS):
    def __init__(
        self,
        voice_id: str,
        *,
        api_key: str | None = None,
        model_id: str = "mistv2",
        language: str = "eng",
        speed_alpha: float = 1.0,
        base_url: str = RIME_TTS_URL,
        sample_rate: int = RIME_SAMPLE_RATE,
        first_chunk_chars: int = DEFAULT_FIRST_CHUNK_CHARS,
        chunk_chars: int = DEFAULT_CHUNK_CHARS,
        idle_flush_seconds: float = DEFAULT_IDLE_FLUSH_SECONDS,
        metrics_callback: TtsMetricCallback | None = None,
    ) -> None:
        resolved_api_key = api_key or os.getenv("RIME_API_KEY")
        if not resolved_api_key:
            raise ValueError("RIME_API_KEY is required")

        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=sample_rate,
            num_channels=RIME_CHANNELS,
        )
        self._voice_id = voice_id
        self._model_id = model_id
        self._language = language
        self._speed_alpha = speed_alpha
        self._base_url = base_url
        self._api_key = resolved_api_key
        self._first_chunk_chars = env_int(
            "RIME_TTS_FIRST_CHUNK_CHARS",
            first_chunk_chars,
        )
        self._chunk_chars = env_int("RIME_TTS_CHUNK_CHARS", chunk_chars)
        self._idle_flush_seconds = env_float(
            "RIME_TTS_IDLE_FLUSH_SECONDS",
            idle_flush_seconds,
        )
        self._metrics_callback = metrics_callback
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0))
        logger.info(
            "rime_tts_initialized voice=%s model=%s lang=%s sample_rate=%s "
            "first_chunk_chars=%s chunk_chars=%s idle_flush_seconds=%s",
            self._voice_id,
            self._model_id,
            self._language,
            self.sample_rate,
            self._first_chunk_chars,
            self._chunk_chars,
            self._idle_flush_seconds,
        )

    def synthesize(self, text: str) -> "RimeStream":
        logger.info(
            "rime_tts_synthesize_requested voice=%s model=%s lang=%s chars=%s",
            self._voice_id,
            self._model_id,
            self._language,
            len(text),
        )
        return RimeStream(
            client=self._client,
            api_key=self._api_key,
            base_url=self._base_url,
            text=text,
            voice_id=self._voice_id,
            model_id=self._model_id,
            language=self._language,
            speed_alpha=self._speed_alpha,
            sample_rate=self.sample_rate,
            num_channels=self.num_channels,
            metrics_callback=self._metrics_callback,
        )

    def stream(self) -> "RimeSynthesizeStream":
        logger.info(
            "rime_tts_stream_created voice=%s model=%s lang=%s",
            self._voice_id,
            self._model_id,
            self._language,
        )
        return RimeSynthesizeStream(
            client=self._client,
            api_key=self._api_key,
            base_url=self._base_url,
            voice_id=self._voice_id,
            model_id=self._model_id,
            language=self._language,
            speed_alpha=self._speed_alpha,
            sample_rate=self.sample_rate,
            num_channels=self.num_channels,
            first_chunk_chars=self._first_chunk_chars,
            chunk_chars=self._chunk_chars,
            idle_flush_seconds=self._idle_flush_seconds,
            metrics_callback=self._metrics_callback,
        )

    async def aclose(self) -> None:
        await self._client.aclose()


class RimeSynthesizeStream(tts.SynthesizeStream):
    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        api_key: str,
        base_url: str,
        voice_id: str,
        model_id: str,
        language: str,
        speed_alpha: float,
        sample_rate: int,
        num_channels: int,
        first_chunk_chars: int,
        chunk_chars: int,
        idle_flush_seconds: float,
        metrics_callback: TtsMetricCallback | None = None,
    ) -> None:
        super().__init__()
        self._client = client
        self._api_key = api_key
        self._base_url = base_url
        self._voice_id = voice_id
        self._model_id = model_id
        self._language = language
        self._speed_alpha = speed_alpha
        self._sample_rate = sample_rate
        self._num_channels = num_channels
        self._first_chunk_chars = max(12, first_chunk_chars)
        self._chunk_chars = max(self._first_chunk_chars, chunk_chars)
        self._idle_flush_seconds = max(0.1, idle_flush_seconds)
        self._metrics_callback = metrics_callback

    @utils.log_exceptions(logger=logger)
    async def _main_task(self) -> None:
        buffer = ""
        emitted_any = False
        input_closed = False
        read_task: asyncio.Task[str | tts.SynthesizeStream._FlushSentinel] | None = (
            asyncio.create_task(self._input_ch.__anext__())
        )

        try:
            while not input_closed:
                assert read_task is not None
                done, _ = await asyncio.wait(
                    {read_task},
                    timeout=self._idle_flush_seconds if buffer.strip() else None,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if not done:
                    chunk, buffer, split_reason = take_ready_text(
                        buffer,
                        force=True,
                        target_chars=self._first_chunk_chars
                        if not emitted_any
                        else self._chunk_chars,
                    )
                    if chunk:
                        await self._emit_chunk(
                            chunk,
                            is_first=not emitted_any,
                            flush_reason="idle_timeout",
                            split_reason=split_reason,
                        )
                        emitted_any = True
                    continue

                try:
                    item = read_task.result()
                    read_task = asyncio.create_task(self._input_ch.__anext__())
                    flush_reason = "explicit_flush"
                except StopAsyncIteration:
                    input_closed = True
                    item = self._FlushSentinel()
                    flush_reason = "input_closed"

                if isinstance(item, self._FlushSentinel):
                    emitted_any = await self._flush_buffer(
                        buffer,
                        emitted_any,
                        flush_reason,
                    )
                    buffer = ""
                    continue

                buffer += item
                while True:
                    chunk, buffer, split_reason = take_ready_text(
                        buffer,
                        force=False,
                        target_chars=self._first_chunk_chars
                        if not emitted_any
                        else self._chunk_chars,
                    )
                    if not chunk:
                        break
                    await self._emit_chunk(
                        chunk,
                        is_first=not emitted_any,
                        flush_reason="streaming_text",
                        split_reason=split_reason,
                    )
                    emitted_any = True
        finally:
            if read_task is not None and not read_task.done():
                await utils.aio.gracefully_cancel(read_task)

    async def _flush_buffer(
        self,
        buffer: str,
        emitted_any: bool,
        flush_reason: str,
    ) -> bool:
        while buffer.strip():
            chunk, buffer, split_reason = take_ready_text(
                buffer,
                force=True,
                target_chars=self._first_chunk_chars
                if not emitted_any
                else self._chunk_chars,
            )
            if not chunk:
                break
            await self._emit_chunk(
                chunk,
                is_first=not emitted_any,
                flush_reason=flush_reason,
                split_reason=split_reason,
            )
            emitted_any = True
        return emitted_any

    async def _emit_chunk(
        self,
        text: str,
        *,
        is_first: bool,
        flush_reason: str,
        split_reason: str,
    ) -> None:
        logger.info(
            "rime_tts_text_chunk_created rime_tts_chunk_chars=%s "
            "rime_tts_chunk_flush_reason=%s split_reason=%s is_first=%s preview=%r",
            len(text),
            flush_reason,
            split_reason,
            is_first,
            text[:80],
        )
        emit_tts_metric(
            self._metrics_callback,
            "tts_text_chunk",
            provider="rime",
            chars=len(text),
            isFirst=is_first,
            flushReason=flush_reason,
            splitReason=split_reason,
            targetChars=self._first_chunk_chars if is_first else self._chunk_chars,
        )
        if is_first:
            logger.info("rime_tts_first_chunk_chars chars=%s", len(text))
        await self._synthesize_chunk(text)

    async def _synthesize_chunk(self, text: str) -> None:
        if not text.strip():
            return

        start = time.monotonic()
        logger.info(
            "rime_tts_chunk_start chars=%s voice=%s model=%s lang=%s preview=%r",
            len(text),
            self._voice_id,
            self._model_id,
            self._language,
            text[:80],
        )

        first_frame = True
        frame_count = 0
        generated_samples = 0
        stream = RimeStream(
            client=self._client,
            api_key=self._api_key,
            base_url=self._base_url,
            text=text,
            voice_id=self._voice_id,
            model_id=self._model_id,
            language=self._language,
            speed_alpha=self._speed_alpha,
            sample_rate=self._sample_rate,
            num_channels=self._num_channels,
        )
        try:
            async for audio in stream:
                frame = getattr(audio, "frame", None)
                samples_per_channel = int(
                    getattr(frame, "samples_per_channel", 0) or 0,
                )
                generated_samples += samples_per_channel
                if first_frame:
                    first_frame = False
                    first_audio_ms = round((time.monotonic() - start) * 1000)
                    logger.info(
                        "rime_tts_audio_first_frame_ms=%s chars=%s",
                        first_audio_ms,
                        len(text),
                    )
                    emit_tts_metric(
                        self._metrics_callback,
                        "tts_first_audio",
                        provider="rime",
                        chars=len(text),
                        firstAudioMs=first_audio_ms,
                    )
                frame_count += 1
                self._event_ch.send_nowait(audio)
        except asyncio.CancelledError:
            generated_audio_ms = (
                round((generated_samples / self._sample_rate) * 1000)
                if generated_samples
                else None
            )
            logger.info(
                "rime_tts_chunk_cancelled tts_stream_cancelled elapsed_ms=%s "
                "chars=%s frames=%s generated_audio_ms=%s",
                round((time.monotonic() - start) * 1000),
                len(text),
                frame_count,
                generated_audio_ms,
            )
            emit_tts_metric(
                self._metrics_callback,
                "tts_audio_chunk_cancelled",
                provider="rime",
                chars=len(text),
                frames=frame_count,
                generatedAudioMs=generated_audio_ms,
            )
            raise
        finally:
            await stream.aclose()

        generated_audio_ms = (
            round((generated_samples / self._sample_rate) * 1000)
            if generated_samples
            else None
        )
        logger.info(
            "rime_tts_chunk_done_ms=%s chars=%s frames=%s generated_audio_ms=%s",
            round((time.monotonic() - start) * 1000),
            len(text),
            frame_count,
            generated_audio_ms,
        )
        emit_tts_metric(
            self._metrics_callback,
            "tts_audio_chunk_done",
            provider="rime",
            chars=len(text),
            frames=frame_count,
            generatedAudioMs=generated_audio_ms,
            elapsedMs=round((time.monotonic() - start) * 1000),
        )


class RimeStream(tts.ChunkedStream):
    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        api_key: str,
        base_url: str,
        text: str,
        voice_id: str,
        model_id: str,
        language: str,
        speed_alpha: float,
        sample_rate: int,
        num_channels: int,
        metrics_callback: TtsMetricCallback | None = None,
    ) -> None:
        super().__init__()
        self._client = client
        self._api_key = api_key
        self._base_url = base_url
        self._text = text
        self._voice_id = voice_id
        self._model_id = model_id
        self._language = language
        self._speed_alpha = speed_alpha
        self._sample_rate = sample_rate
        self._num_channels = num_channels
        self._metrics_callback = metrics_callback

    @utils.log_exceptions()
    async def _main_task(self) -> None:
        request_id = utils.shortuuid()
        segment_id = utils.shortuuid()
        pending = bytearray()
        start = time.monotonic()
        first_chunk = True
        bytes_received = 0

        try:
            logger.info(
                "rime_http_request speaker=%s modelId=%s lang=%s chars=%s",
                self._voice_id,
                self._model_id,
                self._language,
                len(self._text),
            )
            async with self._client.stream(
                "POST",
                self._base_url,
                headers={
                    "Accept": "audio/pcm",
                    "Authorization": f"Bearer {self._api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "text": self._text,
                    "modelId": self._model_id,
                    "speaker": self._voice_id,
                    "lang": self._language,
                    "samplingRate": self._sample_rate,
                    "speedAlpha": self._speed_alpha,
                },
            ) as response:
                response.raise_for_status()
                async for chunk in response.aiter_bytes():
                    if first_chunk:
                        first_chunk = False
                        first_byte_ms = round((time.monotonic() - start) * 1000)
                        logger.info(
                            "rime_http_first_byte_ms=%s chars=%s voice=%s",
                            first_byte_ms,
                            len(self._text),
                            self._voice_id,
                        )
                        emit_tts_metric(
                            self._metrics_callback,
                            "tts_first_audio",
                            provider="rime",
                            chars=len(self._text),
                            firstAudioMs=first_byte_ms,
                        )
                    bytes_received += len(chunk)
                    pending.extend(chunk)
                    audio = self._take_complete_pcm_frames(pending)
                    if audio:
                        self._send_audio(audio, request_id, segment_id)
        except asyncio.CancelledError:
            logger.info(
                "rime_http_cancelled_ms=%s chars=%s bytes=%s voice=%s",
                round((time.monotonic() - start) * 1000),
                len(self._text),
                bytes_received,
                self._voice_id,
            )
            raise

        if pending:
            self._send_audio(bytes(pending), request_id, segment_id)

        logger.info(
            "rime_http_done_ms=%s chars=%s bytes=%s voice=%s",
            round((time.monotonic() - start) * 1000),
            len(self._text),
            bytes_received,
            self._voice_id,
        )
        emit_tts_metric(
            self._metrics_callback,
            "tts_audio_chunk_done",
            provider="rime",
            chars=len(self._text),
            bytes=bytes_received,
            elapsedMs=round((time.monotonic() - start) * 1000),
        )

    def _take_complete_pcm_frames(self, pending: bytearray) -> bytes:
        frame_width = PCM_BYTES_PER_SAMPLE * self._num_channels
        complete_bytes = len(pending) - (len(pending) % frame_width)
        if complete_bytes == 0:
            return b""
        audio = bytes(pending[:complete_bytes])
        del pending[:complete_bytes]
        return audio

    def _send_audio(
        self,
        audio: bytes,
        request_id: str,
        segment_id: str,
    ) -> None:
        samples_per_channel = len(audio) // (
            PCM_BYTES_PER_SAMPLE * self._num_channels
        )
        if samples_per_channel == 0:
            return
        frame = rtc.AudioFrame(
            audio,
            self._sample_rate,
            self._num_channels,
            samples_per_channel,
        )
        self._event_ch.send_nowait(
            tts.SynthesizedAudio(
                request_id=request_id,
                segment_id=segment_id,
                frame=frame,
            ),
        )


def take_ready_text(
    text: str,
    *,
    force: bool,
    target_chars: int = DEFAULT_CHUNK_CHARS,
) -> tuple[str, str, str]:
    if not text.strip():
        return "", "", "empty"

    candidate = text.lstrip()
    sentence_match = SENTENCE_BOUNDARY_RE.match(candidate)
    if sentence_match and (
        force or len(normalize_chunk(sentence_match.group(1))) >= 8
    ):
        chunk = normalize_chunk(sentence_match.group(1))
        return chunk, candidate[sentence_match.end() :].lstrip(), "sentence_boundary"

    normalized_candidate = normalize_chunk(candidate)
    if not force and len(normalized_candidate) < target_chars:
        return "", text, "waiting_for_target_chars"

    if force and len(normalized_candidate) <= target_chars:
        return normalized_candidate, "", "forced_flush"

    limit = min(len(candidate), target_chars)
    boundary = max(
        candidate.rfind(",", 0, limit),
        candidate.rfind(";", 0, limit),
        candidate.rfind(":", 0, limit),
        candidate.rfind(" ", 0, limit),
    )
    if boundary < max(12, target_chars // 2):
        boundary = limit

    chunk = normalize_chunk(candidate[:boundary])
    rest = candidate[boundary:].lstrip()
    split_reason = "punctuation_boundary" if candidate[boundary : boundary + 1] in {",", ";", ":"} else "target_chars"
    return chunk, rest, split_reason


def normalize_chunk(text: str) -> str:
    return WHITESPACE_RE.sub(" ", text).strip()


def env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        logger.warning("Invalid integer env %s=%r; using %s", name, raw, default)
        return default


def env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        logger.warning("Invalid float env %s=%r; using %s", name, raw, default)
        return default
