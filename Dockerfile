# -- Stage 1: Frontend build ---------------------------------------------------
FROM node:24-slim AS frontend
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY dashboard/ .
RUN pnpm build

# -- Stage 2: Python build -------------------------------------------------------
FROM python:3.12-slim AS builder

WORKDIR /app

COPY pyproject.toml ./
COPY src/ src/

RUN pip install --no-cache-dir build \
    && python -m build --wheel --outdir /app/dist

# -- Stage 3: Runtime ------------------------------------------------------------
FROM python:3.12-slim

WORKDIR /app

RUN addgroup --system app && adduser --system --ingroup app app

COPY --from=builder /app/dist/*.whl /tmp/
RUN pip install --no-cache-dir "/tmp/edictum_console-0.1.0-py3-none-any.whl[ai]" && rm /tmp/*.whl

COPY alembic.ini ./
COPY alembic/ alembic/
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh

COPY --from=frontend /app/dashboard/dist static/dashboard/

USER app

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
