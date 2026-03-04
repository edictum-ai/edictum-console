"""C2: Composition tenant isolation tests.

Risk if bypassed: Cross-tenant composition/contract data leak. SHIP-BLOCKER.
"""

from __future__ import annotations

from collections.abc import Callable

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.security


def _contract_payload(contract_id: str = "block-reads") -> dict:
    return {
        "contract_id": contract_id,
        "name": "Block Reads",
        "type": "pre",
        "definition": {"tool": "db_read", "then": {"effect": "deny"}},
        "tags": ["security"],
    }


def _composition_payload(
    name: str = "finance-agents", contracts: list[dict] | None = None,
) -> dict:
    return {
        "name": name,
        "description": "Test bundle",
        "defaults_mode": "enforce",
        "update_strategy": "manual",
        "contracts": contracts or [],
    }


async def _create_contract_and_composition(
    client: AsyncClient, contract_id: str = "block-reads", comp_name: str = "finance-agents",
) -> None:
    """Helper: create a contract then a composition referencing it."""
    resp = await client.post("/api/v1/contracts", json=_contract_payload(contract_id))
    assert resp.status_code == 201
    resp = await client.post(
        "/api/v1/compositions",
        json=_composition_payload(comp_name, [
            {"contract_id": contract_id, "position": 10},
        ]),
    )
    assert resp.status_code == 201


async def test_list_compositions_tenant_isolation(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create composition as A, list as B -> empty."""
    await _create_contract_and_composition(client)

    set_auth_tenant_b()
    resp = await client.get("/api/v1/compositions")
    assert resp.status_code == 200
    assert resp.json() == []


async def test_get_composition_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """GET /compositions/{name} as B -> 404."""
    await _create_contract_and_composition(client)

    set_auth_tenant_b()
    resp = await client.get("/api/v1/compositions/finance-agents")
    assert resp.status_code == 404


async def test_update_composition_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """PUT /compositions/{name} as B on A's composition -> 404."""
    await _create_contract_and_composition(client)

    set_auth_tenant_b()
    resp = await client.put(
        "/api/v1/compositions/finance-agents",
        json={"description": "Hijacked"},
    )
    assert resp.status_code == 404


async def test_delete_composition_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """DELETE /compositions/{name} as B -> 404."""
    await _create_contract_and_composition(client)

    set_auth_tenant_b()
    resp = await client.delete("/api/v1/compositions/finance-agents")
    assert resp.status_code == 404


async def test_preview_composition_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """POST /compositions/{name}/preview as B -> 404."""
    await _create_contract_and_composition(client)

    set_auth_tenant_b()
    resp = await client.post("/api/v1/compositions/finance-agents/preview")
    assert resp.status_code == 404


async def test_deploy_composition_cross_tenant(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """POST /compositions/{name}/deploy as B -> 404."""
    await _create_contract_and_composition(client)

    set_auth_tenant_b()
    resp = await client.post(
        "/api/v1/compositions/finance-agents/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 404


async def test_composition_references_cross_tenant_contract(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create contract as A, switch to B, create composition referencing A's
    contract_id -> 422 (contract not found in B's tenant scope).

    This is the HIGHEST PRIORITY test — cross-FK tenant check.
    """
    # Tenant A creates a contract
    resp = await client.post("/api/v1/contracts", json=_contract_payload("secret-rule"))
    assert resp.status_code == 201

    # Tenant B tries to use A's contract_id in their composition
    set_auth_tenant_b()
    resp = await client.post(
        "/api/v1/compositions",
        json=_composition_payload("evil-comp", [
            {"contract_id": "secret-rule", "position": 10},
        ]),
    )
    assert resp.status_code == 422
    assert "not found" in resp.json()["detail"].lower()


async def test_composition_update_references_cross_tenant_contract(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    """Create contract as A. B creates own composition (empty), then tries
    to add A's contract via update -> 422."""
    # Tenant A creates a contract
    resp = await client.post("/api/v1/contracts", json=_contract_payload("secret-rule"))
    assert resp.status_code == 201

    # Tenant B creates their own empty composition (no contracts)
    set_auth_tenant_b()
    resp = await client.post("/api/v1/compositions", json=_composition_payload("b-comp"))
    assert resp.status_code == 201

    # B tries to update composition to reference A's contract
    resp = await client.put(
        "/api/v1/compositions/b-comp",
        json={"contracts": [
            {"contract_id": "secret-rule", "position": 10},
        ]},
    )
    # Route returns 404 because resolve_contracts raises ValueError("not found")
    # and the route handler maps "not found" → 404. Either 404 or 422 is acceptable
    # — the key invariant is that cross-tenant reference is rejected.
    assert resp.status_code in (404, 422)
    assert "not found" in resp.json()["detail"].lower()
