# NOTES

Run instructions are in [README.md](README.md). Requirement trace and every assumption: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md). Raw build log: [docs/devlog.md](docs/devlog.md).

## 1. Design

```
users ──< sessions                        robots (reference data)
  └──< requests ──< request_status_events      │
          │         (append-only: from, to, actor, time)
          └──< assignments >── episodes >──────┘
               PK = episode_id   PK = episode_id ── import_run_id → import_runs (who, when, sha256, report)
```

**State** lives in PostgreSQL, including login sessions. The only in-process state is the SSE subscriber list and the login-failure counter; both are disposable.

**Invariants in the database, rules in services.** `assignments.episode_id` is the primary key, so "an episode is in at most one request" holds even for two racing writers; CHECK constraints guard `quality`, `status`, `role`, durations and counts. Services add the workflow, clear errors, and a `SELECT … FOR UPDATE` on the request row so assign, unassign and `→ delivered` serialise. The workflow is one `(from, to) → roles` table; tests restate it independently and check all 75 `from × to × role` combinations.

**Hardest decisions**
1. *Import conflicts: never overwrite.* The export has `EP-00011` twice (`bad`, then `good`) and `ep-00003`, which collides with `EP-00003` but with different data. Picking "the better" or "the last" row is silent corruption, and changing the `quality` of an already-assigned episode would break the assignment rule. So ids are normalised (trim, upper-case), the first occurrence wins, conflicting rows are skipped and reported with the differing fields, and existing rows are never modified (`INSERT … ON CONFLICT DO NOTHING`), which makes re-imports idempotent. Cost: correcting an existing episode needs a separate, deliberate flow (not built).
2. *Server-side sessions instead of JWT.* Opaque random token in an `HttpOnly; SameSite=Lax` cookie, only its SHA-256 stored. Deactivation and role changes apply on the next request, logout is real, JavaScript cannot read the token, and `EventSource` works. Price: a DB lookup per request, and CSRF has to be handled (§4).
3. *When may episodes change?* The brief is silent, so assign/unassign is allowed only while a request is `submitted` or `in_progress`; a delivered set cannot shift under the client. A rejected request keeps its episodes for rework. I also did **not** require an episode's `task_name` to match the request's (not a stated rule); the UI pre-filters by task and warns on a mismatch.

**Other assumptions** (full list in REQUIREMENTS.md §5): blank `operator_name` imports with a warning, any other blank field is rejected; `14/08/2026` is day-first and zone-less times are UTC; duration is whole seconds in 1..3600 (`45.5` is rejected, not rounded); future dates and unknown robots are rejected; clients get 404 (not 403) for others' requests; only clients create requests; analytics is staff-only with inclusive UTC days. On the supplied file 172 of 189 rows import, 17 are skipped with reasons, and a re-run imports 0.

**Stretch items.** The one I chose is **real-time (SSE)**: operators see new requests and status, assignment and export changes live. Events carry ids only and the UI refetches through the normal authorised endpoints; the stream re-checks the session on every keep-alive, so a deactivated operator is cut off. I also built the **background export** (assignment enqueues one job per episode in the same transaction; workers claim with `FOR UPDATE SKIP LOCKED` under a lease; completion is fenced by attempt number; five attempts with backoff, then a manual retry; a succeeded export never runs twice). Both are beyond the "pick one" ask, kept small and tested. **Deployment** is prepared and verified locally (`deploy/`, `docs/DEPLOY.md`) but **not published**: there is no public URL.

## 2. Left out, and the next two days

Left out: password reset; editing/cancelling a request; correcting an existing episode; frontend automated tests (UI driven by hand in a browser); README screenshots; a public deployment (tooling exists, nothing is hosted); the CI file is written but has not run on GitHub.

With two more days: Playwright tests for the three roles; a reviewed "correct episode" flow with audit trail and an assignment-history view (stored, not shown); background CSV import with `COPY`; keyset pagination; actually hosting the `deploy/` stack; password reset and Redis-backed throttling.

## 3. Something that went wrong

*A security test that tested nothing.* I parametrised "every route returns 401 when anonymous" over `app.routes`. It passed, but `pytest -rs` showed `got empty parameter set`: FastAPI 0.142 includes routers lazily, so `app.routes` holds opaque `_IncludedRouter` objects and my `isinstance(…, APIRoute)` filter matched none. Enumerating `app.openapi()["paths"]` fixed it, and the first real run failed on `POST /auth/logout`, which was reachable without a session. Lesson: a parametrised test needs a guard that it ran at least one case.

*A race I introduced myself.* Adding the export job to `assign_episodes`, I flushed the new rows before the `try/except IntegrityError` that turns a primary-key collision into a 409, so two operators racing for one episode could get a 500. My two-thread race test caught it only intermittently (1 failure in a Docker run, 0 in 30 local loops), so I wrote a deterministic reproduction (one session holds an uncommitted assignment, a second operator blocks on it and collides at flush time), confirmed it fails on the old code, and moved the whole write inside the `try`.

*Slow import.* 200k rows took 40 s; `cProfile` showed most of it in SQLAlchemy recompiling a giant multi-`VALUES` INSERT per chunk. One cached `INSERT … ON CONFLICT DO NOTHING` with a list of parameter sets: ~17 s. `EXPLAIN ANALYZE` also showed my first median query reading every request regardless of date range; it now filters on an indexed column first (migration `0002`).

## 4. Security

**Passwords and tokens.** Argon2id (`pwdlib`); seed passwords from `users.json` are hashed, never stored in plain text. Login failures look identical for unknown user and wrong password (a dummy hash keeps timing similar) and are throttled (10 per 15 min per e-mail, in-process). Sessions: 256-bit random tokens, hashed at rest, 8 h expiry, `HttpOnly`, `SameSite=Lax`, `Secure` outside development. Role and `is_active` are read from the DB on every request.

**Input validation.** Pydantic on every body and query; parameterised SQL only; uploads capped at 50 MB, UTF-8 only, NUL bytes and unparseable CSV refused before any write; one error envelope, no stack traces; React escapes output; API docs off outside development. CSRF: same-origin behind nginx, `SameSite=Lax`, plus an `Origin`-vs-`Host` check on state-changing requests.

**The two vulnerabilities I would worry about most**
1. *Broken object-level authorisation.* Every request/episode endpoint takes an id from the URL; one forgotten ownership check leaks another client's data. Mitigated by a single `get_visible_request` choke point, 404 for foreign objects, and tests that enumerate every route plus a cross-client matrix. The residual risk is a future endpoint that bypasses the helper.
2. *Untrusted file import.* The CSV comes from a recording system but is uploaded by a person. Risks: memory exhaustion (read whole, capped at 50 MB: fine for one container, not for many concurrent uploads), data poisoning (mitigated by never overwriting), and spreadsheet formula injection (`=cmd|…` in `task_name`) if values are ever exported to Excel; there is no such export today, but it must be handled before one exists.

Known weak spots: the seeded passwords are weak by the brief's design (the seed refuses to run when `APP_ENV=production`), and the per-e-mail throttle lets an attacker lock a known user out for 15 minutes.

## 5. Scale

*Measured at 200k episodes* (`docs/evidence/`): per-day/per-robot over one month 14 ms (index scan), over the whole year 143 ms (sequential scan + sort), top-5 tasks 25 ms. Request analytics read the `requests` table, whose size follows business volume, so the median stays cheap.

*100× episodes (20M)* breaks the unbounded things first: `SELECT DISTINCT task_name` and `COUNT(*)` behind the episode list, `OFFSET` paging, and full-range analytics (~linear, so the year query would take ~15 s). Fixes: keyset pagination, a `task_names` table, BRIN on `recorded_at` plus monthly partitions, a daily rollup table maintained by the import, and a background `COPY` import.

*10× users:* one API process and in-memory state fail before the database. The SSE broker and login throttle are per-process, so several API instances need Postgres `LISTEN/NOTIFY` or Redis; the per-request session lookup would get a short-TTL cache. The rest is stateless and scales horizontally.

## 6. AI tooling

**Claude Code (Claude Sonnet 5.5)** was used throughout: analysing the brief and the messy CSV, checking current library versions and Postgres features, planning, writing the backend, tests, React UI and docs, and running and debugging the suite and the Docker stack. Decisions and assumptions are written down in `docs/` and the incidents above come from the real build log, so they can be questioned in the live session.
