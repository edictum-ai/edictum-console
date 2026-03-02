"""Tests for PushManager dead connection cleanup (HIGH-5)."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime, timedelta

import pytest

from edictum_server.push.manager import MAX_CONNECTION_AGE, PushManager

TENANT = uuid.uuid4()


@pytest.fixture()
def push() -> PushManager:
    return PushManager()


def test_cleanup_removes_closed_connections(push: PushManager) -> None:
    """Connections with is_closed=True are removed during cleanup."""
    conn1 = push.subscribe("production", tenant_id=TENANT, agent_id="a1")
    conn2 = push.subscribe("production", tenant_id=TENANT, agent_id="a2")

    conn1.is_closed = True
    assert push.connection_count == 2

    removed = push.cleanup_stale_connections()
    assert removed == 1
    assert push.connection_count == 1
    assert push.get_agent_connections(TENANT) == [conn2]


def test_cleanup_removes_stale_connections(push: PushManager) -> None:
    """Connections older than MAX_CONNECTION_AGE are removed."""
    conn_old = push.subscribe("production", tenant_id=TENANT, agent_id="old")
    conn_fresh = push.subscribe("production", tenant_id=TENANT, agent_id="fresh")

    # Backdate the old connection
    conn_old.connected_at = datetime.now(UTC) - MAX_CONNECTION_AGE - timedelta(seconds=1)

    removed = push.cleanup_stale_connections()
    assert removed == 1
    assert push.connection_count == 1
    assert push.get_agent_connections(TENANT) == [conn_fresh]


def test_cleanup_keeps_active_connections(push: PushManager) -> None:
    """Fresh, open connections are not removed."""
    push.subscribe("production", tenant_id=TENANT, agent_id="a1")
    push.subscribe("staging", tenant_id=TENANT, agent_id="a2")

    removed = push.cleanup_stale_connections()
    assert removed == 0
    assert push.connection_count == 2


def test_cleanup_removes_empty_env_keys(push: PushManager) -> None:
    """When all connections in an env are removed, the env key is deleted."""
    conn = push.subscribe("production", tenant_id=TENANT, agent_id="a1")
    conn.is_closed = True

    push.cleanup_stale_connections()
    assert "production" not in push._connections


def test_cleanup_mixed_closed_and_stale(push: PushManager) -> None:
    """Both closed and stale connections are removed in a single pass."""
    conn_closed = push.subscribe("production", tenant_id=TENANT, agent_id="closed")
    conn_stale = push.subscribe("staging", tenant_id=TENANT, agent_id="stale")
    push.subscribe("production", tenant_id=TENANT, agent_id="alive")

    conn_closed.is_closed = True
    conn_stale.connected_at = datetime.now(UTC) - MAX_CONNECTION_AGE - timedelta(minutes=5)

    removed = push.cleanup_stale_connections()
    assert removed == 2
    assert push.connection_count == 1


def test_unsubscribe_marks_closed(push: PushManager) -> None:
    """unsubscribe() sets is_closed=True on the connection."""
    conn = push.subscribe("production", tenant_id=TENANT, agent_id="a1")
    assert not conn.is_closed

    push.unsubscribe("production", conn)
    assert conn.is_closed


async def test_start_stop_cleanup_task(push: PushManager) -> None:
    """Cleanup task can be started and stopped without error."""
    push.start_cleanup_task()
    assert push._cleanup_task is not None
    assert not push._cleanup_task.done()

    push.stop_cleanup_task()
    # Give the event loop a chance to process the cancellation
    await asyncio.sleep(0.05)
    assert push._cleanup_task.done()


async def test_start_cleanup_task_idempotent(push: PushManager) -> None:
    """Calling start_cleanup_task() twice does not create a second task."""
    push.start_cleanup_task()
    task1 = push._cleanup_task

    push.start_cleanup_task()
    task2 = push._cleanup_task
    assert task1 is task2

    push.stop_cleanup_task()
    await asyncio.sleep(0.05)
