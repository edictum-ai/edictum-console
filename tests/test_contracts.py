"""Tests for contract library CRUD endpoints."""

from __future__ import annotations

from collections.abc import Callable

import pytest
from httpx import AsyncClient

from tests.conftest import TENANT_A_ID, TENANT_B_ID

SAMPLE_YAML = """\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: devops-agent

contracts:
  - id: block-shell
    type: pre
    tool: shell
    then:
      effect: deny
  - id: audit-reads
    type: post
    tool: db_read
    then:
      effect: log
"""


def _make_contract(
    contract_id: str = "block-reads",
    name: str = "Block Reads",
    type: str = "pre",
) -> dict:
    return {
        "contract_id": contract_id,
        "name": name,
        "type": type,
        "definition": {"tool": "db_read", "then": {"effect": "deny"}},
        "tags": ["security", "baseline"],
        "description": "Blocks database reads",
    }


# --- Create ---

@pytest.mark.anyio
async def test_create_contract(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/contracts", json=_make_contract())
    assert resp.status_code == 201
    data = resp.json()
    assert data["contract_id"] == "block-reads"
    assert data["version"] == 1
    assert data["is_latest"] is True
    assert data["type"] == "pre"
    assert data["tags"] == ["security", "baseline"]
    assert data["definition"]["tool"] == "db_read"
    assert data["tenant_id"] == str(TENANT_A_ID)


@pytest.mark.anyio
async def test_create_duplicate_contract_id_returns_409(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract())
    resp = await client.post("/api/v1/contracts", json=_make_contract())
    assert resp.status_code == 409


@pytest.mark.anyio
async def test_create_invalid_contract_id_returns_422(client: AsyncClient) -> None:
    body = _make_contract(contract_id="Block Reads")
    resp = await client.post("/api/v1/contracts", json=body)
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_create_invalid_type_returns_422(client: AsyncClient) -> None:
    body = _make_contract(type="invalid")
    resp = await client.post("/api/v1/contracts", json=body)
    assert resp.status_code == 422


# --- Update ---

@pytest.mark.anyio
async def test_update_contract_increments_version(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract())
    resp = await client.put("/api/v1/contracts/block-reads", json={
        "definition": {"tool": "db_write", "then": {"effect": "deny"}},
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["version"] == 2
    assert data["is_latest"] is True
    assert data["definition"]["tool"] == "db_write"
    # Version history included
    assert len(data["versions"]) == 2
    assert data["versions"][0]["version"] == 2
    assert data["versions"][1]["version"] == 1


@pytest.mark.anyio
async def test_update_nonexistent_returns_404(client: AsyncClient) -> None:
    resp = await client.put("/api/v1/contracts/nope", json={"name": "x"})
    assert resp.status_code == 404


# --- Get ---

@pytest.mark.anyio
async def test_get_contract_latest(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract())
    resp = await client.get("/api/v1/contracts/block-reads")
    assert resp.status_code == 200
    data = resp.json()
    assert data["contract_id"] == "block-reads"
    assert data["version"] == 1
    assert len(data["versions"]) == 1


@pytest.mark.anyio
async def test_get_contract_specific_version(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract())
    await client.put("/api/v1/contracts/block-reads", json={"name": "Updated"})

    resp = await client.get("/api/v1/contracts/block-reads/versions/1")
    assert resp.status_code == 200
    assert resp.json()["version"] == 1
    assert resp.json()["name"] == "Block Reads"

    resp2 = await client.get("/api/v1/contracts/block-reads/versions/2")
    assert resp2.status_code == 200
    assert resp2.json()["version"] == 2
    assert resp2.json()["name"] == "Updated"


@pytest.mark.anyio
async def test_get_nonexistent_returns_404(client: AsyncClient) -> None:
    resp = await client.get("/api/v1/contracts/nope")
    assert resp.status_code == 404


# --- List ---

@pytest.mark.anyio
async def test_list_contracts(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract("c1", "C1", "pre"))
    await client.post("/api/v1/contracts", json=_make_contract("c2", "C2", "post"))
    resp = await client.get("/api/v1/contracts")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2


@pytest.mark.anyio
async def test_list_contracts_filter_by_type(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract("c1", "C1", "pre"))
    await client.post("/api/v1/contracts", json=_make_contract("c2", "C2", "post"))
    resp = await client.get("/api/v1/contracts", params={"type": "pre"})
    assert len(resp.json()) == 1
    assert resp.json()[0]["contract_id"] == "c1"


@pytest.mark.anyio
async def test_list_contracts_filter_by_tag(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract("c1", "C1"))
    body = _make_contract("c2", "C2")
    body["tags"] = ["compliance"]
    await client.post("/api/v1/contracts", json=body)

    resp = await client.get("/api/v1/contracts", params={"tag": "compliance"})
    assert len(resp.json()) == 1
    assert resp.json()[0]["contract_id"] == "c2"


@pytest.mark.anyio
async def test_list_contracts_search(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract("c1", "Block PII"))
    await client.post("/api/v1/contracts", json=_make_contract("c2", "Audit Logs"))
    resp = await client.get("/api/v1/contracts", params={"search": "pii"})
    assert len(resp.json()) == 1
    assert resp.json()[0]["contract_id"] == "c1"


# --- Delete ---

@pytest.mark.anyio
async def test_delete_unused_contract(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract())
    resp = await client.delete("/api/v1/contracts/block-reads")
    assert resp.status_code == 204

    # Verify it's gone
    resp2 = await client.get("/api/v1/contracts/block-reads")
    assert resp2.status_code == 404


@pytest.mark.anyio
async def test_delete_nonexistent_returns_404(client: AsyncClient) -> None:
    resp = await client.delete("/api/v1/contracts/nope")
    assert resp.status_code == 404


# --- Import ---

@pytest.mark.anyio
async def test_import_from_yaml(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/contracts/import", json={
        "yaml_content": SAMPLE_YAML,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert sorted(data["contracts_created"]) == ["audit-reads", "block-shell"]
    assert data["contracts_updated"] == []
    assert data["bundle_composition_created"] == "devops-agent"

    # Verify contracts exist
    resp2 = await client.get("/api/v1/contracts/block-shell")
    assert resp2.status_code == 200
    assert resp2.json()["type"] == "pre"


@pytest.mark.anyio
async def test_import_with_existing_creates_new_version(client: AsyncClient) -> None:
    # Pre-create a contract that matches one in the YAML
    await client.post("/api/v1/contracts", json={
        "contract_id": "block-shell",
        "name": "Block Shell",
        "type": "pre",
        "definition": {"tool": "shell", "then": {"effect": "log"}},
    })

    resp = await client.post("/api/v1/contracts/import", json={
        "yaml_content": SAMPLE_YAML,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "block-shell" in data["contracts_updated"]
    assert "audit-reads" in data["contracts_created"]

    # Verify version incremented
    resp2 = await client.get("/api/v1/contracts/block-shell")
    assert resp2.json()["version"] == 2


@pytest.mark.anyio
async def test_import_invalid_yaml_returns_422(client: AsyncClient) -> None:
    resp = await client.post("/api/v1/contracts/import", json={
        "yaml_content": "not: valid: yaml: [[",
    })
    assert resp.status_code == 422


# --- Tenant Isolation ---

@pytest.mark.anyio
async def test_tenant_isolation(
    client: AsyncClient,
    set_auth_tenant_b: Callable[[], None],
) -> None:
    # Create as tenant A
    await client.post("/api/v1/contracts", json=_make_contract())

    # Switch to tenant B
    set_auth_tenant_b()

    # Tenant B cannot see tenant A's contracts
    resp = await client.get("/api/v1/contracts")
    assert resp.status_code == 200
    assert len(resp.json()) == 0

    resp2 = await client.get("/api/v1/contracts/block-reads")
    assert resp2.status_code == 404

    resp3 = await client.delete("/api/v1/contracts/block-reads")
    assert resp3.status_code == 404

    resp4 = await client.put("/api/v1/contracts/block-reads", json={"name": "x"})
    assert resp4.status_code == 404


# --- Usage ---

@pytest.mark.anyio
async def test_usage_empty(client: AsyncClient) -> None:
    await client.post("/api/v1/contracts", json=_make_contract())
    resp = await client.get("/api/v1/contracts/block-reads/usage")
    assert resp.status_code == 200
    assert resp.json() == []


# --- Edge cases (bug fixes) ---

@pytest.mark.anyio
async def test_update_empty_body_returns_error(client: AsyncClient) -> None:
    """Empty update body should not create a pointless new version."""
    await client.post("/api/v1/contracts", json=_make_contract())
    resp = await client.put("/api/v1/contracts/block-reads", json={})
    assert resp.status_code == 422
    assert "at least one field" in resp.json()["detail"].lower()


@pytest.mark.anyio
async def test_import_invalid_type_in_yaml_returns_422(client: AsyncClient) -> None:
    """YAML with an invalid contract type should be rejected."""
    bad_yaml = """\
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: bad-bundle
contracts:
  - id: bad-type
    type: foobar
    tool: shell
    then:
      effect: deny
"""
    resp = await client.post("/api/v1/contracts/import", json={
        "yaml_content": bad_yaml,
    })
    assert resp.status_code == 422
    assert "type must be one of" in resp.json()["detail"]
