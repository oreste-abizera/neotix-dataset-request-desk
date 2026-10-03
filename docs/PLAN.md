# Plan: Dataset Request Desk

Inputs: [REQUIREMENTS.md](REQUIREMENTS.md) (R-numbers, assumptions A1-A22), [RESEARCH.md](RESEARCH.md) (decisions D1-D10).

## 1. Architecture

```
 Browser ──► nginx (frontend container: static React build, proxies /api)
                │  same origin, cookie session
                ▼
            FastAPI (uvicorn)  ── routers (HTTP, authz deps)
                │                 └─ services (domain rules, transactions)
                ▼                      └─ models (SQLAlchemy 2)
            PostgreSQL  ◄── Alembic migrations (run on api start) + seed step
```

Layering rule that keeps the code easy to defend live: **routers** only parse/validate/authorize and call a **service**; **services** own every domain rule and DB transaction; **csv_rules** (row parsing/validation) is a pure module with no DB, so import edge cases are unit-tested in milliseconds.

### Tech choices and why they beat the alternatives
| Choice | Beats | Because |
|---|---|---|
| PostgreSQL | SQLite | `percentile_cont`, `ON CONFLICT`, row locks, real concurrency |
| FastAPI + sync SQLAlchemy | Django, async SQLAlchemy | Pydantic validation, auto OpenAPI for reviewers; sync is simpler to reason about |
| Cookie session (opaque, hashed at rest) | JWT | immediate revocation on deactivate/role change, XSS-safer, works with SSE |
| argon2 (pwdlib) | bcrypt | what FastAPI docs recommend now; memory-hard |
| React+Vite+TS served by nginx | HTMX/Jinja | real client/server split proves the API enforces authz; same-origin proxy removes CORS |
| Alembic | create_all | brief requires migrations |
| One Makefile over compose | scripts sprawl | `make up`, `make test`, `make lint` |

## 2. Directory structure
```
.
├── README.md  NOTES.md  Makefile  docker-compose.yml  .env.example  .gitignore
├── .github/workflows/ci.yml
├── seed/                      # as provided: users.json, episodes.csv, generate_episodes.py, README.md
├── docs/                      # REQUIREMENTS / RESEARCH / PLAN (+ evidence/ benchmark output)
├── backend/
│   ├── Dockerfile  requirements.txt  requirements-dev.txt  pyproject.toml  alembic.ini
│   ├── migrations/versions/0001_initial.py
│   ├── app/
│   │   ├── main.py  config.py  db.py  logging.py  errors.py  deps.py  security.py
│   │   ├── models.py  schemas.py  cli.py (seed, import-episodes)
│   │   ├── routers/   auth, users, requests, episodes, imports, analytics, health, events
│   │   └── services/  users, requests (state machine), assignments, importer, csv_rules, analytics
│   └── tests/         conftest.py + test_authz, test_transitions, test_assignments, test_import, test_analytics, test_users
└── frontend/  Dockerfile  nginx.conf  package.json  src/ (api.ts, pages: Login, ClientRequests, NewRequest, OpsRequests, RequestDetail/Assign)
```

## 3. Data model
```
users(id PK, email UNIQUE (lowercased), name, organisation NULL, role CHECK IN (client,operator,admin),
      password_hash, is_active, created_at)
sessions(id PK, user_id FK, token_hash UNIQUE, expires_at, created_at)
robots(robot_id PK)                                    -- 5 seeded
episodes(episode_id PK text, robot_id FK, task_name, recorded_at timestamptz, duration_seconds CHECK 1..3600,
         operator_name NULL, quality CHECK IN (good,usable,bad), import_run_id FK, created_at)
requests(id PK, client_id FK, task_name, episodes_requested CHECK >0, deadline date, notes,
         status CHECK IN (...5), created_at, updated_at)
request_status_events(id PK, request_id FK, from_status NULL, to_status, actor_id FK, created_at)
assignments(episode_id PK/FK  <- one request per episode, DB-enforced, request_id FK, assigned_by FK, assigned_at)
import_runs(id PK, user_id FK, filename, sha256, summary jsonb, created_at)
```
Indexes: `episodes(recorded_at)`, `episodes(task_name) WHERE quality='good'`, `episodes(task_name, quality)`, `assignments(request_id)`, `requests(client_id)`, `requests(status)`, `request_status_events(request_id, created_at)`.

**Where state lives:** everything durable in Postgres; sessions in DB; no in-process state except the optional SSE broker.

## 4. API contract (all under `/api`, JSON; errors `{"error":{"code","message","details?"}}`)
| Method & path | Roles | Notes |
|---|---|---|
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | public / any | cookie set; generic failure message; inactive users cannot log in |
| `GET/POST /users`, `PATCH /users/{id}` (role, is_active, name) | admin | cannot deactivate/demote self or last admin; password set on create |
| `POST /requests` | client | owner = caller |
| `GET /requests`, `GET /requests/{id}` | client (own only; others -> 404), operator, admin | detail includes status history + assigned episodes |
| `POST /requests/{id}/transitions` `{to}` | role-per-transition (see below) | 409 on invalid transition / unmet delivery gate; 403 on wrong role |
| `GET /episodes?task_name&quality&unassigned&page&page_size` | operator, admin | server pagination |
| `POST /requests/{id}/assignments` `{episode_ids:[]}` , `DELETE /requests/{id}/assignments/{episode_id}` | operator, admin | rules below |
| `POST /imports` (multipart CSV) | operator, admin | returns full report; `GET /imports`, `GET /imports/{id}` |
| `GET /analytics?from&to` | operator, admin | |
| `GET /health` (outside `/api` too) | public | checks DB |
| `GET /events` (SSE) | operator, admin | stretch |

**Transition table** (single dict in `services/requests.py`, tested exhaustively over every from/to/role triple):
`submitted→in_progress` op/admin · `in_progress→delivered` op/admin + gate `assigned >= episodes_requested` · `delivered→accepted` client(owner) · `delivered→rejected` client(owner) · `rejected→in_progress` op/admin. Everything else 409.

**Assignment rules** (in one service function, under `SELECT … FOR UPDATE` on the request): request status in {submitted, in_progress}; episode exists; quality ∈ {good, usable}; episode not already assigned (DB PK is the final arbiter -> 409 with which episodes failed); batch is all-or-nothing and reports per-episode reasons.

**Import report** (response and `import_runs.summary`): `{total_lines, blank_lines, imported, unchanged, skipped:[{line, episode_id, reason, detail}], warnings:[…], counts_by_reason}`.

## 5. Key algorithms
- **Import:** stream CSV with `csv` module → per-row `validate_row()` (pure; normalisation rules from REQUIREMENTS §2) → in-file dedupe (first wins, conflicting later rows reported) → chunks of 1000 → `INSERT … ON CONFLICT (episode_id) DO NOTHING RETURNING episode_id` → for non-returned ids, fetch stored rows and classify `unchanged` vs `conflict_with_existing`. One transaction; row-level rejects never abort the file. 200k rows target < ~30s.
- **Analytics:** three SQL statements via SQLAlchemy Core. (a) `GROUP BY date_trunc('day', recorded_at AT TIME ZONE 'UTC')::date, robot_id`. (b) `GROUP BY status` over requests with `submitted_at` in range + `percentile_cont(0.5)` over first-submitted→first-delivered seconds from `request_status_events` (CTE with `MIN(created_at) FILTER (WHERE to_status=…)`). (c) good episodes grouped by task, `ORDER BY count DESC, task_name LIMIT 5`.
- **Sessions:** `secrets.token_urlsafe(32)`, store SHA-256, 8h expiry, `HttpOnly; SameSite=Lax; Secure` when not in dev.
- **Logging:** pure-ASGI/`BaseHTTPMiddleware` emitting one JSON line per request: `ts, level, request_id, method, path, status, duration_ms, user_id`. Stdlib `logging` + JSON formatter (no extra dependency).

## 6. Prioritized task list (hours include writing that task's tests)

**MUST (every requirement)**
| # | Task | Reqs | h |
|---|---|---|---|
| 1 | Scaffold: compose (db, api, web), Dockerfile, Makefile, config, Alembic initial migration, models, `.gitignore`, ruff | R20,21,31 | 0.75 |
| 2 | Auth: argon2, sessions, `/auth/*`, RBAC deps, admin user mgmt + safeguards, seed command from `users.json` | R1-R7 | 0.75 |
| 3 | Requests + state machine + status history; client isolation (404) | R2,12-15 | 0.5 |
| 4 | Episodes list/filter/pagination + assignment service (rules, locking, concurrency test) | R16-18 | 0.5 |
| 5 | CSV import service + endpoint + CLI + report + 26-case fixture test + idempotency test | R8-11,22 | 1.0 |
| 6 | Analytics endpoint + 200k load evidence (`EXPLAIN ANALYZE` saved in `docs/evidence/`) | R23-25 | 0.5 |
| 7 | Logging middleware, `/health`, error envelope | R26,27 | 0.25 |
| 8 | Frontend: login; client (create/list/accept/reject); operator (all requests, transition buttons, assign list w/ filters, import upload, analytics summary) | R28-30 | 1.25 |
| 9 | CI (GitHub Actions: lint + tests with Postgres service) | R33 | 0.25 |
| 10 | NOTES.md, README.md, clean-clone verification, final review | R35-40,45 | 1.0 |
| | **MUST subtotal** | | **6.75** |

**Stretch (only after all MUST items pass): SSE real-time**, 0.75h: in-process broker, `GET /events`, publish on request create/transition, UI subscribes via `EventSource` and refreshes the operator list. Chosen over background export/deployment because it is cheapest and carries no risk to required behaviour. Limitation (documented): in-process broker works for a single API instance; multi-instance needs Postgres `LISTEN/NOTIFY` or Redis.
**Total: ≈ 7.5h** (cap 8h). If time runs short, SSE is dropped first, then admin-user UI (API stays), then the analytics UI panel.

## 7. Test strategy (real Postgres; `make test` = one command)
Chosen for what the brief names, written as behaviours not coverage:
1. **Authorization:** unauthenticated -> 401 on every route except login/health (parametrised over the route table so new routes can't be forgotten); role × endpoint matrix; client A cannot read/transition client B's request (404); client cannot assign/import/see analytics; operator cannot manage users or accept/reject; deactivated user's session dies immediately; admin can't lock themselves out.
2. **Transitions:** exhaustive from×to×role matrix against the table; delivery gate (n-1 episodes blocked, n allowed); each change writes an event with actor and time; rejected → in_progress rework keeps assignments.
3. **Assignment:** bad episode rejected; already-assigned rejected; same episode to two requests (sequential and a real two-thread race -> exactly one winner); locked after `delivered`; unassign frees the episode.
4. **Import:** unit tests per messy case; the real `episodes.csv` asserted counts; run twice -> second run imports 0, no new rows; conflicting re-import never overwrites quality of an assigned episode; malformed/huge-field handling.
5. **Analytics:** small deterministic fixture → exact per-day/robot counts, median (odd/even/none), top-5 tie-break, range boundaries.
6. **Health/logging:** `/health` 200 and DB-down 503; log line has all fields and user id.

**Demonstrating correctness:** `docs/evidence/` with (a) import report JSON for the real CSV, twice (second = all unchanged), (b) 200k import timing + analytics `EXPLAIN ANALYZE`, (c) pytest output, (d) 3-4 UI screenshots in README.

## 8. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Time overrun (frontend is the most elastic) | build API-complete first; UI is deliberately plain; stretch last |
| Compose startup ordering (migrate before API, seed idempotent) | db healthcheck, `api` entrypoint runs `alembic upgrade head` then idempotent seed; verified from a fresh clone |
| Lock/race bugs | DB-level uniqueness as source of truth + a real concurrency test |
| Hidden-ambiguity mismatch with reviewers (A1-A4) | defaults chosen to be easy to flip (single check each); recorded in NOTES |
| Seed credentials are weak | dev-only; seed refuses in `APP_ENV=production` unless forced; documented |
| Not able to explain AI-written code live | small modules, plain constructs; NOTES records decisions; I review each file before commit |
| "Something that went wrong" must be real | keep a running `docs/devlog.md` of genuine incidents while building; NOTES draws from it |
| Commit message rule | plain conventional commits, no AI attribution (user's global rule overrides the default trailer) |

## 9. Commit plan (conventional commits, incremental)
`chore: scaffold` → `feat(db): schema and initial migration` → `feat(auth): …` → `feat(requests): state machine and history` → `feat(assignments): …` → `feat(import): …` → `feat(analytics): …` → `feat(ops): logging, health` → `feat(web): …` → `ci: …` → `docs: notes and readme`. Tests land in the same commit as the feature.

## 10. Plan vs. what happened
- Postgres **16** (not 17): the 17 image pull stalled on the network; 16 has every feature used.
- Median query rewritten after `EXPLAIN ANALYZE` (migration `0002`); import insert path changed after profiling. See `docs/devlog.md`.
- Stretch item delivered: SSE. Total effort tracked close to the plan (about 7.5 h including the stretch).
