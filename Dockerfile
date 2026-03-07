# -- Stage 1: Frontend build ---------------------------------------------------
FROM node:24-slim AS frontend

WORKDIR /app/dashboard

COPY dashboard/package.json dashboard/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

COPY dashboard/ .
RUN pnpm build

# -- Stage 2: Python build -----------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /app

COPY pyproject.toml ./
COPY src/ src/

RUN pip install --no-cache-dir build \
    && python -m build --wheel --outdir /app/dist

# -- Stage 3: Runtime ----------------------------------------------------------
FROM python:3.12-slim

# Prevent Python from writing .pyc files and enable unbuffered stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install tini for proper PID 1 signal handling
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and group
RUN addgroup --system app && adduser --system --ingroup app app

# Install Python dependencies as root, then lock down
COPY --from=builder /app/dist/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/edictum_console-*.whl"[ai]" \
    && rm -rf /tmp/*.whl

# Copy application files
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app alembic/ alembic/
COPY --chown=app:app docker-entrypoint.sh ./
COPY --chown=app:app --from=frontend /app/dashboard/dist static/dashboard/

# Ensure entrypoint is executable
RUN chmod +x docker-entrypoint.sh

# Drop to non-root user
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')"]

ENTRYPOINT ["tini", "--"]
CMD ["./docker-entrypoint.sh"]
