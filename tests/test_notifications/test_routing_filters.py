"""Tests for notification routing filters (_matches_filters) and manager fan-out."""

from __future__ import annotations

import pytest

from edictum_server.notifications.base import (
    NotificationChannel,
    NotificationManager,
    _matches_filters,
)


class FakeChannel(NotificationChannel):
    def __init__(self, name: str = "fake", filters: dict | None = None) -> None:
        self._name = name
        self._filters = filters
        self.requests: list[dict] = []

    @property
    def name(self) -> str:
        return self._name

    @property
    def supports_interactive(self) -> bool:
        return False

    @property
    def filters(self) -> dict | None:
        return self._filters

    async def send_approval_request(self, **kwargs: object) -> None:
        self.requests.append(dict(kwargs))

    async def send_approval_decided(self, **kwargs: object) -> None:
        pass


# --- _matches_filters standalone tests ---


def test_empty_filters_matches_everything() -> None:
    ch = FakeChannel(filters=None)
    assert _matches_filters(ch, env="staging", agent_id="x", contract_name=None) is True


def test_env_filter_matches() -> None:
    ch = FakeChannel(filters={"environments": ["production"]})
    assert _matches_filters(ch, env="production", agent_id="x", contract_name=None) is True


def test_env_filter_rejects() -> None:
    ch = FakeChannel(filters={"environments": ["production"]})
    assert _matches_filters(ch, env="staging", agent_id="x", contract_name=None) is False


def test_agent_pattern_matches() -> None:
    ch = FakeChannel(filters={"agent_patterns": ["team-a-*"]})
    assert _matches_filters(ch, env="prod", agent_id="team-a-billing", contract_name=None) is True


def test_agent_pattern_rejects() -> None:
    ch = FakeChannel(filters={"agent_patterns": ["team-a-*"]})
    assert _matches_filters(ch, env="prod", agent_id="team-b-ops", contract_name=None) is False


def test_contract_pattern_matches() -> None:
    ch = FakeChannel(filters={"contract_names": ["security-*"]})
    assert _matches_filters(ch, env="prod", agent_id="x", contract_name="security-audit") is True


def test_contract_pattern_rejects() -> None:
    ch = FakeChannel(filters={"contract_names": ["security-*"]})
    assert _matches_filters(ch, env="prod", agent_id="x", contract_name="billing-check") is False


def test_multi_dimension_and() -> None:
    ch = FakeChannel(filters={"environments": ["production"], "agent_patterns": ["team-a-*"]})
    # Both match
    assert _matches_filters(ch, env="production", agent_id="team-a-billing", contract_name=None) is True
    # Env matches, agent doesn't
    assert _matches_filters(ch, env="production", agent_id="team-b-ops", contract_name=None) is False
    # Agent matches, env doesn't
    assert _matches_filters(ch, env="staging", agent_id="team-a-billing", contract_name=None) is False


def test_null_contract_name_skips_filter() -> None:
    ch = FakeChannel(filters={"contract_names": ["security-*"]})
    assert _matches_filters(ch, env="prod", agent_id="x", contract_name=None) is True


def test_glob_mid_pattern() -> None:
    ch = FakeChannel(filters={"agent_patterns": ["*-billing-*"]})
    assert _matches_filters(ch, env="prod", agent_id="team-a-billing-prod", contract_name=None) is True


# --- Manager fan-out routing ---


async def test_manager_routes_by_filter() -> None:
    prod_only = FakeChannel("prod-only", filters={"environments": ["production"]})
    all_envs = FakeChannel("all-envs", filters=None)
    mgr = NotificationManager()
    await mgr.reload({"t1": [prod_only, all_envs]})

    await mgr.notify_approval_request(
        approval_id="a1",
        agent_id="agent",
        tool_name="tool",
        tool_args=None,
        message="msg",
        env="staging",
        timeout_seconds=60,
        timeout_effect="deny",
        tenant_id="t1",
    )
    # Only all_envs should receive the staging notification
    assert len(all_envs.requests) == 1
    assert len(prod_only.requests) == 0
