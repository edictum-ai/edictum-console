#!/usr/bin/env python3
"""Edictum Console — Try It

One command. No manual setup. See governance events in your dashboard in 60 seconds.

    pip install httpx edictum[server]
    python examples/try-it.py

With AI contract assistant (free model, no cost):
    python examples/try-it.py --openrouter-key sk-or-v1-...

Prerequisites: console running (docker compose up -d)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import urllib.error
import urllib.request

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DEFAULT_URL = "http://localhost:8000"
ADMIN_EMAIL = "demo@edictum.dev"
ADMIN_PASSWORD = "EdictumDemo2026!"  # meets 12-char minimum

CONTRACT_YAML = """\
apiVersion: edictum/v1
kind: ContractBundle

metadata:
  name: try-it
  description: "Quick demo — email safety, file access, and rate limits."

defaults:
  mode: enforce

tools:
  send_email:
    side_effect: irreversible
  read_file:
    side_effect: read
  search_web:
    side_effect: read
  get_weather:
    side_effect: pure

contracts:
  - id: no-external-email
    type: pre
    tool: send_email
    when:
      not:
        args.to:
          ends_with: "@company.com"
    then:
      effect: deny
      message: "Denied: can only email @company.com, not '{args.to}'"

  - id: no-sensitive-files
    type: pre
    tool: read_file
    when:
      args.path:
        contains_any: ["/etc/passwd", ".env", "secrets", "credentials"]
    then:
      effect: deny
      message: "Denied: sensitive file '{args.path}'"

  - id: weather-rate-limit
    type: session
    limits:
      max_calls_per_tool:
        get_weather: 3
    then:
      effect: deny
      message: "Rate limit: max 3 weather lookups per session"
"""

# Tool calls to simulate — mix of allows and denials
SCENARIOS = [
    ("get_weather", {"city": "Tokyo"}, "Sunny, 22C"),
    ("read_file", {"path": "/home/user/notes.txt"}, "Meeting notes from Monday..."),
    ("send_email", {"to": "alice@company.com", "subject": "Report", "body": "Q1 done"}, "Sent"),
    # These will be DENIED:
    ("read_file", {"path": "/etc/passwd"}, None),
    ("send_email", {"to": "leak@competitor.com", "subject": "Data", "body": "..."}, None),
    # More weather — will hit rate limit on 4th:
    ("get_weather", {"city": "London"}, "Cloudy, 14C"),
    ("get_weather", {"city": "Berlin"}, "Rainy, 8C"),
    ("get_weather", {"city": "Sydney"}, None),  # 4th call → denied
    # A few more normal calls:
    ("search_web", {"query": "edictum governance"}, "Edictum: runtime contracts for AI agents"),
    ("read_file", {"path": "/home/user/readme.md"}, "# Welcome to the project"),
]

# ---------------------------------------------------------------------------
# HTTP helpers (stdlib only — no httpx needed for setup)
# ---------------------------------------------------------------------------


class ConsoleClient:
    """Minimal HTTP client for console setup. Uses only stdlib."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.cookies: dict[str, str] = {}

    def _request(self, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
        url = f"{self.base_url}/api/v1{path}"
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("X-Requested-With", "try-it")
        if self.cookies:
            req.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in self.cookies.items()))
        try:
            with urllib.request.urlopen(req) as resp:
                # Capture set-cookie headers
                for header in resp.headers.get_all("Set-Cookie") or []:
                    name, _, rest = header.partition("=")
                    value = rest.split(";")[0]
                    self.cookies[name.strip()] = value.strip()
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body_bytes = e.read()
            try:
                return e.code, json.loads(body_bytes)
            except Exception:
                return e.code, {"detail": body_bytes.decode(errors="replace")}

    def get(self, path: str) -> tuple[int, dict]:
        return self._request("GET", path)

    def post(self, path: str, body: dict | None = None) -> tuple[int, dict]:
        return self._request("POST", path, body)

    def put(self, path: str, body: dict | None = None) -> tuple[int, dict]:
        return self._request("PUT", path, body)


# ---------------------------------------------------------------------------
# Setup steps
# ---------------------------------------------------------------------------


def check_health(client: ConsoleClient) -> bool:
    try:
        status, data = client.get("/health")
        return status == 200 and data.get("status") == "ok"
    except Exception:
        return False


def bootstrap(client: ConsoleClient) -> bool:
    """Create admin account. Returns True if created, False if already exists."""
    status, data = client.post(
        "/setup",
        {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        },
    )
    if status == 201:
        return True
    if status == 409:
        return False  # already bootstrapped
    print(f"  ERROR: Bootstrap failed: {status} {data}")
    sys.exit(1)


def login(client: ConsoleClient) -> None:
    status, _ = client.post(
        "/auth/login",
        {
            "email": ADMIN_EMAIL,
            "password": ADMIN_PASSWORD,
        },
    )
    if status != 200:
        print(f"  ERROR: Login failed ({status}). If you bootstrapped manually,")
        print("         edit ADMIN_EMAIL/ADMIN_PASSWORD in this script.")
        sys.exit(1)


def create_api_key(client: ConsoleClient) -> str:
    status, data = client.post("/keys", {"env": "production", "label": "try-it"})
    if status not in (200, 201):
        print(f"  ERROR: Key creation failed: {status} {data}")
        sys.exit(1)
    return data["key"]


def upload_and_deploy(client: ConsoleClient) -> int:
    status, data = client.post("/bundles", {"yaml_content": CONTRACT_YAML})
    if status not in (200, 201):
        print(f"  ERROR: Bundle upload failed: {status} {data}")
        sys.exit(1)
    version = data["version"]
    name = data["name"]
    status, data = client.post(f"/bundles/{name}/{version}/deploy", {"env": "production"})
    if status not in (200, 201):
        print(f"  ERROR: Deploy failed: {status} {data}")
        sys.exit(1)
    return version


def configure_openrouter(client: ConsoleClient, api_key: str) -> bool:
    status, data = client.put(
        "/settings/ai",
        {
            "provider": "openrouter",
            "api_key": api_key,
            "model": "google/gemma-3-1b-it:free",
        },
    )
    if status != 200:
        print(f"  ERROR: AI config failed: {status} {data}")
        return False

    # Test connection
    status, data = client.post("/settings/ai/test")
    if status == 200 and data.get("ok"):
        print(f"  AI connected: {data.get('model')} ({data.get('latency_ms')}ms)")
        return True
    else:
        print(f"  AI connection test failed: {data.get('error', 'unknown')}")
        return False


# ---------------------------------------------------------------------------
# Agent simulation
# ---------------------------------------------------------------------------


async def run_agent(url: str, api_key: str) -> None:
    try:
        from edictum import Edictum
    except ImportError:
        print("\n  edictum not installed. Install with:")
        print("    pip install edictum[server]")
        print("\n  Skipping agent simulation — but setup is complete.")
        print(f"  Dashboard: {url}/dashboard")
        return

    print(f"\n  Connecting agent to {url} ...")
    guard = await Edictum.from_server(
        url=url,
        api_key=api_key,
        agent_id="try-it-agent",
        bundle_name="try-it",
        env="production",
    )
    print(f"  Connected. Policy version: {guard.policy_version}")

    print(f"\n  Running {len(SCENARIOS)} tool calls...\n")

    for i, (tool_name, args, mock_result) in enumerate(SCENARIOS, 1):
        # Define a mock tool function that returns the pre-set result
        async def mock_tool(_result: str = mock_result, **_kw) -> str:
            return _result or "ok"

        try:
            await guard.run(tool_name, args, mock_tool)
            print(f"  [{i:2d}] ALLOW  {tool_name}({_fmt_args(args)})")
        except Exception as exc:
            exc_type = type(exc).__name__
            exc_msg = str(exc)
            # edictum raises ToolCallDenied or similar for governance denials
            if (
                "denied" in exc_type.lower()
                or "denied" in exc_msg.lower()
                or "denied" in exc_msg.lower()
                or "limit" in exc_msg.lower()
            ):
                print(f"  [{i:2d}] DENY   {tool_name}({_fmt_args(args)})")
                print(f"         -> {exc_msg[:80]}")
            else:
                print(f"  [{i:2d}] ERROR  {tool_name}({_fmt_args(args)}): {exc_msg[:80]}")

        await asyncio.sleep(0.3)

    # Flush audit events
    if hasattr(guard, "_audit_sink") and guard._audit_sink:
        await guard._audit_sink.flush()
    elif hasattr(guard, "close"):
        await guard.close()

    print(f"\n  Done. {len(SCENARIOS)} events sent to console.")


def _fmt_args(args: dict) -> str:
    parts = []
    for k, v in args.items():
        s = str(v)
        if len(s) > 30:
            s = s[:27] + "..."
        parts.append(f"{k}={s!r}")
    return ", ".join(parts)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Edictum Console — try it in 60 seconds",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Prerequisites: docker compose up -d",
    )
    parser.add_argument("--url", default=DEFAULT_URL, help="Console URL (default: %(default)s)")
    parser.add_argument(
        "--openrouter-key", help="OpenRouter API key for AI assistant (free model)"
    )
    args = parser.parse_args()

    url = args.url.rstrip("/")
    client = ConsoleClient(url)

    # Step 1: Health check
    print("1. Checking console...")
    if not check_health(client):
        print(f"   Console not reachable at {url}")
        print("   Start it first: docker compose up -d")
        sys.exit(1)
    print("   OK")

    # Step 2: Bootstrap
    print("2. Creating admin account...")
    created = bootstrap(client)
    if created:
        print(f"   Created: {ADMIN_EMAIL}")
    else:
        print(f"   Already exists — logging in as {ADMIN_EMAIL}")

    # Step 3: Login + API key
    print("3. Creating API key...")
    login(client)
    api_key = create_api_key(client)
    print(f"   Key: {api_key[:25]}...")

    # Step 4: Upload + deploy contract
    print("4. Deploying contracts...")
    version = upload_and_deploy(client)
    print(f"   Bundle 'try-it' v{version} deployed to production")

    # Step 5: Optional — configure AI assistant
    if args.openrouter_key:
        print("5. Configuring AI assistant (google/gemma-3-1b-it:free)...")
        configure_openrouter(client, args.openrouter_key)
    else:
        print("5. AI assistant — skipped (pass --openrouter-key to enable)")

    # Step 6: Run agent
    print("6. Running governed agent...")
    asyncio.run(run_agent(url, api_key))

    # Done
    print()
    print("=" * 60)
    print(f"  Open the dashboard: {url}/dashboard")
    print(f"  Email:    {ADMIN_EMAIL}")
    print(f"  Password: {ADMIN_PASSWORD}")
    print()
    if args.openrouter_key:
        print("  AI assistant is configured — try it in the Contracts page.")
    else:
        print("  Tip: re-run with --openrouter-key to test the AI assistant")
    print("=" * 60)


if __name__ == "__main__":
    main()
