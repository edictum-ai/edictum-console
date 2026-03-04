"""C3: Import injection / YAML safety tests.

Risk if bypassed: Code execution via YAML deserialization, DoS via YAML bombs,
or data corruption via malformed contract IDs.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.security


async def test_import_yaml_bomb(client: AsyncClient) -> None:
    """YAML with recursive anchors (billion laughs) -> reject or safe-handle.
    yaml.safe_load prevents unbounded expansion."""
    yaml_bomb = "a: &a [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]"
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": yaml_bomb},
    )
    # Should either reject with 422 or handle safely (not hang/OOM)
    assert resp.status_code == 422


async def test_import_malicious_yaml_tags(client: AsyncClient) -> None:
    """YAML with !!python/exec tags -> rejected by safe_load."""
    malicious = """\
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: evil
contracts:
  - id: !!python/object/apply:os.system ["echo pwned"]
    type: pre
    tool: shell
    then:
      effect: deny
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": malicious},
    )
    assert resp.status_code == 422


async def test_import_oversized_yaml(client: AsyncClient) -> None:
    """Import YAML larger than 1MB -> should be rejected or handled safely."""
    # Build a YAML string > 1MB
    big_content = "x" * (1024 * 1024 + 100)
    oversized = f"""\
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: huge
contracts:
  - id: big
    type: pre
    description: {big_content}
    tool: shell
    then:
      effect: deny
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": oversized},
    )
    # Either 413 (payload too large) or 422 (validation) — not 500
    assert resp.status_code in (413, 422, 201)
    # If it succeeds, that's acceptable — the important thing is no crash


async def test_import_non_contract_yaml(client: AsyncClient) -> None:
    """Valid YAML but not a ContractBundle (wrong kind/apiVersion) -> 422."""
    not_a_bundle = """\
apiVersion: kubernetes/v1
kind: Pod
metadata:
  name: nginx
spec:
  containers:
    - name: nginx
      image: nginx:latest
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": not_a_bundle},
    )
    assert resp.status_code == 422


async def test_import_wrong_kind_with_valid_contracts(client: AsyncClient) -> None:
    """YAML with correct structure but wrong kind -> 422 (not silently imported)."""
    wrong_kind = """\
apiVersion: edictum/v1
kind: SomethingElse
metadata:
  name: sneaky
contracts:
  - id: legit-looking
    type: pre
    tool: shell
    then:
      effect: deny
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": wrong_kind},
    )
    assert resp.status_code == 422
    assert "kind" in resp.json()["detail"].lower()


async def test_import_missing_api_version(client: AsyncClient) -> None:
    """YAML with no apiVersion field -> 422."""
    no_version = """\
kind: ContractBundle
metadata:
  name: no-version
contracts:
  - id: test
    type: pre
    tool: shell
    then:
      effect: deny
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": no_version},
    )
    assert resp.status_code == 422
    assert "apiversion" in resp.json()["detail"].lower()


async def test_import_empty_contracts_array(client: AsyncClient) -> None:
    """YAML with empty contracts list -> 422."""
    empty = """\
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: empty-bundle
contracts: []
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": empty},
    )
    assert resp.status_code == 422
    assert "no contracts" in resp.json()["detail"].lower()


async def test_import_duplicate_contract_ids_in_yaml(client: AsyncClient) -> None:
    """YAML with two contracts sharing the same id -> should not crash.
    Acceptable outcomes: 201 (first creates, second updates) or 422 (rejects)."""
    dup_yaml = """\
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: dup-test
contracts:
  - id: block-shell
    type: pre
    tool: shell
    then:
      effect: deny
  - id: block-shell
    type: pre
    tool: shell
    then:
      effect: log
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": dup_yaml},
    )
    # Must NOT be a 500 server error — either handle gracefully or reject
    assert resp.status_code in (201, 422), (
        f"Duplicate contract IDs in YAML caused server error: {resp.text}"
    )


async def test_import_contract_with_no_id_field(client: AsyncClient) -> None:
    """Contract missing 'id' field -> 422 with clear error."""
    no_id_yaml = """\
apiVersion: edictum/v1
kind: ContractBundle
metadata:
  name: missing-id
contracts:
  - type: pre
    tool: shell
    then:
      effect: deny
"""
    resp = await client.post(
        "/api/v1/contracts/import",
        json={"yaml_content": no_id_yaml},
    )
    assert resp.status_code == 422
    assert "id" in resp.json()["detail"].lower()


async def test_import_contract_id_with_special_chars(client: AsyncClient) -> None:
    """contract_id with path traversal, SQL injection chars -> validate format rejects."""
    bad_ids = [
        "../etc/passwd",
        "'; DROP TABLE contracts; --",
        "block\x00reads",
        "UPPER-CASE",
        " leading-space",
        "block reads",  # spaces
    ]
    for bad_id in bad_ids:
        resp = await client.post(
            "/api/v1/contracts",
            json={
                "contract_id": bad_id,
                "name": "Evil",
                "type": "pre",
                "definition": {"tool": "shell", "then": {"effect": "deny"}},
            },
        )
        assert resp.status_code == 422, (
            f"Expected 422 for contract_id={bad_id!r}, got {resp.status_code}"
        )
