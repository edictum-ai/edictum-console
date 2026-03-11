"""Stateless contract evaluation service (development-time playground)."""

from __future__ import annotations

import hashlib
import re
import time
from typing import Any

import yaml

from edictum import Edictum, EvaluationResult, Principal

from edictum_server.schemas.evaluate import (
    ContractEvaluation,
    EvaluateResponse,
    PrincipalInput,
)

# Complexity limits to prevent DoS via crafted YAML (#6)
_MAX_CONTRACTS = 100
_MAX_NESTING_DEPTH = 10
_MAX_REGEX_LENGTH = 500


def _check_yaml_complexity(yaml_content: str) -> None:
    """Validate that YAML doesn't exceed complexity limits.

    Raises ValueError if the YAML is too complex (too many contracts,
    too deeply nested, or contains excessively long regex patterns).
    """
    try:
        parsed = yaml.safe_load(yaml_content)
    except yaml.YAMLError as exc:
        raise ValueError(f"Invalid YAML: {exc}") from exc

    if not isinstance(parsed, dict):
        raise ValueError("Invalid contract YAML: expected a mapping at top level")

    # Check contract count
    contracts = parsed.get("contracts", [])
    if isinstance(contracts, list) and len(contracts) > _MAX_CONTRACTS:
        raise ValueError(
            f"Too many contracts ({len(contracts)}). "
            f"Maximum is {_MAX_CONTRACTS}."
        )

    # Check nesting depth and regex patterns
    _check_depth(parsed, max_depth=_MAX_NESTING_DEPTH)
    _check_regex_patterns(parsed)


def _check_depth(obj: object, max_depth: int, current: int = 0) -> None:
    """Recursively check nesting depth of a parsed YAML structure."""
    if current > max_depth:
        raise ValueError(
            f"YAML nesting exceeds maximum depth ({max_depth}). "
            "Simplify the contract structure."
        )
    if isinstance(obj, dict):
        for v in obj.values():
            _check_depth(v, max_depth, current + 1)
    elif isinstance(obj, list):
        for item in obj:
            _check_depth(item, max_depth, current + 1)


def _check_regex_patterns(obj: object) -> None:
    """Find and validate regex patterns in the parsed YAML."""
    if isinstance(obj, dict):
        for key, value in obj.items():
            if key in ("pattern", "regex", "match") and isinstance(value, str):
                if len(value) > _MAX_REGEX_LENGTH:
                    raise ValueError(
                        f"Regex pattern too long ({len(value)} chars). "
                        f"Maximum is {_MAX_REGEX_LENGTH}."
                    )
                # Test that the regex compiles without catastrophic backtracking risk
                try:
                    re.compile(value)
                except re.error as exc:
                    raise ValueError(f"Invalid regex pattern: {exc}") from exc
            else:
                _check_regex_patterns(value)
    elif isinstance(obj, list):
        for item in obj:
            _check_regex_patterns(item)


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
        ValueError: If the YAML is invalid or cannot be parsed as contracts.
    """
    # Validate YAML complexity before evaluation to prevent DoS (#6)
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
