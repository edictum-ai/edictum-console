"""Request and response schemas for contract library endpoints."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

_CONTRACT_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


class ContractCreateRequest(BaseModel):
    """Create a new contract in the library."""

    contract_id: str
    name: str
    description: str | None = None
    type: str  # "pre" | "post" | "session" | "sandbox"
    definition: dict
    tags: list[str] = []

    @field_validator("contract_id")
    @classmethod
    def validate_contract_id(cls, v: str) -> str:
        if not _CONTRACT_ID_RE.match(v):
            raise ValueError(
                "contract_id must match [a-z0-9][a-z0-9_-]* "
                "(lowercase, digits, hyphens, underscores; must start with alphanumeric)"
            )
        return v

    @field_validator("type")
    @classmethod
    def validate_type(cls, v: str) -> str:
        allowed = {"pre", "post", "session", "sandbox"}
        if v not in allowed:
            raise ValueError(f"type must be one of {sorted(allowed)}")
        return v


class ContractUpdateRequest(BaseModel):
    """Update a contract (creates a new version)."""

    name: str | None = None
    description: str | None = None
    definition: dict | None = None
    tags: list[str] | None = None


class ContractVersionInfo(BaseModel):
    """Version summary within contract detail."""

    version: int
    created_at: datetime
    created_by: str


class ContractSummary(BaseModel):
    """Contract list item."""

    model_config = ConfigDict(from_attributes=True)

    contract_id: str
    name: str
    type: str
    tags: list
    version: int
    description: str | None
    created_at: datetime
    usage_count: int = 0


class ContractDetail(ContractSummary):
    """Full contract with definition and version history."""

    id: uuid.UUID
    tenant_id: uuid.UUID
    definition: dict
    is_latest: bool
    created_by: str
    versions: list[ContractVersionInfo] = []


class ContractUsageItem(BaseModel):
    """Bundle composition that uses a contract."""

    model_config = ConfigDict(from_attributes=True)

    composition_id: uuid.UUID
    composition_name: str


class ImportRequest(BaseModel):
    """Import contracts from a YAML bundle."""

    yaml_content: str


class ImportResult(BaseModel):
    """Result of importing contracts from YAML."""

    contracts_created: list[str]
    contracts_updated: list[str]
    bundle_composition_created: str | None
