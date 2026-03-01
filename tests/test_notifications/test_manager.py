"""Tests for NotificationChannel protocol and NotificationManager."""

from __future__ import annotations

from typing import Any

from edictum_server.notifications.base import NotificationChannel, NotificationManager


class FakeChannel(NotificationChannel):
    """Test double that records calls."""

    def __init__(
        self,
        name: str = "fake",
        filters: dict[str, list[str]] | None = None,
    ) -> None:
        self._name = name
        self._filters = filters
        self.approval_requests: list[dict[str, Any]] = []
        self.approval_decisions: list[dict[str, Any]] = []
        self.closed = False

    @property
    def name(self) -> str:
        return self._name

    @property
    def supports_interactive(self) -> bool:
        return False

    @property
    def filters(self) -> dict[str, list[str]] | None:
        return self._filters

    async def send_approval_request(self, **kwargs: Any) -> None:
        self.approval_requests.append(kwargs)

    async def send_approval_decided(self, **kwargs: Any) -> None:
        self.approval_decisions.append(kwargs)

    async def close(self) -> None:
        self.closed = True


class FailingChannel(NotificationChannel):
    """Channel that always raises."""

    @property
    def name(self) -> str:
        return "failing"

    @property
    def supports_interactive(self) -> bool:
        return False

    async def send_approval_request(self, **kwargs: Any) -> None:  # noqa: ARG002
        raise RuntimeError("send failed")

    async def send_approval_decided(self, **kwargs: Any) -> None:  # noqa: ARG002
        raise RuntimeError("decide failed")


TENANT_ID = "tenant-1"


def _sample_kwargs() -> dict[str, Any]:
    return {
        "approval_id": "abc-123",
        "agent_id": "agent-1",
        "tool_name": "shell",
        "tool_args": None,
        "message": "test",
        "env": "production",
        "timeout_seconds": 300,
        "timeout_effect": "deny",
        "tenant_id": TENANT_ID,
    }


async def test_manager_fans_out_to_tenant_channels() -> None:
    ch1 = FakeChannel("ch1")
    ch2 = FakeChannel("ch2")
    mgr = NotificationManager()
    await mgr.reload({TENANT_ID: [ch1, ch2]})

    await mgr.notify_approval_request(**_sample_kwargs())

    assert len(ch1.approval_requests) == 1
    assert len(ch2.approval_requests) == 1
    assert ch1.approval_requests[0]["approval_id"] == "abc-123"


async def test_manager_isolates_tenants() -> None:
    ch_a = FakeChannel("tenant-a")
    ch_b = FakeChannel("tenant-b")
    mgr = NotificationManager()
    await mgr.reload({"tenant-a": [ch_a], "tenant-b": [ch_b]})

    await mgr.notify_approval_request(**{**_sample_kwargs(), "tenant_id": "tenant-a"})

    assert len(ch_a.approval_requests) == 1
    assert len(ch_b.approval_requests) == 0


async def test_manager_catches_errors_from_channels() -> None:
    ok_channel = FakeChannel("ok")
    fail_channel = FailingChannel()
    mgr = NotificationManager()
    await mgr.reload({TENANT_ID: [fail_channel, ok_channel]})

    await mgr.notify_approval_request(**_sample_kwargs())

    assert len(ok_channel.approval_requests) == 1


async def test_manager_works_with_empty_channels() -> None:
    mgr = NotificationManager()
    await mgr.notify_approval_request(**_sample_kwargs())
    await mgr.notify_approval_decided(
        approval_id="abc",
        status="approved",
        decided_by="admin",
        reason=None,
        tenant_id=TENANT_ID,
    )


async def test_manager_reload_closes_old_channels() -> None:
    old_ch = FakeChannel("old")
    new_ch = FakeChannel("new")
    mgr = NotificationManager()
    await mgr.reload({TENANT_ID: [old_ch]})
    await mgr.reload({TENANT_ID: [new_ch]})

    assert old_ch.closed is True
    assert new_ch.closed is False
    assert mgr.channels_for_tenant(TENANT_ID) == [new_ch]


async def test_manager_notify_decided_fans_out() -> None:
    ch1 = FakeChannel("ch1")
    ch2 = FakeChannel("ch2")
    mgr = NotificationManager()
    await mgr.reload({TENANT_ID: [ch1, ch2]})

    await mgr.notify_approval_decided(
        approval_id="abc",
        status="approved",
        decided_by="admin",
        reason="safe",
        tenant_id=TENANT_ID,
    )

    assert len(ch1.approval_decisions) == 1
    assert len(ch2.approval_decisions) == 1
    assert ch1.approval_decisions[0]["status"] == "approved"


async def test_channel_protocol_requires_name() -> None:
    ch = FakeChannel("test-name")
    assert ch.name == "test-name"


async def test_channel_protocol_supports_interactive() -> None:
    ch = FakeChannel()
    assert ch.supports_interactive is False


async def test_filter_matching_skips_non_matching() -> None:
    prod_only = FakeChannel("prod", filters={"environments": ["production"]})
    all_envs = FakeChannel("all")
    mgr = NotificationManager()
    await mgr.reload({TENANT_ID: [prod_only, all_envs]})

    staging_kwargs = {**_sample_kwargs(), "env": "staging"}
    await mgr.notify_approval_request(**staging_kwargs)

    assert len(prod_only.approval_requests) == 0
    assert len(all_envs.approval_requests) == 1
