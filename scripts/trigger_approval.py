"""Trigger a real approval via the API to test notification channels.

Usage:
    python scripts/trigger_approval.py --api-key <your-api-key>
    python scripts/trigger_approval.py --api-key <your-api-key> --base-url http://localhost:8000
"""

from __future__ import annotations

import argparse
import asyncio

import httpx


async def main(api_key: str, base_url: str) -> None:
    base_url = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"}

    payload = {
        "agent_id": "test-agent",
        "tool_name": "exec",
        "tool_args": {"command": "kubectl rollout restart deployment/api-gateway -n production"},
        "message": "Agent wants to restart the api-gateway deployment in production. Approve?",
        "env": "production",
        "timeout_seconds": 300,
        "timeout_effect": "deny",
        "contract_name": "production-safety",
        "decision_source": "approval-required",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(
            f"{base_url}/api/v1/approvals",
            headers=headers,
            json=payload,
        )

    if resp.status_code == 201:
        data = resp.json()
        print(f"Approval created: {data['id']}")
        print(f"Status: {data['status']}")
        print(f"Check your notification channels — a message should have arrived.")
    else:
        print(f"Failed: {resp.status_code}")
        print(resp.text)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-key", required=True)
    parser.add_argument("--base-url", default="http://localhost:8000")
    args = parser.parse_args()
    asyncio.run(main(args.api_key, args.base_url))
