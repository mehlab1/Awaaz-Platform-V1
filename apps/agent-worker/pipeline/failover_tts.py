"""Provider-agnostic TTS failover wrapper with pre-call health probe and circuit breaker.

Usage:
    from pipeline.failover_tts import FailoverTTS

    primary = build_tts(config, primary_selection)
    fallback = build_tts(config, fallback_selection)
    engine = FailoverTTS(primary, fallback, primary_selection, fallback_selection)
"""

from __future__ import annotations

import asyncio
import logging
import time
import inspect
from collections.abc import Mapping
from dataclasses import dataclass, field

import httpx
from livekit.agents import tts, utils
from livekit import rtc
import copy

from pipeline.tts import TtsMetricCallback, emit_tts_metric


logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Retryable error classification
# ---------------------------------------------------------------------------

# HTTP status codes that indicate a transient provider outage.
_RETRYABLE_HTTP_STATUSES = frozenset({500, 502, 503, 504, 520, 521, 522, 523, 524, 529})

# Auth/config errors — these should NOT trigger failover; they are permanent.
_AUTH_HTTP_STATUSES = frozenset({401, 403})


class TtsRetryableError(Exception):
    """Raised when a TTS provider error is retryable (5xx, timeout, connection)."""

    def __init__(self, message: str, *, provider: str, original: BaseException | None = None) -> None:
        super().__init__(message)
        self.provider = provider
        self.original = original


class TtsAuthError(Exception):
    """Raised when a TTS provider returns an auth/config error (401/403)."""

    def __init__(self, message: str, *, provider: str, original: BaseException | None = None) -> None:
        super().__init__(message)
        self.provider = provider
        self.original = original


def classify_tts_error(
    error: BaseException,
    *,
    provider: str,
) -> TtsRetryableError | TtsAuthError | None:
    """Classify a TTS synthesis error as retryable, auth, or unknown.

    Returns a wrapped error for retryable/auth cases, None if unknown.
    """
    # httpx status errors
    if isinstance(error, httpx.HTTPStatusError):
        status = error.response.status_code
        if status in _RETRYABLE_HTTP_STATUSES:
            return TtsRetryableError(
                f"{provider} returned HTTP {status}",
                provider=provider,
                original=error,
            )
        if status in _AUTH_HTTP_STATUSES:
            return TtsAuthError(
                f"{provider} returned HTTP {status} (credentials/config error)",
                provider=provider,
                original=error,
            )
        return None

    # Timeouts and connection failures are retryable
    if isinstance(error, (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout, httpx.PoolTimeout)):
        return TtsRetryableError(
            f"{provider} timeout: {error}",
            provider=provider,
            original=error,
        )

    if isinstance(error, (httpx.ConnectError, httpx.RemoteProtocolError)):
        return TtsRetryableError(
            f"{provider} connection error: {error}",
            provider=provider,
            original=error,
        )

    # Websocket errors (cartesia uses websockets library)
    try:
        import websockets.exceptions as ws_exc

        if isinstance(error, (ws_exc.ConnectionClosed, ws_exc.InvalidStatusCode)):
            return TtsRetryableError(
                f"{provider} websocket error: {error}",
                provider=provider,
                original=error,
            )
    except ImportError:
        pass

    # ConnectionError / OSError family — network-level failures
    if isinstance(error, (ConnectionError, OSError)):
        return TtsRetryableError(
            f"{provider} OS/connection error: {error}",
            provider=provider,
            original=error,
        )

    return None


# ---------------------------------------------------------------------------
# Circuit breaker — global, process-level, keyed by composite identity
# ---------------------------------------------------------------------------

DEFAULT_FAILURE_THRESHOLD = 3
DEFAULT_COOLDOWN_SECONDS = 30.0
# Strict timeout for the pre-call health probe so it doesn't delay call setup.
DEFAULT_PROBE_TIMEOUT_SECONDS = 3.0


def _circuit_key(
    provider_id: str,
    key_fingerprint: str | None,
    model_id: str,
    voice_id: str,
) -> str:
    """Build a composite circuit breaker key so one failing credential/config
    doesn't poison all calls for the same provider."""
    fp = key_fingerprint or "managed"
    return f"{provider_id}|{fp}|{model_id}|{voice_id}"


@dataclass
class _CircuitState:
    failure_count: int = 0
    state: str = "closed"  # "closed" | "open" | "half_open"
    last_failure_at: float = 0.0
    last_error_message: str = ""


# Global registry — one per worker process, thread-safe not needed (asyncio single-thread).
_circuit_registry: dict[str, _CircuitState] = {}


def _get_circuit(key: str) -> _CircuitState:
    if key not in _circuit_registry:
        _circuit_registry[key] = _CircuitState()
    return _circuit_registry[key]


def record_failure(
    key: str,
    error_message: str,
    *,
    threshold: int = DEFAULT_FAILURE_THRESHOLD,
) -> None:
    circuit = _get_circuit(key)
    circuit.failure_count += 1
    circuit.last_failure_at = time.monotonic()
    circuit.last_error_message = error_message
    if circuit.failure_count >= threshold and circuit.state == "closed":
        circuit.state = "open"
        logger.warning(
            "circuit_breaker_opened key=%s failures=%s reason=%s",
            key,
            circuit.failure_count,
            error_message,
        )


def record_success(key: str) -> None:
    circuit = _get_circuit(key)
    if circuit.state != "closed":
        logger.info(
            "circuit_breaker_closed key=%s previous_state=%s previous_failures=%s",
            key,
            circuit.state,
            circuit.failure_count,
        )
    circuit.failure_count = 0
    circuit.state = "closed"
    circuit.last_error_message = ""


def should_use_fallback(
    key: str,
    *,
    cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS,
) -> bool:
    """Return True if the circuit is open and cooldown has not elapsed."""
    circuit = _get_circuit(key)
    if circuit.state == "closed":
        return False
    if circuit.state == "open":
        elapsed = time.monotonic() - circuit.last_failure_at
        if elapsed >= cooldown_seconds:
            circuit.state = "half_open"
            logger.info(
                "circuit_breaker_half_open key=%s elapsed_seconds=%.1f cooldown_seconds=%.1f",
                key,
                elapsed,
                cooldown_seconds,
            )
            return False  # Allow a probe attempt
        return True
    # half_open — allow the probe attempt through
    return False


def is_half_open(key: str) -> bool:
    circuit = _get_circuit(key)
    return circuit.state == "half_open"


# ---------------------------------------------------------------------------
# FailoverTTS — the public wrapper
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class FailoverIdentity:
    """Identity of one side (primary or fallback) for logging and circuit keying."""
    provider_id: str
    voice_id: str
    model_id: str
    key_fingerprint: str | None

    @property
    def circuit_key(self) -> str:
        return _circuit_key(self.provider_id, self.key_fingerprint, self.model_id, self.voice_id)


class FailoverTTS(tts.TTS):
    """Wraps a primary and optional fallback TTS engine with health-check and circuit breaker.

    Implements the LiveKit ``tts.TTS`` interface so ``VoiceAssistant`` can use it
    transparently.

    Behaviour summary:
    - On instantiation or lazily on first synthesis, runs a silent health probe
      against the primary. If the probe fails with a retryable error, selects
      the fallback for the remainder of the call.
    - During synthesis, if the primary raises a retryable error *before* any
      audio was emitted for the current text unit, retries that unit on fallback.
    - If partial audio was already emitted, skips retrying that unit (to avoid
      duplicate speech) and switches subsequent units to fallback.
    - Auth/config errors (401/403) are NOT treated as failover triggers; they
      are logged clearly and re-raised.
    """

    def __init__(
        self,
        primary: tts.TTS,
        fallback: tts.TTS | None,
        primary_identity: FailoverIdentity,
        fallback_identity: FailoverIdentity | None,
        *,
        failure_threshold: int = DEFAULT_FAILURE_THRESHOLD,
        cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS,
        probe_timeout_seconds: float = DEFAULT_PROBE_TIMEOUT_SECONDS,
        metrics_callback: TtsMetricCallback | None = None,
    ) -> None:
        # Use the primary's audio parameters as the baseline.
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=primary.sample_rate,
            num_channels=primary.num_channels,
        )
        self._primary = primary
        self._fallback = fallback
        self._primary_id = primary_identity
        self._fallback_id = fallback_identity
        self._failure_threshold = failure_threshold
        self._cooldown_seconds = cooldown_seconds
        self._probe_timeout = probe_timeout_seconds
        self._metrics_callback = metrics_callback

        # Session-level state: once we switch to fallback for a call, stay there.
        self._session_failed_over = False
        try:
            loop = asyncio.get_running_loop()
            self._probe_task = loop.create_task(self.run_probe())
            # Prevent "Task exception was never retrieved" warning if the task
            # fails with an auth error and stream() is never called to await it.
            self._probe_task.add_done_callback(lambda t: t.exception())
        except RuntimeError:
            # Note: During tests or sync setup with no running loop, the probe
            # will not run. This is acceptable since LiveKit workers always
            # have a running loop in production.
            self._probe_task = None

        logger.info(
            "failover_tts_initialized primary=%s fallback=%s",
            self._primary_id.provider_id,
            self._fallback_id.provider_id if self._fallback_id else "none",
        )

    # -- public LiveKit TTS interface --

    def synthesize(self, text: str) -> tts.ChunkedStream:
        return FailoverChunkedStream(self, text)

    def stream(self) -> tts.SynthesizeStream:
        return FailoverSynthesizeStream(self)

    async def aclose(self) -> None:
        errors: list[Exception] = []
        for engine, label in [
            (self._primary, "primary"),
            (self._fallback, "fallback"),
        ]:
            if engine is None:
                continue
            aclose_fn = getattr(engine, "aclose", None)
            if callable(aclose_fn):
                try:
                    res = aclose_fn()
                    if inspect.isawaitable(res):
                        await res
                except Exception as exc:
                    logger.error("failover_tts_close_failed engine=%s error=%s", label, exc)
                    errors.append(exc)
        if errors:
            logger.error("failover_tts_close_had_errors count=%s", len(errors))

    # -- health probe --

    async def run_probe(self) -> None:
        """Run a bounded pre-call health probe against the primary.

        If the primary fails with a retryable error, pre-selects the fallback
        for this session. The probe does NOT emit audible speech — it uses a
        short synthesize() call and discards the audio frames immediately.
        """

        if self._fallback is None:
            logger.info("failover_tts_probe_skipped reason=no_fallback")
            return

        # If the circuit is already open, skip the probe and use fallback.
        if should_use_fallback(self._primary_id.circuit_key, cooldown_seconds=self._cooldown_seconds):
            logger.info(
                "failover_tts_probe_skipped reason=circuit_open key=%s",
                self._primary_id.circuit_key,
            )
            self._session_failed_over = True
            emit_tts_metric(
                self._metrics_callback,
                "tts_failover_pre_call",
                primaryProvider=self._primary_id.provider_id,
                fallbackProvider=self._fallback_id.provider_id if self._fallback_id else None,
                reason="circuit_open",
            )
            return

        # Guard: If someone nests FailoverTTS instances, this would recurse.
        # build_tts() is responsible for ensuring primary is a raw engine.
        probe_text = "test"
        started_at = time.monotonic()
        try:
            stream = self._primary.synthesize(probe_text)
            try:
                async with asyncio.timeout(self._probe_timeout):
                    async for _ in stream:
                        pass  # Discard all audio frames — no audible output.
            finally:
                aclose_fn = getattr(stream, "aclose", None)
                if callable(aclose_fn):
                    try:
                        res = aclose_fn()
                        if inspect.isawaitable(res):
                            await res
                    except Exception:
                        pass

            elapsed_ms = round((time.monotonic() - started_at) * 1000)
            logger.info(
                "failover_tts_probe_ok provider=%s elapsed_ms=%s",
                self._primary_id.provider_id,
                elapsed_ms,
            )
            record_success(self._primary_id.circuit_key)

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            elapsed_ms = round((time.monotonic() - started_at) * 1000)
            classified = classify_tts_error(exc, provider=self._primary_id.provider_id)

            if isinstance(classified, TtsRetryableError):
                logger.warning(
                    "failover_tts_probe_failed provider=%s elapsed_ms=%s error=%s",
                    self._primary_id.provider_id,
                    elapsed_ms,
                    classified,
                )
                record_failure(
                    self._primary_id.circuit_key,
                    str(classified),
                    threshold=self._failure_threshold,
                )
                self._session_failed_over = True
                emit_tts_metric(
                    self._metrics_callback,
                    "tts_failover_pre_call",
                    primaryProvider=self._primary_id.provider_id,
                    fallbackProvider=self._fallback_id.provider_id if self._fallback_id else None,
                    reason="probe_failed",
                    elapsedMs=elapsed_ms,
                    error=str(classified),
                )
            elif isinstance(classified, TtsAuthError):
                # Auth errors are NOT failover triggers — surface clearly.
                logger.error(
                    "failover_tts_probe_auth_error provider=%s elapsed_ms=%s error=%s "
                    "action=not_failing_over_credentials_invalid",
                    self._primary_id.provider_id,
                    elapsed_ms,
                    classified,
                )
                # Do NOT fail over — re-raise as a configuration error.
                raise classified from exc
            else:
                # Unknown error — log but don't fail over for safety.
                logger.error(
                    "failover_tts_probe_unknown_error provider=%s elapsed_ms=%s error=%s action=not_failing_over",
                    self._primary_id.provider_id,
                    elapsed_ms,
                    exc,
                )
                pass

    # -- engine selection --

    def _pick_engine(self) -> tts.TTS:
        if self._session_failed_over and self._fallback is not None:
            return self._fallback
        if self._fallback is not None and should_use_fallback(
            self._primary_id.circuit_key, cooldown_seconds=self._cooldown_seconds
        ):
            self._session_failed_over = True
            return self._fallback
        return self._primary

    def _active_provider_id(self) -> str:
        if self._session_failed_over and self._fallback_id is not None:
            return self._fallback_id.provider_id
        return self._primary_id.provider_id


# ---------------------------------------------------------------------------
# FailoverChunkedStream — wraps synthesize() with retry
# ---------------------------------------------------------------------------

class FailoverChunkedStream(tts.ChunkedStream):
    def __init__(self, parent: FailoverTTS, text: str) -> None:
        super().__init__()
        self._parent = parent
        self._text = text

    @utils.log_exceptions(logger=logger)
    async def _main_task(self) -> None:
        if self._parent._probe_task is not None:
            await self._parent._probe_task

        while True:
            engine = self._parent._pick_engine()
            inner_stream = engine.synthesize(self._text)
            had_audio = False

            resampler = None
            if engine is self._parent._fallback and self._parent._primary.sample_rate != engine.sample_rate:
                resampler = rtc.AudioResampler(
                    input_rate=engine.sample_rate,
                    output_rate=self._parent._primary.sample_rate,
                )

            try:
                async for event in inner_stream:
                    had_audio = True
                    if resampler and hasattr(event, "frame") and event.frame is not None:
                        frames = resampler.push(event.frame)
                        for f in frames:
                            new_event = copy.copy(event)
                            new_event.frame = f
                            self._event_ch.send_nowait(new_event)
                    else:
                        self._event_ch.send_nowait(event)

                if not self._parent._session_failed_over:
                    record_success(self._parent._primary_id.circuit_key)
                break

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                classified = classify_tts_error(exc, provider=self._parent._active_provider_id())
                if isinstance(classified, TtsAuthError):
                    raise classified from exc

                if isinstance(classified, TtsRetryableError) and self._parent._fallback is not None:
                    record_failure(
                        self._parent._primary_id.circuit_key,
                        str(classified),
                        threshold=self._parent._failure_threshold,
                    )
                    self._parent._session_failed_over = True
                    emit_tts_metric(
                        self._parent._metrics_callback,
                        "tts_failover_mid_call",
                        primaryProvider=self._parent._primary_id.provider_id,
                        fallbackProvider=self._parent._fallback_id.provider_id if self._parent._fallback_id else None,
                        hadAudio=had_audio,
                        error=str(classified),
                    )
                    if had_audio:
                        break
                    continue
                else:
                    raise
            finally:
                aclose_fn = getattr(inner_stream, "aclose", None)
                if callable(aclose_fn):
                    try:
                        res = aclose_fn()
                        if inspect.isawaitable(res):
                            await res
                    except Exception:
                        pass

# ---------------------------------------------------------------------------
# FailoverSynthesizeStream — wraps a streaming TTS with per-chunk failover
# ---------------------------------------------------------------------------

class FailoverSynthesizeStream(tts.SynthesizeStream):
    """A streaming TTS wrapper that intercepts provider errors per text chunk
    and retries failed chunks on the fallback engine.

    Streaming safety rules:
    - If NO audio has been emitted for the current text chunk, retry that
      chunk with the fallback.
    - If PARTIAL audio was already emitted, do NOT replay — switch subsequent
      chunks to fallback to avoid duplicate speech.
    """

    def __init__(self, parent: FailoverTTS) -> None:
        super().__init__()
        self._parent = parent
        self._chunk_had_audio = False
        self._buffered_text: list[str | tts.SynthesizeStream._FlushSentinel] = []

    @utils.log_exceptions(logger=logger)
    async def _main_task(self) -> None:
        if self._parent._probe_task is not None:
            await self._parent._probe_task

        while True:
            engine = self._parent._pick_engine()
            inner_stream = engine.stream()

            resampler = None
            if engine is self._parent._fallback and self._parent._primary.sample_rate != engine.sample_rate:
                resampler = rtc.AudioResampler(
                    input_rate=engine.sample_rate,
                    output_rate=self._parent._primary.sample_rate,
                )

            forward_task = asyncio.create_task(self._forward_input(inner_stream))

            try:
                async for audio_event in inner_stream:
                    self._chunk_had_audio = True
                    if resampler and hasattr(audio_event, "frame") and audio_event.frame is not None:
                        frames = resampler.push(audio_event.frame)
                        for f in frames:
                            new_event = copy.copy(audio_event)
                            new_event.frame = f
                            self._event_ch.send_nowait(new_event)
                    else:
                        self._event_ch.send_nowait(audio_event)

                if not self._parent._session_failed_over:
                    record_success(self._parent._primary_id.circuit_key)
                break

            except asyncio.CancelledError:
                raise
            except Exception as exc:
                classified = classify_tts_error(exc, provider=self._parent._active_provider_id())

                if isinstance(classified, TtsAuthError):
                    logger.error(
                        "failover_stream_auth_error provider=%s error=%s",
                        self._parent._active_provider_id(),
                        classified,
                    )
                    raise classified from exc

                if isinstance(classified, TtsRetryableError) and self._parent._fallback is not None:
                    logger.warning(
                        "failover_stream_retryable_error provider=%s had_audio=%s error=%s",
                        self._parent._active_provider_id(),
                        self._chunk_had_audio,
                        classified,
                    )
                    record_failure(
                        self._parent._primary_id.circuit_key,
                        str(classified),
                        threshold=self._parent._failure_threshold,
                    )
                    self._parent._session_failed_over = True
                    emit_tts_metric(
                        self._parent._metrics_callback,
                        "tts_failover_mid_call",
                        primaryProvider=self._parent._primary_id.provider_id,
                        fallbackProvider=self._parent._fallback_id.provider_id if self._parent._fallback_id else None,
                        hadAudio=self._chunk_had_audio,
                        error=str(classified),
                    )
                    # Note: _chunk_had_audio is not explicitly reset here. If the 
                    # fallback also fails, its had_audio state applies. Since there 
                    # are only two engines, this is acceptable flag semantics.
                    if self._chunk_had_audio:
                        logger.info(
                            "failover_stream_partial_audio_switch provider=%s "
                            "action=subsequent_chunks_use_fallback",
                            self._parent._active_provider_id(),
                        )
                        break
                    continue
                else:
                    raise
            finally:
                forward_task.cancel()
                try:
                    await forward_task
                except asyncio.CancelledError:
                    pass
                aclose_fn = getattr(inner_stream, "aclose", None)
                if callable(aclose_fn):
                    try:
                        res = aclose_fn()
                        if inspect.isawaitable(res):
                            await res
                    except Exception:
                        pass

    async def _forward_input(self, inner_stream: tts.SynthesizeStream) -> None:
        """Forward text tokens from our input channel to the inner stream."""
        try:
            for item in self._buffered_text:
                if isinstance(item, self._FlushSentinel):
                    inner_stream.flush()
                else:
                    inner_stream.push_text(item)

            # Note: When forward_task is cancelled on a retry, any tokens
            # received in the meantime remain safely buffered in self._input_ch.
            # The new forward_task will pick them up seamlessly here.
            async for item in self._input_ch:
                self._buffered_text.append(item)
                if isinstance(item, self._FlushSentinel):
                    inner_stream.flush()
                else:
                    inner_stream.push_text(item)
            inner_stream.mark_segment_end()
        except asyncio.CancelledError:
            return
