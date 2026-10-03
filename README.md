# Dataset Request Desk

Internal platform that replaces the spreadsheet for a robot-data company: clients request datasets, operators fulfil them by assigning recorded episodes, clients accept or reject the delivery. Operators can also import the (messy) episode CSV export and see analytics.

**Stack:** Python 3.13 · FastAPI · SQLAlchemy 2 · Alembic · PostgreSQL 16 · React + TypeScript (Vite) behind nginx · Docker Compose.
**Stretch items:** the one I chose is **real-time updates** (Server-Sent Events) for operators. I also built the **background export** job (§ below) and the **deployment tooling** (`deploy/`, `docs/DEPLOY.md`). The deployment is verified locally but **not published**: there is no public URL.
Design reasoning, trade-offs and what I would do next are in **[NOTES.md](NOTES.md)**.

## Run it (one command)

Requires Docker with Compose. From a clean clone:

```bash
make up          # or: docker compose up --build -d --wait
```

First build takes a couple of minutes. It starts Postgres, runs the migrations, seeds the users and the sample episodes, then starts the API and the web UI.

| What | Where |
|---|---|
| Web UI | http://localhost:8080 (set `WEB_PORT`, `API_PORT`, `DB_PORT` in `.env` if these ports are taken; see `.env.example`) |
| API docs (development only) | http://localhost:8000/api/docs |
| Health | http://localhost:8080/health |

Stop with `make down`; wipe all data with `make reset`. Without `make`, use the `docker compose` commands shown in the [Makefile](Makefile).

### Seed users (development only, passwords are weak by design)

| Role | Email | Password |
|---|---|---|
| admin | `admin@oreste.dev` | `admin123` |
| operator | `ops1@oreste.dev`, `ops2@oreste.dev` | `ops123` |
| client | `client-a@oreste.dev` (Acme Robotics) | `client123` |
| client | `client-b@oreste.dev` (Beta Labs) | `client123` |

Passwords are stored as Argon2id hashes. The seed refuses to run with `APP_ENV=production`.

### Try the workflow
1. Sign in as `client-a`, create a request (e.g. *pick cup*, 3 episodes).
2. Sign in as `ops1` (second browser/profile to see live updates): open the request, **Start work**, select episodes (filter by task/quality; `bad` ones cannot be selected), **Assign**, then **Mark delivered** (refused until 3 are assigned).
3. Back as `client-a`: **Accept** or **Reject** (rejected goes back to `in_progress` for rework).
4. As an operator, open **Import** and upload `seed/episodes.csv`: you get a per-row report. Upload it again: nothing is duplicated.

## Run the tests

```bash
make test        # whole suite inside Docker against a real Postgres: nothing to install
make test-local  # same tests with a local venv (needs Python 3.11+); also: make lint
```

214 tests against a **real PostgreSQL** (a separate `neotix_test` database, migrated with Alembic). They concentrate on what the brief names:

| Area | File | Examples |
|---|---|---|
| Authorization | `test_authz.py` | every route from the OpenAPI schema returns 401 without a session; role × endpoint matrix; client isolation (404); deactivation/role change effective immediately; admin cannot lock themselves out; login throttle; CSRF origin check |
| Status transitions | `test_transitions.py` | all 75 `from × to × role` combinations against an independently written table; delivery gate; full rework path; audit trail with actors |
| Assignment rules | `test_assignments.py` | quality, all-or-nothing batches, one request per episode, lock after delivery, **two-thread race** on the same episode, deliver-vs-unassign race |
| Import | `test_csv_rules.py`, `test_import.py` | one test per messy case, exact counts on the real export, **idempotency** (run 3×), never overwrites an assigned episode, BOM/CRLF/quoted fields, chunking, hostile files |
| Analytics | `test_analytics.py` | hand-computed per-day/robot counts, odd/even/empty medians, top-5 tie-break, range boundaries |
| Operability | `test_operability.py`, `test_seed.py`, `test_events.py` | `/health` up/down, one JSON log line per request with user id, error envelope, seed idempotency, SSE |

CI (`.github/workflows/ci.yml`): backend lint + tests with a Postgres service, frontend build, and a `docker compose up` smoke test. Green on GitHub Actions.

## Stretch items

| Item | Status | Where |
|---|---|---|
| Real-time (SSE) | Done (the one I picked) | `app/events.py`, `GET /api/events`, header shows "● Live"; `tests/test_events.py` |
| Background work | Done (extra) | On assignment each episode gets an export job (sleep 2-5 s, fails 20%). Postgres-backed queue (`FOR UPDATE SKIP LOCKED`), idempotent enqueue (PK = episode id), leases so a dead worker's job is taken over, completion fenced by attempt number, up to 5 attempts with backoff, manual "Retry failed exports", per-episode status in the operator UI (live). `app/services/exports.py`, `app/worker.py`, `tests/test_exports.py` |
| Deployment | Tooling done and verified locally; **not deployed publicly** | `deploy/docker-compose.prod.yml` (Caddy automatic HTTPS, only 80/443 exposed, no demo users), `python -m app.cli create-admin`, secrets and DB management in [docs/DEPLOY.md](docs/DEPLOY.md) |

## Architecture

```
Browser ─► nginx :8080 ──► static React build
              │ /api/*, /health  (same origin: no CORS, cookie never crosses sites)
              ▼
           FastAPI ── routers   (HTTP shape + authorization dependencies)
              │         └─ services (all domain rules, one transaction per action)
              │              └─ csv_rules: pure row validation, no DB
              ▼
          PostgreSQL ◄── Alembic (runs on API start) · seed step (idempotent)
```

Layout:

```
backend/app/{routers,services,models.py,schemas.py,deps.py,events.py,cli.py}   backend/migrations/   backend/tests/
frontend/src/    seed/ (provided data)    docs/ (requirements, research, plan, devlog, evidence)
```

### API summary (`/api`, JSON; errors are `{"error": {"code", "message", "details?"}}`)

| Endpoint | Who |
|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | public / any user |
| `GET, POST /users`, `PATCH /users/{id}` | admin |
| `POST /requests` | client |
| `GET /requests`, `GET /requests/{id}` | client (own only) · operator · admin |
| `POST /requests/{id}/transitions` `{"to": …}` | role per transition |
| `POST /requests/{id}/assignments`, `DELETE /requests/{id}/assignments/{episode_id}` | operator · admin |
| `GET /episodes` (filters, pagination), `GET /episodes/task-names` | operator · admin |
| `POST /imports` (multipart CSV), `GET /imports[/{id}]` | operator · admin |
| `GET /analytics?from=YYYY-MM-DD&to=YYYY-MM-DD` | operator · admin |
| `GET /events` (SSE) | operator · admin |
| `POST /requests/{id}/exports/retry` | operator · admin |
| `GET /health` (outside `/api`) | public |

CLI inside the API container: `python -m app.cli import-episodes FILE`, `seed`, `create-admin`.

## Key decisions (details and trade-offs in NOTES.md)
- **PostgreSQL only.** The median is `percentile_cont` in SQL, the import uses `ON CONFLICT`, assignment races use row locks. SQLite cannot do these, so there is no "what changes in production" caveat.
- **Rules in two layers:** the database enforces the invariants (one request per episode is the primary key of `assignments`; CHECK constraints), services enforce the workflow and give good errors.
- **Import never overwrites existing episodes**, so re-importing is safe and an assigned episode can never silently change quality. Every skipped row is reported with a reason.
- **Server-side sessions in an HttpOnly cookie**, not JWT: instant revocation, SSE-friendly.
- **Analytics are three SQL statements.** Evidence at 200k rows is in `docs/evidence/`.

### Analytics with 5 million episodes
*Per-day/per-robot counts* and *top-5 tasks* read only episodes in the requested range. Measured at 200k rows: one month 14 ms (index scan), full year 143 ms, top-5 25 ms; cost grows roughly linearly with rows in range, so a full-range query at 5M would be on the order of 3 s and a month-range query stays in the tens of milliseconds. To keep dashboards fast I would add a BRIN index on `recorded_at`, monthly partitions, and a daily rollup table. *Request fulfilment and the median* read the `requests` table (business volume, not recording volume) through an indexed date filter, so 5M episodes do not affect them.

Import throughput: 200,000 rows in ~17 s on a laptop; the same file again (all unchanged) ~15 s. Reports are in `docs/evidence/`.

## Assumptions
The full list is in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) §5 and summarised in NOTES.md §1. The ones most worth knowing: assignment is allowed only while a request is `submitted`/`in_progress`; an episode's task does not have to match the request's; CSV dates like `14/08/2026` are day-first and zone-less timestamps are UTC; blank `operator_name` imports with a warning but other blank fields are rejected.

## What I'd do with more time
Playwright end-to-end tests; a correct-an-episode flow with audit trail; background import with progress; keyset pagination and a rollup table; real deployment with managed secrets; password reset. Full list in NOTES.md §2.

## Time spent
About 9 hours of working time including the two extra stretch items: requirements analysis, research, implementation, tests, performance measurement and documentation (estimate).
