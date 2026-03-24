"""Security response headers middleware.

Injects standard security headers on every response to mitigate XSS,
clickjacking, MIME-sniffing, and protocol downgrade attacks (issue #12).
"""

from __future__ import annotations

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

# CSP uses 'unsafe-inline' for scripts because the dashboard has an inline
# theme-detection script in index.html.  A nonce-based approach would be
# more restrictive but requires build pipeline changes.
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'"
)

_HEADERS = {
    "Content-Security-Policy": _CSP,
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": ("camera=(), microphone=(), geolocation=(), payment=()"),
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security response headers to every HTTP response."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        for name, value in _HEADERS.items():
            response.headers.setdefault(name, value)
        return response
