#!/bin/bash
set -e

echo "=== Edictum Console — Security Audit ==="
echo "Started: $(date)"

cd /workspace

# Fresh clone
git clone https://github.com/acartag7/edictum-console.git
cd edictum-console
mkdir -p audits/results

# Python env
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]" --quiet
pip install pip-audit pip-licenses --quiet

# Frontend deps
cd dashboard && pnpm install --frozen-lockfile --silent
cd ..

echo ""
echo "=== Setup complete. All tools ready. ==="
echo "=== Now follow AUDIT-MASTER.md ==="
echo ""
echo "Audit files:"
ls audits/AUDIT-*.md
echo ""
echo "Results will be saved to: audits/results/"
