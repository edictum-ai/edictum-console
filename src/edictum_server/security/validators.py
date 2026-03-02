"""Input validation utilities — SSRF, XSS, and length protection."""

from __future__ import annotations

import asyncio
import ipaddress
import re
import socket
from urllib.parse import urlparse

# Networks that must never be reachable via user-supplied URLs (SSRF protection)
_BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),  # Cloud metadata (AWS/GCP)
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("224.0.0.0/4"),
    ipaddress.ip_network("240.0.0.0/4"),
    ipaddress.ip_network("255.255.255.255/32"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fe80::/10"),
    ipaddress.ip_network("fc00::/7"),
]

_ALLOWED_SCHEMES = {"http", "https"}

_HTML_TAG_RE = re.compile(r"<[^>]+>", re.IGNORECASE)
_XSS_PATTERNS = [
    re.compile(r"<script", re.IGNORECASE),
    re.compile(r"javascript:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),
    re.compile(r"<iframe", re.IGNORECASE),
    re.compile(r"<object", re.IGNORECASE),
    re.compile(r"<embed", re.IGNORECASE),
    re.compile(r"<svg", re.IGNORECASE),
    re.compile(r"expression\s*\(", re.IGNORECASE),
]


class ValidationError(ValueError):
    """Raised when an input fails a security validation check."""


async def validate_url(url: str) -> str:
    """Validate that a URL is safe to make server-side requests to.

    Blocks private networks, loopback, cloud metadata endpoints, and
    non-HTTP schemes to prevent SSRF attacks.

    Returns the URL unchanged if valid. Raises ValidationError otherwise.
    """
    if not url:
        raise ValidationError("URL cannot be empty")

    try:
        parsed = urlparse(url.strip())
    except Exception as exc:
        raise ValidationError(f"Invalid URL: {exc}") from exc

    if parsed.scheme.lower() not in _ALLOWED_SCHEMES:
        raise ValidationError(
            f"URL scheme '{parsed.scheme}' not allowed. Only HTTP/HTTPS are permitted."
        )

    hostname = parsed.hostname
    if not hostname:
        raise ValidationError("URL must include a hostname")

    try:
        addr_info = await asyncio.to_thread(socket.getaddrinfo, hostname, None)
    except socket.gaierror as exc:
        raise ValidationError(f"Cannot resolve hostname '{hostname}': {exc}") from exc

    for _family, _type, _proto, _canonname, sockaddr in addr_info:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        for network in _BLOCKED_NETWORKS:
            if ip in network:
                raise ValidationError(
                    f"URL resolves to blocked address {ip_str} "
                    f"(network {network}). SSRF protection prevents access to "
                    "internal or cloud-metadata addresses."
                )

    return url


def sanitize_text(value: str, *, max_length: int | None = None) -> str:
    """Reject strings containing HTML tags or common XSS payloads.

    This is a rejection sanitizer — invalid input raises ValidationError
    rather than being silently stripped. Frontend is still responsible for
    escaping output (defence in depth).

    Returns the value unchanged if clean. Raises ValidationError otherwise.
    """
    if not value:
        return value

    if max_length is not None and len(value) > max_length:
        raise ValidationError(
            f"Input exceeds maximum length of {max_length} characters "
            f"(got {len(value)})"
        )

    if _HTML_TAG_RE.search(value):
        raise ValidationError("HTML tags are not allowed in this field")

    for pattern in _XSS_PATTERNS:
        if pattern.search(value):
            raise ValidationError("Potentially unsafe content detected in this field")

    return value
