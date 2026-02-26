"""Request and response schemas for bundle and deployment endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BundleUploadRequest(BaseModel):
    """Upload a new contract bundle (raw YAML string)."""

    yaml_content: str


class BundleResponse(BaseModel):
    """Serialized bundle returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    version: int
    revision_hash: str
    signature_hex: str | None = None
    source_hub_slug: str | None = None
    source_hub_revision: str | None = None
    uploaded_by: str
    created_at: datetime


class BundleWithDeploymentsResponse(BundleResponse):
    """Bundle response enriched with deployed environment names."""

    deployed_envs: list[str] = []


class DeployRequest(BaseModel):
    """Request body for deploying a bundle to an environment."""

    env: str


class DeploymentResponse(BaseModel):
    """Serialized deployment returned by the API."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    env: str
    bundle_version: int
    deployed_by: str
    created_at: datetime
