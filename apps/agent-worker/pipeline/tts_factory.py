import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass

from livekit.agents import tts

from pipeline.cartesia_tts import CartesiaTTS
from pipeline.tts import RimeTTS


logger = logging.getLogger(__name__)

RUNTIME_TTS_PROVIDER_RIME = "rime"
RUNTIME_TTS_PROVIDER_CARTESIA = "cartesia"
RUNTIME_TTS_PROVIDERS = frozenset(
    {RUNTIME_TTS_PROVIDER_RIME, RUNTIME_TTS_PROVIDER_CARTESIA},
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
) -> tts.TTS:
    resolved = selection or parse_tts_runtime_selection(config)
    log_tts_selection(resolved)

    if resolved.provider_id not in RUNTIME_TTS_PROVIDERS:
        raise ValueError(
            f"TTS provider {resolved.provider_id} is not enabled in worker runtime yet."
        )

    if resolved.provider_id == RUNTIME_TTS_PROVIDER_CARTESIA:
        api_key = resolved.api_key
        if not api_key:
            raise ValueError(
                "Cartesia TTS requires credentials.tts.apiKey from internal agent config",
            )
        return CartesiaTTS(
            voice_id=resolved.voice_id,
            model_id=resolved.model_id,
            language=resolved.language,
            api_key=api_key,
        )

    api_key = resolved.api_key or os.getenv("RIME_API_KEY")
    if not api_key:
        raise ValueError("RIME_API_KEY is required")

    return RimeTTS(
        voice_id=resolved.voice_id,
        model_id=resolved.model_id,
        language=resolved.language,
        api_key=api_key,
    )


async def close_tts(engine: tts.TTS) -> None:
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
