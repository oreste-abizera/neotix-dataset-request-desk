# Research notes

Scope: only what changes the implementation. Versions checked against PyPI on 2026-10-03; API behaviour checked against current docs, not memory.

## 1. Toolchain available on this machine
Python 3.13.3, Docker 29.3.1 + Compose v5.1.1, Node 22.23, npm 10.9, local PostgreSQL 14 client (`psql`). No `uv`. -> Use plain `pip` + `requirements*.txt` with exact pins (no extra tool for reviewers to install); run everything through Docker.

## 2. Current package versions (PyPI, 2026-10-03)

| Package | Version | Note |
|---|---|---|
| fastapi | 0.142.2 | py>=3.10 |
| uvicorn | 0.54.0 | |
| sqlalchemy | 2.1.3 | **py>=3.11**, so the image must be >=3.11 (use `python:3.13-slim`) |
| alembic | 1.20.0 | |
| psycopg (v3) | 3.3.6 | SQLAlchemy URL prefix `postgresql+psycopg` ([SQLAlchemy PG dialect docs](https://docs.sqlalchemy.org/en/21/dialects/postgresql.html)) |
| pydantic / pydantic-settings | 2.13.5 / 2.15.0 | |
| pwdlib (argon2) | 0.3.1 | what FastAPI's own docs now recommend, see §4 |
| python-multipart | 0.0.32 | CSV upload |
| pytest / httpx | 9.1.1 / 0.28.1 | TestClient |
| ruff | 0.16.10 | lint + format, single tool |

I will re-check exact pins at install time with `pip install` / `pip freeze` and pin what actually resolves and passes tests.

## 3. Database features the brief leans on (verified)

- **Median in-DB:** `percentile_cont(0.5) WITHIN GROUP (ORDER BY <double precision | interval>)`; ignores NULLs; interpolates between middle values ([PG aggregate docs](https://www.postgresql.org/docs/current/functions-aggregate.html)). Use it on `EXTRACT(EPOCH FROM delivered_at - submitted_at)` so the API returns plain seconds. SQLite has no equivalent -> **PostgreSQL is the right choice**, not just "preferred".
- **Idempotent import:** `INSERT ... ON CONFLICT (episode_id) DO NOTHING RETURNING episode_id` returns *only newly inserted* rows ([PG INSERT docs](https://www.postgresql.org/docs/current/sql-insert.html)). Rows missing from RETURNING = already existed; I then compare against the stored row to classify `unchanged` vs `conflict_with_existing`. SQLAlchemy exposes it as `postgresql.insert(...).on_conflict_do_nothing(index_elements=[...])` ([SQLAlchemy docs](https://docs.sqlalchemy.org/en/21/dialects/postgresql.html)).
- **Assignment races:** `SELECT ... FOR UPDATE` on the parent `requests` row holds an exclusive row lock to commit and serializes concurrent writers ([PG explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)). Plan: lock the request row for assign, unassign and the `delivered` transition, so the "count >= requested" check can't race an unassign. Independently, `UNIQUE(episode_id)` on `assignments` makes "one request at a time" a DB invariant: two operators racing for the same episode -> exactly one succeeds, the other gets an IntegrityError mapped to 409.
- **Scale discussion (5M episodes):** per-day/per-robot counts and top-5 tasks are index-friendly aggregates over `recorded_at`. Sources agree the standard ladder is: B-tree/composite index first, then BRIN for append-mostly time columns, then partitioning, then precomputed rollups/materialised views for repeated dashboards ([BRIN overview](https://medium.com/@jramcloud1/22-postgresql-17-performance-tuning-brin-block-range-index-e0a57a2f4645), [materialised views](https://stormatics.tech/blogs/postgresql-materialized-views-when-caching-your-query-results-makes-sense-and-when-it-doesnt), [aggregate tuning](https://mydba.dev/blog/postgres-aggregate-window-tuning)). Ordered-set aggregates like `percentile_cont` must sort each group, which is expensive on big inputs. **Key insight for the write-up:** my median runs over *requests*, not episodes (small, grows with business volume, not recording volume), so it stays cheap at 5M episodes; only the two episode aggregates scale. I'll prove this with `EXPLAIN (ANALYZE)` on a 200k-row load and extrapolate honestly.

## 4. Auth: what the docs recommend vs. what fits this app

- FastAPI's current security tutorial recommends **`pwdlib` with Argon2** (`PasswordHash.recommended()`) and PyJWT ([FastAPI OAuth2/JWT](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)).
- JWT is *not* required by the brief. Trade-off I considered:
  - **JWT bearer:** stateless, but deactivating a user / changing a role would not take effect until expiry unless I add a DB check anyway (which cancels the benefit), and SSE (`EventSource`) cannot send an `Authorization` header.
  - **Opaque server-side session in an `HttpOnly; SameSite=Lax` cookie** (random 256-bit token, only its SHA-256 stored): revocation/deactivation is immediate, logout is real, JS can't read the token (XSS can't exfiltrate it), and `EventSource` works for the real-time stretch. Cost: one indexed lookup per request (I already load the user for RBAC) and CSRF must be handled.
- CSRF handling: `SameSite=Lax`, JSON/multipart-only endpoints, plus an `Origin`-header check on unsafe methods; UI and API are same-origin behind the nginx proxy so no CORS is needed at all.
- **Decision implied:** sessions-in-cookie, argon2 via pwdlib, no JWT dependency. (Recorded in REQUIREMENTS A15.)

## 5. Sync vs async stack
FastAPI works with plain `def` endpoints (run in a threadpool) and sync SQLAlchemy sessions. Async SQLAlchemy adds greenlet/lazy-load pitfalls and makes tests and live-coding harder, with no benefit for an internal tool. **Decision:** sync SQLAlchemy 2.x + psycopg3, `def` endpoints, a per-request session dependency. SSE (if built) is the one place needing `async`, kept isolated.

## 6. Test strategy implications
- Tests must hit **real PostgreSQL**: `percentile_cont`, `ON CONFLICT`, `FOR UPDATE`, partial/unique constraints can't be faked by SQLite.
- Approach: the compose `db` service plus a separate `neotix_test` database; `make test` starts the db, runs migrations (Alembic) once per session on the test DB, wraps each test in a rolled-back transaction or truncates between tests. CI uses a GitHub Actions Postgres service container. (Considered `testcontainers` 4.15.0: nicer isolation but one more dependency and slower on reviewers' machines; rejected.)
- A genuine concurrency test (two threads, two sessions assigning the same episode) is high-signal and cheap with this setup.

## 7. What makes take-home submissions stand out (synthesis)
Sources: [Make your take-home stand out](https://eliya-b.medium.com/make-your-take-home-coding-assignment-stand-out-477f6f1efa81), [Crack the Take-Home](https://maxim-gorin.medium.com/crack-the-take-home-how-to-ace-technical-test-assignments-d6f9771b687b), [Take-home guide 2026: scope, tests, submission](https://prachub.com/resources/software-engineer-take-home-assignment-guide-2026-scope-tests-and-submission). Common points:
- Reviewers assume you can build CRUD; they grade **judgment, verification and communication**: edge cases, trade-offs, defendable decisions.
- README = runnable on a clean machine with exact commands, trade-offs, next steps. Comments/notes should explain *why*.
- Commits: separate implementation+tests from docs/evidence; incremental history.
- Meet every must-have before polish; be honest about gaps.

(These are secondary blog sources; they agree with the brief's own section 8, which is the authoritative rubric.)

## 8. Decisions this implies

| # | Decision | Why |
|---|---|---|
| D1 | PostgreSQL 16 (`postgres:16-alpine`; the 17 image pull stalled, and 16 has every feature used), no SQLite path | `percentile_cont`, `ON CONFLICT`, row locks; avoids a "what would change in prod" caveat |
| D2 | FastAPI + sync SQLAlchemy 2.1 + psycopg3 + Alembic; Pydantic v2 schemas | boring, widely known, easy to defend live |
| D3 | Cookie sessions (opaque token, hashed at rest) + argon2 via pwdlib; origin check for CSRF; no JWT | instant revocation, SSE-compatible, XSS-safer; supersedes REQUIREMENTS A15 |
| D4 | Concurrency invariants enforced in DB (`UNIQUE(assignments.episode_id)`, CHECKs) plus `FOR UPDATE` on the request row in the service layer | correctness under races, testable |
| D5 | Import = parse+validate rows in Python (pure function, unit-testable), then batched `INSERT ... ON CONFLICT DO NOTHING`; classify leftovers by comparing to stored rows; one `import_runs` row per run | idempotent, fast at 200k, reports every reason |
| D6 | Analytics as 3 SQL queries (GROUP BY `date_trunc('day', recorded_at AT TIME ZONE 'UTC')`; `percentile_cont` over requests; top-5 with `LIMIT 5`) + indexes `(recorded_at)`, `(task_name) WHERE quality='good'`; `EXPLAIN ANALYZE` at 200k as evidence; BRIN/partitioning/rollup discussed for 5M | matches brief's "in DB" requirement |
| D7 | Tests against real Postgres via compose db + test database; GitHub Actions service container | fidelity over convenience |
| D8 | Frontend: React + Vite + TypeScript, no UI kit, served by nginx which also reverse-proxies `/api` (same origin) | no CORS, smallest moving parts that still demonstrate a real separated UI |
| D9 | Dependencies via `requirements.txt` with exact pins + `ruff` for lint/format; `Makefile` wraps docker compose | no tooling prerequisites beyond Docker |
| D10 | Stretch candidate: **SSE real-time** (cookie auth makes it work with native `EventSource`; in-process broker, with the multi-instance limitation noted in NOTES) | smallest time cost; background-job and deployment stretches cost more and risk required items. Final call in PLAN.md after MUST items are budgeted |
