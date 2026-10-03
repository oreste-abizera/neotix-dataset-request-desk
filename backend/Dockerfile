# Build context is the repository root (see docker-compose.yml) so seed/ can be copied in.
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/alembic.ini .
COPY backend/migrations ./migrations
COPY backend/app ./app
COPY seed /seed
ENV SEED_DIR=/seed


# `docker compose run --rm tests`: the whole test-suite inside the same image, no local Python needed.
FROM base AS test
COPY backend/requirements-dev.txt .
RUN pip install --no-cache-dir -r requirements-dev.txt
COPY backend/pyproject.toml .
COPY backend/tests ./tests
CMD ["pytest"]


FROM base AS runtime
RUN useradd --system --no-create-home appuser
USER appuser
EXPOSE 8000
# Migrate, seed (idempotent), then serve.
CMD ["sh", "-c", "alembic upgrade head && python -m app.cli seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
