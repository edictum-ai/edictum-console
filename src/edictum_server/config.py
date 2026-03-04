"""Application configuration via environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Edictum Console settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDICTUM_")

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/edictum"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Secret key for session signing (required, no default)
    secret_key: str = ""

    # Admin bootstrap (first run only)
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
            raise ValueError(
                "EDICTUM_SIGNING_KEY_SECRET is not valid hex."
            ) from exc
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


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
