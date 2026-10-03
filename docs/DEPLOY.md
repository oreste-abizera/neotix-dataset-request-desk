# Deployment (stretch item: public deployment with HTTPS)

**Status, stated plainly:** the production stack below is built and was verified **locally** (HTTPS via Caddy's internal CA on `localhost`, HTTP/2, HSTS, `Secure` cookie, first admin by CLI, roles, SSE through both proxies, CSRF rejection, no demo users, API docs off). It has **not** been deployed to a public host from this repository, because that needs a server and a domain on your own account. **No public URL is claimed.** Let's Encrypt issuance is the one step I could not exercise locally.

## What gets deployed

```
Internet ─:443─► Caddy (automatic HTTPS, HSTS) ─► nginx (static UI, /api proxy) ─► FastAPI (+ export workers) ─► PostgreSQL
                  :80 redirects to HTTPS                                                 only Caddy publishes ports
```

`deploy/docker-compose.prod.yml` differs from the development compose file in these ways:

| | development (`docker-compose.yml`) | production (`deploy/`) |
|---|---|---|
| Published ports | web 8080, api 8000, db 5433 (localhost) | **only Caddy 80/443**; db and api are private |
| `APP_ENV` | `development` | `production`: `Secure` cookies, API docs off, demo seed refused |
| Users | demo users seeded | **none**; first admin via `create-admin` |
| Sample episodes | imported | not imported |
| DB password | fixed dev value | required from the env file, compose refuses to start without it |

## Secrets

* The only secret is the database password (sessions are random tokens stored hashed in the DB; there is no signing key to leak). It lives in `deploy/.env.prod`, which is git-ignored (`.env.prod.example` is the template) and should be `chmod 600` on the server.
* Nothing secret is baked into an image or committed. Generate with `python3 -c "import secrets; print(secrets.token_urlsafe(32))"`.
* Admin passwords are passed to the CLI through the `ADMIN_PASSWORD` environment variable or an interactive prompt (min. 12 characters), never on the command line.
* Rotation: change the password inside Postgres (`ALTER USER neotix PASSWORD '…'`), update `.env.prod`, `docker compose … up -d`. To invalidate every login: `DELETE FROM sessions;`.
* On a managed platform, replace the env file with that platform's secret store; the app reads everything from environment variables.

## Database management

* PostgreSQL 16 in a named volume (`pgdata`). **Migrations run automatically** on every API start (`alembic upgrade head` in the image command) and are idempotent.
* Backups (run from cron on the host, copy off the machine):
  `docker compose -f deploy/docker-compose.prod.yml exec -T db pg_dump -U neotix -Fc neotix > neotix-$(date +%F).dump`
  Restore: `… exec -T db pg_restore -U neotix -d neotix --clean < neotix-YYYY-MM-DD.dump`.
* Better for real use: a managed Postgres (point `DATABASE_URL` at it and delete the `db` service) for point-in-time recovery and automated backups.

## Steps on a fresh server (any VPS or free-tier VM with Docker)

1. Point a DNS A/AAAA record (e.g. `desk.oreste.dev`) at the server; open ports 80 and 443.
2. `git clone <repo> && cd <repo> && cp deploy/.env.prod.example deploy/.env.prod` and set `SITE_ADDRESS` and `POSTGRES_PASSWORD`.
3. `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build --wait`
4. Create the first administrator, then create operators and clients from the **Users** page:
   `docker compose -f deploy/docker-compose.prod.yml exec -e ADMIN_PASSWORD='…' api python -m app.cli create-admin --email you@oreste.dev --name "Your Name"`
5. Check `https://<your-domain>/health`. Caddy obtains and renews the certificate itself; keep the `caddy_data` volume.
6. Update: `git pull && docker compose … up -d --build`.

## Known limits of this setup
Single host, single API instance (the SSE broker and login throttle are per-process, see NOTES §5), no automated off-site backups, no external monitoring. Importing large files holds them in memory (50 MB cap).
