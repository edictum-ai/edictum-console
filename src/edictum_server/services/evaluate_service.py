"""Stateless contract evaluation service (development-time playground)."""

from __future__ import annotations

import hashlib
import time
from typing import Any

from edictum import Edictum, EvaluationResult, Principal

from edictum_server.schemas.evaluate import (
    ContractEvaluation,
    EvaluateResponse,
    PrincipalInput,
)


def _build_principal(inp: PrincipalInput | None) -> Principal | None:
    """Convert API input to an edictum Principal, or None."""
    if inp is None:
        return None
    return Principal(
        user_id=inp.user_id,
        role=inp.role,
        claims=inp.claims or {},
    )


def _map_result(result: EvaluationResult, mode: str, yaml_hash: str) -> EvaluateResponse:
    """Map an edictum EvaluationResult to the API response schema."""
    contracts = [
        ContractEvaluation(
            id=cr.contract_id,
            type=cr.contract_type,
            matched=cr.passed,
            effect=cr.effect,
            message=cr.message,
            observed=cr.observed,
            tags=list(cr.tags),
        )
        for cr in result.contracts
    ]

    # The deciding contract is the first failing non-observed contract
    deciding: str | None = None
    for cr in result.contracts:
        if not cr.passed and not cr.observed:
            deciding = cr.contract_id
            break

    return EvaluateResponse(
        verdict=result.verdict,
        mode=mode,
        contracts_evaluated=contracts,
        deciding_contract=deciding,
        policy_version=yaml_hash[:12],
        evaluation_time_ms=0.0,  # overwritten by caller
    )


# Limits to prevent DoS via arbitrarily complex bundles.
_MAX_CONTRACTS = 100
_MAX_YAML_DOCUMENTS = 10


def _check_yaml_complexity(yaml_content: str) -> None:
    """Reject YAML that exceeds complexity limits before evaluation.

    Raises ValueError if the content has too many YAML documents or
    other structural issues that suggest a DoS attempt.
    """
    # Count YAML document separators (---).
    # Each '---' at the start of a line starts a new document.
    doc_count = yaml_content.count("\n---") + 1
    if doc_count > _MAX_YAML_DOCUMENTS:
        raise ValueError(f"YAML contains {doc_count} documents (limit: {_MAX_YAML_DOCUMENTS}).")


def evaluate_contracts(
    *,
    yaml_content: str,
    tool_name: str,
    tool_args: dict[str, Any],
    environment: str = "production",
    principal_input: PrincipalInput | None = None,
) -> EvaluateResponse:
    """Evaluate a tool call against YAML contracts.

    This is a stateless, synchronous operation for the dashboard playground.
    It never persists data or touches the database.

    Args:
        yaml_content: Raw YAML contract bundle.
        tool_name: Tool name to evaluate.
        tool_args: Arguments for the tool call.
        environment: Environment context (default "production").
        principal_input: Optional principal identity.

    Returns:
        EvaluateResponse with verdict, matched contracts, timing.

    Raises:
        ValueError: If the YAML is invalid, cannot be parsed, or exceeds
            complexity limits (contract count, document count).
    """
    _check_yaml_complexity(yaml_content)

    principal = _build_principal(principal_input)
    yaml_hash = hashlib.sha256(yaml_content.encode("utf-8")).hexdigest()

    start = time.monotonic()

    try:
        edictum_instance = Edictum.from_yaml_string(
            yaml_content,
            environment=environment,
        )
    except Exception as exc:
        raise ValueError(f"Invalid contract YAML: {exc}") from exc

    # Check contract count after parsing.
    contract_count = len(getattr(edictum_instance, "contracts", []))
    if contract_count > _MAX_CONTRACTS:
        raise ValueError(f"Bundle contains {contract_count} contracts (limit: {_MAX_CONTRACTS}).")

    result: EvaluationResult = edictum_instance.evaluate(
        tool_name,
        tool_args,
        principal=principal,
    )

    elapsed_ms = (time.monotonic() - start) * 1000

    # Determine mode from the edictum instance
    mode = getattr(edictum_instance, "mode", "enforce") or "enforce"

    response = _map_result(result, mode, yaml_hash)
    response.evaluation_time_ms = round(elapsed_ms, 2)
    return response
