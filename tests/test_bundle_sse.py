"""Tests for SSE events fired by bundle upload."""

from __future__ import annotations

from httpx import AsyncClient

from edictum_server.push.manager import PushManager
from tests.conftest import TENANT_A_ID

SAMPLE_YAML = "rules:\n  - name: test\n    tool: shell\n    verdict: deny\n"


async def test_upload_fires_bundle_uploaded_sse(
    client: AsyncClient,
    push_manager: PushManager,
) -> None:
    """Uploading a bundle pushes a ``bundle_uploaded`` event to the dashboard."""
    queue = push_manager.subscribe_dashboard(TENANT_A_ID)

    resp = await client.post(
        "/api/v1/bundles",
        json={"yaml_content": SAMPLE_YAML},
    )
    assert resp.status_code == 201

    # The event should be in the queue
    event = queue.get_nowait()
    assert event["type"] == "bundle_uploaded"
    assert event["version"] == 1
    assert "revision_hash" in event
    assert event["uploaded_by"] == "user_test_123"

    push_manager.unsubscribe_dashboard(TENANT_A_ID, queue)
