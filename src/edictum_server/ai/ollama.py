"""Ollama AI provider — local models via the Ollama Python SDK."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator

from edictum_server.ai.base import AIProvider

logger = logging.getLogger(__name__)

try:
    import ollama as _ollama_lib

    _HAS_OLLAMA = True
except ImportError:
    _HAS_OLLAMA = False

DEFAULT_MODEL = "llama3"


class OllamaProvider(AIProvider):
    """Streaming AI provider using the Ollama Python SDK.

    Requires: ``pip install ollama``
    """

    def __init__(
        self,
        *,
        host: str = "http://localhost:11434",
        model: str = DEFAULT_MODEL,
    ) -> None:
        if not _HAS_OLLAMA:
            raise RuntimeError(
                "ollama package is not installed. "
                "Install it with: pip install ollama"
            )
        self._host = host
        self._model = model
        self._client = _ollama_lib.AsyncClient(host=host)

    @property
    def name(self) -> str:
        return "ollama"

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
        stream = await self._client.chat(
            model=self._model,
            messages=all_messages,
            stream=True,
            options={"num_predict": max_tokens},
        )
        async for chunk in stream:
            content = chunk.get("message", {}).get("content", "")
            if content:
                yield content
