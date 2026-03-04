"""AI provider protocol for pluggable LLM backends.

Follows the same ABC pattern as notifications/base.py.
Each provider wraps a specific SDK and yields streaming text chunks.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator


class AIProvider(ABC):
    """Protocol for pluggable AI/LLM backends.

    Implementations: AnthropicProvider, OpenAICompatibleProvider, OllamaProvider.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier (e.g. 'anthropic', 'openai', 'ollama')."""
        ...

    @property
    @abstractmethod
    def model(self) -> str:
        """Model identifier currently configured."""
        ...

    @abstractmethod
    def stream_response(
        self,
        messages: list[dict[str, str]],
        system_prompt: str,
        max_tokens: int = 4096,
    ) -> AsyncIterator[str]:
        """Stream a response as text chunks.

        Yields plain text deltas. Caller is responsible for
        assembling the full response if needed.

        Args:
            messages: Conversation history (role/content dicts).
            system_prompt: System-level instructions.
            max_tokens: Maximum tokens in the response.

        Yields:
            Text chunks as they arrive from the provider.
        """
        ...

    async def close(self) -> None:  # noqa: B027
        """Clean up resources (e.g. httpx clients). Override if needed."""
