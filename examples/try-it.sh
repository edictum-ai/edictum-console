#!/usr/bin/env bash
# Edictum Console — Try It
#
# One command. See real contract enforcement in your dashboard.
#
#   ./examples/try-it.sh
#
# With AI contract assistant (free model, no cost):
#   ./examples/try-it.sh --openrouter-key sk-or-v1-...
#
# Prerequisites: docker compose up -d

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────

URL="${EDICTUM_URL:-http://localhost:8000}"
API="$URL/api/v1"
EMAIL="demo@edictum.dev"
PASSWORD="EdictumDemo2026!"
OPENROUTER_KEY=""
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

# Parse args
while [[ $# -gt 0 ]]; do
    case $1 in
        --openrouter-key) OPENROUTER_KEY="$2"; shift 2 ;;
        --url) URL="$2"; API="$URL/api/v1"; shift 2 ;;
        *) echo "Usage: $0 [--openrouter-key KEY] [--url URL]"; exit 1 ;;
    esac
done

# ── Helpers ───────────────────────────────────────────────────────────────

api_post() {
    curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
        -H "Content-Type: application/json" \
        -H "X-Requested-With: try-it" \
        -X POST "$API$1" -d "$2"
}

api_put() {
    curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
        -H "Content-Type: application/json" \
        -H "X-Requested-With: try-it" \
        -X PUT "$API$1" -d "$2"
}

# ── 1. Health check ──────────────────────────────────────────────────────

echo "1. Checking console..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API/health" 2>/dev/null || true)
if [ "$STATUS" != "200" ]; then
    echo "   Console not reachable at $URL"
    echo "   Start it first: docker compose up -d"
    exit 1
fi
echo "   OK"

# ── 2. Bootstrap admin ──────────────────────────────────────────────────

echo "2. Creating admin account..."
RESULT=$(api_post "/setup" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}")
if echo "$RESULT" | grep -q '"message"'; then
    echo "   Created: $EMAIL"
else
    echo "   Already exists — logging in as $EMAIL"
fi

# ── 3. Login + create API key ───────────────────────────────────────────

echo "3. Creating API key..."
api_post "/auth/login" "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" > /dev/null

KEY_RESULT=$(api_post "/keys" '{"env":"production","label":"try-it"}')
API_KEY=$(echo "$KEY_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])" 2>/dev/null || echo "")

if [ -z "$API_KEY" ]; then
    echo "   ERROR: Could not create API key"
    echo "   $KEY_RESULT"
    exit 1
fi
echo "   Key: ${API_KEY:0:25}..."

# ── 4. Upload + deploy contracts ────────────────────────────────────────

echo "4. Deploying contracts..."

CONTRACT_YAML=$(cat <<'YAML'
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
YAML
)

YAML_JSON=$(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$CONTRACT_YAML")
UPLOAD_RESULT=$(api_post "/bundles" "{\"yaml_content\":$YAML_JSON}")
VERSION=$(echo "$UPLOAD_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "")

if [ -z "$VERSION" ]; then
    echo "   ERROR: Upload failed"
    echo "   $UPLOAD_RESULT"
    exit 1
fi

api_post "/bundles/try-it/$VERSION/deploy" '{"env":"production"}' > /dev/null
echo "   Bundle 'try-it' v$VERSION deployed to production"

# ── 5. AI assistant (optional) ──────────────────────────────────────────

if [ -n "$OPENROUTER_KEY" ]; then
    echo "5. Configuring AI assistant (google/gemma-3-1b-it:free)..."
    api_put "/settings/ai" "{\"provider\":\"openrouter\",\"api_key\":\"$OPENROUTER_KEY\",\"model\":\"google/gemma-3-1b-it:free\"}" > /dev/null
    TEST_RESULT=$(api_post "/settings/ai/test" "{}")
    AI_OK=$(echo "$TEST_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'AI connected: {d.get(\"model\")} ({d.get(\"latency_ms\")}ms)' if d.get('ok') else f'Failed: {d.get(\"error\",\"unknown\")}')" 2>/dev/null)
    echo "   $AI_OK"
else
    echo "5. AI assistant — skipped (pass --openrouter-key to enable)"
fi

# ── 6. Install edictum + run governed agent ─────────────────────────────

echo "6. Installing edictum..."

# Find Python 3.12+ (edictum requires it)
PYTHON=""
for py in python3.14 python3.13 python3.12 python3; do
    if command -v "$py" &>/dev/null; then
        PY_VER=$("$py" -c "import sys; print(sys.version_info[:2] >= (3,12))" 2>/dev/null || echo "False")
        if [ "$PY_VER" = "True" ]; then
            PYTHON="$py"
            break
        fi
    fi
done

if [ -z "$PYTHON" ]; then
    echo "   ERROR: Python 3.12+ required (edictum needs it)"
    echo "   Install via: brew install python@3.12"
    exit 1
fi

# Use existing venv, otherwise create a temporary one
if [ -z "${VIRTUAL_ENV:-}" ]; then
    VENV_DIR=$(mktemp -d)/edictum-tryit
    "$PYTHON" -m venv "$VENV_DIR"
    PYTHON="$VENV_DIR/bin/python3"
    echo "   Created temporary venv ($("$PYTHON" --version))"
else
    echo "   Using active venv"
fi

"$PYTHON" -m pip install --upgrade pip --quiet 2>/dev/null || true
"$PYTHON" -m pip install "edictum[server,yaml]" 2>&1 | grep -E "^(Installing|Successfully|Requirement)" || true
echo "   OK"

echo "7. Running governed agent..."
echo ""

"$PYTHON" - "$URL" "$API_KEY" <<'PYTHON'
import asyncio
import sys

from edictum import Edictum

URL = sys.argv[1]
API_KEY = sys.argv[2]

SCENARIOS = [
    ("get_weather",  {"city": "Tokyo"},                                          "Sunny, 22C"),
    ("read_file",    {"path": "/home/user/notes.txt"},                           "Meeting notes from Monday..."),
    ("send_email",   {"to": "alice@company.com", "subject": "Report", "body": "Q1 done"}, "Sent"),
    ("read_file",    {"path": "/etc/passwd"},                                    None),
    ("send_email",   {"to": "leak@competitor.com", "subject": "Data", "body": "..."}, None),
    ("get_weather",  {"city": "London"},                                         "Cloudy, 14C"),
    ("get_weather",  {"city": "Berlin"},                                         "Rainy, 8C"),
    ("get_weather",  {"city": "Sydney"},                                         None),
    ("search_web",   {"query": "edictum governance"},                            "Edictum: runtime contracts for AI agents"),
    ("read_file",    {"path": "/home/user/readme.md"},                           "# Welcome to the project"),
]


def fmt(args):
    return ", ".join(f"{k}='{v}'" if len(str(v)) < 30 else f"{k}='...'" for k, v in args.items())


async def main():
    guard = await Edictum.from_server(
        url=URL, api_key=API_KEY, agent_id="try-it-agent",
        bundle_name="try-it", env="production",
    )
    print(f"  Connected. Policy: {guard.policy_version[:16]}...")
    print(f"  Running {len(SCENARIOS)} tool calls...\n")

    for i, (tool, args, mock_result) in enumerate(SCENARIOS, 1):
        async def tool_fn(_r=mock_result, **_kw):
            return _r or "ok"

        try:
            await guard.run(tool, args, tool_fn)
            print(f"  [{i:2d}] ALLOW  {tool}({fmt(args)})")
        except Exception as exc:
            print(f"  [{i:2d}] DENY   {tool}({fmt(args)})")
            print(f"         -> {str(exc)[:80]}")

        await asyncio.sleep(0.3)

    if hasattr(guard, "close"):
        await guard.close()
    print(f"\n  Done. {len(SCENARIOS)} events sent to console.")


asyncio.run(main())
PYTHON

# ── Done ────────────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  Open the dashboard: $URL/dashboard"
echo "  Email:    $EMAIL"
echo "  Password: $PASSWORD"
echo ""
if [ -n "$OPENROUTER_KEY" ]; then
    echo "  AI assistant is configured — try it in the Contracts page."
else
    echo "  Tip: re-run with --openrouter-key to test the AI assistant"
fi
echo "============================================================"
