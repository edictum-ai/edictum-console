"""C1: Contract library tenant isolation tests.

Risk if bypassed: Cross-tenant contract data leak. SHIP-BLOCKER.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.security


def _contract_payload(contract_id: str = "test-contract") -> dict:
    return {
        "contract_id": contract_id,
        "name": "Test Contract",
        "type": "pre",
        "definition": {"tool": "shell", "then": {"effect": "deny"}},
        "tags": ["test"],
    }


SAMPLE_YAML = """\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: import-test

contracts:
  - id: imported-rule
    type: pre
    tool: shell
    then:
      effect: deny
"""


async def test_list_contracts_tenant_isolation(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create contract as A, list as B -> empty."""
    resp = await client.post("/api/v1/contracts", json=_contract_payload())
    assert resp.status_code == 201

    set_auth_tenant_b()
    resp = await client.get("/api/v1/contracts")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_contract_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create contract as A, GET /{contract_id} as B -> 404."""
    resp = await client.post("/api/v1/contracts", json=_contract_payload("block-reads"))
    assert resp.status_code == 201

    set_auth_tenant_b()
    resp = await client.get("/api/v1/contracts/block-reads")
    assert resp.status_code == 404


async def test_get_contract_version_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """GET /{contract_id}/versions/{version} as B -> 404."""
    resp = await client.post("/api/v1/contracts", json=_contract_payload("block-reads"))
    assert resp.status_code == 201

    set_auth_tenant_b()
    resp = await client.get("/api/v1/contracts/block-reads/versions/1")
    assert resp.status_code == 404


async def test_update_contract_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """PUT /{contract_id} as B on A's contract -> 404."""
    resp = await client.post("/api/v1/contracts", json=_contract_payload("block-reads"))
    assert resp.status_code == 201

    set_auth_tenant_b()
    resp = await client.put(
        "/api/v1/contracts/block-reads",
        json={"name": "Hijacked"},
    )
    assert resp.status_code == 404


async def test_delete_contract_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """DELETE /{contract_id} as B on A's contract -> 404."""
    resp = await client.post("/api/v1/contracts", json=_contract_payload("block-reads"))
    assert resp.status_code == 201

    set_auth_tenant_b()
    resp = await client.delete("/api/v1/contracts/block-reads")
    assert resp.status_code == 404


async def test_contract_usage_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """GET /{contract_id}/usage as B -> empty (contract not found in B's scope)."""
    resp = await client.post("/api/v1/contracts", json=_contract_payload("block-reads"))
    assert resp.status_code == 201

    set_auth_tenant_b()
    resp = await client.get("/api/v1/contracts/block-reads/usage")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_import_creates_contracts_in_own_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Import as A, then list as B -> B sees nothing."""
    resp = await client.post("/api/v1/contracts/import", json={"yaml_content": SAMPLE_YAML})
    assert resp.status_code == 201

    set_auth_tenant_b()
    resp = await client.get("/api/v1/contracts")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_contract_id_collision_across_tenants(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Both tenants create contract_id='block-reads'. Each only sees own."""
    # Tenant A creates
    resp_a = await client.post("/api/v1/contracts", json=_contract_payload("block-reads"))
    assert resp_a.status_code == 201

    # Tenant B creates same contract_id
    set_auth_tenant_b()
    resp_b = await client.post("/api/v1/contracts", json=_contract_payload("block-reads"))
    assert resp_b.status_code == 201

    # B only sees their own
    resp = await client.get("/api/v1/contracts")
    assert len(resp.json()) == 1

    # A only sees their own
    set_auth_tenant_a()
    resp = await client.get("/api/v1/contracts")
    assert len(resp.json()) == 1
