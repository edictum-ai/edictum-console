"""Tests for NotificationChannel protocol and NotificationManager."""

from __future__ import annotations

from typing import Any

from edictum_server.notifications.base import NotificationChannel, NotificationManager


class FakeChannel(NotificationChannel):
    """Test double that records calls."""

    def __init__(self, name: str = "fake") -> None:
        self._name = name
        self.approval_requests: list[dict] = []
        self.approval_decisions: list[dict] = []

    @property
    def name(self) -> str:
        return self._name

    @property
    def supports_interactive(self) -> bool:
        return False

    async def send_approval_request(self, **kwargs: Any) -> None:
        self.approval_requests.append(kwargs)

    async def send_approval_decided(self, **kwargs: Any) -> None:
        self.approval_decisions.append(kwargs)


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


def _sample_kwargs() -> dict:
    return {
        "approval_id": "abc-123",
        "agent_id": "agent-1",
        "tool_name": "shell",
        "tool_args": None,
        "message": "test",
        "env": "production",
        "timeout_seconds": 300,
        "timeout_effect": "deny",
        "tenant_id": "tenant-1",
    }


async def test_manager_fans_out_to_all_channels() -> None:
    ch1 = FakeChannel("ch1")
    ch2 = FakeChannel("ch2")
    mgr = NotificationManager(channels=[ch1, ch2])

    await mgr.notify_approval_request(**_sample_kwargs())

    assert len(ch1.approval_requests) == 1
    assert len(ch2.approval_requests) == 1
    assert ch1.approval_requests[0]["approval_id"] == "abc-123"


async def test_manager_catches_errors_from_channels() -> None:
    ok_channel = FakeChannel("ok")
    fail_channel = FailingChannel()
    mgr = NotificationManager(channels=[fail_channel, ok_channel])

    # Should not raise -- manager catches and logs
    await mgr.notify_approval_request(**_sample_kwargs())

    # The healthy channel still received the notification
    assert len(ok_channel.approval_requests) == 1


async def test_manager_works_with_empty_channels() -> None:
    mgr = NotificationManager()
    # Should not raise
    await mgr.notify_approval_request(**_sample_kwargs())
    await mgr.notify_approval_decided(
        approval_id="abc",
        status="approved",
        decided_by="admin",
        reason=None,
    )


async def test_manager_add_channel() -> None:
    mgr = NotificationManager()
    assert len(mgr.channels) == 0

    ch = FakeChannel()
    mgr.add_channel(ch)
    assert len(mgr.channels) == 1


async def test_manager_notify_decided_fans_out() -> None:
    ch1 = FakeChannel("ch1")
    ch2 = FakeChannel("ch2")
    mgr = NotificationManager(channels=[ch1, ch2])

    await mgr.notify_approval_decided(
        approval_id="abc",
        status="approved",
        decided_by="admin",
        reason="safe",
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
