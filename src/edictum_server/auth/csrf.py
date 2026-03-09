"""CSRF protection middleware for cookie-authenticated endpoints.

Uses the custom-header pattern: mutating requests (POST/PUT/DELETE/PATCH) that
rely on cookie auth must include ``X-Requested-With`` header.  Browsers block
cross-origin requests from setting custom headers unless CORS allows it, so
a forged form submission from another origin cannot include this header.

API-key-authenticated requests (``Authorization: Bearer edk_*``) are exempt
because they don't rely on ambient cookies.  External webhook callbacks
(Telegram, Discord, Slack) and the login/setup endpoints are also exempt.
"""

from __future__ import annotations

import logging

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger(__name__)

_MUTATING_METHODS = frozenset({"POST", "PUT", "DELETE", "PATCH"})

# Paths exempt from CSRF checks — login (sets cookie), setup (bootstrap),
# external webhook callbacks (their own auth), and health.
_EXEMPT_PREFIXES = (
    "/api/v1/auth/login",
    "/api/v1/setup",
    "/api/v1/telegram/",
    "/api/v1/discord/",
    "/api/v1/slack/",
    "/api/v1/health",
)


class CSRFMiddleware(BaseHTTPMiddleware):
    """Require ``X-Requested-With`` on cookie-auth mutating requests."""

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        if request.method not in _MUTATING_METHODS:
            return await call_next(request)

        path = request.url.path

        # Non-API paths (SPA, static assets) — no check needed
        if not path.startswith("/api/"):
            return await call_next(request)

        # Exempt paths (webhooks, login, setup)
        if path.startswith(_EXEMPT_PREFIXES):
            return await call_next(request)

        # API-key requests are exempt — they don't use cookies
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer edk_"):
            return await call_next(request)

        # Cookie-auth mutating request — require custom header
        if not request.headers.get("x-requested-with"):
            return JSONResponse(
                {"detail": "Missing CSRF header."},
                status_code=403,
            )

        return await call_next(request)
