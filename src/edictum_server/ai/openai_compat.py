"""OpenAI-compatible AI provider — works with OpenAI and OpenRouter APIs."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from edictum_server.ai.base import AIProvider, AiUsageResult

logger = logging.getLogger(__name__)

try:
    import openai

    _HAS_OPENAI = True
except ImportError:
    _HAS_OPENAI = False

DEFAULT_OPENAI_MODEL = "gpt-5-mini"
DEFAULT_OPENROUTER_MODEL = "qwen/qwen3-4b:free"
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"


class OpenAICompatibleProvider(AIProvider):
    """Streaming AI provider using the OpenAI Python SDK.

    Works with any OpenAI-compatible API (OpenAI, OpenRouter, etc.)
    by setting ``base_url``.

    Requires: ``pip install openai``
    """

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        provider_name: str = "openai",
        base_url: str | None = None,
    ) -> None:
        if not _HAS_OPENAI:
            raise RuntimeError(
                "openai package is not installed. "
                "Install it with: pip install openai"
            )
        self._provider_name = provider_name
        self._model = model
        self._client = openai.AsyncOpenAI(
            api_key=api_key,
            base_url=base_url,
        )
        self._last_usage: AiUsageResult | None = None

    @property
    def name(self) -> str:
        return self._provider_name

    @property
    def model(self) -> str:
        return self._model

    async def stream_response(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        all_messages = [{"role": "system", "content": system_prompt}, *messages]
        stream = await self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
            messages=all_messages,
        )
        input_tokens = 0
        output_tokens = 0
        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
            if chunk.usage is not None:
                input_tokens = chunk.usage.prompt_tokens or 0
                output_tokens = chunk.usage.completion_tokens or 0
        self._last_usage = AiUsageResult(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            model=self._model,
        )

    async def close(self) -> None:
        await self._client.close()
