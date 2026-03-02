#!/bin/sh
set -e

# Railway injects DATABASE_URL as postgresql:// — translate to asyncpg driver if needed
if [ -z "$EDICTUM_DATABASE_URL" ] && [ -n "$DATABASE_URL" ]; then
  export EDICTUM_DATABASE_URL=$(echo "$DATABASE_URL" | sed 's|^postgresql://|postgresql+asyncpg://|;s|^postgres://|postgresql+asyncpg://|')
fi

# Railway injects REDIS_URL — map to our var if needed
if [ -z "$EDICTUM_REDIS_URL" ] && [ -n "$REDIS_URL" ]; then
  export EDICTUM_REDIS_URL="$REDIS_URL"
fi

echo "Running database migrations..."
alembic upgrade head

echo "Starting edictum-console..."
exec uvicorn edictum_server.main:app --host 0.0.0.0 --port "${PORT:-8000}"
