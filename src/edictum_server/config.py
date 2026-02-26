"""Application configuration via environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Edictum Console settings loaded from environment / .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_prefix="EDICTUM_")

    # Database
    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/edictum"
    )

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

    # CORS allowed origins (comma-separated)
    cors_origins: str = "http://localhost:8000,http://localhost:3000"

    # Runtime environment
    env_name: str = "development"

    # Telegram bot integration (optional)
    telegram_bot_token: str = ""
    telegram_chat_id: int = 0
    telegram_webhook_secret: str = ""


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance."""
    return Settings()
