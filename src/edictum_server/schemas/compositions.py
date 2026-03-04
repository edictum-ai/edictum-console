"""Request and response schemas for bundle composition endpoints."""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator

_BUNDLE_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")
_BUNDLE_NAME_MAX_LEN = 128


class CompositionItemInput(BaseModel):
    """A contract reference within a composition."""

    contract_id: str  # stable contract_id (not UUID)
    position: int
    mode_override: Literal["enforce", "observe"] | None = None
    enabled: bool = True


class CompositionCreateRequest(BaseModel):
    """Create a new bundle composition."""

    name: str
    description: str | None = None
    defaults_mode: Literal["enforce", "observe"] = "enforce"
    update_strategy: Literal["manual", "auto_deploy", "observe_first"] = "manual"
    contracts: list[CompositionItemInput] = []
    tools_config: dict | None = None
    observability: dict | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v) > _BUNDLE_NAME_MAX_LEN:
            raise ValueError(
                f"name must be at most {_BUNDLE_NAME_MAX_LEN} characters"
            )
        if not _BUNDLE_NAME_RE.match(v):
            raise ValueError(
                "name must match [a-z0-9][a-z0-9._-]* "
                "(lowercase, digits, dots, hyphens, underscores)"
            )
        return v


class CompositionUpdateRequest(BaseModel):
    """Update a bundle composition (all fields optional)."""

    description: str | None = None
    defaults_mode: Literal["enforce", "observe"] | None = None
    update_strategy: Literal["manual", "auto_deploy", "observe_first"] | None = None
    contracts: list[CompositionItemInput] | None = None
    tools_config: dict | None = None
    observability: dict | None = None


class CompositionItemDetail(BaseModel):
    """Detailed view of a contract within a composition."""

    model_config = ConfigDict(from_attributes=True)

    contract_id: str  # stable id
    contract_name: str
    contract_type: str
    contract_version: int
    position: int
    mode_override: str | None
    enabled: bool
    has_newer_version: bool


class CompositionSummary(BaseModel):
    """Composition list item."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    description: str | None
    defaults_mode: str
    update_strategy: str
    contract_count: int
    updated_at: datetime
    created_by: str


class CompositionDetail(CompositionSummary):
    """Full composition with contracts and config."""

    id: uuid.UUID
    tenant_id: uuid.UUID
    contracts: list[CompositionItemDetail]
    tools_config: dict | None
    observability: dict | None


class PreviewResponse(BaseModel):
    """Assembled YAML preview (no deployment)."""

    yaml_content: str
    contracts_count: int
    validation_errors: list[str]


class ComposeDeployRequest(BaseModel):
    """Request body for deploying a composed bundle."""

    env: Literal["production", "staging", "development"]


class ComposeDeployResponse(BaseModel):
    """Response after assembling, signing, and deploying."""

    bundle_name: str
    bundle_version: int
    contracts_assembled: list[dict]
    deployment_id: uuid.UUID
