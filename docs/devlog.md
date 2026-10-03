# Dev log (raw notes for NOTES.md section 3)

- Compose `postgres:17-alpine` pull hung for minutes on this network; switched to `postgres:16-alpine` (already cached; PG16 has every feature used).
- Auth test that "every route requires authentication" first collected **zero** cases and passed silently:
  FastAPI 0.142 includes routers lazily (`app.routes` holds `_IncludedRouter` objects, not `APIRoute`).
  Diagnosed with `pytest -rs` ("empty parameter set"), then enumerated routes from `app.openapi()["paths"]`.
  The corrected test immediately found a real bug: `POST /auth/logout` was reachable without auth.
