"""SSRF-safe HTTP transport — re-validates DNS at request time.

The ``validate_url()`` check in ``validators.py`` runs at channel creation/update,
but DNS can change between validation and actual request (TOCTOU).  This transport
resolves the hostname and checks against blocked networks at request time.
"""

from __future__ import annotations

import ipaddress
import socket

import httpx

from edictum_server.security.validators import _BLOCKED_NETWORKS


class SSRFError(Exception):
    """Raised when a request targets a blocked network."""


class SafeTransport(httpx.AsyncHTTPTransport):
    """AsyncHTTPTransport that blocks requests to private/internal networks."""

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        hostname = request.url.host
        if hostname:
            # Resolve DNS and check all addresses
            try:
                addr_info = socket.getaddrinfo(hostname, None)
            except socket.gaierror as exc:
                raise SSRFError(f"Cannot resolve hostname '{hostname}': {exc}") from exc

            for _family, _type, _proto, _canonname, sockaddr in addr_info:
                ip_str = sockaddr[0]
                try:
                    ip = ipaddress.ip_address(ip_str)
                except ValueError:
                    continue
                for network in _BLOCKED_NETWORKS:
                    if ip in network:
                        raise SSRFError(
                            f"Request to {hostname} blocked: resolves to {ip_str} "
                            f"(network {network})"
                        )

        return await super().handle_async_request(request)
