"""AI model pricing via OpenRouter's public API.

Uses OpenRouter as a pricing oracle with in-memory caching (1-hour TTL).
Graceful degradation: returns None on any error.
"""

from __future__ import annotations

import asyncio
import logging
import time
from decimal import Decimal

import httpx

logger = logging.getLogger(__name__)

OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models"
_CACHE_TTL_SECONDS = 3600  # 1 hour

# Cache: model_id -> (prompt_per_token, completion_per_token)
# Swapped atomically — never cleared-then-updated.
_pricing_cache: dict[str, tuple[float, float]] = {}
_cache_updated_at: float = 0.0
_refresh_lock = asyncio.Lock()

# Provider prefix mapping for OpenRouter model IDs
_PROVIDER_PREFIXES: dict[str, str] = {
    "anthropic": "anthropic/",
    "openai": "openai/",
    "openrouter": "",  # Already in correct format
}


def _normalize_model_id(model: str, provider: str) -> str:
    """Map a provider's model ID to OpenRouter's format."""
    prefix = _PROVIDER_PREFIXES.get(provider, "")
    if prefix and not model.startswith(prefix):
        return f"{prefix}{model}"
    return model


async def _refresh_cache() -> None:
    """Fetch all model pricing from OpenRouter and populate cache.

    Uses a lock to prevent duplicate concurrent refreshes and swaps
    the cache atomically to avoid readers seeing an empty dict.
    """
    global _pricing_cache, _cache_updated_at  # noqa: PLW0603

    async with _refresh_lock:
        # Double-check: another coroutine may have refreshed while we waited
        if time.monotonic() - _cache_updated_at <= _CACHE_TTL_SECONDS:
            return

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(OPENROUTER_MODELS_URL)
                resp.raise_for_status()
                data = resp.json()

            new_cache: dict[str, tuple[float, float]] = {}
            for entry in data.get("data", []):
                model_id = entry.get("id", "")
                pricing = entry.get("pricing", {})
                prompt_str = pricing.get("prompt")
                completion_str = pricing.get("completion")
                if prompt_str is not None and completion_str is not None:
                    try:
                        prompt_price = float(Decimal(prompt_str))
                        completion_price = float(Decimal(completion_str))
                        new_cache[model_id] = (prompt_price, completion_price)
                    except (ValueError, ArithmeticError):
                        continue

            # Atomic swap — readers never see an empty cache
            _pricing_cache = new_cache
            _cache_updated_at = time.monotonic()
            logger.info("Refreshed AI pricing cache: %d models", len(new_cache))
        except Exception:
            logger.warning(
                "Failed to fetch OpenRouter pricing — costs unavailable",
                exc_info=True,
            )


async def fetch_model_pricing(model: str, provider: str) -> tuple[float, float] | None:
    """Get per-token pricing for a model.

    Returns (prompt_per_token, completion_per_token) or None if unavailable.
    Ollama models are always free (returns None).
    """
    if provider == "ollama":
        return None

    # Refresh cache if stale
    if time.monotonic() - _cache_updated_at > _CACHE_TTL_SECONDS:
        await _refresh_cache()

    model_id = _normalize_model_id(model, provider)
    return _pricing_cache.get(model_id)


def estimate_cost(
    input_tokens: int,
    output_tokens: int,
    pricing: tuple[float, float] | None,
) -> float | None:
    """Calculate estimated cost in USD given token counts and per-token pricing."""
    if pricing is None:
        return None
    prompt_rate, completion_rate = pricing
    return input_tokens * prompt_rate + output_tokens * completion_rate
