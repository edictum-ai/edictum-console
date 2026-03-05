"""Anthropic AI provider — Claude models via the Anthropic SDK."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from edictum_server.ai.base import AIProvider, AiUsageResult

logger = logging.getLogger(__name__)

try:
    import anthropic

    _HAS_ANTHROPIC = True
except ImportError:
    _HAS_ANTHROPIC = False

DEFAULT_MODEL = "claude-haiku-4-5-20251001"


class AnthropicProvider(AIProvider):
    """Streaming AI provider using the Anthropic Python SDK.

    Requires: ``pip install anthropic``
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str = DEFAULT_MODEL,
    ) -> None:
        if not _HAS_ANTHROPIC:
            raise RuntimeError(
                "anthropic package is not installed. "
                "Install it with: pip install anthropic"
            )
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model
        self._last_usage: AiUsageResult | None = None

    @property
    def name(self) -> str:
        return "anthropic"

    @property
    def model(self) -> str:
        return self._model

    async def stream_response(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        async with self._client.messages.stream(
            model=self._model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text
            msg = await stream.get_final_message()
            self._last_usage = AiUsageResult(
                input_tokens=msg.usage.input_tokens,
                output_tokens=msg.usage.output_tokens,
                model=self._model,
            )

    async def close(self) -> None:
        await self._client.close()
