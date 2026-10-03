# Dev log (raw notes for NOTES.md section 3)

- Compose `postgres:17-alpine` pull hung for minutes on this network; switched to `postgres:16-alpine` (already cached; PG16 has every feature used).
- Auth test that "every route requires authentication" first collected **zero** cases and passed silently:
  FastAPI 0.142 includes routers lazily (`app.routes` holds `_IncludedRouter` objects, not `APIRoute`).
  Diagnosed with `pytest -rs` ("empty parameter set"), then enumerated routes from `app.openapi()["paths"]`.
  The corrected test immediately found a real bug: `POST /auth/logout` was reachable without auth.
- 200k import took 40s on first attempt. `cProfile` on 20k rows showed ~55% of time in SQLAlchemy *compiling* the
  2000-row multi-VALUES INSERT for every chunk (new literal values each time = no statement cache).
  Executing one cached `INSERT ... ON CONFLICT DO NOTHING RETURNING` with a list of parameter sets cut it to ~17s.
- First median query filtered `submitted_at` *after* aggregating events, so `EXPLAIN ANALYZE` showed it reading every
  request however narrow the date range. Rewrote it to filter on indexed `requests.created_at` first (migration 0002);
  narrow window now uses an index scan (8ms -> 1.7ms at 5k requests, and no longer grows with total requests).
- SSE test `test_service_actions_publish_events_to_subscribers` timed out waiting for the 3rd event: `create_request`
  never published. My scripted string-replace had silently not matched (ruff had already re-wrapped that line).
  Lesson: scripted edits must assert they changed something; the behaviour test caught it, not the edit.
- Self-review found the importer would raise `csv.Error` (field > 128 KB) and psycopg `DataError` (NUL byte) as 500s;
  both now return 422 `invalid_csv` before anything is written (test added).
- Background-export work: adding `db.flush()` + enqueue before the `try: db.commit() except IntegrityError` in
  `assign_episodes` moved the primary-key collision (two operators racing for one episode) *outside* the handler, so
  the loser got a 500. The existing two-thread race test caught it only intermittently (1 failure in a Docker run; 0 in
  30 local loops). Fixed by moving add/flush/enqueue/commit inside the `try`, and added a deterministic regression test
  (one session holds an uncommitted assignment, a second operator blocks on it, then collides at flush time). Verified
  the new test fails against the old structure.
- Frontend upgrade: the new session-expiry test failed (UI stayed on the signed-in shell after a 401). Cause:
  `queryClient.clear()` detaches live observers, so the following `setQueryData(me, null)` updated a query nobody was
  watching. A real bug in my first draft of the new data layer, found by the test, not by manual use. Fixed with one
  `resetSession()` helper that removes every query except "who am I" and then sets it.
- Screenshots for the README were captured with puppeteer-core driving Chrome with real mobile emulation. They exposed a
  mobile layout bug my earlier checks missed: the browser pane's "mobile" viewport had silently reset to 656 px, so
  nothing at 390 px had really been measured. Two causes (grid column min-width; an `sr-only` span positioned against
  the page inside a scroll container). A pixel-level overflow check across every page now reports 0.
- A scripted edit that moved an `eslint-disable-next-line` comment turned a clean lint into an error; running only
  `eslint | tail` hid it. Lesson: look at the exit status, not the tail of the output.
