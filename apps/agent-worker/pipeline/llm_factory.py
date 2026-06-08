import logging
import os
from collections.abc import Mapping
from dataclasses import dataclass

from livekit.agents import llm
from livekit.plugins import anthropic, openai, groq


logger = logging.getLogger(__name__)

RUNTIME_LLM_PROVIDER_GROQ = "groq"
RUNTIME_LLM_PROVIDER_OPENAI = "openai"
RUNTIME_LLM_PROVIDER_ANTHROPIC = "anthropic"
RUNTIME_LLM_PROVIDERS = frozenset(
    {
        RUNTIME_LLM_PROVIDER_GROQ,
        RUNTIME_LLM_PROVIDER_OPENAI,
        RUNTIME_LLM_PROVIDER_ANTHROPIC,
    },
)
DEFAULT_LLM_PROVIDER = RUNTIME_LLM_PROVIDER_GROQ
DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
DEFAULT_OPENAI_MODEL = "gpt-4o"
DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-latest"
# Groq supports OpenAI compatibility routing. These are Groq's model identifiers
# for those routed models, not native OpenAI models.
GROQ_RUNTIME_MODELS = frozenset(
    {
        "llama-3.3-70b-versatile",
        "openai/gpt-oss-120b",
        "openai/gpt-oss-20b",
    },
)
OPENAI_RUNTIME_MODELS = frozenset({DEFAULT_OPENAI_MODEL})
ANTHROPIC_RUNTIME_MODELS = frozenset({DEFAULT_ANTHROPIC_MODEL})
SUPPORTED_LLM_MODELS_BY_PROVIDER = {
    RUNTIME_LLM_PROVIDER_GROQ: GROQ_RUNTIME_MODELS,
    RUNTIME_LLM_PROVIDER_OPENAI: OPENAI_RUNTIME_MODELS,
    RUNTIME_LLM_PROVIDER_ANTHROPIC: ANTHROPIC_RUNTIME_MODELS,
}


@dataclass(frozen=True)
class LlmRuntimeSelection:
    provider_id: str
    model_id: str
    api_key: str | None
    key_fingerprint: str | None
    metadata_provider_id: str | None


def build_llm(
    config: Mapping[str, object],
    selection: LlmRuntimeSelection | None = None,
) -> llm.LLM:
    resolved = selection or parse_llm_runtime_selection(config)
    log_llm_selection(resolved)

    if resolved.provider_id not in RUNTIME_LLM_PROVIDERS:
        raise ValueError(
            f"LLM provider {resolved.provider_id} is not enabled in worker runtime."
        )
    supported_models = SUPPORTED_LLM_MODELS_BY_PROVIDER[resolved.provider_id]
    if resolved.model_id not in supported_models:
        raise ValueError(
            f"Unsupported {resolved.provider_id} LLM model: {resolved.model_id}"
        )

    if resolved.provider_id == RUNTIME_LLM_PROVIDER_OPENAI:
        api_key = resolved.api_key or _first_env(
            "FINOVA_OPENAI_API_KEY",
            "OPENAI_API_KEY",
        )
        if not api_key:
            raise ValueError(
                "FINOVA_OPENAI_API_KEY or OPENAI_API_KEY is required for OpenAI LLM"
            )
        return openai.LLM(
            model=resolved.model_id,
            api_key=api_key,
        )

    if resolved.provider_id == RUNTIME_LLM_PROVIDER_ANTHROPIC:
        api_key = resolved.api_key or _first_env(
            "FINOVA_ANTHROPIC_API_KEY",
            "ANTHROPIC_API_KEY",
        )
        if not api_key:
            raise ValueError(
                "FINOVA_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY is required for Anthropic LLM"
            )
        return anthropic.LLM(
            model=resolved.model_id,
            api_key=api_key,
        )

    api_key = resolved.api_key or _first_env(
        "FINOVA_GROQ_API_KEY",
        "GROQ_API_KEY",
    )
    if not api_key:
        raise ValueError(
            "FINOVA_GROQ_API_KEY or GROQ_API_KEY is required for Groq LLM"
        )
    return groq.LLM(
        model=resolved.model_id,
        api_key=api_key,
    )


def parse_llm_runtime_selection(config: Mapping[str, object]) -> LlmRuntimeSelection:
    pipeline = _mapping_value(config, "pipeline")
    pipeline_llm = _mapping_value(pipeline, "llm") if pipeline else None
    credentials = _mapping_value(config, "credentials")
    credentials_llm = _mapping_value(credentials, "llm") if credentials else None
    metadata = _mapping_value(config, "metadata")

    # llmProviderId in metadata is a legacy fallback path from older configs.
    # We prioritize the new pipeline config if present.
    provider_id = _normalize_provider_id(
        _string_value(pipeline_llm, "providerId")
        or _string_value(metadata, "llmProviderId")
        or DEFAULT_LLM_PROVIDER,
    )
    # If the user leaves the model field blank (or if it's missing in legacy config),
    # we explicitly assign the provider's default model here.
    model_id = (
        _string_value(pipeline_llm, "model")
        or _string_value(metadata, "llmModel")
        or _legacy_string(
            config,
            "model",
            _default_model_for_provider(provider_id),
        )
    )
    api_key = _string_value(credentials_llm, "apiKey")
    key_fingerprint = _string_value(credentials_llm, "keyFingerprint") or _string_value(
        metadata,
        "llmKeyFingerprint",
    )
    metadata_provider_id = _string_value(metadata, "llmProviderId")

    return LlmRuntimeSelection(
        provider_id=provider_id,
        model_id=model_id,
        api_key=api_key,
        key_fingerprint=key_fingerprint,
        metadata_provider_id=metadata_provider_id,
    )


def log_llm_selection(selection: LlmRuntimeSelection) -> None:
    logger.info(
        "llm_provider_selected provider=%s metadata_provider=%s model=%s key=%s",
        selection.provider_id,
        selection.metadata_provider_id or selection.provider_id,
        selection.model_id,
        "provided" if selection.api_key else "env",
    )
    if selection.key_fingerprint:
        logger.info("llm_key_fingerprint fingerprint=%s", selection.key_fingerprint)


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
    return provider_id.strip().lower() or DEFAULT_LLM_PROVIDER


def _default_model_for_provider(provider_id: str) -> str:
    if provider_id == RUNTIME_LLM_PROVIDER_OPENAI:
        return DEFAULT_OPENAI_MODEL
    if provider_id == RUNTIME_LLM_PROVIDER_ANTHROPIC:
        return DEFAULT_ANTHROPIC_MODEL
    return DEFAULT_GROQ_MODEL


def _first_env(*names: str) -> str | None:
    for name in names:
        value = os.getenv(name)
        if value and value.strip():
            return value.strip()
    return None
