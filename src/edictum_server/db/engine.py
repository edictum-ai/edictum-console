"""Async engine factory and session dependency."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from edictum_server.config import get_settings

# Populated during app lifespan startup via ``init_engine``.
_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_engine(url: str | None = None) -> AsyncEngine:
    """Create the async engine and session factory.  Called once at startup."""
    global _engine, _session_factory  # noqa: PLW0603
    database_url = url or get_settings().database_url
    _engine = create_async_engine(database_url, echo=False)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_engine() -> AsyncEngine:
    """Return the current engine (must be initialised first)."""
    if _engine is None:
        raise RuntimeError("Database engine not initialised — call init_engine() first")
    return _engine


def async_session_factory() -> async_sessionmaker[AsyncSession]:
    """Return the session factory (must be initialised first).

    Use this for background tasks that run outside the FastAPI DI context.
    """
    if _session_factory is None:
        raise RuntimeError("Database engine not initialised — call init_engine() first")
    return _session_factory


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields an async database session."""
    if _session_factory is None:
        raise RuntimeError("Database engine not initialised — call init_engine() first")
    async with _session_factory() as session:
        yield session
