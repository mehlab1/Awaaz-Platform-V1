import os

import httpx
from livekit import rtc
from livekit.agents import tts, utils


RIME_TTS_URL = "https://users.rime.ai/v1/rime-tts"
RIME_SAMPLE_RATE = 16_000
RIME_CHANNELS = 1
PCM_BYTES_PER_SAMPLE = 2


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
    ) -> None:
        resolved_api_key = api_key or os.getenv("RIME_API_KEY")
        if not resolved_api_key:
            raise ValueError("RIME_API_KEY is required")

        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=sample_rate,
            num_channels=RIME_CHANNELS,
        )
        self._voice_id = voice_id
        self._model_id = model_id
        self._language = language
        self._speed_alpha = speed_alpha
        self._base_url = base_url
        self._api_key = resolved_api_key
        self._client = httpx.AsyncClient(timeout=30.0)

    def synthesize(self, text: str) -> "RimeStream":
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

    async def aclose(self) -> None:
        await self._client.aclose()


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
                pending.extend(chunk)
                audio = self._take_complete_pcm_frames(pending)
                if audio:
                    self._send_audio(audio, request_id, segment_id)

        if pending:
            self._send_audio(bytes(pending), request_id, segment_id)

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
