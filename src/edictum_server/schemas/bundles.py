"""Request and response schemas for bundle and deployment endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class BundleUploadRequest(BaseModel):
    """Upload a new contract bundle (raw YAML string)."""

    yaml_content: str


class BundleResponse(BaseModel):
    """Serialized bundle returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    name: str
    version: int
    revision_hash: str
    signature_hex: str | None = None
    source_hub_slug: str | None = None
    source_hub_revision: str | None = None
    uploaded_by: str
    created_at: datetime


class BundleCurrentResponse(BundleResponse):
    """Bundle response with YAML content for agent consumption.

    Used by GET /{name}/current — agents need the actual contract YAML
    to parse and enforce. The yaml_bytes field is base64-encoded.
    """

    yaml_bytes: str  # base64-encoded YAML content


class BundleWithDeploymentsResponse(BundleResponse):
    """Bundle response enriched with deployed environment names."""

    deployed_envs: list[str] = []


class BundleSummaryResponse(BaseModel):
    """Summary of a named bundle (for the bundle list)."""

    name: str
    latest_version: int
    version_count: int
    last_updated: datetime
    deployed_envs: list[str] = []
    contract_count: int | None = None
    last_deployed_at: datetime | None = None


class DeployRequest(BaseModel):
    """Request body for deploying a bundle to an environment."""

    env: Literal["production", "staging", "development"]


class DeploymentResponse(BaseModel):
    """Serialized deployment returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    env: str
    bundle_name: str
    bundle_version: int
    deployed_by: str
    created_at: datetime
