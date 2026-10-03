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
