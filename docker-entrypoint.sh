#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting edictum-console..."
exec uvicorn edictum_server.main:app --host 0.0.0.0 --port 8000
