"""Operational commands: python -m app.cli seed | seed-demo | import-episodes FILE | create-admin"""

import argparse
import getpass
import logging
import os
import sys
from pathlib import Path

from app import demo_data
from app.config import settings
from app.db import SessionLocal
from app.errors import AppError
from app.services import importer, users

log = logging.getLogger("app.cli")


def seed(force: bool = False) -> None:
    if settings.app_env == "production" and not (force or settings.seed_force):
        log.warning("Refusing to seed demo users in production (use --force or SEED_FORCE=true).")
        return
    with SessionLocal() as db:
        created = users.seed_users(db, settings.seed_dir / "users.json")
        print(f"seed users created: {created or 'none (already present)'}")
        sample = settings.seed_dir / "episodes.csv"
        if settings.seed_sample_episodes and importer.episode_count(db) == 0 and sample.exists():
            report = importer.import_episodes(db, None, sample.name, sample.read_bytes())
            print(
                f"sample episodes imported: {report['imported']} "
                f"(skipped {report['skipped_count']}, see /api/imports/{report['import_run_id']})"
            )
        if settings.seed_demo_activity:
            print(f"demo activity: {demo_data.populate(db)}")


def seed_demo() -> None:
    with SessionLocal() as db:
        print(f"demo activity: {demo_data.populate(db)}")


def import_episodes(path: Path) -> None:
    import json

    with SessionLocal() as db:
        report = importer.import_episodes(db, None, path.name, path.read_bytes())
    print(json.dumps(report, indent=2, default=str))


MIN_ADMIN_PASSWORD_LENGTH = 12


def create_admin(email: str, name: str, password: str) -> None:
    """Bootstrap the first administrator, e.g. in production where demo users are never seeded."""
    if len(password) < MIN_ADMIN_PASSWORD_LENGTH:
        raise SystemExit(f"Password must be at least {MIN_ADMIN_PASSWORD_LENGTH} characters.")
    with SessionLocal() as db:
        try:
            user = users.create_user(db, email=email, name=name, role="admin", password=password)
        except AppError as exc:
            raise SystemExit(exc.message) from None
    print(f"admin created: {user.email}")


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("seed", help="create demo users (and sample episodes if enabled)")
    s.add_argument("--force", action="store_true")
    sub.add_parser(
        "seed-demo", help="add realistic demo requests, history and episodes (idempotent)"
    )
    i = sub.add_parser("import-episodes", help="import an episodes CSV; prints the report")
    i.add_argument("file", type=Path)
    a = sub.add_parser(
        "create-admin", help="create an administrator (password from $ADMIN_PASSWORD or a prompt)"
    )
    a.add_argument("--email", required=True)
    a.add_argument("--name", required=True)
    args = parser.parse_args(argv)
    if args.command == "create-admin":
        password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password: ")
        create_admin(args.email, args.name, password)
    elif args.command == "seed-demo":
        seed_demo()
    elif args.command == "seed":
        seed(args.force)
    else:
        import_episodes(args.file)


if __name__ == "__main__":
    sys.exit(main())
