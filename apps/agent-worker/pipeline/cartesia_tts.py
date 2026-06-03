import asyncio
import base64
import json
import logging
import time
import uuid
from collections.abc import Callable, Mapping
from typing import Any

import websockets
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

CARTESIA_WS_BASE = "wss://api.cartesia.ai/tts/websocket"
CARTESIA_API_VERSION = "2026-03-01"
CARTESIA_SAMPLE_RATE = 16_000
CARTESIA_CHANNELS = 1
DEFAULT_CARTESIA_MODEL_ID = "sonic-3.5"
DEFAULT_MAX_BUFFER_DELAY_MS = 250


class CartesiaTTS(tts.TTS):
    def __init__(
        self,
        voice_id: str,
        *,
        api_key: str,
        model_id: str = DEFAULT_CARTESIA_MODEL_ID,
        language: str = "en",
        sample_rate: int = CARTESIA_SAMPLE_RATE,
        first_chunk_chars: int = DEFAULT_FIRST_CHUNK_CHARS,
        chunk_chars: int = DEFAULT_CHUNK_CHARS,
        idle_flush_seconds: float = DEFAULT_IDLE_FLUSH_SECONDS,
        max_buffer_delay_ms: int = DEFAULT_MAX_BUFFER_DELAY_MS,
        metrics_callback: TtsMetricCallback | None = None,
    ) -> None:
        if not api_key.strip():
            raise ValueError("Cartesia API key is required")

        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=sample_rate,
            num_channels=CARTESIA_CHANNELS,
        )
        self._voice_id = voice_id
        self._model_id = normalize_cartesia_model_id(model_id)
        self._language = normalize_cartesia_language(language)
        self._api_key = api_key.strip()
        self._first_chunk_chars = env_int(
            "CARTESIA_TTS_FIRST_CHUNK_CHARS",
            first_chunk_chars,
        )
        self._chunk_chars = env_int("CARTESIA_TTS_CHUNK_CHARS", chunk_chars)
        self._idle_flush_seconds = env_float(
            "CARTESIA_TTS_IDLE_FLUSH_SECONDS",
            idle_flush_seconds,
        )
        self._max_buffer_delay_ms = env_int(
            "CARTESIA_TTS_MAX_BUFFER_DELAY_MS",
            max_buffer_delay_ms,
        )
        self._metrics_callback = metrics_callback
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._ws_lock = asyncio.Lock()
        self._send_lock = asyncio.Lock()

    def synthesize(self, text: str) -> "CartesiaChunkedStream":
        return CartesiaChunkedStream(self, text=text)

    def stream(self) -> "CartesiaSynthesizeStream":
        return CartesiaSynthesizeStream(self)

    async def _ensure_ws(self) -> websockets.WebSocketClientProtocol:
        async with self._ws_lock:
            if self._ws is not None and not self._ws.closed:
                return self._ws
            if self._ws is not None:
                await self._close_ws_unlocked()
            url = f"{CARTESIA_WS_BASE}?cartesia_version={CARTESIA_API_VERSION}"
            self._ws = await websockets.connect(
                url,
                additional_headers={"X-API-Key": self._api_key},
                open_timeout=5,
                close_timeout=2,
            )
            return self._ws

    async def send_payload(self, payload: Mapping[str, Any]) -> None:
        ws = await self._ensure_ws()
        async with self._send_lock:
            await ws.send(json.dumps(payload))

    async def recv_json(self) -> dict[str, Any]:
        ws = await self._ensure_ws()
        raw = await ws.recv()
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            raise TypeError("Cartesia websocket response must be a JSON object")
        return parsed

    async def aclose(self) -> None:
        async with self._ws_lock:
            await self._close_ws_unlocked()

    async def _close_ws_unlocked(self) -> None:
        if self._ws is None:
            return
        try:
            await self._ws.close()
        except Exception:
            logger.debug("cartesia_ws_close_failed", exc_info=True)
        finally:
            self._ws = None


class CartesiaChunkedStream(tts.ChunkedStream):
    def __init__(self, parent: CartesiaTTS, *, text: str) -> None:
        super().__init__()
        self._parent = parent
        self._text = text

    @utils.log_exceptions(logger=logger)
    async def _main_task(self) -> None:
        context_id = str(uuid.uuid4())
        started_at = time.monotonic()
        logger.info(
            "cartesia_tts_started context_id=%s mode=chunked chars=%s",
            context_id,
            len(self._text),
        )
        request_id = utils.shortuuid()
        segment_id = utils.shortuuid()
        emitter = _CartesiaAudioEmitter(
            stream=self,
            parent=self._parent,
            request_id=request_id,
            segment_id=segment_id,
        )
        done_event = asyncio.Event()

        async def receive_loop() -> None:
            first_audio = True
            try:
                while True:
                    message = await self._parent.recv_json()
                    if message.get("context_id") != context_id:
                        continue
                    msg_type = message.get("type")
                    if msg_type == "chunk":
                        data_b64 = message.get("data")
                        if isinstance(data_b64, str):
                            audio_chunk = base64.b64decode(data_b64)
                            if first_audio:
                                first_audio = False
                                first_audio_ms = round((time.monotonic() - started_at) * 1000)
                                logger.info(
                                    "cartesia_tts_first_audio_ms=%s context_id=%s",
                                    first_audio_ms,
                                    context_id,
                                )
                                emit_tts_metric(
                                    self._parent._metrics_callback,
                                    "tts_first_audio",
                                    provider="cartesia",
                                    chars=len(self._text),
                                    firstAudioMs=first_audio_ms,
                                )
                            emit_tts_metric(
                                self._parent._metrics_callback,
                                "tts_audio_packet",
                                provider="cartesia",
                                bytes=len(audio_chunk),
                            )
                            emitter.push(audio_chunk)
                    elif msg_type in {"done", "flush_done"}:
                        emitter.flush()
                        done_event.set()
                        logger.info(
                            "cartesia_tts_context_closed context_id=%s reason=%s",
                            context_id,
                            msg_type,
                        )
                        break
                    elif msg_type == "error":
                        logger.error(
                            "cartesia_tts_error context_id=%s payload=%s",
                            context_id,
                            message,
                        )
                        done_event.set()
                        break
            except asyncio.CancelledError:
                raise

        receive_task = asyncio.create_task(receive_loop())
        try:
            await self._parent.send_payload(
                build_generation_payload(
                    self._parent,
                    context_id=context_id,
                    transcript=self._text,
                    continue_input=False,
                ),
            )
            await asyncio.wait_for(done_event.wait(), timeout=30.0)
        except asyncio.CancelledError:
            try:
                await self._parent.send_payload(
                    {"context_id": context_id, "cancel": True},
                )
            except Exception:
                pass
            logger.info("cartesia_tts_cancelled context_id=%s", context_id)
            raise
        finally:
            await utils.aio.gracefully_cancel(receive_task)


class CartesiaSynthesizeStream(tts.SynthesizeStream):
    def __init__(self, parent: CartesiaTTS) -> None:
        super().__init__()
        self._parent = parent
        self._context_id = str(uuid.uuid4())
        self._cancelled = False
        self._done_event = asyncio.Event()
        self._receive_task: asyncio.Task[None] | None = None
        self._generation_epoch = 0
        self._text_chunk_count = 0

    @utils.log_exceptions(logger=logger)
    async def _main_task(self) -> None:
        start = time.monotonic()
        logger.info(
            "cartesia_tts_started context_id=%s voice=%s model=%s language=%s",
            self._context_id,
            self._parent._voice_id,
            self._parent._model_id,
            self._parent._language,
        )
        self._receive_task = asyncio.create_task(self._receive_loop(start))
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
                        await self._push_transcript(chunk, continue_input=True)
                        emitted_any = True
                    continue

                try:
                    item = read_task.result()
                    read_task = asyncio.create_task(self._input_ch.__anext__())
                except StopAsyncIteration:
                    input_closed = True
                    item = self._FlushSentinel()

                if isinstance(item, self._FlushSentinel):
                    emitted_any = await self._flush_buffer(buffer, emitted_any)
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
                    await self._push_transcript(chunk, continue_input=True)
                    emitted_any = True

            if buffer.strip():
                await self._flush_buffer(buffer, emitted_any)
            await self._finalize_context()
        except asyncio.CancelledError:
            await self._cancel_context()
            logger.info(
                "cartesia_tts_cancelled context_id=%s elapsed_ms=%s",
                self._context_id,
                round((time.monotonic() - start) * 1000),
            )
            raise
        finally:
            if read_task is not None and not read_task.done():
                await utils.aio.gracefully_cancel(read_task)
            if self._receive_task is not None:
                await utils.aio.gracefully_cancel(self._receive_task)

    async def _flush_buffer(self, buffer: str, emitted_any: bool) -> bool:
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
            await self._push_transcript(chunk, continue_input=True)
            emitted_any = True
        return emitted_any

    async def _push_transcript(self, text: str, *, continue_input: bool) -> None:
        if self._cancelled or not text.strip():
            return
        is_first = self._text_chunk_count == 0
        self._text_chunk_count += 1
        emit_tts_metric(
            self._parent._metrics_callback,
            "tts_text_chunk",
            provider="cartesia",
            chars=len(text),
            isFirst=is_first,
            continueInput=continue_input,
            targetChars=self._parent._first_chunk_chars if is_first else self._parent._chunk_chars,
        )
        await self._parent.send_payload(
            build_generation_payload(
                self._parent,
                context_id=self._context_id,
                transcript=text,
                continue_input=continue_input,
            ),
        )

    async def _finalize_context(self) -> None:
        if self._cancelled:
            return
        await self._parent.send_payload(
            {
                "context_id": self._context_id,
                "flush": True,
            },
        )
        try:
            await asyncio.wait_for(self._done_event.wait(), timeout=30.0)
        except asyncio.TimeoutError:
            logger.warning(
                "cartesia_tts_finalize_timeout context_id=%s",
                self._context_id,
            )

    async def _cancel_context(self) -> None:
        if self._cancelled:
            return
        self._cancelled = True
        self._generation_epoch += 1
        try:
            await self._parent.send_payload(
                {
                    "context_id": self._context_id,
                    "cancel": True,
                },
            )
        except Exception as error:
            logger.warning(
                "cartesia_tts_cancel_send_failed context_id=%s error=%s",
                self._context_id,
                error,
            )
        self._done_event.set()
        logger.info(
            "cartesia_tts_context_closed context_id=%s reason=cancel",
            self._context_id,
        )

    async def _receive_loop(self, started_at: float) -> None:
        emitter = _CartesiaAudioEmitter(
            stream=self,
            parent=self._parent,
            request_id=utils.shortuuid(),
            segment_id=utils.shortuuid(),
            cancelled=lambda: self._cancelled,
        )
        first_audio = True
        epoch = self._generation_epoch

        try:
            while not self._cancelled:
                try:
                    message = await self._parent.recv_json()
                except asyncio.CancelledError:
                    raise
                except Exception as error:
                    logger.error(
                        "cartesia_tts_error context_id=%s stage=recv error=%s",
                        self._context_id,
                        error,
                    )
                    break

                if message.get("context_id") != self._context_id:
                    continue
                if self._cancelled or epoch != self._generation_epoch:
                    continue

                msg_type = message.get("type")
                if msg_type == "chunk":
                    data_b64 = message.get("data")
                    if not isinstance(data_b64, str):
                        continue
                    try:
                        chunk = base64.b64decode(data_b64)
                    except Exception as error:
                        logger.error(
                            "cartesia_tts_error context_id=%s stage=decode error=%s",
                            self._context_id,
                            error,
                        )
                        continue
                    if first_audio:
                        first_audio = False
                        first_audio_ms = round((time.monotonic() - started_at) * 1000)
                        logger.info(
                            "cartesia_tts_first_audio_ms=%s context_id=%s",
                            first_audio_ms,
                            self._context_id,
                        )
                        emit_tts_metric(
                            self._parent._metrics_callback,
                            "tts_first_audio",
                            provider="cartesia",
                            firstAudioMs=first_audio_ms,
                        )
                    emit_tts_metric(
                        self._parent._metrics_callback,
                        "tts_audio_packet",
                        provider="cartesia",
                        bytes=len(chunk),
                    )
                    emitter.push(chunk)
                elif msg_type in {"done", "flush_done"}:
                    emitter.flush()
                    self._done_event.set()
                    logger.info(
                        "cartesia_tts_context_closed context_id=%s reason=%s",
                        self._context_id,
                        msg_type,
                    )
                    break
                elif msg_type == "error":
                    logger.error(
                        "cartesia_tts_error context_id=%s payload=%s",
                        self._context_id,
                        message,
                    )
                    self._done_event.set()
                    break
        except asyncio.CancelledError:
            raise
        finally:
            emitter.flush()


class _CartesiaAudioEmitter:
    def __init__(
        self,
        *,
        stream: tts.SynthesizeStream | tts.ChunkedStream,
        parent: CartesiaTTS,
        request_id: str,
        segment_id: str,
        cancelled: Callable[[], bool] | None = None,
    ) -> None:
        self._stream = stream
        self._parent = parent
        self._request_id = request_id
        self._segment_id = segment_id
        self._cancelled = cancelled
        self._pending = bytearray()

    def push(self, chunk: bytes) -> None:
        if self._cancelled and self._cancelled():
            return
        self._pending.extend(chunk)
        self._emit_complete_frames()

    def flush(self) -> None:
        if self._pending:
            frame_width = PCM_BYTES_PER_SAMPLE * self._parent.num_channels
            remainder = len(self._pending) % frame_width
            if remainder:
                self._pending.extend(b"\x00" * (frame_width - remainder))
            self._emit_complete_frames()

    def _emit_complete_frames(self) -> None:
        frame_width = PCM_BYTES_PER_SAMPLE * self._parent.num_channels
        complete_bytes = len(self._pending) - (len(self._pending) % frame_width)
        if complete_bytes == 0:
            return
        audio = bytes(self._pending[:complete_bytes])
        del self._pending[:complete_bytes]
        samples_per_channel = complete_bytes // frame_width
        if samples_per_channel == 0:
            return
        if self._cancelled and self._cancelled():
            return
        frame = rtc.AudioFrame(
            audio,
            self._parent.sample_rate,
            self._parent.num_channels,
            samples_per_channel,
        )
        emit_tts_metric(
            self._parent._metrics_callback,
            "tts_audio_frame",
            provider="cartesia",
            bytes=len(audio),
            frames=1,
            generatedAudioMs=round((samples_per_channel / self._parent.sample_rate) * 1000),
        )
        self._stream._event_ch.send_nowait(
            tts.SynthesizedAudio(
                request_id=self._request_id,
                segment_id=self._segment_id,
                frame=frame,
            ),
        )


def build_generation_payload(
    parent: CartesiaTTS,
    *,
    context_id: str,
    transcript: str,
    continue_input: bool,
) -> dict[str, Any]:
    return {
        "model_id": parent._model_id,
        "transcript": transcript,
        "voice": {"mode": "id", "id": parent._voice_id},
        "language": parent._language,
        "context_id": context_id,
        "continue": continue_input,
        "max_buffer_delay_ms": parent._max_buffer_delay_ms,
        "output_format": {
            "container": "raw",
            "encoding": "pcm_s16le",
            "sample_rate": parent.sample_rate,
        },
    }


def normalize_cartesia_language(language: str) -> str:
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


def normalize_cartesia_model_id(model_id: str) -> str:
    trimmed = model_id.strip()
    if not trimmed or trimmed == "cartesia":
        return DEFAULT_CARTESIA_MODEL_ID
    return trimmed
