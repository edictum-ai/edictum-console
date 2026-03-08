#!/bin/sh
set -e

# Ensure postgresql+asyncpg:// driver prefix — Railway provides postgresql:// format
if [ -n "$EDICTUM_DATABASE_URL" ]; then
  export EDICTUM_DATABASE_URL=$(echo "$EDICTUM_DATABASE_URL" | sed 's|^postgresql://|postgresql+asyncpg://|;s|^postgres://|postgresql+asyncpg://|')
elif [ -n "$DATABASE_URL" ]; then
  export EDICTUM_DATABASE_URL=$(echo "$DATABASE_URL" | sed 's|^postgresql://|postgresql+asyncpg://|;s|^postgres://|postgresql+asyncpg://|')
fi

# Railway injects REDIS_URL — map to our var if needed
if [ -z "$EDICTUM_REDIS_URL" ] && [ -n "$REDIS_URL" ]; then
  export EDICTUM_REDIS_URL="$REDIS_URL"
fi

echo "Running database migrations..."
# One-time migration consolidation: if DB has old revision IDs (002-007),
# stamp to the new consolidated 001 before running upgrade.
CURRENT_REV=$(alembic current 2>/dev/null | grep -oE '[0-9]+' | head -1 || true)
if [ -n "$CURRENT_REV" ] && [ "$CURRENT_REV" != "001" ]; then
  echo "Stamping DB from old revision $CURRENT_REV to consolidated 001..."
  alembic stamp --purge 001
fi
alembic upgrade head

echo "Starting edictum-console..."
exec uvicorn edictum_server.main:app --host 0.0.0.0 --port "${PORT:-8000}"
