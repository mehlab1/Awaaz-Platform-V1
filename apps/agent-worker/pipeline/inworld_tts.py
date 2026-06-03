import asyncio
import base64
import json
import logging
import time
from json import JSONDecoder
from typing import Any

import httpx
from livekit import rtc
from livekit.agents import tts, utils

from pipeline.tts import (
    DEFAULT_CHUNK_CHARS,
    DEFAULT_FIRST_CHUNK_CHARS,
    DEFAULT_IDLE_FLUSH_SECONDS,
    PCM_BYTES_PER_SAMPLE,
    TtsMetricCallback,
    emit_tts_metric,
    env_float,
    env_int,
    take_ready_text,
)


logger = logging.getLogger(__name__)

INWORLD_TTS_STREAM_URL = "https://api.inworld.ai/tts/v1/voice:stream"
INWORLD_SAMPLE_RATE = 16_000
INWORLD_CHANNELS = 1
DEFAULT_INWORLD_MODEL_ID = "inworld-tts-2"
DEFAULT_DELIVERY_MODE = "BALANCED"


class InworldTTS(tts.TTS):
    def __init__(
        self,
        voice_id: str,
        *,
        api_key: str,
        model_id: str = DEFAULT_INWORLD_MODEL_ID,
        language: str = "en",
        sample_rate: int = INWORLD_SAMPLE_RATE,
        first_chunk_chars: int = DEFAULT_FIRST_CHUNK_CHARS,
        chunk_chars: int = DEFAULT_CHUNK_CHARS,
        idle_flush_seconds: float = DEFAULT_IDLE_FLUSH_SECONDS,
        delivery_mode: str = DEFAULT_DELIVERY_MODE,
        metrics_callback: TtsMetricCallback | None = None,
    ) -> None:
        if not api_key.strip():
            raise ValueError("Inworld API key is required")

        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=sample_rate,
            num_channels=INWORLD_CHANNELS,
        )
        self._voice_id = voice_id
        self._model_id = normalize_inworld_model_id(model_id)
        self._language = normalize_inworld_language(language)
        self._api_key = api_key.strip()
        self._delivery_mode = delivery_mode
        self._first_chunk_chars = env_int(
            "INWORLD_TTS_FIRST_CHUNK_CHARS",
            first_chunk_chars,
        )
        self._chunk_chars = env_int("INWORLD_TTS_CHUNK_CHARS", chunk_chars)
        self._idle_flush_seconds = env_float(
            "INWORLD_TTS_IDLE_FLUSH_SECONDS",
            idle_flush_seconds,
        )
        self._metrics_callback = metrics_callback
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=5.0))
        logger.info(
            "inworld_tts_initialized voice=%s model=%s language=%s sample_rate=%s "
            "delivery_mode=%s first_chunk_chars=%s chunk_chars=%s",
            self._voice_id,
            self._model_id,
            self._language,
            self.sample_rate,
            self._delivery_mode,
            self._first_chunk_chars,
            self._chunk_chars,
        )

    def synthesize(self, text: str) -> "InworldStream":
        return InworldStream(
            client=self._client,
            api_key=self._api_key,
            voice_id=self._voice_id,
            model_id=self._model_id,
            text=text,
            sample_rate=self.sample_rate,
            num_channels=self.num_channels,
            delivery_mode=self._delivery_mode,
            metrics_callback=self._metrics_callback,
        )

    def stream(self) -> "InworldSynthesizeStream":
        return InworldSynthesizeStream(self)

    async def aclose(self) -> None:
        await self._client.aclose()


class InworldSynthesizeStream(tts.SynthesizeStream):
    def __init__(self, parent: InworldTTS) -> None:
        super().__init__()
        self._parent = parent
        self._generation_id = 0
        self._text_chunk_count = 0

    @utils.log_exceptions(logger=logger)
    async def _main_task(self) -> None:
        generation_id = self._generation_id
        logger.info(
            "inworld_tts_started generation=%s voice=%s model=%s language=%s",
            generation_id,
            self._parent._voice_id,
            self._parent._model_id,
            self._parent._language,
        )
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
                    timeout=self._parent._idle_flush_seconds if buffer.strip() else None,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if not done:
                    chunk, buffer, _ = take_ready_text(
                        buffer,
                        force=True,
                        target_chars=self._parent._first_chunk_chars
                        if not emitted_any
                        else self._parent._chunk_chars,
                    )
                    if chunk:
                        await self._emit_chunk(chunk, generation_id=generation_id)
                        emitted_any = True
                    continue

                try:
                    item = read_task.result()
                    read_task = asyncio.create_task(self._input_ch.__anext__())
                except StopAsyncIteration:
                    input_closed = True
                    item = self._FlushSentinel()

                if isinstance(item, self._FlushSentinel):
                    emitted_any = await self._flush_buffer(
                        buffer,
                        emitted_any,
                        generation_id=generation_id,
                    )
                    buffer = ""
                    continue

                buffer += item
                while True:
                    chunk, buffer, _ = take_ready_text(
                        buffer,
                        force=False,
                        target_chars=self._parent._first_chunk_chars
                        if not emitted_any
                        else self._parent._chunk_chars,
                    )
                    if not chunk:
                        break
                    await self._emit_chunk(chunk, generation_id=generation_id)
                    emitted_any = True
        except asyncio.CancelledError:
            self._generation_id += 1
            logger.info(
                "inworld_tts_cancelled generation=%s voice=%s",
                generation_id,
                self._parent._voice_id,
            )
            raise
        finally:
            if read_task is not None and not read_task.done():
                await utils.aio.gracefully_cancel(read_task)
            logger.info(
                "inworld_tts_closed generation=%s voice=%s",
                generation_id,
                self._parent._voice_id,
            )

    async def _flush_buffer(
        self,
        buffer: str,
        emitted_any: bool,
        *,
        generation_id: int,
    ) -> bool:
        while buffer.strip():
            chunk, buffer, _ = take_ready_text(
                buffer,
                force=True,
                target_chars=self._parent._first_chunk_chars
                if not emitted_any
                else self._parent._chunk_chars,
            )
            if not chunk:
                break
            await self._emit_chunk(chunk, generation_id=generation_id)
            emitted_any = True
        return emitted_any

    async def _emit_chunk(self, text: str, *, generation_id: int) -> None:
        if generation_id != self._generation_id:
            return
        is_first = self._text_chunk_count == 0
        self._text_chunk_count += 1
        emit_tts_metric(
            self._parent._metrics_callback,
            "tts_text_chunk",
            provider="inworld",
            chars=len(text),
            isFirst=is_first,
            targetChars=self._parent._first_chunk_chars if is_first else self._parent._chunk_chars,
        )
        stream = InworldStream(
            client=self._parent._client,
            api_key=self._parent._api_key,
            voice_id=self._parent._voice_id,
            model_id=self._parent._model_id,
            text=text,
            sample_rate=self._parent.sample_rate,
            num_channels=self._parent.num_channels,
            delivery_mode=self._parent._delivery_mode,
            metrics_callback=self._parent._metrics_callback,
        )
        try:
            async for audio in stream:
                if generation_id != self._generation_id:
                    break
                self._event_ch.send_nowait(audio)
        except asyncio.CancelledError:
            raise
        finally:
            await stream.aclose()


class InworldStream(tts.ChunkedStream):
    def __init__(
        self,
        *,
        client: httpx.AsyncClient,
        api_key: str,
        voice_id: str,
        model_id: str,
        text: str,
        sample_rate: int,
        num_channels: int,
        delivery_mode: str,
        metrics_callback: TtsMetricCallback | None = None,
    ) -> None:
        super().__init__()
        self._client = client
        self._api_key = api_key
        self._voice_id = voice_id
        self._model_id = model_id
        self._text = text
        self._sample_rate = sample_rate
        self._num_channels = num_channels
        self._delivery_mode = delivery_mode
        self._metrics_callback = metrics_callback

    @utils.log_exceptions(logger=logger)
    async def _main_task(self) -> None:
        request_id = utils.shortuuid()
        segment_id = utils.shortuuid()
        pending = bytearray()
        start = time.monotonic()
        first_audio = True
        bytes_received = 0
        body = build_inworld_request_body(
            text=self._text,
            voice_id=self._voice_id,
            model_id=self._model_id,
            sample_rate=self._sample_rate,
            delivery_mode=self._delivery_mode,
        )

        try:
            async with self._client.stream(
                "POST",
                INWORLD_TTS_STREAM_URL,
                headers={
                    "Authorization": inworld_authorization_header(self._api_key),
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                },
                json=body,
            ) as response:
                response.raise_for_status()
                parser = InworldStreamJsonParser()
                async for text_chunk in response.aiter_text():
                    for message in parser.feed(text_chunk):
                        pcm = extract_pcm_from_message(message)
                        if not pcm:
                            continue
                        if first_audio:
                            first_audio = False
                            first_audio_ms = round((time.monotonic() - start) * 1000)
                            logger.info(
                                "inworld_tts_first_audio_ms=%s chars=%s voice=%s",
                                first_audio_ms,
                                len(self._text),
                                self._voice_id,
                            )
                            emit_tts_metric(
                                self._metrics_callback,
                                "tts_first_audio",
                                provider="inworld",
                                chars=len(self._text),
                                firstAudioMs=first_audio_ms,
                            )
                        bytes_received += len(pcm)
                        emit_tts_metric(
                            self._metrics_callback,
                            "tts_audio_packet",
                            provider="inworld",
                            bytes=len(pcm),
                        )
                        pending.extend(pcm)
                        self._emit_pending_pcm(pending, request_id, segment_id)
                for message in parser.flush():
                    pcm = extract_pcm_from_message(message)
                    if pcm:
                        bytes_received += len(pcm)
                        emit_tts_metric(
                            self._metrics_callback,
                            "tts_audio_packet",
                            provider="inworld",
                            bytes=len(pcm),
                        )
                        pending.extend(pcm)
                        self._emit_pending_pcm(pending, request_id, segment_id)
        except asyncio.CancelledError:
            logger.info(
                "inworld_tts_cancelled elapsed_ms=%s chars=%s bytes=%s voice=%s",
                round((time.monotonic() - start) * 1000),
                len(self._text),
                bytes_received,
                self._voice_id,
            )
            emit_tts_metric(
                self._metrics_callback,
                "tts_audio_chunk_cancelled",
                provider="inworld",
                chars=len(self._text),
                bytes=bytes_received,
                elapsedMs=round((time.monotonic() - start) * 1000),
            )
            raise
        except Exception as error:
            logger.error(
                "inworld_tts_error voice=%s model=%s chars=%s error=%s",
                self._voice_id,
                self._model_id,
                len(self._text),
                error,
            )
            raise

        if pending:
            self._emit_pending_pcm(pending, request_id, segment_id, flush=True)
        emit_tts_metric(
            self._metrics_callback,
            "tts_audio_chunk_done",
            provider="inworld",
            chars=len(self._text),
            bytes=bytes_received,
            elapsedMs=round((time.monotonic() - start) * 1000),
        )

    def _emit_pending_pcm(
        self,
        pending: bytearray,
        request_id: str,
        segment_id: str,
        *,
        flush: bool = False,
    ) -> None:
        frame_width = PCM_BYTES_PER_SAMPLE * self._num_channels
        complete_bytes = len(pending) - (len(pending) % frame_width)
        if complete_bytes == 0:
            if flush and pending:
                pad = frame_width - len(pending)
                pending.extend(b"\x00" * pad)
                complete_bytes = len(pending)
            else:
                return
        audio = bytes(pending[:complete_bytes])
        del pending[:complete_bytes]
        samples_per_channel = complete_bytes // frame_width
        if samples_per_channel == 0:
            return
        frame = rtc.AudioFrame(
            audio,
            self._sample_rate,
            self._num_channels,
            samples_per_channel,
        )
        emit_tts_metric(
            self._metrics_callback,
            "tts_audio_frame",
            provider="inworld",
            bytes=len(audio),
            frames=1,
            generatedAudioMs=round((samples_per_channel / self._sample_rate) * 1000),
        )
        self._event_ch.send_nowait(
            tts.SynthesizedAudio(
                request_id=request_id,
                segment_id=segment_id,
                frame=frame,
            ),
        )
        if flush and pending:
            self._emit_pending_pcm(pending, request_id, segment_id, flush=True)


class InworldStreamJsonParser:
    """Parse concatenated or newline-delimited JSON stream chunks from Inworld."""

    def __init__(self) -> None:
        self._buffer = ""
        self._decoder = JSONDecoder()

    def feed(self, chunk: str) -> list[dict[str, Any]]:
        self._buffer += chunk
        return self._consume_complete_objects()

    def flush(self) -> list[dict[str, Any]]:
        trimmed = self._buffer.strip()
        self._buffer = ""
        if not trimmed:
            return []
        try:
            return [json.loads(trimmed)]
        except json.JSONDecodeError:
            logger.warning("inworld_tts_stream_trailing_parse_failed bytes=%s", len(trimmed))
            return []

    def _consume_complete_objects(self) -> list[dict[str, Any]]:
        messages: list[dict[str, Any]] = []
        while self._buffer:
            stripped = self._buffer.lstrip()
            if stripped != self._buffer:
                self._buffer = stripped
            if not self._buffer:
                break
            try:
                message, end = self._decoder.raw_decode(self._buffer)
            except json.JSONDecodeError:
                line_end = self._buffer.find("\n")
                if line_end == -1:
                    break
                line = self._buffer[:line_end].strip()
                self._buffer = self._buffer[line_end + 1 :]
                if not line:
                    continue
                try:
                    message = json.loads(line)
                except json.JSONDecodeError:
                    break
                messages.append(message)
                continue
            messages.append(message)
            self._buffer = self._buffer[end:]
        return messages


def build_inworld_request_body(
    *,
    text: str,
    voice_id: str,
    model_id: str,
    sample_rate: int,
    delivery_mode: str,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "text": text,
        "voiceId": voice_id,
        "modelId": model_id,
        "audioConfig": {
            "audioEncoding": "PCM",
            "sampleRateHertz": sample_rate,
        },
    }
    if delivery_mode:
        body["deliveryMode"] = delivery_mode
    return body


def inworld_authorization_header(api_key: str) -> str:
    trimmed = api_key.strip()
    if trimmed.lower().startswith("basic "):
        return trimmed
    return f"Basic {trimmed}"


def extract_pcm_from_message(message: dict[str, Any]) -> bytes:
    error = message.get("error")
    if isinstance(error, dict) and error.get("message"):
        raise RuntimeError(f"Inworld TTS stream error: {error.get('message')}")

    result = message.get("result")
    if not isinstance(result, dict):
        return b""

    audio_content = result.get("audioContent")
    if not isinstance(audio_content, str) or not audio_content:
        return b""

    return base64.b64decode(audio_content)


def normalize_inworld_language(language: str) -> str:
    normalized = language.strip().lower().replace("_", "-")
    if not normalized:
        return "en"
    if normalized in {"eng", "english"}:
        return "en"
    if len(normalized) == 2:
        return normalized
    if "-" in normalized:
        return normalized.split("-", 1)[0]
    return normalized[:2] if len(normalized) >= 2 else "en"


def normalize_inworld_model_id(model_id: str) -> str:
    trimmed = model_id.strip()
    if not trimmed or trimmed in {"inworld", "default"}:
        return DEFAULT_INWORLD_MODEL_ID
    return trimmed
