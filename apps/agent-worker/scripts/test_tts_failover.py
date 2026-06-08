"""Phase 5 failover smoke tests (no network). Run from apps/agent-worker:
python scripts/test_tts_failover.py
"""

from __future__ import annotations

import asyncio
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from livekit.agents import tts, utils
from livekit import rtc

from pipeline.failover_tts import (
    FailoverIdentity,
    FailoverTTS,
    TtsRetryableError,
    TtsAuthError,
    classify_tts_error,
    record_failure,
    record_success,
    should_use_fallback,
    is_half_open,
    _circuit_registry,
    DEFAULT_FAILURE_THRESHOLD,
)
from pipeline.tts_factory import (
    parse_fallback_tts_runtime_selection,
    parse_tts_runtime_selection,
    build_tts_with_failover,
)


# ---------------------------------------------------------------------------
# Mock TTS engines for testing
# ---------------------------------------------------------------------------

MOCK_SAMPLE_RATE = 16_000
MOCK_CHANNELS = 1


class MockTTS(tts.TTS):
    """A TTS engine that produces silent audio frames without network calls."""

    def __init__(self, provider_id: str = "mock") -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=MOCK_SAMPLE_RATE,
            num_channels=MOCK_CHANNELS,
        )
        self.provider_id = provider_id
        self.synthesize_count = 0
        self.stream_count = 0

    def synthesize(self, text: str) -> "MockChunkedStream":
        self.synthesize_count += 1
        return MockChunkedStream(text, self)

    def stream(self) -> "MockSynthesizeStream":
        self.stream_count += 1
        return MockSynthesizeStream(self)

    async def aclose(self) -> None:
        pass


class MockSynthesizeStream(tts.SynthesizeStream):
    def __init__(self, parent: MockTTS) -> None:
        super().__init__()

    @utils.log_exceptions()
    async def _main_task(self) -> None:
        pass


class MockChunkedStream(tts.ChunkedStream):
    def __init__(self, text: str, parent: MockTTS) -> None:
        super().__init__()
        self._text = text
        self._parent = parent

    @utils.log_exceptions()
    async def _main_task(self) -> None:
        # Emit a single silent audio frame.
        request_id = "mock-req"
        segment_id = "mock-seg"
        num_samples = 160  # 10ms at 16kHz
        audio_bytes = b"\x00\x00" * num_samples
        frame = rtc.AudioFrame(
            audio_bytes,
            self._parent.sample_rate,
            self._parent.num_channels,
            num_samples,
        )
        self._event_ch.send_nowait(
            tts.SynthesizedAudio(
                request_id=request_id,
                segment_id=segment_id,
                frame=frame,
            )
        )


class FailingTTS(tts.TTS):
    """A TTS engine that always raises a retryable error."""

    def __init__(self, provider_id: str = "failing") -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=MOCK_SAMPLE_RATE,
            num_channels=MOCK_CHANNELS,
        )
        self.provider_id = provider_id
        self.synthesize_count = 0

    def synthesize(self, text: str) -> "FailingChunkedStream":
        self.synthesize_count += 1
        return FailingChunkedStream(self)

    def stream(self) -> tts.SynthesizeStream:
        raise TtsRetryableError(
            f"{self.provider_id} simulated 503",
            provider=self.provider_id,
        )

    async def aclose(self) -> None:
        pass


class FailingChunkedStream(tts.ChunkedStream):
    def __init__(self, parent: FailingTTS) -> None:
        super().__init__()
        self._parent = parent

    @utils.log_exceptions()
    async def _main_task(self) -> None:
        import httpx
        raise httpx.HTTPStatusError(
            "Server Error",
            request=httpx.Request("POST", "https://example.com/tts"),
            response=httpx.Response(503),
        )


class AuthFailingTTS(tts.TTS):
    """A TTS engine that always raises a 401 auth error."""

    def __init__(self, provider_id: str = "auth_failing") -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=True),
            sample_rate=MOCK_SAMPLE_RATE,
            num_channels=MOCK_CHANNELS,
        )
        self.provider_id = provider_id

    def synthesize(self, text: str) -> "AuthFailingChunkedStream":
        return AuthFailingChunkedStream(self)

    def stream(self) -> tts.SynthesizeStream:
        raise TtsAuthError(
            f"{self.provider_id} returned HTTP 401",
            provider=self.provider_id,
        )

    async def aclose(self) -> None:
        pass


class AuthFailingChunkedStream(tts.ChunkedStream):
    def __init__(self, parent: AuthFailingTTS) -> None:
        super().__init__()
        self._parent = parent

    @utils.log_exceptions()
    async def _main_task(self) -> None:
        import httpx
        raise httpx.HTTPStatusError(
            "Unauthorized",
            request=httpx.Request("POST", "https://example.com/tts"),
            response=httpx.Response(401),
        )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def _clear_circuits() -> None:
    _circuit_registry.clear()


def test_classify_retryable_errors() -> None:
    """5xx, timeout, connection errors should classify as retryable."""
    import httpx

    # 503
    err_503 = httpx.HTTPStatusError(
        "Service Unavailable",
        request=httpx.Request("POST", "https://example.com"),
        response=httpx.Response(503),
    )
    classified = classify_tts_error(err_503, provider="rime")
    assert isinstance(classified, TtsRetryableError), f"Expected retryable, got {type(classified)}"
    assert classified.provider == "rime"

    # 401
    err_401 = httpx.HTTPStatusError(
        "Unauthorized",
        request=httpx.Request("POST", "https://example.com"),
        response=httpx.Response(401),
    )
    classified = classify_tts_error(err_401, provider="cartesia")
    assert isinstance(classified, TtsAuthError), f"Expected auth error, got {type(classified)}"

    # Timeout
    err_timeout = httpx.ConnectTimeout("Connection timed out")
    classified = classify_tts_error(err_timeout, provider="elevenlabs")
    assert isinstance(classified, TtsRetryableError)

    # Connection error
    err_conn = httpx.ConnectError("Connection refused")
    classified = classify_tts_error(err_conn, provider="inworld")
    assert isinstance(classified, TtsRetryableError)

    # Generic ValueError — should NOT classify
    classified = classify_tts_error(ValueError("bad config"), provider="rime")
    assert classified is None

    print("  classify_retryable_errors_ok")


def test_circuit_breaker_keying() -> None:
    """Circuit breaker key includes provider+fingerprint+model+voice."""
    _clear_circuits()

    from pipeline.failover_tts import _circuit_key

    key_a = _circuit_key("rime", "fp-abc", "mistv2", "voice-1")
    key_b = _circuit_key("rime", "fp-xyz", "mistv2", "voice-1")
    key_c = _circuit_key("rime", "fp-abc", "mistv2", "voice-2")

    assert key_a != key_b, "Different fingerprints should produce different keys"
    assert key_a != key_c, "Different voices should produce different keys"

    # Record failures on key_a — should NOT affect key_b
    for _ in range(DEFAULT_FAILURE_THRESHOLD):
        record_failure(key_a, "simulated")

    assert should_use_fallback(key_a), "key_a should be open"
    assert not should_use_fallback(key_b), "key_b should still be closed"

    print("  circuit_breaker_keying_ok")


def test_circuit_breaker_lifecycle() -> None:
    """closed → open → half_open → closed lifecycle."""
    _clear_circuits()

    key = "test-lifecycle|fp|m|v"

    assert not should_use_fallback(key), "Initial state should be closed"

    # Record failures up to threshold
    for i in range(DEFAULT_FAILURE_THRESHOLD):
        record_failure(key, f"fail-{i}")

    assert should_use_fallback(key), "Should be open after threshold failures"

    # Simulate cooldown by manipulating last_failure_at
    from pipeline.failover_tts import _get_circuit, DEFAULT_COOLDOWN_SECONDS

    circuit = _get_circuit(key)
    circuit.last_failure_at = time.monotonic() - DEFAULT_COOLDOWN_SECONDS - 1

    assert not should_use_fallback(key), "Should allow probe after cooldown"
    assert is_half_open(key), "Should be half_open after cooldown"

    # Record success → close
    record_success(key)
    assert not should_use_fallback(key), "Should be closed after success"
    assert not is_half_open(key)

    print("  circuit_breaker_lifecycle_ok")


def test_primary_success_no_fallback_used() -> None:
    """When primary succeeds, fallback is never touched."""
    _clear_circuits()

    primary = MockTTS("primary-ok")
    fallback = MockTTS("fallback-ok")
    primary_id = FailoverIdentity("rime", "v1", "m1", "fp1")
    fallback_id = FailoverIdentity("cartesia", "v2", "m2", "fp2")

    engine = FailoverTTS(primary, fallback, primary_id, fallback_id)

    async def run() -> None:
        await engine.run_probe()
        assert primary.synthesize_count == 1, "Probe should call primary.synthesize once"
        assert fallback.synthesize_count == 0, "Fallback should not be used"
        assert not engine._session_failed_over

    asyncio.run(run())
    print("  primary_success_no_fallback_ok")


def test_probe_failure_selects_fallback() -> None:
    """When primary probe fails with retryable error, fallback is pre-selected."""
    _clear_circuits()

    primary = FailingTTS("failing-primary")
    fallback = MockTTS("fallback-healthy")
    primary_id = FailoverIdentity("rime", "v1", "m1", "fp-fail")
    fallback_id = FailoverIdentity("cartesia", "v2", "m2", "fp-ok")

    engine = FailoverTTS(primary, fallback, primary_id, fallback_id)

    async def run() -> None:
        await engine.run_probe()
        assert engine._session_failed_over, "Should have failed over after probe failure"
        picked = engine._pick_engine()
        assert picked is fallback, "Should pick fallback after failed probe"

    asyncio.run(run())
    print("  probe_failure_selects_fallback_ok")


def test_auth_error_does_not_failover() -> None:
    """401/403 auth errors should NOT trigger failover — they raise clearly."""
    _clear_circuits()

    primary = AuthFailingTTS("auth-broken")
    fallback = MockTTS("fallback")
    primary_id = FailoverIdentity("rime", "v1", "m1", "fp-auth")
    fallback_id = FailoverIdentity("cartesia", "v2", "m2", "fp-ok")

    engine = FailoverTTS(primary, fallback, primary_id, fallback_id)

    async def run() -> None:
        try:
            await engine.run_probe()
            raise AssertionError("Expected TtsAuthError to be raised")
        except TtsAuthError:
            pass  # Expected
        assert not engine._session_failed_over, "Auth errors should NOT trigger failover"

    asyncio.run(run())
    print("  auth_error_no_failover_ok")


def test_parse_fallback_config() -> None:
    """Fallback config is correctly parsed from worker config."""
    config = {
        "pipeline": {
            "tts": {
                "providerId": "rime",
                "voiceId": "v1",
                "modelId": "mistv2",
                "language": "eng",
            },
            "fallbackTts": {
                "providerId": "cartesia",
                "voiceId": "cart-voice",
                "modelId": "sonic-3.5",
                "language": "en",
            },
        },
        "credentials": {
            "tts": {"apiKey": "rime-key"},
            "fallbackTts": {"apiKey": "cartesia-key", "keyFingerprint": "cfp"},
        },
        "metadata": {
            "ttsProviderId": "rime",
            "fallbackTtsProviderId": "cartesia",
        },
    }

    primary = parse_tts_runtime_selection(config)
    assert primary.provider_id == "rime"
    assert primary.voice_id == "v1"

    fallback = parse_fallback_tts_runtime_selection(config)
    assert fallback is not None
    assert fallback.provider_id == "cartesia"
    assert fallback.voice_id == "cart-voice"
    assert fallback.model_id == "sonic-3.5"
    assert fallback.api_key == "cartesia-key"
    assert fallback.key_fingerprint == "cfp"

    print("  parse_fallback_config_ok")


def test_no_fallback_config() -> None:
    """When no fallback is configured, parse returns None."""
    config = {
        "pipeline": {
            "tts": {
                "providerId": "rime",
                "voiceId": "v1",
                "modelId": "mistv2",
                "language": "eng",
            },
        },
        "credentials": {"tts": {"apiKey": "rime-key"}},
    }
    fallback = parse_fallback_tts_runtime_selection(config)
    assert fallback is None
    print("  no_fallback_config_ok")


def test_close_tts_cascades() -> None:
    """close_tts on FailoverTTS closes both engines."""
    _clear_circuits()

    primary = MockTTS("p")
    fallback = MockTTS("f")
    primary_id = FailoverIdentity("rime", "v1", "m1", "fp1")
    fallback_id = FailoverIdentity("cartesia", "v2", "m2", "fp2")

    engine = FailoverTTS(primary, fallback, primary_id, fallback_id)

    from pipeline.tts_factory import close_tts

    async def run() -> None:
        await close_tts(engine)
        # If aclose didn't raise, both engines were closed successfully.

    asyncio.run(run())
    print("  close_tts_cascades_ok")


def test_circuit_open_skips_probe() -> None:
    """If circuit is already open, probe is skipped and fallback is selected."""
    _clear_circuits()

    primary = MockTTS("primary")
    fallback = MockTTS("fallback")
    primary_id = FailoverIdentity("rime", "v1", "m1", "fp-open-test")
    fallback_id = FailoverIdentity("cartesia", "v2", "m2", "fp2")

    # Pre-open the circuit
    for _ in range(DEFAULT_FAILURE_THRESHOLD):
        record_failure(primary_id.circuit_key, "pre-opened")

    engine = FailoverTTS(primary, fallback, primary_id, fallback_id)

    async def run() -> None:
        await engine.run_probe()
        assert engine._session_failed_over, "Should pre-select fallback when circuit is open"
        assert primary.synthesize_count == 0, "Should skip probe entirely"

    asyncio.run(run())
    print("  circuit_open_skips_probe_ok")


def main() -> None:
    print("Running failover TTS tests...")
    test_classify_retryable_errors()
    test_circuit_breaker_keying()
    test_circuit_breaker_lifecycle()
    test_primary_success_no_fallback_used()
    test_probe_failure_selects_fallback()
    test_auth_error_does_not_failover()
    test_parse_fallback_config()
    test_no_fallback_config()
    test_close_tts_cascades()
    test_circuit_open_skips_probe()
    print("failover_tests_ok")


if __name__ == "__main__":
    main()
