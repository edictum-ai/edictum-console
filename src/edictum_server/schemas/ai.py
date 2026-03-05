"""Pydantic schemas for AI contract assistant endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class AiConfigResponse(BaseModel):
    """AI config returned to dashboard (API key masked, never raw)."""

    provider: str
    api_key_masked: str
    model: str | None = None
    base_url: str | None = None
    configured: bool


class UpsertAiConfigRequest(BaseModel):
    """Request to create or update AI config."""

    provider: str = Field(..., pattern=r"^(anthropic|openai|openrouter|ollama)$")
    api_key: str | None = Field(None, max_length=500)
    model: str | None = Field(None, max_length=200)
    base_url: str | None = Field(None, max_length=500)


class TestConnectionResponse(BaseModel):
    """Result of testing AI provider connectivity."""

    ok: bool
    model: str | None = None
    latency_ms: int | None = None
    error: str | None = None


class AssistMessage(BaseModel):
    """A single message in the conversation."""

    role: str = Field(..., pattern=r"^(user|assistant)$")
    content: str = Field(..., max_length=10_000)


class AssistRequest(BaseModel):
    """Chat request for the AI contract assistant."""

    messages: list[AssistMessage] = Field(..., max_length=50)
    current_yaml: str | None = Field(None, max_length=50_000)


class DailyUsage(BaseModel):
    """Aggregated AI usage for a single day."""

    date: str
    input_tokens: int
    output_tokens: int
    cost_usd: float | None
    queries: int


class AiUsageResponse(BaseModel):
    """AI usage statistics over a date range."""

    total_input_tokens: int
    total_output_tokens: int
    total_cost_usd: float | None
    query_count: int
    avg_tokens_per_second: float
    daily: list[DailyUsage]
