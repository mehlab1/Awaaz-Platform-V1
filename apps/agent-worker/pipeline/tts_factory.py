import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass

from livekit.agents import tts

from pipeline.cartesia_tts import CartesiaTTS
from pipeline.elevenlabs_tts import ElevenLabsTTS
from pipeline.failover_tts import FailoverIdentity, FailoverTTS
from pipeline.inworld_tts import InworldTTS
from pipeline.tts import RimeTTS, TtsMetricCallback


logger = logging.getLogger(__name__)

RUNTIME_TTS_PROVIDER_RIME = "rime"
RUNTIME_TTS_PROVIDER_CARTESIA = "cartesia"
RUNTIME_TTS_PROVIDER_ELEVENLABS = "elevenlabs"
RUNTIME_TTS_PROVIDER_INWORLD = "inworld"
RUNTIME_TTS_PROVIDERS = frozenset(
    {
        RUNTIME_TTS_PROVIDER_RIME,
        RUNTIME_TTS_PROVIDER_CARTESIA,
        RUNTIME_TTS_PROVIDER_ELEVENLABS,
        RUNTIME_TTS_PROVIDER_INWORLD,
    },
)
DEFAULT_RIME_VOICE_ID = "mist-default"
DEFAULT_RIME_MODEL_ID = "mistv2"
DEFAULT_RIME_LANGUAGE = "eng"


@dataclass(frozen=True)
class TtsRuntimeSelection:
    provider_id: str
    voice_id: str
    model_id: str
    language: str
    api_key: str | None
    key_fingerprint: str | None
    metadata_provider_id: str | None


def build_tts(
    config: Mapping[str, object],
    selection: TtsRuntimeSelection | None = None,
    metrics_callback: TtsMetricCallback | None = None,
) -> tts.TTS:
    resolved = selection or parse_tts_runtime_selection(config)
    log_tts_selection(resolved)

    if resolved.provider_id not in RUNTIME_TTS_PROVIDERS:
        raise ValueError(
            f"TTS provider {resolved.provider_id} is not enabled in worker runtime yet."
        )

    if resolved.provider_id == RUNTIME_TTS_PROVIDER_CARTESIA:
        api_key = resolved.api_key or _first_env(
            "FINOVA_CARTESIA_API_KEY",
            "CARTESIA_API_KEY",
        )
        if not api_key:
            raise ValueError(
                "Cartesia TTS requires credentials.tts.apiKey, FINOVA_CARTESIA_API_KEY, or CARTESIA_API_KEY",
            )
        return CartesiaTTS(
            voice_id=resolved.voice_id,
            model_id=resolved.model_id,
            language=resolved.language,
            api_key=api_key,
            metrics_callback=metrics_callback,
        )

    if resolved.provider_id == RUNTIME_TTS_PROVIDER_ELEVENLABS:
        api_key = resolved.api_key or _first_env(
            "FINOVA_ELEVENLABS_API_KEY",
            "ELEVENLABS_API_KEY",
            "ELEVEN_API_KEY",
        )
        if not api_key:
            raise ValueError(
                "ElevenLabs TTS requires credentials.tts.apiKey, FINOVA_ELEVENLABS_API_KEY, ELEVENLABS_API_KEY, or ELEVEN_API_KEY",
            )
        return ElevenLabsTTS(
            voice_id=resolved.voice_id,
            model_id=resolved.model_id,
            language=resolved.language,
            api_key=api_key,
            metrics_callback=metrics_callback,
        )

    if resolved.provider_id == RUNTIME_TTS_PROVIDER_INWORLD:
        api_key = resolved.api_key or _first_env(
            "FINOVA_INWORLD_API_KEY",
            "INWORLD_API_KEY",
        )
        if not api_key:
            raise ValueError(
                "Inworld TTS requires credentials.tts.apiKey, FINOVA_INWORLD_API_KEY, or INWORLD_API_KEY",
            )
        return InworldTTS(
            voice_id=resolved.voice_id,
            model_id=resolved.model_id,
            language=resolved.language,
            api_key=api_key,
            metrics_callback=metrics_callback,
        )

    api_key = resolved.api_key or _first_env("FINOVA_RIME_API_KEY", "RIME_API_KEY")
    if not api_key:
        raise ValueError("FINOVA_RIME_API_KEY or RIME_API_KEY is required")

    return RimeTTS(
        voice_id=resolved.voice_id,
        model_id=resolved.model_id,
        language=resolved.language,
        api_key=api_key,
        metrics_callback=metrics_callback,
    )


async def close_tts(engine: tts.TTS) -> None:
    """Close a TTS engine, including FailoverTTS which cascades to both children."""
    aclose = getattr(engine, "aclose", None)
    if callable(aclose):
        await aclose()


def parse_tts_runtime_selection(config: Mapping[str, object]) -> TtsRuntimeSelection:
    pipeline = _mapping_value(config, "pipeline")
    pipeline_tts = _mapping_value(pipeline, "tts") if pipeline else None
    credentials = _mapping_value(config, "credentials")
    credentials_tts = _mapping_value(credentials, "tts") if credentials else None
    metadata = _mapping_value(config, "metadata")

    provider_id = _normalize_provider_id(
        _string_value(pipeline_tts, "providerId")
        or _string_value(metadata, "ttsProviderId")
        or RUNTIME_TTS_PROVIDER_RIME,
    )
    voice_id = (
        _string_value(pipeline_tts, "voiceId")
        or _legacy_string(config, "voiceId", DEFAULT_RIME_VOICE_ID)
    )
    model_id = (
        _string_value(pipeline_tts, "modelId")
        or _legacy_string(config, "voiceModelId", DEFAULT_RIME_MODEL_ID)
    )
    language = (
        _string_value(pipeline_tts, "language")
        or _legacy_string(config, "voiceLang", DEFAULT_RIME_LANGUAGE)
    )
    api_key = _string_value(credentials_tts, "apiKey")
    key_fingerprint = _string_value(credentials_tts, "keyFingerprint") or _string_value(
        metadata,
        "ttsKeyFingerprint",
    )
    metadata_provider_id = _string_value(metadata, "ttsProviderId")

    return TtsRuntimeSelection(
        provider_id=provider_id,
        voice_id=voice_id,
        model_id=model_id,
        language=language,
        api_key=api_key,
        key_fingerprint=key_fingerprint,
        metadata_provider_id=metadata_provider_id,
    )


def parse_fallback_tts_runtime_selection(
    config: Mapping[str, object],
) -> TtsRuntimeSelection | None:
    """Parse the optional fallbackTts pipeline/credentials from the worker config.

    Returns None if no fallback is configured.
    """
    pipeline = _mapping_value(config, "pipeline")
    pipeline_fallback = _mapping_value(pipeline, "fallbackTts") if pipeline else None
    if not pipeline_fallback:
        return None

    provider_id_raw = _string_value(pipeline_fallback, "providerId")
    if not provider_id_raw:
        return None

    credentials = _mapping_value(config, "credentials")
    credentials_fallback = _mapping_value(credentials, "fallbackTts") if credentials else None
    metadata = _mapping_value(config, "metadata")

    provider_id = _normalize_provider_id(provider_id_raw)
    voice_id = _string_value(pipeline_fallback, "voiceId") or ""
    model_id = _string_value(pipeline_fallback, "modelId") or ""
    language = _string_value(pipeline_fallback, "language") or "eng"
    api_key = _string_value(credentials_fallback, "apiKey")
    key_fingerprint = (
        _string_value(credentials_fallback, "keyFingerprint")
        or _string_value(metadata, "fallbackTtsKeyFingerprint")
    )

    return TtsRuntimeSelection(
        provider_id=provider_id,
        voice_id=voice_id,
        model_id=model_id,
        language=language,
        api_key=api_key,
        key_fingerprint=key_fingerprint,
        metadata_provider_id=_string_value(metadata, "fallbackTtsProviderId"),
    )


def build_tts_with_failover(
    config: Mapping[str, object],
    primary_selection: TtsRuntimeSelection | None = None,
    *,
    metrics_callback: TtsMetricCallback | None = None,
) -> tts.TTS:
    """Build a TTS engine from the worker config, wrapping in FailoverTTS if
    a fallback is configured.

    This is the recommended entry point for agent.py.
    """
    resolved_primary = primary_selection or parse_tts_runtime_selection(config)
    primary_engine = build_tts(config, resolved_primary, metrics_callback=metrics_callback)

    fallback_selection = parse_fallback_tts_runtime_selection(config)
    if fallback_selection is None:
        logger.info("tts_failover_disabled reason=no_fallback_configured")
        return primary_engine

    log_tts_selection(fallback_selection)
    logger.info(
        "tts_fallback_configured primary=%s fallback=%s",
        resolved_primary.provider_id,
        fallback_selection.provider_id,
    )

    try:
        fallback_engine = build_tts(
            config,
            fallback_selection,
            metrics_callback=metrics_callback,
        )
    except Exception as exc:
        logger.error(
            "tts_fallback_build_failed provider=%s error=%s action=continuing_without_fallback",
            fallback_selection.provider_id,
            exc,
        )
        return primary_engine

    primary_identity = FailoverIdentity(
        provider_id=resolved_primary.provider_id,
        voice_id=resolved_primary.voice_id,
        model_id=resolved_primary.model_id,
        key_fingerprint=resolved_primary.key_fingerprint,
    )
    fallback_identity = FailoverIdentity(
        provider_id=fallback_selection.provider_id,
        voice_id=fallback_selection.voice_id,
        model_id=fallback_selection.model_id,
        key_fingerprint=fallback_selection.key_fingerprint,
    )

    return FailoverTTS(
        primary_engine,
        fallback_engine,
        primary_identity,
        fallback_identity,
        metrics_callback=metrics_callback,
    )


def log_tts_selection(selection: TtsRuntimeSelection) -> None:
    logger.info(
        "tts_provider_selected provider=%s metadata_provider=%s voice=%s model=%s language=%s",
        selection.provider_id,
        selection.metadata_provider_id or selection.provider_id,
        selection.voice_id,
        selection.model_id,
        selection.language,
    )
    if selection.key_fingerprint:
        logger.info(
            "tts_key_fingerprint fingerprint=%s",
            selection.key_fingerprint,
        )
    logger.info(
        "tts_runtime_provider provider=%s",
        selection.provider_id,
    )


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


def _legacy_string(
    config: Mapping[str, object],
    key: str,
    default: str,
) -> str:
    value = config.get(key)
    if isinstance(value, str):
        trimmed = value.strip()
        if trimmed:
            return trimmed
    return default


def _normalize_provider_id(provider_id: str) -> str:
    return provider_id.strip().lower() or RUNTIME_TTS_PROVIDER_RIME


def _first_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return value.strip()
    return None
