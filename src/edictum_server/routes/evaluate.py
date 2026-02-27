"""Evaluate (playground) endpoint — stateless contract evaluation."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from edictum_server.auth.dependencies import (
    AuthContext,
    require_dashboard_auth,
)
from edictum_server.schemas.evaluate import EvaluateRequest, EvaluateResponse
from edictum_server.services.evaluate_service import evaluate_contracts

router = APIRouter(prefix="/api/v1/bundles", tags=["evaluate"])


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate(
    body: EvaluateRequest,
    _auth: AuthContext = Depends(require_dashboard_auth),
) -> EvaluateResponse:
    """Evaluate a tool call against YAML contracts (dashboard playground).

    This is a development-time endpoint for testing contracts in the dashboard.
    It is never called by agents during production execution.
    """
    try:
        return evaluate_contracts(
            yaml_content=body.yaml_content,
            tool_name=body.tool_name,
            tool_args=body.tool_args,
            environment=body.environment,
            principal_input=body.principal,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
