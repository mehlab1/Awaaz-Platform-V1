"""Phase 5.3–5.5 factory smoke (no network). Run from apps/agent-worker:
python scripts/test_tts_factory.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pipeline.cartesia_tts import CartesiaTTS
from pipeline.elevenlabs_tts import ElevenLabsTTS
from pipeline.inworld_tts import InworldTTS
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

    elevenlabs_cfg = {
        "pipeline": {
            "tts": {
                "providerId": "elevenlabs",
                "voiceId": "21m00Tcm4TlvDq8ikWAM",
                "modelId": "eleven_flash_v2_5",
                "language": "en",
            },
        },
        "credentials": {"tts": {"apiKey": "elevenlabs-test-key"}},
    }
    elevenlabs_engine = build_tts(elevenlabs_cfg)
    assert isinstance(elevenlabs_engine, ElevenLabsTTS)

    inworld_cfg = {
        "pipeline": {
            "tts": {
                "providerId": "inworld",
                "voiceId": "Dennis",
                "modelId": "inworld-tts-2",
                "language": "en",
            },
        },
        "credentials": {"tts": {"apiKey": "inworld-test-key"}},
    }
    inworld_engine = build_tts(inworld_cfg)
    assert isinstance(inworld_engine, InworldTTS)

    try:
        build_tts(
            {
                "pipeline": {
                    "tts": {
                        "providerId": "unknown-tts",
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
        raise AssertionError("expected unknown provider to be rejected")

    legacy = parse_tts_runtime_selection(
        {"voiceId": "legacy", "voiceModelId": "mistv2", "voiceLang": "eng"},
    )
    assert legacy.provider_id == "rime"
    assert legacy.voice_id == "legacy"

    print("factory_tests_ok")


if __name__ == "__main__":
    main()
