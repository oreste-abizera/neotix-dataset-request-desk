# NOTES

Run it, tests and screenshots: [README.md](README.md). Requirement trace and all assumptions: [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md). Frontend research, decisions and measurements: [docs/frontend-research.md](docs/frontend-research.md), [docs/frontend-upgrade-plan.md](docs/frontend-upgrade-plan.md). Build log: [docs/devlog.md](docs/devlog.md).

## 1. Design

```
users ──< sessions                        robots (reference data)
  └──< requests ──< request_status_events      │
          │         (append-only: from, to, actor, time)
          └──< assignments >── episodes >──────┘
               PK = episode_id   PK = episode_id ── import_run_id → import_runs (who, when, sha256, report)
```

**State** lives in PostgreSQL, sessions included. The only in-process state is the SSE subscriber list and the login-failure counter; both are disposable.

**Invariants in the database, rules in services.** `assignments.episode_id` is the primary key, so "an episode is in at most one request" holds even for racing writers; CHECK constraints guard `quality`, `status`, `role`, durations and counts. Services add the workflow, clear errors, and a `SELECT … FOR UPDATE` on the request row so assign, unassign and `→ delivered` serialise. The workflow is one `(from, to) → roles` table; tests restate it independently and check all 75 `from × to × role` combinations.

**Hardest decisions**
1. *Import conflicts: never overwrite.* The export has `EP-00011` twice (`bad`, then `good`) and `ep-00003`, which collides with `EP-00003` but with different data. Picking "the better" or "the last" row is silent corruption, and changing the quality of an assigned episode would break the assignment rule. So ids are normalised, the first occurrence wins, conflicting rows are skipped and reported with the differing fields, and existing rows are never modified (`INSERT … ON CONFLICT DO NOTHING`), which makes re-imports idempotent. Cost: correcting an existing episode needs a separate, deliberate flow (not built).
2. *Server-side sessions instead of JWT.* Opaque random token in an `HttpOnly; SameSite=Lax` cookie, only its SHA-256 stored. Deactivation and role changes apply on the next request, logout is real, JavaScript cannot read the token, and `EventSource` works. Price: a DB lookup per request, and CSRF must be handled (§4).
3. *When may episodes change?* The brief is silent, so assign/unassign is allowed only while a request is `submitted` or `in_progress`; a delivered set cannot shift under the client. A rejected request keeps its episodes for rework. I did **not** require an episode's `task_name` to match the request's (not a stated rule); the UI pre-filters by task and warns on a mismatch.

**Other assumptions** (all in REQUIREMENTS.md §5): blank `operator_name` imports with a warning, any other blank field is rejected; `14/08/2026` is day-first and zone-less times are UTC; future dates and unknown robots are rejected; clients get 404 (not 403) for others' requests; only clients create requests. On the supplied file 172 of 189 rows import, 17 are skipped with reasons, and a re-run imports 0.

**Frontend.** React + TypeScript with a token-based design system (light and dark), TanStack Query and Radix. The server stays the authority: the UI only offers transitions the API lists as allowed. Deliberately lean (76 kB gzip entry bundle) because the brief says "keep it small"; accessibility is tested (axe in the suite and in real Chrome, 0 violations; Lighthouse 100).

**Stretch items.** My chosen one is **real-time (SSE)**: operators see requests, assignments and export progress live. I also built the **background export** (one job per assigned episode; `FOR UPDATE SKIP LOCKED` under a lease; completion fenced by attempt number; five attempts, then manual retry) and **deployed** to https://desk.oreste.dev as a staging environment with demo data (`docs/DEPLOY.md`; CI deploys with a health check and automatic rollback). The last two go beyond "pick one".

## 2. Left out, and the next two days

Left out: password reset; editing or cancelling a request; correcting an existing episode; end-to-end browser tests (the frontend has 67 component, flow and accessibility tests, but nothing drives a real browser in CI).

With two more days: Playwright tests for the three roles; a reviewed "correct episode" flow with audit trail and an assignment-history view (stored, not shown); background CSV import with `COPY`; keyset pagination; managed Postgres with off-site backups; password reset and Redis-backed throttling.

## 3. Something that went wrong

*A security test that tested nothing.* My "every route returns 401 when anonymous" test passed, but `pytest -rs` showed `got empty parameter set`: FastAPI 0.142 includes routers lazily, so `app.routes` held no `APIRoute`s. Enumerating `app.openapi()["paths"]` fixed it, and the first real run failed on `POST /auth/logout`, which was reachable without a session.

*A race I introduced.* Adding the export job to `assign_episodes`, I flushed new rows before the `try/except IntegrityError` that turns a primary-key collision into a 409, so two operators racing for one episode could get a 500. My two-thread race test caught it only intermittently (1 failure in a Docker run, 0 in 30 local loops), so I wrote a deterministic reproduction, confirmed it fails on the old code, and moved the write inside the `try`.

*A mobile bug my own checks missed.* I had recorded "no horizontal scroll at 375 px", but the browser pane's mobile emulation had silently reset to 656 px, so nothing at phone width was measured. Screenshots taken with real device emulation (390 px) showed request pages 244-316 px too wide (a grid column that could not shrink, and an `sr-only` label positioned against the page). Fixed, and the claim in the docs corrected.

## 4. Security

**Passwords and tokens.** Argon2id (`pwdlib`); seed passwords are hashed, never stored in plain text. Login failures look identical for unknown user and wrong password (a dummy hash keeps timing similar) and are throttled (10 per 15 min per e-mail, in-process). Sessions: 256-bit random tokens, hashed at rest, 8 h expiry, `HttpOnly`, `SameSite=Lax`, `Secure` outside development. Role and `is_active` are read from the DB on every request.

**Input validation.** Pydantic on every body and query; parameterised SQL only; uploads capped at 50 MB, UTF-8 only, NUL bytes and unparseable CSV refused before any write; one error envelope, no stack traces; React escapes output; API docs off outside development. CSRF: same-origin behind the proxy, `SameSite=Lax`, plus an `Origin`-vs-`Host` check on state-changing requests.

**The two vulnerabilities I worry about most**
1. *Broken object-level authorisation.* Every request/episode endpoint takes an id from the URL; one forgotten ownership check leaks another client's data. Mitigated by a single `get_visible_request` choke point, 404 for foreign objects, and tests that enumerate every route plus a cross-client matrix. Residual risk: a future endpoint that bypasses the helper.
2. *Untrusted file import.* The CSV is uploaded by a person. Risks: memory exhaustion (read whole, capped at 50 MB: fine for one container, not for many concurrent uploads), data poisoning (mitigated by never overwriting), and spreadsheet formula injection. The one CSV the UI produces (skipped rows) neutralises leading `= + - @`; any future export must do the same.

Known weak spots: the seeded demo passwords are weak by the brief's design (the seed refuses to run in production unless forced), and the per-e-mail throttle lets an attacker lock a known user out for 15 minutes.

## 5. Scale

*Measured at 200k episodes* (`docs/evidence/`): per-day/per-robot over a month 14 ms (index scan), over a year 143 ms (sequential scan), top-5 tasks 25 ms. Request analytics read the small `requests` table, so the median stays cheap.

*100× episodes (20M)* breaks the unbounded things first: `SELECT DISTINCT task_name` and `COUNT(*)` behind the episode list, `OFFSET` paging, and full-range analytics (roughly linear: the year query would take ~15 s). Fixes: keyset pagination, a `task_names` table, BRIN plus monthly partitions, a daily rollup table, and a background `COPY` import.

*10× users:* one API process and in-memory state fail before the database. The SSE broker and login throttle are per-process, so several API instances need Postgres `LISTEN/NOTIFY` or Redis; the per-request session lookup would get a short-TTL cache. The rest is stateless and scales horizontally.

## 6. AI tooling

I used **Claude Code (Claude Sonnet 5.5)** as my main implementation tool, working under my direction. I set the scope and priorities and made the product and hosting calls (staging with demo data, the server and domain, CI/CD, what to merge and when), and I ran, deployed and checked the result. Claude Code did the research, drafting and much of the code, tests and documentation, and ran the test-suite, the Docker stack, Lighthouse and axe. Because a lot of the code was generated, I leaned on checks that do not depend on trusting it: tests against a real PostgreSQL, deliberately breaking core rules to confirm the tests fail (backend and UI), and reproducible measurements (`EXPLAIN ANALYZE`, Lighthouse, axe, a pixel-level overflow check). Decisions, assumptions and measurements are written down in `docs/`, and the incidents in §3 are real events from `docs/devlog.md`. README screenshots were captured by script (puppeteer-core driving Chrome).
