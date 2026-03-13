#!/usr/bin/env bash
# Edictum Console — Try It
#
# One command. No dependencies. See governance events in your dashboard.
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

api_get() {
    curl -s -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
        -H "X-Requested-With: try-it" \
        "$API$1"
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
CODE=$(echo "$RESULT" | grep -o '"message"' || true)
CONFLICT=$(echo "$RESULT" | grep -o '"Server is already' || true)

if [ -n "$CODE" ]; then
    echo "   Created: $EMAIL"
elif [ -n "$CONFLICT" ]; then
    echo "   Already exists — logging in as $EMAIL"
else
    echo "   Already set up — logging in as $EMAIL"
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

# Escape YAML for JSON
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

# ── 6. Send governance events ───────────────────────────────────────────

echo "6. Sending governance events..."
echo ""

# Simulate tool calls by posting events directly to the console API.
# In production, the edictum library does this automatically inside your agent.

post_event() {
    local tool="$1" verdict="$2" reason="$3" args_json="$4" mode="${5:-enforce}"
    local call_id
    call_id="try-it-$(date +%s%N)-$RANDOM"

    curl -s -X POST "$API/events" \
        -H "Authorization: Bearer $API_KEY" \
        -H "X-Edictum-Agent-Id: try-it-agent" \
        -H "Content-Type: application/json" \
        -d "{\"events\":[{
            \"call_id\":\"$call_id\",
            \"agent_id\":\"try-it-agent\",
            \"tool_name\":\"$tool\",
            \"verdict\":\"$verdict\",
            \"mode\":\"$mode\",
            \"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
            \"payload\":{\"args\":$args_json,\"reason\":\"$reason\",\"contract\":\"try-it\"}
        }]}" > /dev/null
}

print_event() {
    local num="$1" verdict="$2" tool="$3" args_desc="$4" reason="$5"
    if [ "$verdict" = "allow" ]; then
        printf "  [%2d] ALLOW  %s(%s)\n" "$num" "$tool" "$args_desc"
    else
        printf "  [%2d] DENY   %s(%s)\n" "$num" "$tool" "$args_desc"
        printf "         -> %s\n" "$reason"
    fi
}

# 10 tool calls — 7 allows, 3 denials

print_event 1 allow get_weather "city='Tokyo'" ""
post_event "get_weather" "allow" "" '{"city":"Tokyo"}'

print_event 2 allow read_file "path='/home/user/notes.txt'" ""
post_event "read_file" "allow" "" '{"path":"/home/user/notes.txt"}'

print_event 3 allow send_email "to='alice@company.com', subject='Report'" ""
post_event "send_email" "allow" "" '{"to":"alice@company.com","subject":"Report"}'

print_event 4 deny read_file "path='/etc/passwd'" "Denied: sensitive file '/etc/passwd'"
post_event "read_file" "deny" "Denied: sensitive file '/etc/passwd'" '{"path":"/etc/passwd"}'

print_event 5 deny send_email "to='leak@competitor.com', subject='Data'" "Denied: can only email @company.com"
post_event "send_email" "deny" "Denied: can only email @company.com" '{"to":"leak@competitor.com","subject":"Data"}'

print_event 6 allow get_weather "city='London'" ""
post_event "get_weather" "allow" "" '{"city":"London"}'

print_event 7 allow get_weather "city='Berlin'" ""
post_event "get_weather" "allow" "" '{"city":"Berlin"}'

print_event 8 deny get_weather "city='Sydney'" "Rate limit: max 3 weather lookups per session"
post_event "get_weather" "deny" "Rate limit: max 3 weather lookups per session" '{"city":"Sydney"}'

print_event 9 allow search_web "query='edictum governance'" ""
post_event "search_web" "allow" "" '{"query":"edictum governance"}'

print_event 10 allow read_file "path='/home/user/readme.md'" ""
post_event "read_file" "allow" "" '{"path":"/home/user/readme.md"}'

echo ""
echo "  Done. 10 events sent to console."

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
