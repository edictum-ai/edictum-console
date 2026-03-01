"""Tests for the NotificationManager reload and tenant isolation."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from edictum_server.notifications.base import NotificationChannel, NotificationManager


class FakeChannel(NotificationChannel):
    def __init__(self, name: str = "fake") -> None:
        self._name = name
        self.closed = False

    @property
    def name(self) -> str:
        return self._name

    @property
    def supports_interactive(self) -> bool:
        return False

    async def send_approval_request(self, **kwargs: object) -> None:
        pass

    async def send_approval_decided(self, **kwargs: object) -> None:
        pass

    async def close(self) -> None:
        self.closed = True


async def test_reload_sets_channels() -> None:
    mgr = NotificationManager()
    ch = FakeChannel("slack")
    await mgr.reload({"tenant-a": [ch]})
    assert mgr.channels_for_tenant("tenant-a") == [ch]


async def test_reload_closes_old_channels() -> None:
    mgr = NotificationManager()
    old = FakeChannel("old")
    await mgr.reload({"tenant-a": [old]})
    new = FakeChannel("new")
    await mgr.reload({"tenant-a": [new]})
    assert old.closed is True
    assert mgr.channels_for_tenant("tenant-a") == [new]


async def test_tenant_isolation() -> None:
    mgr = NotificationManager()
    ch = FakeChannel("a-only")
    await mgr.reload({"tenant-a": [ch]})
    assert mgr.channels_for_tenant("tenant-b") == []


async def test_channels_property_returns_all() -> None:
    mgr = NotificationManager()
    ch_a = FakeChannel("a")
    ch_b = FakeChannel("b")
    await mgr.reload({"t1": [ch_a], "t2": [ch_b]})
    assert set(mgr.channels) == {ch_a, ch_b}
