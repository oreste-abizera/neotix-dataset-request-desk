# Build context is the repository root (see docker-compose.yml) so seed/ can be copied in.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /srv

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/alembic.ini .
COPY backend/migrations ./migrations
COPY backend/app ./app
COPY seed /seed

RUN useradd --system --no-create-home appuser
USER appuser

ENV SEED_DIR=/seed
EXPOSE 8000
# Migrate, seed (idempotent), then serve.
CMD ["sh", "-c", "alembic upgrade head && python -m app.cli seed && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
