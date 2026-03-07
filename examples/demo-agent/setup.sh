#!/usr/bin/env bash
# Edictum Console — Quick Demo Setup
#
# This script:
#   1. Generates secrets and writes .env
#   2. Starts the console via docker compose
#   3. Creates an admin account via the setup wizard API
#   4. Creates an API key
#   5. Uploads and deploys the demo contract bundle
#
# Usage: ./setup.sh
#
# After running, open http://localhost:8000/dashboard and log in with
# the credentials shown at the end. Then run the demo agent.

set -euo pipefail
cd "$(dirname "$0")/../.."

# ── 1. Generate secrets and write .env ──────────────────────────

echo "Generating secrets..."
POSTGRES_PASSWORD=$(python3 -c "import secrets; print(secrets.token_hex(16))")
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
SIGNING_SECRET=$(python3 -c "import secrets; print(secrets.token_hex(32))")

cat > .env << EOF
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
EDICTUM_SECRET_KEY=${SECRET_KEY}
EDICTUM_SIGNING_KEY_SECRET=${SIGNING_SECRET}
EOF

echo "  .env written (3 secrets generated)"

# ── 2. Start the console ────────────────────────────────────────

echo ""
echo "Starting docker compose (postgres + redis + server)..."
docker compose up -d --build 2>&1 | tail -5

echo "Waiting for server to be ready..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:8000/api/v1/health > /dev/null 2>&1; then
        echo "  Server is up."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "  ERROR: Server did not start within 30s. Check: docker compose logs server"
        exit 1
    fi
    sleep 1
done

# ── 3. Create admin account ─────────────────────────────────────

ADMIN_EMAIL="admin@demo.test"
ADMIN_PASSWORD="DemoPassword2026"

echo ""
echo "Creating admin account..."
python3 -c "
import httpx, sys
r = httpx.post('http://localhost:8000/api/v1/setup',
    json={'email': '${ADMIN_EMAIL}', 'password': '${ADMIN_PASSWORD}'},
    headers={'X-Requested-With': 'setup'})
if r.status_code == 201:
    print('  Admin created.')
elif r.status_code == 409:
    print('  Admin already exists (server was already set up).')
else:
    print(f'  ERROR: {r.status_code} {r.text}', file=sys.stderr)
    sys.exit(1)
"

# ── 4. Log in and create API key ────────────────────────────────

echo ""
echo "Creating API key..."
API_KEY=$(python3 -c "
import httpx, json
with httpx.Client(base_url='http://localhost:8000/api/v1',
                  headers={'X-Requested-With': 'setup'}) as c:
    c.post('/auth/login', json={'email': '${ADMIN_EMAIL}', 'password': '${ADMIN_PASSWORD}'})
    r = c.post('/keys', json={'env': 'production', 'label': 'demo-agent'})
    print(r.json()['key'])
")
echo "  Key: ${API_KEY}"

# ── 5. Upload and deploy contract bundle ────────────────────────

echo ""
echo "Uploading and deploying demo contract bundle..."
python3 -c "
import httpx, pathlib
yaml = pathlib.Path('examples/demo-agent/contract.yaml').read_text()
with httpx.Client(base_url='http://localhost:8000/api/v1',
                  headers={'X-Requested-With': 'setup'}) as c:
    c.post('/auth/login', json={'email': '${ADMIN_EMAIL}', 'password': '${ADMIN_PASSWORD}'})
    r = c.post('/bundles', json={'yaml_content': yaml})
    v = r.json()['version']
    c.post(f'/bundles/demo-agent/{v}/deploy', json={'env': 'production'})
    print(f'  Bundle demo-agent v{v} deployed to production.')
"

# ── Done ────────────────────────────────────────────────────────

echo ""
echo "============================================================"
echo "  Edictum Console is ready!"
echo ""
echo "  Dashboard:  http://localhost:8000/dashboard"
echo "  Email:      ${ADMIN_EMAIL}"
echo "  Password:   ${ADMIN_PASSWORD}"
echo ""
echo "  API Key:    ${API_KEY}"
echo ""
echo "  Run the demo agent:"
echo ""
echo "    cd examples/demo-agent"
echo "    python3 -m venv .venv && source .venv/bin/activate"
echo "    pip install -r requirements.txt"
echo "    export EDICTUM_API_KEY=\"${API_KEY}\""
echo "    export OPENROUTER_API_KEY=\"sk-or-...\""
echo "    python demo_agent.py"
echo "============================================================"
