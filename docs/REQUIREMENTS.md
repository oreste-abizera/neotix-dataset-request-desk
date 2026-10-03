# Requirements: Dataset Request Desk (Neotix Software Engineer test)

Sources: `WORK_TASK.md` (the brief, "B§n"), `seed/README.md` ("S-README"), `seed/users.json`, `seed/episodes.csv`, `seed/generate_episodes.py`.
Deadline: Sun 04 Oct 2026 23:59 Kigali (UTC+2). Budget 6-8h, hard cap ~10h. Submission: Git repo link, emailed in reply to the brief.

Status legend: `[ ]` todo. Tick as implemented; Phase 5 adds evidence next to each.

---

## 1. Explicit requirements

### Roles, auth (B§2)
- [ ] R1. Three roles: `client`, `operator`, `admin`. (B§2)
- [ ] R2. **client**: create requests; view *only own* requests; accept/reject a delivered request. (B§2)
- [ ] R3. **operator**: view all requests; move a request through its workflow; assign episodes; import episode metadata. (B§2)
- [ ] R4. **admin**: everything an operator can do, plus create/deactivate users and change roles. (B§2)
- [ ] R5. Authentication required for every action except login. (B§2)
- [ ] R6. Authorization enforced **server-side**; hiding UI buttons is insufficient. (B§2)
- [ ] R7. Seed step creates the 5 users from `seed/users.json` (admin, 2 operators, 2 clients with organisation); passwords **not stored in plain text**. (S-README, B§4.3)

### Domain (B§3)
- [ ] R8. **Episode**: `episode_id`, `robot_id`, `task_name`, `recorded_at`, `duration_seconds`, `operator_name`, `quality` (`good`/`usable`/`bad`), plus extras as needed. (B§3)
- [ ] R9. Episodes imported from a messy CSV (`seed/episodes.csv`). Import must be **idempotent** (safe to re-run on the same file, no duplicate records). (B§3)
- [ ] R10. Import must **report clearly**: imported, skipped, and *why*. (B§3)
- [ ] R11. Decide how each messy case is handled, handle it, report it, and document in NOTES.md. (S-README)
- [ ] R12. **Request**: belongs to a client; `task_name`, `episodes_requested` (count), `deadline`, `notes`, `status`. (B§3)
- [ ] R13. Status flow: `submitted -> in_progress -> delivered -> accepted`; `delivered -> rejected -> in_progress` (rework). Only valid transitions. (B§3)
- [ ] R14. Transitions only by owning roles: clients accept/reject; operators do the rest. (B§3)
- [ ] R15. Every status change recorded with **who** and **when**. (B§3)
- [ ] R16. **Assignment**: episode assigned to a request. An episode is in **at most one** request at a time. (B§3)
- [ ] R17. Only `good` or `usable` episodes are assignable. (B§3)
- [ ] R18. A request cannot move to `delivered` until it has >= `episodes_requested` episodes assigned. (B§3)

### Backend (B§4.1)
- [ ] R19. Python backend; REST or GraphQL. (B§4.1, B§6)
- [ ] R20. Relational DB (Postgres preferred; SQLite acceptable if prod differences are explained). (B§4.1)
- [ ] R21. Schema managed by **migrations**. (B§4.1)
- [ ] R22. CSV import as endpoint or CLI command. (B§4.1)
- [ ] R23. **Analytics endpoint** for a date range: (a) episodes recorded per day per robot; (b) request counts by status + **median** time `submitted -> delivered`; (c) top 5 task names by count of *good* episodes. (B§4.1)
- [ ] R24. Analytics computed **in the database**, not by loading rows into Python. (B§4.1)
- [ ] R25. README says how analytics behave with **5 million episodes**. (B§4.1)
- [ ] R26. `/health` endpoint. (B§4.1)
- [ ] R27. Structured logging: one line per request with method, path, status, duration, user id if authenticated. (B§4.1)

### Frontend (B§4.2)
- [ ] R28. Working UI, any modern framework, small but correct. (B§4.2)
- [ ] R29. Client: log in, create request, see own requests + status, accept/reject a delivered one. (B§4.2)
- [ ] R30. Operator: see all requests, change status, assign episodes via a simple list with filters by `task_name` and `quality`. (B§4.2)

### Operations (B§4.3)
- [ ] R31. `docker compose up` (or one documented command) brings up DB, migrations, seed users, API, frontend from a clean clone. (B§4.3)
- [ ] R32. Automated tests runnable with one command. Priority areas: **authorization rules, status transitions, assignment rules, import idempotency**. Coverage % irrelevant; *choice* of tests matters. (B§4.3)
- [ ] R33. *(Nice to have)* CI (GitHub Actions) running tests. (B§4.3)

### Stretch, pick ONE, say which (B§4.4)
- [ ] R34. Real-time (WS/SSE) | Background export job (2-5s sleep, 20% random failure, safe retry, idempotent, per-episode status in UI) | Public deployment w/ HTTPS. Bonus only, never a penalty.

### Written notes: `NOTES.md`, 1-2 pages, "a big part of the evaluation" (B§5)
- [ ] R35. Design: data model (diagram or paragraph), where state lives, 2-3 hardest decisions and why.
- [ ] R36. Deliberately omitted/simplified; what to do next with two more days.
- [ ] R37. Something that went wrong while building and how it was diagnosed. (Must be real; log genuine incidents as they happen.)
- [ ] R38. Security: passwords/tokens, input validation, the 2 vulnerabilities I'd worry about most.
- [ ] R39. Scale: what breaks first at 10x users and 100x episodes; what to change.
- [ ] R40. AI tooling: which tools, used for what.

### Ground rules and submission (B§6, B§7)
- [ ] R41. I must understand and defend every line; live interview will modify/extend my code. (B§6)
- [ ] R42. Don't over-build; clean, tested, honest 70% beats sprawling 100%. (B§6)
- [ ] R43. Commit as you go; Git history is read. (B§6)
- [ ] R44. Ambiguities: decide, and write the decision in NOTES.md. (B§6)
- [ ] R45. Repo contains: code; `README.md` (how to run, how to test, **seed credentials**); `NOTES.md`; CI config if any; deployment URL if stretch = deployment. (B§7)
- [ ] R46. Reply to the original email with the link. Questions may be emailed. (B§7)

---

## 2. Messy-data catalogue (`seed/episodes.csv`, 189 data lines + 2 blank/whitespace lines)

S-README lists: duplicates, blank/invalid values, inconsistent casing/whitespace, mixed date formats, an unknown robot, a malformed row. Line numbers are file lines (header = 1). Proposed disposition in the last column.

| # | Line(s) | Episode | Issue | Proposed handling |
|---|---|---|---|---|
| 1 | 38 & 50 | EP-00074 | exact duplicate row | import first, skip 2nd: `duplicate_in_file` |
| 2 | 37 & 91 | EP-00030 | exact duplicate row | same |
| 3 | 3 & 168 | EP-00011 | same id, **conflicting quality** (`bad` vs `good`) | first wins, later skipped: `conflicting_duplicate_in_file`, flagged loudly in report (never silently picks the better quality) |
| 4 | 189 | `ep-00003` | lowercase id; collides with EP-00003 (line 9) but **different data** | normalise id to upper-case + trim; then treated as a conflicting duplicate of EP-00003 |
| 5 | 59 | (blank id) | missing `episode_id` | reject: `missing_episode_id` |
| 6 | 32 | EP-00008 | leading space in `robot_id` (` arm-01`) | trim, import |
| 7 | 158, 163 | EP-00006, EP-00007 | task name `  Pick Cup `, `PICK CUP` | normalise (trim, collapse spaces, lowercase) to `pick cup`, import |
| 8 | 65, 133 | EP-00009, EP-00010 | quality `Good`, `USABLE` | lowercase, import |
| 9 | 79 | EP-00020 | quality `excellent` (not in enum) | reject: `invalid_quality` (do not guess a mapping) |
| 10 | 69 | EP-00019 | blank quality | reject: `missing_quality` (quality gates assignability, so no default) |
| 11 | 29 | EP-00014 | date `14/08/2026 09:15` | parse as DD/MM/YYYY HH:MM (day 14 proves day-first) |
| 12 | 35 | EP-00013 | date `2026-08-14 09:12:00` (space, not `T`) | accept |
| 13 | 127 | EP-00015 | date with `Z` suffix | accept as UTC |
| 14 | 131 | EP-00023 | `not a date` | reject: `invalid_recorded_at` |
| 15 | 113 | EP-00025 | `2031-01-01T00:00:00` (future, looks like a sentinel) | reject: `recorded_at_in_future` |
| 16 | 66 | EP-00018 | `duration_seconds` = `45.5` | reject: `invalid_duration` (column is integer seconds; don't silently round) |
| 17 | 95 | EP-00016 | blank duration | reject: `missing_duration` |
| 18 | 100 | EP-00017 | duration `-5` | reject: `invalid_duration` |
| 19 | 187 | EP-90003 | duration `N/A` | reject: `invalid_duration` |
| 20 | 188 | EP-90004 | duration `999999` (implausible) | reject: `invalid_duration` (bound 1..3600) |
| 21 | 162 | EP-00024 | robot `arm-99` (unknown) | reject: `unknown_robot` |
| 22 | 170 | EP-00021 | blank robot | reject: `missing_robot_id` |
| 23 | 185 | EP-90001 | malformed: only 6 fields (missing quality) | reject: `malformed_row` |
| 24 | 186 | EP-90002 | task `"pick cup, then place"` (valid quoted CSV, not a standard task) | accept; no task catalogue exists |
| 25 | 190 | EP-90005 | blank `operator_name` | **import with NULL operator + warning** (see ambiguity A5) |
| 26 | 191-192 | n/a | blank / whitespace-only lines | ignore silently, counted as `blank_lines` |

Expected on first import (to be verified by test): 189 data lines, minus 2 blank-ish handled separately; rejects #3-5, 9-10, 14-23 plus 3 duplicates. Exact counts will be asserted in a test and pasted into NOTES.md.

Generator file: IDs `EP-100000+`, 7 task names, 6 operator names, 5 robots, quality mix 60/30/10 good/usable/bad, dates 2025-09 to 2026-09. Use for 200k-row import and analytics timing evidence.

Seed users (S-README): `admin@example.com/admin123`, `ops1@example.com` & `ops2@example.com` /`ops123`, `client-a@example.com` & `client-b@example.com` /`client123`. Weak, dev-only; must be documented as such.

---

## 3. Implicit expectations (what a strong reviewer will look for)

Derived from B§8 (five roughly equal weights: domain-rule correctness, data modelling & queries, engineering practice, operability, written reasoning).

**Domain correctness**
- Rules enforced in the **service layer and the DB** (unique constraint on `assignments.episode_id`, CHECK constraints on enums), not just in the UI. Concurrency-safe: two operators assigning the same episode at once -> exactly one wins (409), tested.
- `delivered` guard counted under a row lock to avoid races with unassign.
- 403 vs 404 policy for client accessing another client's request (prefer 404, no existence leak).
- Admin safeguards: cannot deactivate/demote self or the last admin; deactivated user's tokens stop working immediately.
- Import: transactional, batched, idempotent via `ON CONFLICT`, per-row reasons, no partial-state corruption on crash.

**Data modelling & queries**
- Proper types (`timestamptz`, enums/CHECK), FKs, indexes matching the analytics queries (`recorded_at`, `(task_name, quality)`, `assignments(request_id)`), status history table.
- Analytics with `date_trunc`/`GROUP BY`, `percentile_cont(0.5)`, `LIMIT 5`; `EXPLAIN` evidence at 200k rows; a reasoned 5M-row discussion (index-only scans, partitioning by month, rollup/materialised view, BRIN on `recorded_at`).
- Pagination on the episode list (200k rows must not be dumped).

**Engineering practice**
- Tests chosen deliberately for the four named areas; fast; runnable with one command; runs against real Postgres (not a mock) if feasible.
- Migrations (Alembic) applied automatically on `compose up`; pinned dependencies; lint/format config; CI; `.gitignore`; no secrets in repo (`.env.example`).
- Conventional, incremental commits, no AI attribution lines (per user's global rule).
- Small modules, typed code (pydantic schemas), consistent error envelope.

**Operability**
- JSON structured access log (method, path, status, duration_ms, user_id, request_id); `/health` that checks DB; sensible 4xx/5xx handling with no stack traces leaked; config via env vars; graceful startup ordering (db healthcheck -> migrate -> seed -> api).

**Security**
- Password hashing (argon2id or bcrypt), constant-time compare, generic login errors, login rate limiting or at least noted; token expiry; CORS locked down; input validation via pydantic; parameterised queries only; upload size limit and CSV safety (formula-injection note); output escaping in UI; secure default secret handling.

**UX/Frontend**
- Obvious status badges, only valid actions shown (but server is the authority), loading/error states, filters, pagination.

**Written reasoning (big weight)**
- NOTES.md honest and specific, including the "what went wrong" section being a *real* incident from the build, not invented.

**Interview readiness**
- Every line must be explainable and extendable live. Favour boring, readable choices over clever ones.

---

## 4. Evaluation criteria, stated or hinted
- B§8: roughly equal weight on (1) domain-rule correctness (auth, transitions, assignments, import), (2) data modelling & queries, (3) engineering practice (tests, migrations, Docker, CI, Git history, clarity), (4) operability (logging, health, error handling, one-command startup), (5) written reasoning. Stretch item is bonus only.
- B§6: honesty, scope control, Git history, ability to defend code live.
- B§1 hint: "smaller, solid, well-explained system" over a large unfinished one.
- B§4.3: tests judged by *choice*, not coverage.

---

## 5. Ambiguities, contradictions, missing details (with proposed assumptions)

Items marked **[ASK]** could materially change the design; a draft email is in section 6.

| ID | Ambiguity | Proposed assumption |
|---|---|---|
| A1 **[ASK]** | Must an assigned episode's `task_name` match the request's `task_name`? Brief states no such rule, yet the UI filters by task_name. | **Don't enforce** (not a stated rule). UI pre-filters by the request's task, and API returns the mismatch in the response so UI can warn. Easy to flip to a hard rule behind one check. |
| A2 **[ASK]** | Re-importing an `episode_id` that already exists but with *different* values (e.g. the EP-00011 conflict across runs). Overwrite or skip? | **Skip + report as `conflict_with_existing`; never overwrite.** Rationale: overwriting `quality` of an already-assigned episode to `bad` would silently break the assignment invariant. Identical re-import -> `unchanged`. |
| A3 **[ASK]** | Date format `14/08/2026` day-first or month-first? Naive timestamps' timezone? | Day-first (only one row, 14 > 12 settles it). Naive = UTC; `Z` = UTC; stored `timestamptz`. |
| A4 **[ASK]** | In which request statuses may episodes be assigned/unassigned? Brief silent. | Assign/unassign allowed in `submitted` and `in_progress` only; frozen from `delivered` onward (rework `rejected -> in_progress` reopens it). Rejected request keeps its episodes. |
| A5 | Blank `operator_name` (EP-90005): reject or import? Brief lists it as a field but it does not affect any rule. | Import with NULL + warning counted in report. Other blank fields (robot, quality, duration, id, date) are rejected since they drive rules/analytics. |
| A6 | Duration bounds and non-integer values. | Integer seconds, 1..3600; `45.5` rejected not rounded. |
| A7 | Unknown robot: where do known robots live? | `robots` reference table seeded with the 5 known; import rejects others. (Admin UI to add robots is out of scope.) |
| A8 | Task name canonicalisation. | trim + collapse whitespace + lowercase. Request `task_name` normalised the same way. Free text, no catalogue. |
| A9 | Over-assignment (more than `episodes_requested`)? | Allowed ("at least" wording); delivery gate is `>=`. |
| A10 | Who may create requests? Brief lists only clients; admin = operator-superset. | Clients only. Operators/admins cannot create or accept/reject on a client's behalf. |
| A11 | Do clients see assigned episodes? | Yes, read-only list on their own request (cheap, useful). |
| A12 | Request fields: `deadline` type and validation; `episodes_requested` bounds; `notes` length. | `deadline` a date, must be today or later at creation; `episodes_requested` 1..100000; notes <= 2000 chars. Operator cannot edit request content. |
| A13 | Analytics date-range semantics: filter on what? | (a),(c) by `recorded_at`; (b) by request `submitted_at` in range. Range inclusive-start, exclusive-end (`from`/`to` ISO dates), UTC day buckets. Median is time from the **first** `submitted` to the **first** `delivered` event; undelivered excluded; `null` if none. Ties in top-5 broken alphabetically. |
| A14 | Who can call analytics? | operator + admin only (a client would otherwise see global data). |
| A15 | Auth mechanism unspecified. | Decide in research (leading candidate: short-lived signed JWT in `Authorization: Bearer`, argon2/bcrypt hashes, user `is_active` re-checked on each request so deactivation is immediate). |
| A16 | Admin user-management UI required? Brief's UI section mentions only client + operator flows. | API fully implemented + tested; minimal UI only if time remains. |
| A17 | Import via endpoint or CLI. Operators have the import permission, which implies an HTTP path. | Both, sharing one service: `POST /imports` (multipart, operator/admin) and `python -m app.cli import-episodes FILE`. Whole file processed in one transaction in batches; row-level rejects don't abort the file. Max upload size capped. |
| A18 | Persist import reports? | Store an `import_runs` row (who, when, file hash, counts) and return the full per-row report in the response. |
| A19 | Status history for initial creation. | Creation writes a `null -> submitted` event with the client as actor. |
| A20 | Soft vs hard delete of users. | Deactivate only (`is_active=false`); no deletes anywhere. |
| A21 | Timeline: brief says 6-8h, deadline gives ~1.5 calendar days from now (2026-10-03). | Scope for ~7h; stretch only after MUST items pass. |
| A22 | Repo root. The pack sits in `Neotix/candidate-pack/`. | Build the repo at `Neotix/` root; copy `seed/` into the repo (`seed/` dir kept as provided so the generator and README still make sense); don't commit the zip or `.DS_Store`. |

**Contradictions / tensions noticed (none blocking)**
- B§4.1 says SQLite acceptable while B§4.3 wants one-command full-stack: not a conflict, but the analytics requirement (median via `percentile_cont`, in-DB) favours Postgres; choose Postgres.
- B§4.2 "keep it small" vs "functionality and correctness matter": interpreted as minimal styling, full correct behaviour.
- B§0 says "brief is explicit about what matters most (section 8)": section 8 is the evaluation weights, so I'm treating the five buckets as the prioritisation.
- S-README says "an unknown robot" (singular), but data has one unknown (`arm-99`) and one blank robot; handled as two distinct reject reasons.
- Seed passwords are weak (`admin123`): required by the brief; documented as dev-only, and the seed step is gated so it cannot silently run in a production-like env.
- Tooling note: TaskCreate/TaskUpdate are not available in this session, so progress is tracked by the phase checklists and this file's tick boxes.

---

## 6. Draft clarification email (optional; I proceed on the assumptions above meanwhile)

> **Subject:** Clarifying questions: Dataset Request Desk technical test
>
> Hello,
>
> Thank you for the opportunity. I'm making good progress and have a few short questions. I have written down a default assumption for each so I am not blocked, and I'll adjust if you prefer otherwise:
>
> 1. **Task matching on assignment:** should an episode's `task_name` have to match the request's `task_name` to be assigned? I am assuming it does not (the brief states only the quality and one-request rules), but the UI will pre-filter by the request's task.
> 2. **Re-importing existing IDs with different values:** if an `episode_id` already exists but a later CSV carries different values (e.g. a different `quality`), I plan to skip it and report it as a conflict rather than overwrite, so that quality cannot change under an existing assignment. Is that the behaviour you would want?
> 3. **Dates:** I read `14/08/2026 09:15` as day-first, and treat timestamps without a timezone as UTC. Is that right?
> 4. **Assignment window:** I plan to allow assigning/unassigning episodes only while a request is `submitted` or `in_progress` (locked once `delivered`). Is that acceptable?
>
> Thanks, and kind regards,
> [Your name]
