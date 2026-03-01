"""Input validation utilities for security hardening.

This module provides validators to prevent common web vulnerabilities:
- SSRF (Server-Side Request Forgery) via URL validation
- XSS (Cross-Site Scripting) via HTML sanitization
- DoS (Denial of Service) via length validation

Security Audit: 2026-03-01
Findings: C1, H1, H2
"""

from __future__ import annotations

import ipaddress
import re
import socket
from urllib.parse import urlparse

from pydantic import field_validator


class ValidationError(ValueError):
    """Raised when input validation fails."""
    pass


# =============================================================================
# SSRF Protection (Finding C1)
# =============================================================================

# Networks that should never be accessible via user-provided URLs
BLOCKED_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),        # Private Class A
    ipaddress.ip_network("172.16.0.0/12"),     # Private Class B  
    ipaddress.ip_network("192.168.0.0/16"),    # Private Class C
    ipaddress.ip_network("127.0.0.0/8"),       # Loopback
    ipaddress.ip_network("169.254.0.0/16"),    # Link-local (AWS/GCP metadata)
    ipaddress.ip_network("0.0.0.0/8"),         # Current network
    ipaddress.ip_network("224.0.0.0/4"),       # Multicast
    ipaddress.ip_network("240.0.0.0/4"),       # Reserved
    ipaddress.ip_network("255.255.255.255/32"),# Broadcast
    ipaddress.ip_network("::1/128"),           # IPv6 loopback
    ipaddress.ip_network("fe80::/10"),         # IPv6 link-local
    ipaddress.ip_network("fc00::/7"),          # IPv6 unique local
]

# Only HTTP/HTTPS allowed
ALLOWED_SCHEMES = {"http", "https"}


def validate_url(url: str, *, allow_localhost: bool = False) -> str:
    """Validate that a URL is safe to make server-side requests to.
    
    This prevents SSRF attacks by blocking:
    - Internal network addresses (10.x, 172.16-31.x, 192.168.x)
    - Cloud metadata endpoints (169.254.169.254)
    - Loopback addresses (127.0.0.1, localhost)
    - Non-HTTP schemes (file://, gopher://, etc.)
    
    Args:
        url: The URL to validate
        allow_localhost: If True, allow localhost (for development)
        
    Returns:
        The validated URL (unchanged)
        
    Raises:
        ValidationError: If URL is unsafe or invalid
        
    Example:
        >>> validate_url("https://hooks.slack.com/services/xxx")
        'https://hooks.slack.com/services/xxx'
        
        >>> validate_url("http://169.254.169.254/latest/meta-data/")
        ValidationError: URL resolves to blocked network: 169.254.0.0/16
    """
    if not url:
        raise ValidationError("URL cannot be empty")
    
    # Parse URL
    try:
        parsed = urlparse(url.strip())
    except Exception as e:
        raise ValidationError(f"Invalid URL format: {e}") from e
    
    # Check scheme
    scheme = parsed.scheme.lower()
    if scheme not in ALLOWED_SCHEMES:
        raise ValidationError(
            f"URL scheme '{scheme}' not allowed. Only HTTP/HTTPS permitted."
        )
    
    # Get hostname
    hostname = parsed.hostname
    if not hostname:
        raise ValidationError("URL must include a hostname")
    
    # Resolve hostname to IP
    try:
        # getaddrinfo returns all resolved IPs, we check all of them
        addr_info = socket.getaddrinfo(hostname, None)
        if not addr_info:
            raise ValidationError(f"Cannot resolve hostname: {hostname}")
    except socket.gaierror as e:
        raise ValidationError(f"Cannot resolve hostname '{hostname}': {e}") from e
    
    # Check each resolved IP
    resolved_ips = set()
    for family, _, _, _, sockaddr in addr_info:
        ip_str = sockaddr[0]
        resolved_ips.add(ip_str)
        
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            # Skip non-IP addresses (shouldn't happen)
            continue
        
        # Check against blocked networks
        for network in BLOCKED_NETWORKS:
            if ip in network:
                if not allow_localhost or network != ipaddress.ip_network("127.0.0.0/8"):
                    raise ValidationError(
                        f"URL hostname '{hostname}' resolves to {ip_str} "
                        f"which is in blocked network {network}. "
                        f"SSRF protection prevents access to internal resources."
                    )
    
    return url


# =============================================================================
# XSS Protection (Finding H2)
# =============================================================================

# HTML tag pattern for detection
HTML_TAG_PATTERN = re.compile(r'<[^>]+>', re.IGNORECASE)

# Common XSS patterns
XSS_PATTERNS = [
    re.compile(r'<script', re.IGNORECASE),
    re.compile(r'javascript:', re.IGNORECASE),
    re.compile(r'on\w+\s*=', re.IGNORECASE),  # onclick=, onerror=, etc.
    re.compile(r'<iframe', re.IGNORECASE),
    re.compile(r'<object', re.IGNORECASE),
    re.compile(r'<embed', re.IGNORECASE),
    re.compile(r'<svg', re.IGNORECASE),
    re.compile(r'expression\s*\(', re.IGNORECASE),
]


def sanitize_html(value: str, *, max_length: int | None = None) -> str:
    """Sanitize a string value to prevent XSS attacks.
    
    This function:
    1. Checks for HTML tags
    2. Detects common XSS patterns
    3. Optionally enforces length limits
    
    Note: This is a REJECTION sanitizer, not an escaping one.
    We reject input that looks suspicious rather than trying to
    escape it. Frontend should still escape output as defense-in-depth.
    
    Args:
        value: The string to sanitize
        max_length: Optional maximum length (Finding H1)
        
    Returns:
        The sanitized value (unchanged if valid)
        
    Raises:
        ValidationError: If HTML/XSS patterns detected or length exceeded
        
    Example:
        >>> sanitize_html("My Label")
        'My Label'
        
        >>> sanitize_html("<script>alert(1)</script>")
        ValidationError: HTML tags not allowed in input
    """
    if not value:
        return value
    
    # Length check (Finding H1)
    if max_length is not None and len(value) > max_length:
        raise ValidationError(
            f"Input exceeds maximum length of {max_length} characters "
            f"(got {len(value)} characters)"
        )
    
    # Check for HTML tags
    if HTML_TAG_PATTERN.search(value):
        raise ValidationError(
            "HTML tags not allowed in input. "
            "Please use plain text only."
        )
    
    # Check for XSS patterns
    for pattern in XSS_PATTERNS:
        if pattern.search(value):
            raise ValidationError(
                "Potentially unsafe content detected. "
                "Please use plain text only."
            )
    
    return value


# =============================================================================
# Length Validation (Finding H1)
# =============================================================================

def validate_string_length(
    value: str,
    field_name: str,
    *,
    min_length: int = 0,
    max_length: int = 255,
) -> str:
    """Validate string length to prevent DoS and DB bloat.
    
    Args:
        value: The string to validate
        field_name: Name of the field (for error messages)
        min_length: Minimum allowed length (default: 0)
        max_length: Maximum allowed length (default: 255)
        
    Returns:
        The validated value
        
    Raises:
        ValidationError: If length constraints violated
    """
    if not value:
        if min_length > 0:
            raise ValidationError(
                f"{field_name} is required (minimum {min_length} characters)"
            )
        return value
    
    length = len(value)
    
    if length < min_length:
        raise ValidationError(
            f"{field_name} must be at least {min_length} characters "
            f"(got {length} characters)"
        )
    
    if length > max_length:
        raise ValidationError(
            f"{field_name} must be at most {max_length} characters "
            f"(got {length} characters)"
        )
    
    return value


# =============================================================================
# Pydantic Validators (for schema reuse)
# =============================================================================

def create_html_sanitizer(*, max_length: int | None = None):
    """Create a Pydantic field validator that sanitizes HTML.
    
    Usage in Pydantic schema:
        class MyRequest(BaseModel):
            label: str | None = None
            
            sanitize_label = create_html_sanitizer(max_length=255)
            _validate_label = field_validator('label')(sanitize_label)
    """
    def validator(cls, v):
        if v is None:
            return v
        return sanitize_html(v, max_length=max_length)
    return validator


def create_length_validator(field_name: str, *, min_length: int = 0, max_length: int = 255):
    """Create a Pydantic field validator for length.
    
    Usage:
        validate_name = create_length_validator('name', max_length=100)
        _validate_name = field_validator('name')(validate_name)
    """
    def validator(cls, v):
        if v is None:
            return v
        return validate_string_length(v, field_name, min_length=min_length, max_length=max_length)
    return validator
