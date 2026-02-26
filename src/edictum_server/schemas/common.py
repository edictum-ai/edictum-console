"""Common response schemas shared across endpoints."""

from __future__ import annotations

from pydantic import BaseModel


class ErrorResponse(BaseModel):
    """Standard error response body."""

    detail: str
    code: str
