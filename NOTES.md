# NOTES

Design notes for the Dataset Request Desk. How to run things is in [README.md](README.md). Raw build notes are in [docs/devlog.md](docs/devlog.md); the full requirement trace is in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## 1. Design

**Data model** (PostgreSQL, migrations in `backend/migrations`):

```
users ──< sessions                       robots (reference data, 5 rows)
  │                                         │
  └──< requests ──< request_status_events   │
          │              (append-only: from, to, actor, time)
          └──< assignments >── episodes >───┘
               PK = episode_id             PK = episode_id (from the CSV)
                                           └─ import_run_id → import_runs (who/when/sha256/report)
```

**Where state lives:** everything durable is in Postgres, including login sessions. The only in-process state is the SSE subscriber list (stretch item) and the login-failure counter, both disposable.

**Invariants live in the database, rules live in services.** `assignments.episode_id` is the primary key, so "an episode is in at most one request" cannot be violated even by a racing second writer. CHECK constraints guard `quality`, `status`, `role`, durations and counts. The services add the friendlier checks and error messages, and take a `SELECT … FOR UPDATE` on the request row so assign, unassign and `→ delivered` serialise against each other. The workflow is one table (`TRANSITIONS` in `services/requests.py`) mapping `(from, to)` to the roles allowed. The tests restate the table independently and check all 75 `from × to × role` combinations.

**Hardest decisions**

1. *Import conflicts: never overwrite.* The sample file contains `EP-00011` twice (`bad`, then `good`) and `ep-00003`, which collides with `EP-00003` but with different data. Silently picking "the better one" or "the last one" is data corruption, and overwriting the `quality` of an episode that is already assigned would break the assignment rule. So: ids are normalised (trim, upper-case), the first occurrence in a file wins, later conflicting rows are skipped and reported with the differing fields, and a row that matches an existing episode is `unchanged` while one that differs is reported as `conflict_with_existing`. Existing rows are never modified, which also makes re-importing trivially idempotent (`INSERT … ON CONFLICT DO NOTHING`). The cost: corrections to existing episodes need a separate, deliberate path (not built).
2. *Auth: server-side sessions instead of JWT.* An opaque random token in an `HttpOnly; SameSite=Lax` cookie, with only its SHA-256 stored. Deactivating a user or changing a role takes effect on the very next request (a JWT would keep working until expiry, unless I added a DB lookup anyway), logout is real, JavaScript cannot read the token, and `EventSource` works for the live-update stretch. The price is a DB lookup per request and having to think about CSRF (see §4).
3. *When may episodes be assigned?* The brief is silent. I allow assign/unassign only while a request is `submitted` or `in_progress`, so a delivered set cannot change under the client's eyes. A rejected request keeps its episodes for rework (it becomes editable again at `rejected → in_progress`). I also chose not to require that an episode's `task_name` match the request's: the brief does not state that rule. The UI pre-filters by the request's task and warns on a mismatch. Both are single checks that are easy to tighten.

**Other assumptions** (all in `docs/REQUIREMENTS.md` §5): blank `operator_name` is imported with a warning, while a blank robot/quality/duration/date/id is rejected; `14/08/2026` is day-first and timestamps without a zone are UTC; duration is a whole number of seconds in 1..3600 (`45.5` is rejected, not rounded); future timestamps are rejected; unknown robots are rejected; clients cannot see other clients' requests and get a `404` (not `403`) so existence does not leak; only clients create requests; analytics is operator/admin only; analytics ranges are inclusive UTC days and requests are counted by submission date; the median measures `submitted → first delivered` (a reworked request is delivered more than once).

**Import outcome on the supplied file** (`docs/evidence/`): 189 data rows → 172 imported, 17 skipped with reasons, 1 imported with a warning, 2 blank lines ignored. A second run imports 0 and reports 172 unchanged. The `generate_episodes.py` 200k file imports in ~17 s and re-imports (all unchanged) in ~15 s.

**Stretch item chosen: real-time (SSE).** Operators see new requests and status/assignment changes live (`GET /api/events`, staff only). Events carry ids only; the UI refetches through the normal authorised endpoints. The stream re-validates the session on each keep-alive, so a deactivated operator is cut off.

## 2. Left out / simplified, and the next two days

Left out on purpose: password change/reset and self-service sign-up; editing or cancelling a request; correcting an existing episode (see §1.1); a pagination UI for the request list (the API has `limit/offset`); frontend automated tests (the backend carries the correctness tests, and I drove the UI by hand in a browser); screenshots in the README; admin UI is functional but bare; the CI file is written but has not been run on GitHub from here.

With two more days: (1) a reviewed "correct episode" flow with an audit trail, plus an assignment history view (who assigned what, when; it is stored but not shown); (2) Playwright end-to-end tests for the three roles; (3) move CSV import to a background job with progress, streaming `COPY` into a staging table, and a file-hash "already imported" short-circuit; (4) keyset pagination and a `task_names` table instead of `SELECT DISTINCT`; (5) deploy with HTTPS and managed secrets; (6) per-IP plus per-account login throttling in Redis, and password reset by e-mail.

## 3. Something that went wrong

*My route-authorisation test passed while testing nothing.* I parametrised "every route returns 401 when anonymous" over `app.routes`. It passed, but `pytest -rs` showed `got empty parameter set`: FastAPI 0.142 includes routers lazily, so `app.routes` held opaque `_IncludedRouter` objects and my `isinstance(route, APIRoute)` filter matched none. I switched to enumerating `app.openapi()["paths"]`, which is the authoritative route list. The first real run immediately failed on `POST /api/auth/logout`, which was reachable without a session; it now requires one. Lesson: a parametrised test needs an assertion that it ran at least one case.

*The 200k import took 40 s.* `cProfile` on 20k rows put over half the time inside SQLAlchemy *compiling* a 2,000-row multi-`VALUES` INSERT for every chunk (new literals each time, so nothing is cached). Executing one cached `INSERT … ON CONFLICT DO NOTHING RETURNING` with a list of parameter sets cut it to ~17 s. I also found with `EXPLAIN ANALYZE` that my first median query filtered by date *after* aggregating, so it read every request however narrow the range; it now filters on an indexed column first (migration `0002`). More in `docs/devlog.md`.

## 4. Security

**Passwords and tokens.** Argon2id via `pwdlib`; the seed step hashes `users.json` (never stored in plain text). Login errors are identical for "no such user" and "wrong password" and cost the same time (a dummy hash is verified); failures are throttled (10 per 15 min per e-mail, in-process). Sessions are 256-bit random tokens, hashed at rest, 8 h expiry, `HttpOnly`, `SameSite=Lax`, `Secure` outside development. The role and `is_active` flag are read from the DB on every request.

**Input validation.** Pydantic models on every body/query (lengths, ranges, enums, dates); parameterised queries only (SQLAlchemy); uploads capped at 50 MB, UTF-8 only, NUL bytes and unparseable CSV rejected before any write; one error envelope that never leaks stack traces; nginx adds `nosniff`/frame-deny headers; React escapes output. CSRF: same-origin deployment behind nginx, `SameSite=Lax`, and an `Origin`-vs-`Host` check on state-changing requests. Interactive API docs are off outside development.

**The two vulnerabilities I would worry about most**

1. *Broken object-level authorisation.* Every request and episode endpoint takes an id from the URL, and one forgotten ownership check leaks another client's data. Mitigations: a single `get_visible_request` choke point, 404 for foreign objects, and tests that enumerate every route from OpenAPI plus a cross-client matrix. The remaining risk is a future endpoint that bypasses the helper.
2. *Untrusted file import.* The CSV comes from a recording system but is uploaded by a person. Risks: resource exhaustion (the whole file is held in memory, capped at 50 MB, which is fine for one container but not for many concurrent uploads), data poisoning (mitigated by never overwriting), and spreadsheet formula injection if these values are ever exported to Excel (`=cmd|…` in `task_name`); there is no export today, but it must be handled before one exists.

Also known: the seeded passwords (`admin123`…) are weak by the brief's design. The seed refuses to run when `APP_ENV=production`, but anything real must rotate them. The login throttle is per e-mail, so it also lets an attacker lock a known user out for 15 minutes.

## 5. Scale

*Measured at 200k episodes* (`docs/evidence/analytics-explain-200k.txt`): per-day/per-robot over one month 14 ms (index scan), over the whole year 143 ms (sequential scan + sort), top-5 tasks 25 ms (parallel scan). Request analytics touch the *requests* table, whose size follows business volume, not recording volume, so the median stays cheap.

*At 100× episodes (20M):* the first things to break are the unbounded ones: `SELECT DISTINCT task_name` and `COUNT(*)` behind the paginated episode list, `OFFSET` paging, and full-range analytics (~linear: the year query would take roughly 15 s). Changes: keyset pagination, a small `task_names` table, a `BRIN` index on `recorded_at` (rows arrive in time order) and monthly partitions so ranges prune, a daily rollup table (`day, robot_id, task_name, quality, count`) maintained by the import so the dashboard reads a few thousand rows, and importing through `COPY` in a background worker rather than inside the request.

*At 10× users:* one API process and in-memory state break before the database does. The SSE broker and login throttle are per-process, so with more than one API instance they must move to Postgres `LISTEN/NOTIFY` or Redis; the DB pool and the per-request session lookup would get a short-TTL cache; the nginx tier and API scale horizontally because there is no sticky state apart from those two.

## 6. AI tooling

I used **Claude Code (Claude Sonnet 5.5)** throughout: to analyse the brief and the messy CSV, research current library versions and Postgres features, draft the plan, write the backend, tests, React UI and docs, and run and debug the test suite and the Docker stack. Decisions, trade-offs and assumptions are written down in `docs/` so they can be challenged in the live session; the "what went wrong" items above come from real events recorded in `docs/devlog.md`, not invented afterwards.
