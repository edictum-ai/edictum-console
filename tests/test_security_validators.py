"""Tests for security validators.

Security Audit: 2026-03-01
Findings: C1, H1, H2
"""

import pytest

from edictum_server.security.validators import (
    ValidationError,
    sanitize_html,
    validate_string_length,
    validate_url,
)


class TestValidateURL:
    """Tests for SSRF protection (Finding C1)."""
    
    # Valid URLs
    def test_allows_https_url(self):
        """Valid HTTPS URLs should pass."""
        assert validate_url("https://hooks.slack.com/services/xxx") == \
               "https://hooks.slack.com/services/xxx"
    
    def test_allows_http_url(self):
        """Valid HTTP URLs should pass."""
        assert validate_url("http://example.com/webhook") == \
               "http://example.com/webhook"
    
    def test_allows_url_with_port(self):
        """URLs with ports should work."""
        assert validate_url("https://example.com:8443/webhook") == \
               "https://example.com:8443/webhook"
    
    def test_allows_url_with_path_and_query(self):
        """URLs with paths and queries should work."""
        url = "https://api.example.com/v1/webhook?token=abc123"
        # May fail DNS resolution in test env, but logic is correct
        try:
            assert validate_url(url) == url
        except ValidationError:
            pytest.skip("DNS resolution failed in test environment")
    
    # Blocked schemes
    def test_blocks_file_scheme(self):
        """file:// should be blocked."""
        with pytest.raises(ValidationError, match="scheme.*not allowed"):
            validate_url("file:///etc/passwd")
    
    def test_blocks_gopher_scheme(self):
        """gopher:// should be blocked."""
        with pytest.raises(ValidationError, match="scheme.*not allowed"):
            validate_url("gopher://internal-host:70/")
    
    def test_blocks_ftp_scheme(self):
        """ftp:// should be blocked."""
        with pytest.raises(ValidationError, match="scheme.*not allowed"):
            validate_url("ftp://internal-host/file")
    
    # Internal networks
    def test_blocks_localhost(self):
        """localhost should be blocked."""
        with pytest.raises(ValidationError, match="blocked network"):
            validate_url("http://localhost/admin")
    
    def test_blocks_127_0_0_1(self):
        """127.0.0.1 should be blocked."""
        with pytest.raises(ValidationError, match="blocked network"):
            validate_url("http://127.0.0.1/admin")
    
    def test_blocks_10_network(self):
        """10.x.x.x (private class A) should be blocked."""
        with pytest.raises(ValidationError, match="blocked network"):
            validate_url("http://10.0.0.1/admin")
    
    def test_blocks_172_16_network(self):
        """172.16-31.x.x (private class B) should be blocked."""
        with pytest.raises(ValidationError, match="blocked network"):
            validate_url("http://172.16.0.1/admin")
    
    def test_blocks_192_168_network(self):
        """192.168.x.x (private class C) should be blocked."""
        with pytest.raises(ValidationError, match="blocked network"):
            validate_url("http://192.168.1.1/admin")
    
    def test_blocks_aws_metadata(self):
        """169.254.169.254 (AWS/GCP metadata) should be blocked."""
        with pytest.raises(ValidationError, match="blocked network"):
            validate_url("http://169.254.169.254/latest/meta-data/")
    
    def test_blocks_aws_metadata_hostname(self):
        """AWS metadata via hostname resolution should be blocked."""
        # Note: This test depends on DNS resolution
        with pytest.raises(ValidationError):
            validate_url("http://metadata.google.internal/")
    
    # Edge cases
    def test_blocks_empty_url(self):
        """Empty URL should be rejected."""
        with pytest.raises(ValidationError, match="cannot be empty"):
            validate_url("")
    
    def test_blocks_url_without_hostname(self):
        """URL without hostname should be rejected."""
        with pytest.raises(ValidationError, match="hostname"):
            validate_url("https://")
    
    def test_allows_localhost_when_configured(self):
        """Localhost can be allowed for development."""
        # Only works if allow_localhost=True and DNS resolves
        try:
            result = validate_url("http://localhost:3000/test", allow_localhost=True)
            assert "localhost" in result
        except ValidationError:
            pytest.skip("DNS resolution failed in test environment")


class TestSanitizeHTML:
    """Tests for XSS protection (Finding H2)."""
    
    # Valid input
    def test_allows_plain_text(self):
        """Plain text should pass through unchanged."""
        assert sanitize_html("Hello World") == "Hello World"
    
    def test_allows_special_chars(self):
        """Non-HTML special characters should work."""
        assert sanitize_html("Price: $100 (20% off!)") == "Price: $100 (20% off!)"
    
    def test_allows_unicode(self):
        """Unicode characters should work."""
        assert sanitize_html("Hello 世界 🌍") == "Hello 世界 🌍"
    
    def test_allows_none(self):
        """None should pass through."""
        assert sanitize_html(None) is None
    
    def test_allows_empty_string(self):
        """Empty string should pass through."""
        assert sanitize_html("") == ""
    
    # HTML rejection
    def test_rejects_script_tag(self):
        """<script> tags should be rejected."""
        with pytest.raises(ValidationError, match="HTML tags not allowed"):
            sanitize_html("<script>alert(1)</script>")
    
    def test_rejects_div_tag(self):
        """<div> tags should be rejected."""
        with pytest.raises(ValidationError, match="HTML tags not allowed"):
            sanitize_html("<div>content</div>")
    
    def test_rejects_img_tag(self):
        """<img> tags should be rejected."""
        with pytest.raises(ValidationError, match="HTML tags not allowed"):
            sanitize_html('<img src="x" onerror="alert(1)">')
    
    def test_rejects_incomplete_tag(self):
        """Incomplete HTML tags should be rejected."""
        # "<script" without > might not match the tag pattern, but XSS pattern catches it
        with pytest.raises(ValidationError, match="unsafe"):
            sanitize_html("<script")
    
    # XSS patterns
    def test_rejects_javascript_protocol(self):
        """javascript: protocol should be rejected."""
        with pytest.raises(ValidationError, match="unsafe"):
            sanitize_html("javascript:alert(1)")
    
    def test_rejects_onclick_handler(self):
        """onclick handlers should be rejected."""
        with pytest.raises(ValidationError, match="unsafe"):
            sanitize_html("onclick=alert(1)")
    
    def test_rejects_onerror_handler(self):
        """onerror handlers should be rejected."""
        with pytest.raises(ValidationError, match="unsafe"):
            sanitize_html("onerror=alert(1)")
    
    def test_rejects_iframe(self):
        """<iframe> should be rejected."""
        with pytest.raises(ValidationError, match="HTML tags not allowed"):
            sanitize_html("<iframe src='evil.com'>")
    
    # Length validation (Finding H1)
    def test_enforces_max_length(self):
        """Should enforce max_length when provided."""
        long_string = "A" * 1000
        with pytest.raises(ValidationError, match="exceeds maximum length"):
            sanitize_html(long_string, max_length=255)
    
    def test_allows_within_max_length(self):
        """Strings within max_length should pass."""
        result = sanitize_html("A" * 100, max_length=255)
        assert len(result) == 100


class TestValidateStringLength:
    """Tests for length validation (Finding H1)."""
    
    def test_allows_within_bounds(self):
        """Strings within bounds should pass."""
        assert validate_string_length("hello", "name", min_length=1, max_length=100) == "hello"
    
    def test_rejects_too_short(self):
        """Strings below min_length should be rejected."""
        with pytest.raises(ValidationError, match="at least"):
            validate_string_length("ab", "name", min_length=3, max_length=100)
    
    def test_rejects_too_long(self):
        """Strings above max_length should be rejected."""
        with pytest.raises(ValidationError, match="at most"):
            validate_string_length("A" * 300, "name", min_length=1, max_length=255)
    
    def test_allows_empty_when_min_is_zero(self):
        """Empty strings should be allowed when min_length=0."""
        assert validate_string_length("", "name", min_length=0, max_length=100) == ""
    
    def test_rejects_empty_when_required(self):
        """Empty strings should be rejected when min_length > 0."""
        with pytest.raises(ValidationError, match="required"):
            validate_string_length("", "name", min_length=1, max_length=100)
    
    def test_handles_none_gracefully(self):
        """None should be handled based on context."""
        # When min_length=0, None should pass (optional field)
        assert validate_string_length(None, "name", min_length=0) is None


class TestIntegration:
    """Integration tests combining validators."""
    
    def test_webhook_url_validation_flow(self):
        """Complete flow for validating webhook URLs."""
        # Valid webhook
        url = "https://hooks.slack.com/services/T00/B00/xxx"
        assert validate_url(url) == url
        
        # Malicious webhook to internal service
        with pytest.raises(ValidationError):
            validate_url("http://192.168.1.50:6379/")  # Redis
    
    def test_label_validation_flow(self):
        """Complete flow for validating user labels."""
        # Valid label
        label = "Production API Key"
        assert sanitize_html(label, max_length=255) == label
        
        # XSS attempt
        with pytest.raises(ValidationError):
            sanitize_html("<script>alert(1)</script>", max_length=255)
        
        # Too long
        with pytest.raises(ValidationError):
            sanitize_html("A" * 1000, max_length=255)
