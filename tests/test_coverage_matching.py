"""Unit tests for pure coverage matching functions. No DB needed."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from edictum_server.services.coverage_matching import (
    ContractMatcher,
    classify_tools,
    match_tool,
    parse_contract_matchers,
)
from edictum_server.services.coverage_service import parse_since


# ---------------------------------------------------------------------------
# match_tool
# ---------------------------------------------------------------------------


def test_exact_match() -> None:
    """Exact string match: 'exec' matches 'exec'."""
    matcher = ContractMatcher(
        contract_name="block-exec", contract_type="pre",
        mode="enforce", tool_patterns=["exec"],
        bundle_name="test-bundle", bundle_version=1,
    )
    assert match_tool("exec", [matcher]) == [matcher]


def test_exact_no_match() -> None:
    """Exact match: 'web_scrape' does not match 'exec'."""
    matcher = ContractMatcher(
        contract_name="block-exec", contract_type="pre",
        mode="enforce", tool_patterns=["exec"],
        bundle_name="test-bundle", bundle_version=1,
    )
    assert match_tool("web_scrape", [matcher]) == []


def test_glob_match() -> None:
    """Glob pattern: 'file_*' matches 'file_read'."""
    matcher = ContractMatcher(
        contract_name="file-ops", contract_type="post",
        mode="observe", tool_patterns=["file_*"],
        bundle_name="test-bundle", bundle_version=1,
    )
    assert match_tool("file_read", [matcher]) == [matcher]


def test_glob_no_match() -> None:
    """Glob pattern: 'file_*' does not match 'file' (no underscore)."""
    matcher = ContractMatcher(
        contract_name="file-ops", contract_type="post",
        mode="observe", tool_patterns=["file_*"],
        bundle_name="test-bundle", bundle_version=1,
    )
    assert match_tool("file", [matcher]) == []


def test_glob_empty_suffix() -> None:
    """Glob: 'file_*' matches 'file_' (empty suffix after underscore)."""
    matcher = ContractMatcher(
        contract_name="file-ops", contract_type="post",
        mode="observe", tool_patterns=["file_*"],
        bundle_name="test-bundle", bundle_version=1,
    )
    assert match_tool("file_", [matcher]) == [matcher]


def test_wildcard_matches_everything() -> None:
    """Wildcard '*' matches any tool name."""
    matcher = ContractMatcher(
        contract_name="catch-all", contract_type="session",
        mode="enforce", tool_patterns=["*"],
        bundle_name="test-bundle", bundle_version=1,
    )
    assert match_tool("anything_at_all", [matcher]) == [matcher]


def test_case_sensitivity() -> None:
    """Tool names are case-sensitive: 'Exec' != 'exec'."""
    matcher = ContractMatcher(
        contract_name="block-exec", contract_type="pre",
        mode="enforce", tool_patterns=["exec"],
        bundle_name="test-bundle", bundle_version=1,
    )
    assert match_tool("Exec", [matcher]) == []


def test_multiple_matchers_both_returned() -> None:
    """Multiple matchers can match the same tool."""
    m1 = ContractMatcher(
        contract_name="c1", contract_type="pre",
        mode="observe", tool_patterns=["exec"],
        bundle_name="b1", bundle_version=1,
    )
    m2 = ContractMatcher(
        contract_name="c2", contract_type="pre",
        mode="enforce", tool_patterns=["exec"],
        bundle_name="b1", bundle_version=1,
    )
    result = match_tool("exec", [m1, m2])
    assert len(result) == 2
    assert m1 in result
    assert m2 in result


def test_multiple_patterns_in_one_matcher() -> None:
    """A matcher with multiple patterns matches if any pattern hits."""
    matcher = ContractMatcher(
        contract_name="block-exec", contract_type="pre",
        mode="enforce", tool_patterns=["exec", "shell_run"],
        bundle_name="test-bundle", bundle_version=1,
    )
    assert match_tool("shell_run", [matcher]) == [matcher]


# ---------------------------------------------------------------------------
# parse_contract_matchers
# ---------------------------------------------------------------------------


def test_parse_yaml_basic() -> None:
    """Parse standard contract bundle YAML."""
    yaml_bytes = b"""\
contracts:
  - name: block-exec
    type: pre
    tools: [exec, shell_run]
    mode: enforce
  - name: observe-files
    type: post
    tools: ["file_*"]
    mode: observe
"""
    matchers = parse_contract_matchers(yaml_bytes, "test-bundle", 1)
    assert len(matchers) == 2
    assert matchers[0].contract_name == "block-exec"
    assert matchers[0].tool_patterns == ["exec", "shell_run"]
    assert matchers[0].mode == "enforce"
    assert matchers[1].contract_name == "observe-files"
    assert matchers[1].mode == "observe"


def test_parse_yaml_default_mode() -> None:
    """Mode defaults to 'enforce' when not specified."""
    yaml_bytes = b"""\
contracts:
  - name: block-exec
    type: pre
    tools: [exec]
"""
    matchers = parse_contract_matchers(yaml_bytes, "bundle", 1)
    assert matchers[0].mode == "enforce"


def test_parse_yaml_invalid() -> None:
    """Invalid YAML returns empty list."""
    matchers = parse_contract_matchers(b"{{invalid yaml", "bundle", 1)
    assert matchers == []


def test_parse_yaml_no_contracts() -> None:
    """YAML without contracts key returns empty list."""
    yaml_bytes = b"metadata:\n  name: test\n"
    matchers = parse_contract_matchers(yaml_bytes, "bundle", 1)
    assert matchers == []


def test_parse_yaml_singular_tool() -> None:
    """Handle 'tool' (singular) for backward compatibility."""
    yaml_bytes = b"""\
contracts:
  - name: block-shell
    type: pre
    tool: shell
"""
    matchers = parse_contract_matchers(yaml_bytes, "bundle", 1)
    assert matchers[0].tool_patterns == ["shell"]


def test_parse_yaml_id_fallback() -> None:
    """Handle 'id' instead of 'name' for backward compatibility."""
    yaml_bytes = b"""\
contracts:
  - id: test-contract
    type: pre
    tools: [exec]
"""
    matchers = parse_contract_matchers(yaml_bytes, "bundle", 1)
    assert matchers[0].contract_name == "test-contract"


# ---------------------------------------------------------------------------
# classify_tools
# ---------------------------------------------------------------------------


def _make_row(
    tool_name: str,
    event_count: int = 1,
    deny_count: int | None = None,
    allow_count: int | None = None,
    observe_count: int | None = None,
) -> dict:
    return {
        "tool_name": tool_name,
        "event_count": event_count,
        "last_used": datetime.now(UTC),
        "deny_count": deny_count,
        "allow_count": allow_count,
        "observe_count": observe_count,
    }


def test_classify_enforce_wins_over_observe() -> None:
    """When both enforce and observe match, status is 'enforced'."""
    rows = [_make_row("exec")]
    matchers = [
        ContractMatcher("observe-c", "post", "observe", ["exec"], "b", 1),
        ContractMatcher("enforce-c", "pre", "enforce", ["exec"], "b", 1),
    ]
    result = classify_tools(rows, matchers)
    assert len(result) == 1
    assert result[0]["status"] == "enforced"
    assert result[0]["contract_name"] == "enforce-c"


def test_classify_ungoverned_when_no_match() -> None:
    """Tools with no matching contract are 'ungoverned'."""
    rows = [_make_row("web_scrape")]
    matchers = [
        ContractMatcher("block-exec", "pre", "enforce", ["exec"], "b", 1),
    ]
    result = classify_tools(rows, matchers)
    assert len(result) == 1
    assert result[0]["status"] == "ungoverned"
    assert result[0]["contract_name"] is None


def test_classify_wildcard_100_percent() -> None:
    """Wildcard contract in enforce mode -> all tools enforced."""
    rows = [_make_row("exec"), _make_row("file_read"), _make_row("web_scrape")]
    matchers = [
        ContractMatcher("catch-all", "session", "enforce", ["*"], "b", 1),
    ]
    result = classify_tools(rows, matchers)
    assert all(r["status"] == "enforced" for r in result)


def test_coverage_pct_enforced_only() -> None:
    """coverage_pct counts enforced only: 5 enforced + 1 observed + 1 ungoverned = 71%."""
    rows = [
        _make_row(f"tool_{i}") for i in range(5)
    ] + [
        _make_row("observed_tool"),
        _make_row("ungoverned_tool"),
    ]
    matchers = [
        ContractMatcher("enforce-c", "pre", "enforce", [f"tool_{i}" for i in range(5)], "b", 1),
        ContractMatcher("observe-c", "post", "observe", ["observed_tool"], "b", 1),
    ]
    result = classify_tools(rows, matchers)
    enforced = sum(1 for r in result if r["status"] == "enforced")
    observed = sum(1 for r in result if r["status"] == "observed")
    ungoverned = sum(1 for r in result if r["status"] == "ungoverned")
    total = len(result)

    assert enforced == 5
    assert observed == 1
    assert ungoverned == 1
    assert round(enforced / total * 100) == 71  # NOT 86 (6/7)


def test_classify_sort_order() -> None:
    """Results sorted: enforced first, then observed, then ungoverned."""
    rows = [_make_row("ung"), _make_row("obs"), _make_row("enf")]
    matchers = [
        ContractMatcher("c1", "pre", "enforce", ["enf"], "b", 1),
        ContractMatcher("c2", "post", "observe", ["obs"], "b", 1),
    ]
    result = classify_tools(rows, matchers)
    statuses = [r["status"] for r in result]
    assert statuses == ["enforced", "observed", "ungoverned"]


# ---------------------------------------------------------------------------
# parse_since
# ---------------------------------------------------------------------------


def test_parse_since_none_defaults_24h() -> None:
    result = parse_since(None)
    expected = datetime.now(UTC) - timedelta(hours=24)
    assert abs((result - expected).total_seconds()) < 5


def test_parse_since_hours() -> None:
    result = parse_since("6h")
    expected = datetime.now(UTC) - timedelta(hours=6)
    assert abs((result - expected).total_seconds()) < 5


def test_parse_since_days() -> None:
    result = parse_since("7d")
    expected = datetime.now(UTC) - timedelta(days=7)
    assert abs((result - expected).total_seconds()) < 5


def test_parse_since_minutes() -> None:
    result = parse_since("15m")
    expected = datetime.now(UTC) - timedelta(minutes=15)
    assert abs((result - expected).total_seconds()) < 5


def test_parse_since_iso_timestamp() -> None:
    result = parse_since("2026-03-01T10:30:00+00:00")
    assert result.year == 2026
    assert result.month == 3


def test_parse_since_iso_with_z() -> None:
    result = parse_since("2026-03-01T10:30:00Z")
    assert result.year == 2026


def test_parse_since_invalid() -> None:
    with pytest.raises(ValueError, match="Invalid since value"):
        parse_since("yesterday")
