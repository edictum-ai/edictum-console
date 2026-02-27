"""Request and response schemas for the evaluate (playground) endpoint."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class PrincipalInput(BaseModel):
    """Optional principal context for evaluation."""

    user_id: str | None = None
    role: str | None = None
    claims: dict[str, Any] | None = None


class EvaluateRequest(BaseModel):
    """Request body for contract evaluation playground."""

    yaml_content: str = Field(..., description="YAML contract bundle to evaluate against")
    tool_name: str = Field(..., description="Tool name to simulate")
    tool_args: dict[str, Any] = Field(default_factory=dict, description="Tool arguments")
    environment: str = Field(default="production", description="Environment context")
    agent_id: str = Field(default="test-agent", description="Simulated agent ID")
    principal: PrincipalInput | None = Field(
        default=None, description="Optional principal identity"
    )


class ContractEvaluation(BaseModel):
    """Result of evaluating a single contract."""

    id: str
    type: str
    matched: bool
    effect: str | None = None
    message: str | None = None
    observed: bool = False
    tags: list[str] = []


class EvaluateResponse(BaseModel):
    """Response from the evaluate playground endpoint."""

    verdict: str
    mode: str
    contracts_evaluated: list[ContractEvaluation]
    deciding_contract: str | None = None
    policy_version: str
    evaluation_time_ms: float
