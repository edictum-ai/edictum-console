"""Pure functions for matching agent tools against contract matchers.

No DB, no IO, no imports from routes. Fully testable in isolation.
"""

from __future__ import annotations

import fnmatch
import logging
from dataclasses import dataclass
from typing import Any

import yaml

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class ContractMatcher:
    """A single contract's tool-matching configuration, extracted from YAML."""

    contract_name: str
    contract_type: str  # "pre", "post", "session"
    mode: str  # "enforce" or "observe"
    tool_patterns: list[str]  # ["exec", "file_*", "*"]
    bundle_name: str
    bundle_version: int


def match_tool(tool_name: str, matchers: list[ContractMatcher]) -> list[ContractMatcher]:
    """Return all ContractMatchers whose tool_patterns match the given tool_name.

    Matching rules (in order per pattern):
    1. Exact string match: "exec" matches "exec"
    2. Glob match using fnmatch: "file_*" matches "file_read", "file_write"
    3. Wildcard: "*" matches everything

    Tool names are CASE-SENSITIVE. "Exec" != "exec".
    Each matcher is included at most once (break after first matching pattern).
    """
    matched: list[ContractMatcher] = []
    for matcher in matchers:
        for pattern in matcher.tool_patterns:
            if pattern == "*":
                matched.append(matcher)
                break
            elif "*" in pattern or "?" in pattern:
                if fnmatch.fnmatch(tool_name, pattern):
                    matched.append(matcher)
                    break
            else:
                if tool_name == pattern:
                    matched.append(matcher)
                    break
    return matched


def parse_contract_matchers(
    yaml_bytes: bytes, bundle_name: str, bundle_version: int
) -> list[ContractMatcher]:
    """Parse contract bundle YAML and extract ContractMatcher list.

    Expected YAML structure::

        contracts:
          - name: block-dangerous-exec
            type: pre
            tools: [exec, shell_run]
            mode: enforce

    Returns empty list if YAML is unparseable or has no contracts.
    """
    try:
        parsed = yaml.safe_load(yaml_bytes)
    except yaml.YAMLError:
        return []

    if not isinstance(parsed, dict):
        return []

    contracts = parsed.get("contracts", [])
    if not isinstance(contracts, list):
        return []

    matchers: list[ContractMatcher] = []
    for contract in contracts:
        if not isinstance(contract, dict):
            continue

        name = contract.get("name") or contract.get("id")
        if not name:
            continue

        contract_type = contract.get("type", "pre")
        mode = contract.get("mode", "enforce")

        # Handle both "tools" (list) and "tool" (singular, backward compat)
        tools = contract.get("tools", contract.get("tool"))
        if tools is None:
            tools = []
        elif isinstance(tools, str):
            tools = [tools]

        matchers.append(
            ContractMatcher(
                contract_name=str(name),
                contract_type=str(contract_type),
                mode=str(mode),
                tool_patterns=[str(t) for t in tools],
                bundle_name=bundle_name,
                bundle_version=bundle_version,
            )
        )

    return matchers


def manifest_to_matchers(manifest: dict) -> list[ContractMatcher]:
    """Convert an agent manifest (from Gate) into ContractMatcher list.

    Manifest format::

        {
            "policy_version": "abc123...",
            "contracts": [
                {"id": "deny-reads", "type": "pre", "tool": "Read", "mode": "observe"},
                {"id": "block-bash", "type": "pre", "tool": ["Bash", "shell_*"], "mode": "enforce"},
            ]
        }
    """
    contracts = manifest.get("contracts", [])
    matchers: list[ContractMatcher] = []
    for c in contracts:
        if not isinstance(c, dict):
            continue
        name = c.get("id", "")
        if not name:
            continue

        tool = c.get("tool", [])
        if isinstance(tool, str):
            tool_patterns = [tool]
        elif isinstance(tool, list):
            tool_patterns = [str(t) for t in tool]
        else:
            tool_patterns = []

        matchers.append(
            ContractMatcher(
                contract_name=str(name),
                contract_type=str(c.get("type", "pre")),
                mode=str(c.get("mode", "enforce")),
                tool_patterns=tool_patterns,
                bundle_name="local",
                bundle_version=0,
            )
        )
    return matchers


def classify_tools(
    tool_rows: list[Any],
    matchers: list[ContractMatcher],
    source: str = "console",
) -> list[dict[str, Any]]:
    """Match each tool against matchers and classify as enforced/observed/ungoverned.

    Priority: enforce > observe > ungoverned.
    If multiple contracts match, the enforce-mode contract is the "governing" one.
    If only observe-mode contracts match, the first one is governing.

    ``source`` indicates where the matchers came from: "console" for deployed
    bundles, "local" for agent manifest (Gate).

    Returns list of dicts matching ToolCoverage schema fields, sorted by status:
    enforced first, then observed, then ungoverned.
    """
    status_order = {"enforced": 0, "observed": 1, "ungoverned": 2}
    results: list[dict[str, Any]] = []

    for row in tool_rows:
        # Support both dict rows and named-tuple/object rows
        if isinstance(row, dict):
            tool_name = row["tool_name"]
            event_count = row["event_count"]
            last_used = row["last_used"]
            deny_count = row.get("deny_count")
            allow_count = row.get("allow_count")
            observe_count = row.get("observe_count")
        else:
            tool_name = row.tool_name
            event_count = row.event_count
            last_used = row.last_used
            deny_count = getattr(row, "deny_count", None)
            allow_count = getattr(row, "allow_count", None)
            observe_count = getattr(row, "observe_count", None)

        matched = match_tool(tool_name, matchers)

        if not matched:
            results.append({
                "tool_name": tool_name,
                "status": "ungoverned",
                "contract_name": None,
                "contract_type": None,
                "mode": None,
                "bundle_name": None,
                "source": None,
                "event_count": event_count,
                "last_used": last_used,
                "deny_count": deny_count,
                "allow_count": allow_count,
                "observe_count": observe_count,
            })
            continue

        # Prefer enforce over observe
        enforce_matchers = [m for m in matched if m.mode == "enforce"]
        if enforce_matchers:
            governing = enforce_matchers[0]
            status = "enforced"
        else:
            governing = matched[0]
            status = "observed"

        results.append({
            "tool_name": tool_name,
            "status": status,
            "contract_name": governing.contract_name,
            "contract_type": governing.contract_type,
            "mode": governing.mode,
            "bundle_name": governing.bundle_name,
            "source": source,
            "event_count": event_count,
            "last_used": last_used,
            "deny_count": deny_count,
            "allow_count": allow_count,
            "observe_count": observe_count,
        })

    results.sort(key=lambda r: status_order.get(r["status"], 99))
    return results
