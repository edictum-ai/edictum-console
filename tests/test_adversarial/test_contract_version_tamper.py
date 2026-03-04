"""C4: Contract version tampering tests.

Risk if bypassed: Stale contracts deployed, version confusion, data corruption.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Contract
from tests.conftest import TENANT_A_ID  # noqa: F401 — used in DB queries

pytestmark = pytest.mark.security


def _contract_payload(contract_id: str = "block-reads") -> dict:
    return {
        "contract_id": contract_id,
        "name": "Block Reads",
        "type": "pre",
        "definition": {"tool": "db_read", "then": {"effect": "deny"}},
        "tags": ["security"],
    }


async def test_update_sets_is_latest_correctly(
    client: AsyncClient, db_session: AsyncSession,
) -> None:
    """Create v1, update to v2. Verify v1.is_latest=False, v2.is_latest=True."""
    resp = await client.post("/api/v1/contracts", json=_contract_payload())
    assert resp.status_code == 201

    resp = await client.put(
        "/api/v1/contracts/block-reads",
        json={"name": "Block Reads v2"},
    )
    assert resp.status_code == 200
    assert resp.json()["version"] == 2

    # Verify in DB
    result = await db_session.execute(
        select(Contract).where(
            Contract.tenant_id == TENANT_A_ID,
            Contract.contract_id == "block-reads",
        ).order_by(Contract.version)
    )
    rows = list(result.scalars().all())
    assert len(rows) == 2
    assert rows[0].version == 1
    assert rows[0].is_latest is False
    assert rows[1].version == 2
    assert rows[1].is_latest is True


async def test_get_specific_version_after_multiple_updates(
    client: AsyncClient,
) -> None:
    """Create v1, v2, v3. GET /versions/1 returns v1 content, not latest."""
    await client.post("/api/v1/contracts", json=_contract_payload())
    await client.put("/api/v1/contracts/block-reads", json={"name": "V2"})
    await client.put("/api/v1/contracts/block-reads", json={"name": "V3"})

    # Get v1 specifically
    resp = await client.get("/api/v1/contracts/block-reads/versions/1")
    assert resp.status_code == 200
    assert resp.json()["version"] == 1
    assert resp.json()["name"] == "Block Reads"

    # Get v2 specifically
    resp = await client.get("/api/v1/contracts/block-reads/versions/2")
    assert resp.status_code == 200
    assert resp.json()["name"] == "V2"

    # Get latest (should be v3)
    resp = await client.get("/api/v1/contracts/block-reads")
    assert resp.json()["version"] == 3
    assert resp.json()["name"] == "V3"


async def test_delete_contract_with_composition_reference(
    client: AsyncClient,
) -> None:
    """Delete contract that's in a composition -> 409."""
    await client.post("/api/v1/contracts", json=_contract_payload())
    await client.post("/api/v1/compositions", json={
        "name": "test-comp",
        "defaults_mode": "enforce",
        "update_strategy": "manual",
        "contracts": [{"contract_id": "block-reads", "position": 10}],
    })

    resp = await client.delete("/api/v1/contracts/block-reads")
    assert resp.status_code == 409
    assert "referenced" in resp.json()["detail"].lower()


async def test_import_existing_contract_creates_version(
    client: AsyncClient,
) -> None:
    """Create 'block-shell' v1 manually, import YAML containing 'block-shell'
    -> creates v2, not duplicate error."""
    await client.post("/api/v1/contracts", json={
        "contract_id": "block-shell",
        "name": "Block Shell",
        "type": "pre",
        "definition": {"tool": "shell", "then": {"effect": "deny"}},
    })

    yaml_with_existing = """\
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: reimport-test
contracts:
  - id: block-shell
    type: pre
    tool: shell
    then:
      effect: log
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": yaml_with_existing},
    )
    assert resp.status_code == 201
    assert "block-shell" in resp.json()["contracts_updated"]

    # Verify v2 exists
    resp = await client.get("/api/v1/contracts/block-shell")
    assert resp.json()["version"] == 2


async def test_composition_pins_to_contract_version(
    client: AsyncClient,
) -> None:
    """Composition item FK points to specific Contract row (UUID).
    Updating the contract creates a new row. Composition still points
    to old version until explicitly updated."""
    await client.post("/api/v1/contracts", json=_contract_payload())
    await client.post("/api/v1/compositions", json={
        "name": "pin-test",
        "defaults_mode": "enforce",
        "update_strategy": "manual",
        "contracts": [{"contract_id": "block-reads", "position": 10}],
    })

    # Get the composition detail — should show v1
    resp = await client.get("/api/v1/compositions/pin-test")
    assert resp.status_code == 200
    items = resp.json()["contracts"]
    assert len(items) == 1
    assert items[0]["contract_version"] == 1

    # Update the contract to v2
    await client.put("/api/v1/contracts/block-reads", json={"name": "V2"})

    # Composition still references v1 (pinned by UUID FK)
    resp = await client.get("/api/v1/compositions/pin-test")
    items = resp.json()["contracts"]
    assert items[0]["contract_version"] == 1
    assert items[0]["has_newer_version"] is True


async def test_version_nonexistent_returns_404(client: AsyncClient) -> None:
    """GET /versions/999 on existing contract -> 404 (not 500)."""
    await client.post("/api/v1/contracts", json=_contract_payload())
    resp = await client.get("/api/v1/contracts/block-reads/versions/999")
    assert resp.status_code == 404
