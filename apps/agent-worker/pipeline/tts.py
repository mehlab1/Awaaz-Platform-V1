import asyncio
import logging
import os
import re
import time

import httpx
from livekit import rtc
from livekit.agents import tts, utils


logger = logging.getLogger(__name__)

RIME_TTS_URL = "https://users.rime.ai/v1/rime-tts"
RIME_SAMPLE_RATE = 16_000
RIME_CHANNELS = 1
PCM_BYTES_PER_SAMPLE = 2
DEFAULT_FIRST_CHUNK_CHARS = 36
DEFAULT_CHUNK_CHARS = 90
DEFAULT_IDLE_FLUSH_SECONDS = 0.35
SENTENCE_BOUNDARY_RE = re.compile(r"^(.+?[.!?])(\s+|$)", re.DOTALL)
WHITESPACE_RE = re.compile(r"\s+")


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
        self._client = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=5.0))
        logger.info(
            "rime_tts_initialized voice=%s model=%s lang=%s sample_rate=%s",
            self._voice_id,
            self._model_id,
            self._language,
            self.sample_rate,
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
                    chunk, buffer = take_ready_text(
                        buffer,
                        force=True,
                        target_chars=self._first_chunk_chars
                        if not emitted_any
                        else self._chunk_chars,
                    )
                    if chunk:
                        emitted_any = True
                        await self._synthesize_chunk(chunk)
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
                    chunk, buffer = take_ready_text(
                        buffer,
                        force=False,
                        target_chars=self._first_chunk_chars
                        if not emitted_any
                        else self._chunk_chars,
                    )
                    if not chunk:
                        break
                    emitted_any = True
                    await self._synthesize_chunk(chunk)
        finally:
            if read_task is not None and not read_task.done():
                await utils.aio.gracefully_cancel(read_task)

    async def _flush_buffer(self, buffer: str, emitted_any: bool) -> bool:
        while buffer.strip():
            chunk, buffer = take_ready_text(
                buffer,
                force=True,
                target_chars=self._first_chunk_chars
                if not emitted_any
                else self._chunk_chars,
            )
            if not chunk:
                break
            emitted_any = True
            await self._synthesize_chunk(chunk)
        return emitted_any

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
                if first_frame:
                    first_frame = False
                    logger.info(
                        "rime_tts_first_audio_ms=%s chars=%s",
                        round((time.monotonic() - start) * 1000),
                        len(text),
                    )
                frame_count += 1
                self._event_ch.send_nowait(audio)
        except asyncio.CancelledError:
            logger.info(
                "rime_tts_chunk_cancelled_ms=%s chars=%s frames=%s",
                round((time.monotonic() - start) * 1000),
                len(text),
                frame_count,
            )
            raise
        finally:
            await stream.aclose()

        logger.info(
            "rime_tts_chunk_done_ms=%s chars=%s frames=%s",
            round((time.monotonic() - start) * 1000),
            len(text),
            frame_count,
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

    @utils.log_exceptions()
    async def _main_task(self) -> None:
        request_id = utils.shortuuid()
        segment_id = utils.shortuuid()
        pending = bytearray()
        start = time.monotonic()
        first_chunk = True
        bytes_received = 0

        try:
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
                        logger.info(
                            "rime_http_first_byte_ms=%s chars=%s voice=%s",
                            round((time.monotonic() - start) * 1000),
                            len(self._text),
                            self._voice_id,
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
) -> tuple[str, str]:
    if not text.strip():
        return "", ""

    candidate = text.lstrip()
    sentence_match = SENTENCE_BOUNDARY_RE.match(candidate)
    if sentence_match and (
        force or len(normalize_chunk(sentence_match.group(1))) >= 8
    ):
        chunk = normalize_chunk(sentence_match.group(1))
        return chunk, candidate[sentence_match.end() :].lstrip()

    normalized_candidate = normalize_chunk(candidate)
    if not force and len(normalized_candidate) < target_chars:
        return "", text

    if force and len(normalized_candidate) <= target_chars:
        return normalized_candidate, ""

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
    return chunk, rest


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
