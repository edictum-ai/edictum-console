#!/bin/sh
set -e

echo "Waiting for Postgres..."
retries=0
until python -c "import socket; s=socket.create_connection(('postgres', 5432), timeout=2); s.close()" 2>/dev/null; do
  retries=$((retries + 1))
  if [ "$retries" -ge 30 ]; then
    echo "Postgres not available after 30 attempts, exiting."
    exit 1
  fi
  echo "  Postgres not ready (attempt $retries/30), retrying in 1s..."
  sleep 1
done
echo "Postgres is ready."

echo "Running database migrations..."
alembic upgrade head

echo "Starting edictum-console..."
exec uvicorn edictum_server.main:app --host 0.0.0.0 --port 8000
