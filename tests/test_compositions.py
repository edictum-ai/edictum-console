"""Tests for bundle composition CRUD, preview, deploy, and tenant isolation."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from httpx import AsyncClient

from tests.conftest import TENANT_A_ID, TENANT_B_ID


def _contract(cid: str = "block-reads", name: str = "Block Reads", type: str = "pre") -> dict:
    return {
        "contract_id": cid, "name": name, "type": type,
        "definition": {"tool": "db_read", "then": {"effect": "deny"}},
        "tags": ["security"],
    }


def _composition(
    name: str = "finance-agents", contracts: list[dict] | None = None,
) -> dict:
    return {
        "name": name, "description": "Test bundle",
        "defaults_mode": "enforce", "update_strategy": "manual",
        "contracts": contracts or [],
    }


async def _seed_contracts(client: AsyncClient) -> None:
    """Create two contracts for composition tests."""
    await client.post("/api/v1/contracts", json=_contract("c1", "Contract One", "pre"))
    await client.post("/api/v1/contracts", json=_contract("c2", "Contract Two", "post"))


# --- Create ---

@pytest.mark.anyio
async def test_create_empty_composition(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/compositions", json=_composition())
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "finance-agents"
    assert data["defaults_mode"] == "enforce"
    assert data["contract_count"] == 0
    assert data["contracts"] == []


@pytest.mark.anyio
async def test_create_composition_with_contracts(client: AsyncClient) -> None:
    await _seed_contracts(client)
    body = _composition(contracts=[
        {"contract_id": "c1", "position": 10},
        {"contract_id": "c2", "position": 20, "mode_override": "observe"},
    ])
    resp = await client.post("/api/v1/compositions", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["contract_count"] == 2
    assert len(data["contracts"]) == 2
    assert data["contracts"][0]["contract_id"] == "c1"
    assert data["contracts"][0]["position"] == 10
    assert data["contracts"][1]["mode_override"] == "observe"


@pytest.mark.anyio
async def test_create_duplicate_name_returns_409(client: AsyncClient) -> None:
    await client.post("/api/v1/compositions", json=_composition())
    resp = await client.post("/api/v1/compositions", json=_composition())
    assert resp.status_code == 409


@pytest.mark.anyio
async def test_create_with_nonexistent_contract_returns_422(client: AsyncClient) -> None:
    body = _composition(contracts=[{"contract_id": "nope", "position": 10}])
    resp = await client.post("/api/v1/compositions", json=body)
    assert resp.status_code == 422
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_create_invalid_name_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/compositions", json=_composition(name="INVALID NAME"))
    assert resp.status_code == 422


# --- Get ---

@pytest.mark.anyio
async def test_get_composition(client: AsyncClient) -> None:
    await _seed_contracts(client)
    body = _composition(contracts=[{"contract_id": "c1", "position": 10}])
    await client.post("/api/v1/compositions", json=body)
    resp = await client.get("/api/v1/compositions/finance-agents")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "finance-agents"
    assert len(data["contracts"]) == 1
    assert data["contracts"][0]["contract_name"] == "Contract One"


@pytest.mark.anyio
async def test_get_nonexistent_returns_404(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/compositions/nope")
    assert resp.status_code == 404


# --- List ---

@pytest.mark.anyio
async def test_list_compositions(client: AsyncClient) -> None:
    await client.post("/api/v1/compositions", json=_composition("bundle-a"))
    await client.post("/api/v1/compositions", json=_composition("bundle-b"))
    resp = await client.get("/api/v1/compositions")
    assert resp.status_code == 200
    assert len(resp.json()) == 2


# --- Update ---

@pytest.mark.anyio
async def test_update_composition_scalars(client: AsyncClient) -> None:
    await client.post("/api/v1/compositions", json=_composition())
    resp = await client.put("/api/v1/compositions/finance-agents", json={
        "description": "Updated", "defaults_mode": "observe",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["description"] == "Updated"
    assert data["defaults_mode"] == "observe"


@pytest.mark.anyio
async def test_update_composition_contracts(client: AsyncClient) -> None:
    await _seed_contracts(client)
    body = _composition(contracts=[{"contract_id": "c1", "position": 10}])
    await client.post("/api/v1/compositions", json=body)

    # Replace contracts with c2 only
    resp = await client.put("/api/v1/compositions/finance-agents", json={
        "contracts": [{"contract_id": "c2", "position": 10}],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["contracts"]) == 1
    assert data["contracts"][0]["contract_id"] == "c2"


@pytest.mark.anyio
async def test_update_nonexistent_returns_404(client: AsyncClient) -> None:
    resp = await client.put("/api/v1/compositions/nope", json={"description": "x"})
    assert resp.status_code == 404


# --- Delete ---

@pytest.mark.anyio
async def test_delete_composition(client: AsyncClient) -> None:
    await client.post("/api/v1/compositions", json=_composition())
    resp = await client.delete("/api/v1/compositions/finance-agents")
    assert resp.status_code == 204
    resp2 = await client.get("/api/v1/compositions/finance-agents")
    assert resp2.status_code == 404


@pytest.mark.anyio
async def test_delete_nonexistent_returns_404(client: AsyncClient) -> None:
    resp = await client.delete("/api/v1/compositions/nope")
    assert resp.status_code == 404


# --- Preview ---

@pytest.mark.anyio
async def test_preview_returns_yaml(client: AsyncClient) -> None:
    await _seed_contracts(client)
    body = _composition(contracts=[
        {"contract_id": "c1", "position": 10},
        {"contract_id": "c2", "position": 20},
    ])
    await client.post("/api/v1/compositions", json=body)
    resp = await client.post("/api/v1/compositions/finance-agents/preview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["contracts_count"] == 2
    assert "finance-agents" in data["yaml_content"]
    assert "c1" in data["yaml_content"]
    assert "c2" in data["yaml_content"]


@pytest.mark.anyio
async def test_preview_empty_returns_errors(client: AsyncClient) -> None:
    await client.post("/api/v1/compositions", json=_composition())
    resp = await client.post("/api/v1/compositions/finance-agents/preview")
    assert resp.status_code == 200
    data = resp.json()
    assert data["contracts_count"] == 0
    assert len(data["validation_errors"]) > 0


# --- Mode Resolution ---

@pytest.mark.anyio
async def test_mode_resolution_item_override(client: AsyncClient) -> None:
    """item mode_override > contract definition mode > composition default."""
    await client.post("/api/v1/contracts", json={
        "contract_id": "c-mode", "name": "Mode Test", "type": "pre",
        "definition": {"tool": "shell", "then": {"effect": "deny"}, "mode": "enforce"},
    })
    body = _composition(contracts=[
        {"contract_id": "c-mode", "position": 10, "mode_override": "observe"},
    ])
    await client.post("/api/v1/compositions", json=body)
    resp = await client.post("/api/v1/compositions/finance-agents/preview")
    data = resp.json()
    assert "mode: observe" in data["yaml_content"]


@pytest.mark.anyio
async def test_mode_resolution_contract_definition(client: AsyncClient) -> None:
    """When no item override, contract's own mode is used."""
    await client.post("/api/v1/contracts", json={
        "contract_id": "c-mode2", "name": "Mode Test 2", "type": "pre",
        "definition": {"tool": "shell", "then": {"effect": "deny"}, "mode": "observe"},
    })
    body = _composition(contracts=[
        {"contract_id": "c-mode2", "position": 10},
    ])
    await client.post("/api/v1/compositions", json=body)
    resp = await client.post("/api/v1/compositions/finance-agents/preview")
    data = resp.json()
    assert "mode: observe" in data["yaml_content"]


@pytest.mark.anyio
async def test_mode_resolution_composition_default(client: AsyncClient) -> None:
    """When no item override and no contract mode, composition default is used."""
    await _seed_contracts(client)
    body = _composition(contracts=[{"contract_id": "c1", "position": 10}])
    body["defaults_mode"] = "observe"
    await client.post("/api/v1/compositions", json=body)
    resp = await client.post("/api/v1/compositions/finance-agents/preview")
    data = resp.json()
    assert "mode: observe" in data["yaml_content"]


# --- Position Ordering ---

@pytest.mark.anyio
async def test_position_ordering(client: AsyncClient) -> None:
    await _seed_contracts(client)
    body = _composition(contracts=[
        {"contract_id": "c2", "position": 5},
        {"contract_id": "c1", "position": 15},
    ])
    await client.post("/api/v1/compositions", json=body)
    resp = await client.post("/api/v1/compositions/finance-agents/preview")
    yaml_content = resp.json()["yaml_content"]
    c2_pos = yaml_content.index("c2")
    c1_pos = yaml_content.index("c1")
    assert c2_pos < c1_pos, "c2 should appear before c1 (lower position)"


# --- has_newer_version ---

@pytest.mark.anyio
async def test_has_newer_version_flag(client: AsyncClient) -> None:
    await _seed_contracts(client)
    body = _composition(contracts=[{"contract_id": "c1", "position": 10}])
    await client.post("/api/v1/compositions", json=body)

    # Update c1 to create v2
    await client.put("/api/v1/contracts/c1", json={"name": "Updated"})

    resp = await client.get("/api/v1/compositions/finance-agents")
    data = resp.json()
    assert data["contracts"][0]["has_newer_version"] is True


# --- Tenant Isolation ---

@pytest.mark.anyio
async def test_tenant_isolation_list(
    client: AsyncClient, set_auth_tenant_b: Callable[[], None],
) -> None:
    await client.post("/api/v1/compositions", json=_composition())
    set_auth_tenant_b()
    resp = await client.get("/api/v1/compositions")
    assert resp.status_code == 200
    assert len(resp.json()) == 0


@pytest.mark.anyio
async def test_tenant_isolation_get(
    client: AsyncClient, set_auth_tenant_b: Callable[[], None],
) -> None:
    await client.post("/api/v1/compositions", json=_composition())
    set_auth_tenant_b()
    resp = await client.get("/api/v1/compositions/finance-agents")
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_tenant_isolation_cross_tenant_contract_ref(
    client: AsyncClient, set_auth_tenant_b: Callable[[], None],
    set_auth_tenant_a: Callable[[], None],
) -> None:
    """Composition can't reference another tenant's contract."""
    # Create contract as tenant A
    await _seed_contracts(client)

    # Switch to tenant B and try to create composition with tenant A's contract
    set_auth_tenant_b()
    body = _composition(contracts=[{"contract_id": "c1", "position": 10}])
    resp = await client.post("/api/v1/compositions", json=body)
    assert resp.status_code == 422
    assert "not found" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_tenant_isolation_delete(
    client: AsyncClient, set_auth_tenant_b: Callable[[], None],
) -> None:
    await client.post("/api/v1/compositions", json=_composition())
    set_auth_tenant_b()
    resp = await client.delete("/api/v1/compositions/finance-agents")
    assert resp.status_code == 404
