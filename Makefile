.DEFAULT_GOAL := help
COMPOSE ?= docker compose
PY      := backend/.venv/bin

help:            ## list targets
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-12s %s\n", $$1, $$2}'

up:              ## build and start everything (db, migrations, seed, api, web) -> http://localhost:8080
	$(COMPOSE) up --build -d --wait
	@echo "\nReady: http://localhost:8080  (API docs: http://localhost:8000/api/docs)"

down:            ## stop the stack (keeps data)
	$(COMPOSE) down

reset:           ## stop the stack and DELETE all data
	$(COMPOSE) down -v

logs:            ## follow API logs (JSON, one line per request)
	$(COMPOSE) logs -f api

venv:            ## create backend/.venv with dev dependencies
	python3 -m venv backend/.venv
	$(PY)/pip install -q -r backend/requirements-dev.txt

test:            ## run the backend test-suite against a real Postgres (starts the db container)
	$(COMPOSE) up -d --wait db
	cd backend && ../$(PY)/python -m pytest

lint:            ## ruff lint + format check, and frontend type-check
	cd backend && ../$(PY)/ruff check . && ../$(PY)/ruff format --check .
	cd frontend && npm ci --no-audit --no-fund --silent && npm run --silent typecheck

fmt:             ## auto-format backend
	cd backend && ../$(PY)/ruff format . && ../$(PY)/ruff check . --fix

seed-large:      ## generate and import 200,000 clean episodes (performance demo)
	python3 seed/generate_episodes.py 200000 > seed/episodes_large.csv
	$(COMPOSE) exec -T api sh -c 'cat > /tmp/large.csv' < seed/episodes_large.csv
	$(COMPOSE) exec api python -m app.cli import-episodes /tmp/large.csv | head -12

.PHONY: help up down reset logs venv test lint fmt seed-large
