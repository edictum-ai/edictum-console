"""AI provider package — pluggable LLM backends for contract evaluation assistance.

Factory function ``create_provider`` maps provider names to implementations.
"""

from __future__ import annotations

from edictum_server.ai.base import AIProvider

__all__ = ["AIProvider", "create_provider"]


def create_provider(
    provider: str,
    *,
    api_key: str | None = None,
    model: str | None = None,
    base_url: str | None = None,
) -> AIProvider:
    """Create an AI provider by name.

    Supported providers:
        - ``"anthropic"`` — Anthropic Claude (requires ``pip install anthropic``)
        - ``"openai"`` — OpenAI GPT (requires ``pip install openai``)
        - ``"openrouter"`` — OpenRouter (requires ``pip install openai``)
        - ``"ollama"`` — Ollama local models (requires ``pip install ollama``)

    Args:
        provider: Provider name (case-insensitive).
        api_key: API key for the provider (not needed for ollama).
        model: Model override. Uses provider default if not specified.
        base_url: Base URL override (ollama host, custom endpoint).

    Returns:
        Configured AIProvider instance.

    Raises:
        ValueError: Unknown provider name.
        RuntimeError: Required SDK package not installed.
    """
    name = provider.strip().lower()

    effective_key = api_key or ""

    if name == "anthropic":
        from edictum_server.ai.anthropic import DEFAULT_MODEL, AnthropicProvider

        if not effective_key:
            raise ValueError("Anthropic requires an API key")
        return AnthropicProvider(
            api_key=effective_key,
            model=model or DEFAULT_MODEL,
        )

    if name == "openai":
        from edictum_server.ai.openai_compat import (
            DEFAULT_OPENAI_MODEL,
            OpenAICompatibleProvider,
        )

        if not effective_key:
            raise ValueError("OpenAI requires an API key")
        return OpenAICompatibleProvider(
            api_key=effective_key,
            model=model or DEFAULT_OPENAI_MODEL,
            provider_name="openai",
            base_url=base_url,
        )

    if name == "openrouter":
        from edictum_server.ai.openai_compat import (
            DEFAULT_OPENROUTER_MODEL,
            OPENROUTER_BASE_URL,
            OpenAICompatibleProvider,
        )

        if not effective_key:
            raise ValueError("OpenRouter requires an API key")
        return OpenAICompatibleProvider(
            api_key=effective_key,
            model=model or DEFAULT_OPENROUTER_MODEL,
            provider_name="openrouter",
            base_url=base_url or OPENROUTER_BASE_URL,
        )

    if name == "ollama":
        from edictum_server.ai.ollama import DEFAULT_MODEL, OllamaProvider

        return OllamaProvider(
            host=base_url or "http://localhost:11434",
            model=model or DEFAULT_MODEL,
        )

    raise ValueError(
        f"Unknown AI provider: {provider!r}. "
        f"Supported: anthropic, openai, openrouter, ollama"
    )
