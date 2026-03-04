"""C5: Auto-redeploy safety tests.

Risk if bypassed: Unreviewed contract changes pushed to production agents,
or corrupted bundles deployed.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from edictum_server.db.models import Bundle
from edictum_server.db.models import SigningKey as SigningKeyModel
from edictum_server.services.signing_service import generate_signing_keypair
from tests.conftest import TENANT_A_ID

pytestmark = pytest.mark.security

# 32-byte hex secret used for test signing keys (matches Settings override)
_TEST_SECRET_HEX = "00" * 32
_TEST_SECRET = bytes.fromhex(_TEST_SECRET_HEX)


def _contract_payload(contract_id: str = "block-reads") -> dict:
    return {
        "contract_id": contract_id,
        "name": "Block Reads",
        "type": "pre",
        "definition": {"tool": "db_read", "then": {"effect": "deny"}},
        "tags": ["security"],
    }


async def _setup_contract_and_composition(
    client: AsyncClient,
    update_strategy: str = "manual",
    comp_name: str = "test-comp",
) -> None:
    """Helper: create a contract and composition."""
    await client.post("/api/v1/contracts", json=_contract_payload())
    await client.post("/api/v1/compositions", json={
        "name": comp_name,
        "defaults_mode": "enforce",
        "update_strategy": update_strategy,
        "contracts": [{"contract_id": "block-reads", "position": 10}],
    })


async def _ensure_signing_key(db_session: AsyncSession) -> None:
    """Ensure a signing key exists for tenant A, encrypted with _TEST_SECRET."""
    result = await db_session.execute(
        select(SigningKeyModel).where(
            SigningKeyModel.tenant_id == TENANT_A_ID,
            SigningKeyModel.active.is_(True),
        )
    )
    if result.scalar_one_or_none() is None:
        pub, enc_priv = generate_signing_keypair(_TEST_SECRET)
        key = SigningKeyModel(
            tenant_id=TENANT_A_ID,
            public_key=pub,
            private_key_encrypted=enc_priv,
            active=True,
        )
        db_session.add(key)
        await db_session.commit()


@pytest.fixture()
async def deploy_client(
    test_redis, push_manager,
) -> AsyncClient:
    """Client with signing_key_secret configured for deploy tests."""
    from edictum_server.auth.dependencies import (
        get_current_tenant,
        require_api_key,
        require_dashboard_auth,
    )
    from edictum_server.config import Settings, get_settings
    from edictum_server.db.engine import get_db
    from edictum_server.main import app
    from edictum_server.notifications.base import NotificationManager
    from edictum_server.push.manager import get_push_manager
    from edictum_server.redis.client import get_redis
    from tests.conftest import (
        _make_auth_a_api_key,
        _make_auth_a_dashboard,
        _override_get_db,
    )

    def _test_settings() -> Settings:
        return Settings(signing_key_secret=_TEST_SECRET_HEX)

    from edictum_server.auth.local import LocalAuthProvider

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[get_redis] = lambda: test_redis
    app.dependency_overrides[get_push_manager] = lambda: push_manager
    app.dependency_overrides[require_api_key] = _make_auth_a_api_key
    app.dependency_overrides[require_dashboard_auth] = _make_auth_a_dashboard
    app.dependency_overrides[get_current_tenant] = _make_auth_a_api_key
    app.dependency_overrides[get_settings] = _test_settings

    app.state.redis = test_redis
    app.state.push_manager = push_manager
    app.state.auth_provider = LocalAuthProvider(redis=test_redis, session_ttl_hours=24)
    app.state.notification_manager = NotificationManager()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


async def test_manual_strategy_no_auto_deploy(
    client: AsyncClient, db_session: AsyncSession,
) -> None:
    """Create composition with update_strategy='manual'. Update a contract.
    Verify NO automatic deployment happens — bundle count stays the same."""
    await _setup_contract_and_composition(client, update_strategy="manual")

    # Check bundle count before
    result = await db_session.execute(
        select(Bundle).where(
            Bundle.tenant_id == TENANT_A_ID,
            Bundle.name == "test-comp",
        )
    )
    bundles_before = len(list(result.scalars().all()))

    # Update the contract
    await client.put("/api/v1/contracts/block-reads", json={"name": "Updated"})

    # Check bundle count after — should be the same (manual = no auto-deploy)
    result = await db_session.execute(
        select(Bundle).where(
            Bundle.tenant_id == TENANT_A_ID,
            Bundle.name == "test-comp",
        )
    )
    bundles_after = len(list(result.scalars().all()))
    assert bundles_after == bundles_before


async def test_deploy_without_signing_secret_configured(
    client: AsyncClient,
) -> None:
    """Deploy when EDICTUM_SIGNING_KEY_SECRET is empty -> 422.
    The default test client has no signing_key_secret override."""
    await _setup_contract_and_composition(client)

    resp = await client.post(
        "/api/v1/compositions/test-comp/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 422
    assert "signing" in resp.json()["detail"].lower()


async def test_deploy_requires_signing_key_in_db(
    deploy_client: AsyncClient, db_session: AsyncSession,
) -> None:
    """Deploy with valid secret but no signing key row -> 422."""
    await _setup_contract_and_composition(deploy_client)

    # Ensure no signing key exists in DB
    result = await db_session.execute(
        select(SigningKeyModel).where(SigningKeyModel.tenant_id == TENANT_A_ID)
    )
    for key in result.scalars().all():
        await db_session.delete(key)
    await db_session.commit()

    resp = await deploy_client.post(
        "/api/v1/compositions/test-comp/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 422
    assert "signing key" in resp.json()["detail"].lower()


async def test_deploy_composition_empty_contracts(
    deploy_client: AsyncClient, db_session: AsyncSession,
) -> None:
    """Deploy a composition with zero enabled contracts -> 422."""
    await _ensure_signing_key(db_session)

    # Create composition with no contracts
    await deploy_client.post("/api/v1/compositions", json={
        "name": "empty-comp",
        "defaults_mode": "enforce",
        "update_strategy": "manual",
        "contracts": [],
    })

    resp = await deploy_client.post(
        "/api/v1/compositions/empty-comp/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 422
    assert "no enabled contracts" in resp.json()["detail"].lower()


async def test_composition_snapshot_frozen_on_deploy(
    deploy_client: AsyncClient, db_session: AsyncSession,
) -> None:
    """Deploy composition v1. Update composition (add contracts).
    Verify Bundle row's composition_snapshot still reflects v1 state."""
    await _ensure_signing_key(db_session)
    await _setup_contract_and_composition(deploy_client)

    # Deploy
    resp = await deploy_client.post(
        "/api/v1/compositions/test-comp/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 201
    bundle_version = resp.json()["bundle_version"]
    snapshot_at_deploy = resp.json()["contracts_assembled"]

    # Add a second contract to the composition
    await deploy_client.post("/api/v1/contracts", json=_contract_payload("audit-logs"))
    await deploy_client.put("/api/v1/compositions/test-comp", json={
        "contracts": [
            {"contract_id": "block-reads", "position": 10},
            {"contract_id": "audit-logs", "position": 20},
        ],
    })

    # Verify the Bundle's snapshot is still the original (frozen)
    result = await db_session.execute(
        select(Bundle).where(
            Bundle.tenant_id == TENANT_A_ID,
            Bundle.name == "test-comp",
            Bundle.version == bundle_version,
        )
    )
    bundle = result.scalar_one()
    assert bundle.composition_snapshot == snapshot_at_deploy
    assert len(bundle.composition_snapshot) == 1  # Only block-reads


async def test_deploy_creates_bundle_with_correct_content(
    deploy_client: AsyncClient, db_session: AsyncSession,
) -> None:
    """Deploy composition -> verify bundle YAML contains the right contracts."""
    await _ensure_signing_key(db_session)
    await _setup_contract_and_composition(deploy_client)

    resp = await deploy_client.post(
        "/api/v1/compositions/test-comp/deploy",
        json={"env": "production"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["bundle_name"] == "test-comp"
    assert data["bundle_version"] == 1
    assert len(data["contracts_assembled"]) == 1
    assert data["contracts_assembled"][0]["contract_id"] == "block-reads"


async def test_preview_does_not_create_bundle(
    client: AsyncClient, db_session: AsyncSession,
) -> None:
    """Preview a composition -> no Bundle row created."""
    await _setup_contract_and_composition(client)

    resp = await client.post("/api/v1/compositions/test-comp/preview")
    assert resp.status_code == 200
    assert resp.json()["contracts_count"] == 1

    # Verify no bundle was created
    result = await db_session.execute(
        select(Bundle).where(
            Bundle.tenant_id == TENANT_A_ID,
            Bundle.name == "test-comp",
        )
    )
    assert result.scalar_one_or_none() is None
