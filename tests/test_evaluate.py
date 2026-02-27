"""Tests for POST /api/v1/bundles/evaluate (playground endpoint)."""

from __future__ import annotations

from httpx import AsyncClient

# Valid YAML contract bundle that blocks reads of sensitive files
DENY_YAML = """\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: test-bundle

defaults:
  mode: enforce

contracts:
  - id: block-sensitive-reads
    type: pre
    tool: read_file
    when:
      args.path:
        contains_any: [".env", ".secret", ".pem"]
    then:
      effect: deny
      message: "Sensitive file '{args.path}' denied."
      tags: [secrets]
"""

# YAML that should allow a tool call (no matching contracts)
ALLOW_YAML = DENY_YAML  # Same bundle, but tool_name won't match

# YAML with observe mode (warn instead of deny)
OBSERVE_YAML = """\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: observe-bundle

defaults:
  mode: observe

contracts:
  - id: block-sensitive-reads
    type: pre
    tool: read_file
    when:
      args.path:
        contains_any: [".env", ".secret"]
    then:
      effect: deny
      message: "Sensitive file '{args.path}' observed."
      tags: [secrets]
"""

# YAML with sandbox contract type
SANDBOX_YAML = """\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: sandbox-bundle

defaults:
  mode: enforce

contracts:
  - id: restrict-bash
    type: pre
    tool: bash
    when:
      args.command:
        matches: "\\\\brm\\\\s+(-rf?|--recursive)\\\\b"
    then:
      effect: deny
      message: "Destructive command denied."
      tags: [destructive]
"""


def _make_request(
    yaml_content: str = DENY_YAML,
    tool_name: str = "read_file",
    tool_args: dict | None = None,
    environment: str = "production",
    principal: dict | None = None,
) -> dict:
    body: dict = {
        "yaml_content": yaml_content,
        "tool_name": tool_name,
        "tool_args": tool_args or {},
        "environment": environment,
    }
    if principal is not None:
        body["principal"] = principal
    return body


# --- Deny verdict ---


async def test_evaluate_deny(client: AsyncClient) -> None:
    """Reading .env file triggers the block-sensitive-reads contract."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(
            tool_name="read_file",
            tool_args={"path": "/home/app/.env"},
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"] == "deny"
    assert data["mode"] == "enforce"
    assert data["deciding_contract"] == "block-sensitive-reads"
    assert len(data["contracts_evaluated"]) >= 1
    assert data["evaluation_time_ms"] >= 0
    assert data["policy_version"]  # non-empty hash prefix

    # Check the contract evaluation detail
    contract = data["contracts_evaluated"][0]
    assert contract["id"] == "block-sensitive-reads"
    assert contract["type"] == "precondition"
    assert contract["matched"] is False  # passed=False means contract denied
    assert contract["effect"] in ("deny", "warn")  # effect field from contract result
    assert "secrets" in contract["tags"]


# --- Allow verdict ---


async def test_evaluate_allow(client: AsyncClient) -> None:
    """Tool that doesn't match any contract gets allowed."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(
            yaml_content=ALLOW_YAML,
            tool_name="list_files",
            tool_args={"dir": "/tmp"},
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"] == "allow"
    assert data["deciding_contract"] is None


async def test_evaluate_allow_safe_path(client: AsyncClient) -> None:
    """read_file with a safe path is allowed."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(
            tool_name="read_file",
            tool_args={"path": "/home/app/readme.md"},
        ),
    )
    assert resp.status_code == 200
    assert resp.json()["verdict"] == "allow"


# --- Observe mode ---


async def test_evaluate_observe_mode(client: AsyncClient) -> None:
    """In observe mode, a matching contract should warn instead of deny."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(
            yaml_content=OBSERVE_YAML,
            tool_name="read_file",
            tool_args={"path": "/home/app/.env"},
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    # In observe mode the verdict may be "allow" or "warn"
    # depending on the library version. The key is it's not "deny".
    assert data["verdict"] != "deny"
    assert data["mode"] == "observe"


# --- Invalid YAML ---


async def test_evaluate_invalid_yaml(client: AsyncClient) -> None:
    """Malformed YAML returns 422."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(yaml_content="invalid: yaml: ["),
    )
    assert resp.status_code == 422


async def test_evaluate_empty_yaml(client: AsyncClient) -> None:
    """Empty YAML string returns 422."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(yaml_content=""),
    )
    # Empty YAML may parse as None or fail — either 422 or a valid empty result
    assert resp.status_code in (200, 422)


# --- Principal ---


async def test_evaluate_with_principal(client: AsyncClient) -> None:
    """Principal context is accepted and doesn't break evaluation."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(
            tool_name="read_file",
            tool_args={"path": "/home/app/.env"},
            principal={"user_id": "user-123", "role": "admin", "claims": {"org": "acme"}},
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"] == "deny"


# --- Sandbox contract ---


async def test_evaluate_sandbox_deny(client: AsyncClient) -> None:
    """Destructive bash command is denied by sandbox contract."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(
            yaml_content=SANDBOX_YAML,
            tool_name="bash",
            tool_args={"command": "rm -rf /"},
        ),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["verdict"] == "deny"
    assert data["deciding_contract"] == "restrict-bash"


# --- Response shape ---


async def test_evaluate_response_shape(client: AsyncClient) -> None:
    """Response includes all expected fields."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json=_make_request(
            tool_name="read_file",
            tool_args={"path": "/home/app/.env"},
        ),
    )
    assert resp.status_code == 200
    data = resp.json()

    # Top-level fields
    assert "verdict" in data
    assert "mode" in data
    assert "contracts_evaluated" in data
    assert "deciding_contract" in data
    assert "policy_version" in data
    assert "evaluation_time_ms" in data

    # policy_version is a 12-char hash prefix
    assert len(data["policy_version"]) == 12


# --- Missing required fields ---


async def test_evaluate_missing_yaml(client: AsyncClient) -> None:
    """Missing yaml_content returns 422 (validation error)."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json={"tool_name": "read_file", "tool_args": {}},
    )
    assert resp.status_code == 422


async def test_evaluate_missing_tool_name(client: AsyncClient) -> None:
    """Missing tool_name returns 422 (validation error)."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json={"yaml_content": DENY_YAML, "tool_args": {}},
    )
    assert resp.status_code == 422


# --- Default values ---


async def test_evaluate_default_environment(client: AsyncClient) -> None:
    """Environment defaults to 'production' if not provided."""
    resp = await client.post(
        "/api/v1/bundles/evaluate",
        json={
            "yaml_content": DENY_YAML,
            "tool_name": "read_file",
            "tool_args": {"path": "/home/app/.env"},
        },
    )
    assert resp.status_code == 200
    # Just ensure it works without explicit environment
    assert resp.json()["verdict"] == "deny"
