"""Encrypt notification channel config at rest.

Adds ``config_encrypted`` (LargeBinary) to ``notification_channels``.
Migrates existing plain-text ``config`` JSON into encrypted form and
NULLs out the plain column so secrets don't linger.

Revision ID: 006
Revises: 005
Create Date: 2026-03-05
"""

from __future__ import annotations

import json
import os

import sqlalchemy as sa
from alembic import op
from nacl.secret import SecretBox

revision: str = "006"
down_revision: str = "005"
branch_labels = None
depends_on = None


def _get_secret() -> bytes:
    """Read the signing secret from the environment (same as app config)."""
    raw_hex = os.environ.get("EDICTUM_SIGNING_KEY_SECRET", "")
    if not raw_hex:
        raise RuntimeError(
            "EDICTUM_SIGNING_KEY_SECRET must be set to run this migration. "
            "It is the same 64-hex-char secret used for bundle signing."
        )
    raw = bytes.fromhex(raw_hex)
    if len(raw) != 32:
        raise RuntimeError(
            "EDICTUM_SIGNING_KEY_SECRET must be exactly 32 bytes (64 hex chars)."
        )
    return raw


def upgrade() -> None:
    # 1. Add the new encrypted column
    op.add_column(
        "notification_channels",
        sa.Column("config_encrypted", sa.LargeBinary(), nullable=True),
    )

    # 2. Migrate existing plain-text config → encrypted
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, config FROM notification_channels "
            "WHERE config IS NOT NULL"
        )
    ).fetchall()

    if rows:
        secret = _get_secret()
        box = SecretBox(secret)
        for row in rows:
            channel_id = row[0]
            config_value = row[1]
            # config column is JSON — driver may return dict or string
            if isinstance(config_value, str):
                config_json = config_value
            else:
                config_json = json.dumps(config_value)
            encrypted = box.encrypt(config_json.encode("utf-8"))
            conn.execute(
                sa.text(
                    "UPDATE notification_channels "
                    "SET config_encrypted = :enc, config = NULL "
                    "WHERE id = :id"
                ),
                {"enc": encrypted, "id": channel_id},
            )

    # 3. Make config column nullable (it was NOT NULL before)
    op.alter_column(
        "notification_channels",
        "config",
        existing_type=sa.JSON(),
        nullable=True,
    )


def downgrade() -> None:
    # Decrypt back to plain JSON
    conn = op.get_bind()
    rows = conn.execute(
        sa.text(
            "SELECT id, config_encrypted FROM notification_channels "
            "WHERE config_encrypted IS NOT NULL"
        )
    ).fetchall()

    if rows:
        secret = _get_secret()
        box = SecretBox(secret)
        for row in rows:
            channel_id = row[0]
            encrypted = row[1]
            plaintext = box.decrypt(encrypted)
            config_dict = json.loads(plaintext)
            conn.execute(
                sa.text(
                    "UPDATE notification_channels "
                    "SET config = :cfg, config_encrypted = NULL "
                    "WHERE id = :id"
                ),
                {"cfg": json.dumps(config_dict), "id": channel_id},
            )

    op.alter_column(
        "notification_channels",
        "config",
        existing_type=sa.JSON(),
        nullable=False,
    )
    op.drop_column("notification_channels", "config_encrypted")
