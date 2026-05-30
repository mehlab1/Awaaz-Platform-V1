"""Phase 5.3 factory smoke (no network). Run from apps/agent-worker:
python scripts/test_tts_factory.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.cartesia_tts import CartesiaTTS
from pipeline.tts import RimeTTS
from pipeline.tts_factory import build_tts, parse_tts_runtime_selection


def main() -> None:
    rime_cfg = {
        "voiceId": "anderson_emily",
        "voiceModelId": "arcana",
        "voiceLang": "eng",
        "pipeline": {
            "tts": {
                "providerId": "rime",
                "voiceId": "anderson_emily",
                "modelId": "arcana",
                "language": "eng",
            },
        },
        "credentials": {"tts": {"apiKey": "rime-test-key"}},
    }
    rime_engine = build_tts(rime_cfg)
    assert isinstance(rime_engine, RimeTTS)

    cartesia_cfg = {
        "voiceId": "cartesia:voice-uuid",
        "pipeline": {
            "tts": {
                "providerId": "cartesia",
                "voiceId": "a0e99841-438c-4a64-b679-ae501e7d6091",
                "modelId": "sonic-3.5",
                "language": "en",
            },
        },
        "credentials": {
            "tts": {
                "apiKey": "cartesia-test-key",
                "keyFingerprint": "abc",
            },
        },
        "metadata": {"ttsProviderId": "cartesia"},
    }
    cartesia_engine = build_tts(cartesia_cfg)
    assert isinstance(cartesia_engine, CartesiaTTS)

    for provider in ("elevenlabs", "inworld"):
        try:
            build_tts(
                {
                    "pipeline": {
                        "tts": {
                            "providerId": provider,
                            "voiceId": "x",
                            "modelId": "y",
                            "language": "en",
                        },
                    },
                    "credentials": {"tts": {"apiKey": "k"}},
                },
            )
        except ValueError as error:
            assert "not enabled" in str(error)
        else:
            raise AssertionError(f"expected {provider} to be rejected")

    legacy = parse_tts_runtime_selection(
        {"voiceId": "legacy", "voiceModelId": "mistv2", "voiceLang": "eng"},
    )
    assert legacy.provider_id == "rime"
    assert legacy.voice_id == "legacy"

    print("factory_tests_ok")


if __name__ == "__main__":
    main()
