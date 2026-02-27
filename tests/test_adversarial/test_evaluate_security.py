"""Adversarial security tests for POST /api/v1/bundles/evaluate.

Verifies that the evaluate endpoint:
- Requires dashboard authentication (no anonymous access)
- Rejects API key authentication (dashboard-only)
- Handles malicious YAML payloads safely
- Does not leak internal errors or stack traces
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.security

VALID_YAML = """\
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
        contains_any: [".env"]
    then:
      effect: deny
      message: "Denied."
"""

EVAL_URL = "/api/v1/bundles/evaluate"


def _make_body(yaml_content: str = VALID_YAML) -> dict:
    return {
        "yaml_content": yaml_content,
        "tool_name": "read_file",
        "tool_args": {"path": "/home/.env"},
    }


# --- S1: No authentication → 401/403 ---


async def test_evaluate_no_auth_rejected(no_auth_client: AsyncClient) -> None:
    """Anonymous request to evaluate endpoint must be rejected."""
    resp = await no_auth_client.post(EVAL_URL, json=_make_body())
    assert resp.status_code in (401, 403)


# --- S2: API key auth → rejected (dashboard-only endpoint) ---


async def test_evaluate_api_key_rejected(no_auth_client: AsyncClient) -> None:
    """API key authentication should not grant access to evaluate endpoint.

    The evaluate endpoint uses require_dashboard_auth, not get_current_tenant.
    An API key should be insufficient.
    """
    resp = await no_auth_client.post(
        EVAL_URL,
        json=_make_body(),
        headers={"X-API-Key": "fake-api-key-12345"},
    )
    assert resp.status_code in (401, 403)


# --- Malicious YAML payloads ---


async def test_evaluate_yaml_bomb(client: AsyncClient) -> None:
    """YAML billion-laughs / recursive anchor attack should not crash server."""
    yaml_bomb = "a: &a [*a, *a, *a, *a, *a]"
    resp = await client.post(EVAL_URL, json=_make_body(yaml_content=yaml_bomb))
    # Should return 422 (invalid YAML) or 200 (parsed but no contracts)
    assert resp.status_code in (200, 422)


async def test_evaluate_yaml_python_object(client: AsyncClient) -> None:
    """YAML with Python object tags (!!python/object) must not execute code.

    The edictum library uses yaml.safe_load which rejects these.
    """
    malicious = "!!python/object/apply:os.system ['echo pwned']"
    resp = await client.post(EVAL_URL, json=_make_body(yaml_content=malicious))
    assert resp.status_code == 422


async def test_evaluate_huge_yaml(client: AsyncClient) -> None:
    """Very large YAML should not crash the server (may be slow or rejected)."""
    huge = "contracts:\n" + ("  - id: c{i}\n    type: pre\n    tool: t\n" * 500)
    resp = await client.post(EVAL_URL, json=_make_body(yaml_content=huge))
    # Should handle gracefully — either 200 (parsed) or 422 (too large/invalid)
    assert resp.status_code in (200, 422)


# --- Error leakage ---


async def test_evaluate_error_no_stacktrace(client: AsyncClient) -> None:
    """Error responses must not contain Python stack traces."""
    resp = await client.post(EVAL_URL, json=_make_body(yaml_content="invalid: yaml: ["))
    assert resp.status_code == 422
    body = resp.text
    assert "Traceback" not in body
    assert "File " not in body


# --- Input manipulation ---


async def test_evaluate_empty_tool_name(client: AsyncClient) -> None:
    """Empty tool_name should still evaluate without crashing."""
    body = _make_body()
    body["tool_name"] = ""
    resp = await client.post(EVAL_URL, json=body)
    # Should handle gracefully
    assert resp.status_code in (200, 422)


async def test_evaluate_null_tool_args(client: AsyncClient) -> None:
    """Null tool_args should use empty dict default."""
    resp = await client.post(
        EVAL_URL,
        json={
            "yaml_content": VALID_YAML,
            "tool_name": "read_file",
            # tool_args omitted — should use default empty dict
        },
    )
    assert resp.status_code == 200


async def test_evaluate_special_chars_in_tool_name(client: AsyncClient) -> None:
    """Tool name with special characters should not cause injection."""
    body = _make_body()
    body["tool_name"] = "../../etc/passwd"
    resp = await client.post(EVAL_URL, json=body)
    # Should handle gracefully — either evaluate (200) or reject (422)
    assert resp.status_code in (200, 422)


async def test_evaluate_nested_args(client: AsyncClient) -> None:
    """Deeply nested args should not crash the evaluation."""
    nested = {"a": {"b": {"c": {"d": {"e": "value"}}}}}
    body = _make_body()
    body["tool_args"] = nested
    resp = await client.post(EVAL_URL, json=body)
    assert resp.status_code == 200
