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
# Advisory lock (id=43) prevents concurrent migration runs across instances.
# The Python process holds the DB connection open while alembic runs,
# so the lock is held for the full duration.  Other instances block here
# until the first one finishes and releases the lock.
python3 -c "
import os, subprocess, sys
import sqlalchemy
url = os.environ.get('EDICTUM_DATABASE_URL', '').replace('+asyncpg', '')
if not url:
    print('No EDICTUM_DATABASE_URL — running alembic without lock')
    sys.exit(subprocess.run(['alembic', 'upgrade', 'head']).returncode)
engine = sqlalchemy.create_engine(url)
with engine.connect() as conn:
    conn.execute(sqlalchemy.text('SELECT pg_advisory_lock(43)'))
    conn.commit()
    print('Migration lock acquired')
    rc = subprocess.run(['alembic', 'upgrade', 'head']).returncode
    conn.execute(sqlalchemy.text('SELECT pg_advisory_unlock(43)'))
    conn.commit()
    print('Migration lock released')
engine.dispose()
sys.exit(rc)
"

echo "Starting edictum-console..."
exec uvicorn edictum_server.main:app --host 0.0.0.0 --port "${PORT:-8000}"
