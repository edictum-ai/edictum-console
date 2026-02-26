"""API key generation and verification utilities."""

from __future__ import annotations

import hashlib
import secrets

import bcrypt


def _prehash(key: str) -> bytes:
    """SHA256 pre-hash to fit within bcrypt's 72-byte limit."""
    return hashlib.sha256(key.encode()).hexdigest().encode()


def generate_api_key(env: str) -> tuple[str, str, str]:
    """Generate a new API key for the given environment.

    Args:
        env: Environment name — "production", "staging", or "development".

    Returns:
        Tuple of (full_key, prefix, bcrypt_hash).
        The full key is shown once to the user. The prefix (first 12 chars)
        is stored in plaintext for efficient DB lookup. The bcrypt hash
        is stored for verification.
    """
    valid_envs = ("production", "staging", "development")
    if env not in valid_envs:
        msg = f"Invalid environment: {env!r}. Must be one of {valid_envs}."
        raise ValueError(msg)

    random_part = secrets.token_urlsafe(32)
    full_key = f"edk_{env}_{random_part}"
    prefix = full_key[:12]
    key_hash = bcrypt.hashpw(_prehash(full_key), bcrypt.gensalt(rounds=12)).decode()

    return full_key, prefix, key_hash


def verify_api_key(raw_key: str, stored_hash: str) -> bool:
    """Verify a raw API key against a stored bcrypt hash."""
    return bcrypt.checkpw(_prehash(raw_key), stored_hash.encode())
