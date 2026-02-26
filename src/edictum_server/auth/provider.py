"""Authentication provider protocol for pluggable auth backends."""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass

from fastapi import Request


@dataclass(frozen=True, slots=True)
class DashboardAuthContext:
    """Resolved authentication context for a dashboard (human) user."""

    user_id: uuid.UUID
    tenant_id: uuid.UUID
    email: str
    is_admin: bool


class AuthProvider(ABC):
    """Protocol for pluggable authentication backends.

    Implementations: LocalAuthProvider (bcrypt + Redis sessions).
    Planned: OIDCAuthProvider.
    """

    @abstractmethod
    async def authenticate(self, request: Request) -> DashboardAuthContext:
        """Extract and verify credentials from request.

        Raises HTTPException(401) on failure.
        """
        ...

    @abstractmethod
    async def create_session(
        self,
        user_id: uuid.UUID,
        tenant_id: uuid.UUID,
        email: str,
        is_admin: bool,
    ) -> tuple[str, dict[str, str | bool | int]]:
        """Create a session. Returns (token, cookie_params dict)."""
        ...

    @abstractmethod
    async def destroy_session(self, request: Request) -> None:
        """Destroy the session from the request."""
        ...

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Return provider identifier (e.g., 'local', 'oidc')."""
        ...
