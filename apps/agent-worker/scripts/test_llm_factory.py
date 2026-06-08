"""LLM factory smoke tests with no provider network calls.

Run from apps/agent-worker:
python scripts/test_llm_factory.py
"""

from __future__ import annotations

import os
import sys
from collections.abc import Callable, Iterator
from contextlib import contextmanager

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from livekit.agents import llm
from livekit.plugins import anthropic, openai

from pipeline.llm_factory import (
    DEFAULT_ANTHROPIC_MODEL,
    DEFAULT_GROQ_MODEL,
    DEFAULT_OPENAI_MODEL,
    build_llm,
    parse_llm_runtime_selection,
)


LLM_ENV_NAMES = (
    "FINOVA_GROQ_API_KEY",
    "GROQ_API_KEY",
    "FINOVA_OPENAI_API_KEY",
    "OPENAI_API_KEY",
    "FINOVA_ANTHROPIC_API_KEY",
    "ANTHROPIC_API_KEY",
)


def main() -> None:
    with cleared_llm_environment():
        test_provider_construction()
        test_chat_stream_construction()
        test_provider_defaults_and_precedence()
        test_provider_model_validation()
        test_missing_credentials()
        test_environment_credentials()

    print("llm_factory_tests_ok")


def test_provider_construction() -> None:
    groq_engine = build_llm(
        provider_config(
            provider_id="groq",
            model=DEFAULT_GROQ_MODEL,
            api_key="groq-test-key",
        ),
    )
    assert isinstance(groq_engine, openai.LLM)
    assert engine_model(groq_engine) == DEFAULT_GROQ_MODEL
    assert "api.groq.com" in str(groq_engine._client.base_url)

    openai_engine = build_llm(
        provider_config(
            provider_id="openai",
            model=DEFAULT_OPENAI_MODEL,
            api_key="openai-test-key",
        ),
    )
    assert isinstance(openai_engine, openai.LLM)
    assert engine_model(openai_engine) == DEFAULT_OPENAI_MODEL
    assert "api.openai.com" in str(openai_engine._client.base_url)

    anthropic_engine = build_llm(
        provider_config(
            provider_id="anthropic",
            model=DEFAULT_ANTHROPIC_MODEL,
            api_key="anthropic-test-key",
        ),
    )
    assert isinstance(anthropic_engine, anthropic.LLM)
    assert engine_model(anthropic_engine) == DEFAULT_ANTHROPIC_MODEL


def test_chat_stream_construction() -> None:
    import asyncio

    async def run() -> None:
        chat_ctx = llm.ChatContext()
        chat_ctx.add_message(content="Hello", role="user")
        engines = (
            build_llm(
                provider_config(
                    provider_id="groq",
                    model=DEFAULT_GROQ_MODEL,
                    api_key="groq-test-key",
                ),
            ),
            build_llm(
                provider_config(
                    provider_id="openai",
                    model=DEFAULT_OPENAI_MODEL,
                    api_key="openai-test-key",
                ),
            ),
            build_llm(
                provider_config(
                    provider_id="anthropic",
                    model=DEFAULT_ANTHROPIC_MODEL,
                    api_key="anthropic-test-key",
                ),
            ),
        )
        for engine in engines:
            stream = engine.chat(chat_ctx=chat_ctx)
            await close_unstarted_provider_request(stream)

    asyncio.run(run())


def test_provider_defaults_and_precedence() -> None:
    legacy = parse_llm_runtime_selection({})
    assert legacy.provider_id == "groq"
    assert legacy.model_id == DEFAULT_GROQ_MODEL

    openai_default = parse_llm_runtime_selection(
        {"pipeline": {"llm": {"providerId": " OpenAI "}}},
    )
    assert openai_default.provider_id == "openai"
    assert openai_default.model_id == DEFAULT_OPENAI_MODEL

    anthropic_default = parse_llm_runtime_selection(
        {"metadata": {"llmProviderId": "anthropic"}},
    )
    assert anthropic_default.provider_id == "anthropic"
    assert anthropic_default.model_id == DEFAULT_ANTHROPIC_MODEL

    pipeline_wins = parse_llm_runtime_selection(
        {
            "model": "legacy-model",
            "pipeline": {
                "llm": {
                    "providerId": "openai",
                    "model": DEFAULT_OPENAI_MODEL,
                },
            },
            "metadata": {
                "llmProviderId": "anthropic",
                "llmModel": DEFAULT_ANTHROPIC_MODEL,
            },
        },
    )
    assert pipeline_wins.provider_id == "openai"
    assert pipeline_wins.model_id == DEFAULT_OPENAI_MODEL


def test_provider_model_validation() -> None:
    assert_value_error(
        lambda: build_llm(
            provider_config(
                provider_id="openai",
                model=DEFAULT_ANTHROPIC_MODEL,
                api_key="openai-test-key",
            ),
        ),
        "Unsupported openai LLM model",
    )
    assert_value_error(
        lambda: build_llm(
            provider_config(
                provider_id="anthropic",
                model=DEFAULT_OPENAI_MODEL,
                api_key="anthropic-test-key",
            ),
        ),
        "Unsupported anthropic LLM model",
    )
    assert_value_error(
        lambda: build_llm(
            provider_config(
                provider_id="unknown",
                model="unknown-model",
                api_key="unknown-test-key",
            ),
        ),
        "not enabled in worker runtime",
    )


def test_missing_credentials() -> None:
    cases = (
        ("groq", DEFAULT_GROQ_MODEL, "GROQ_API_KEY"),
        ("openai", DEFAULT_OPENAI_MODEL, "OPENAI_API_KEY"),
        ("anthropic", DEFAULT_ANTHROPIC_MODEL, "ANTHROPIC_API_KEY"),
    )
    for provider_id, model, expected_error in cases:
        assert_value_error(
            lambda provider_id=provider_id, model=model: build_llm(
                provider_config(
                    provider_id=provider_id,
                    model=model,
                    api_key=None,
                ),
            ),
            expected_error,
        )


def test_environment_credentials() -> None:
    os.environ["FINOVA_OPENAI_API_KEY"] = "openai-env-test-key"
    try:
        engine = build_llm(
            provider_config(
                provider_id="openai",
                model=DEFAULT_OPENAI_MODEL,
                api_key=None,
            ),
        )
        assert isinstance(engine, openai.LLM)
    finally:
        os.environ.pop("FINOVA_OPENAI_API_KEY", None)


def provider_config(
    *,
    provider_id: str,
    model: str,
    api_key: str | None,
) -> dict[str, object]:
    credentials: dict[str, object] = {}
    if api_key is not None:
        credentials["llm"] = {
            "apiKey": api_key,
            "keyFingerprint": f"{provider_id}-fingerprint",
        }
    return {
        "pipeline": {
            "llm": {
                "providerId": provider_id,
                "model": model,
            },
        },
        "credentials": credentials,
        "metadata": {"llmProviderId": provider_id},
    }


def engine_model(engine: object) -> str:
    options = getattr(engine, "_opts")
    return str(getattr(options, "model"))


async def close_unstarted_provider_request(stream: object) -> None:
    if hasattr(stream, "aclose"):
        await stream.aclose()
    else:
        for attribute in ("_awaitable_oai_stream", "_awaitable_anthropic_stream"):
            request = getattr(stream, attribute, None)
            close = getattr(request, "close", None)
            if callable(close):
                close()
                return


def assert_value_error(
    action: Callable[[], object],
    expected_message: str,
) -> None:
    try:
        action()
    except ValueError as error:
        assert expected_message in str(error), str(error)
    else:
        raise AssertionError(f"expected ValueError containing {expected_message!r}")


@contextmanager
def cleared_llm_environment() -> Iterator[None]:
    original = {name: os.environ.get(name) for name in LLM_ENV_NAMES}
    for name in LLM_ENV_NAMES:
        os.environ.pop(name, None)
    try:
        yield
    finally:
        for name, value in original.items():
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value


if __name__ == "__main__":
    main()
