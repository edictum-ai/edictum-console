"""Application configuration via environment variables."""

from __future__ import annotations

import logging
from functools import lru_cache
from urllib.parse import urlparse

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    """Edictum Console settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDICTUM_")

    # Database (required — no default, must be explicitly configured)
    database_url: str = ""

    # Redis (required — no default, must be explicitly configured)
    redis_url: str = ""

    # Secret key for session signing (required — server refuses to start without it)
    secret_key: str = ""

    # Admin bootstrap (first run only — optional, use /dashboard/setup wizard instead)
    admin_email: str = ""
    admin_password: str = ""

    # Auth provider
    auth_provider: str = "local"

    # Public base URL
    base_url: str = "http://localhost:8000"

    # Session TTL
    session_ttl_hours: int = 24

    # Ed25519 signing-key encryption secret (32-byte hex string)
    signing_key_secret: str = ""

    # API key prefixes
    api_key_prefix_production: str = "edk_production_"
    api_key_prefix_staging: str = "edk_staging_"
    api_key_prefix_development: str = "edk_development_"

    # Rate limiting
    rate_limit_max_attempts: int = 10
    rate_limit_window_seconds: int = 300

    # CORS allowed origins (comma-separated)
    cors_origins: str = "http://localhost:8000,http://localhost:3000"

    def get_signing_secret(self) -> bytes:
        """Validate and return signing_key_secret as 32 bytes.

        Raises ValueError with a human-readable message if the secret is
        missing, not valid hex, or the wrong length.  Routes should catch
        this and return 422.
        """
        if not self.signing_key_secret:
            raise ValueError(
                "Server signing key secret is not configured "
                "(EDICTUM_SIGNING_KEY_SECRET). "
                "Bundle signing and deployment is unavailable."
            )
        try:
            raw = bytes.fromhex(self.signing_key_secret)
        except ValueError as exc:
            raise ValueError("EDICTUM_SIGNING_KEY_SECRET is not valid hex.") from exc
        if len(raw) != 32:
            raise ValueError(
                "EDICTUM_SIGNING_KEY_SECRET must be exactly 32 bytes "
                f"(64 hex chars), got {len(raw)}."
            )
        return raw

    # Runtime environment
    env_name: str = "development"

    # Telegram env-var config removed — all notification channels
    # are now DB-configured via Settings → Notifications in the dashboard.

    # Trusted proxies for rate limiting (comma-separated IPs)
    trusted_proxies: str = ""

    def validate_required(self) -> None:
        """Validate that required secrets are set. Call at startup."""
        if not self.secret_key:
            raise SystemExit(
                "EDICTUM_SECRET_KEY is required. "
                'Generate one with: python -c "import secrets; print(secrets.token_hex(32))"'
            )
        if not self.database_url:
            raise SystemExit(
                "EDICTUM_DATABASE_URL is required. "
                "Example: postgresql+asyncpg://user:pass@localhost:5432/edictum"
            )
        if not self.redis_url:
            raise SystemExit("EDICTUM_REDIS_URL is required. Example: redis://localhost:6379/0")

        # CORS wildcard is never acceptable — require explicit origins
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        if "*" in origins:
            raise SystemExit(
                "EDICTUM_CORS_ORIGINS must not contain '*' — specify explicit origins"
            )

        # Strip localhost origins when base_url is not localhost
        parsed_base = urlparse(self.base_url)
        if parsed_base.hostname not in ("localhost", "127.0.0.1"):
            localhost_prefixes = ("http://localhost", "http://127.0.0.1")
            filtered = [o for o in origins if not o.startswith(localhost_prefixes)]
            if len(filtered) < len(origins):
                removed = [o for o in origins if o.startswith(localhost_prefixes)]
                logger.warning(
                    "Stripped localhost origins from CORS config (base_url=%s): %s",
                    self.base_url,
                    ", ".join(removed),
                )
                self.cors_origins = ",".join(filtered)


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
