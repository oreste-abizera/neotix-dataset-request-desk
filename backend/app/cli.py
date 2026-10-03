"""Operational commands:  python -m app.cli seed | import-episodes FILE"""

import argparse
import logging
import sys
from pathlib import Path

from app.config import settings
from app.db import SessionLocal
from app.services import importer, users

log = logging.getLogger("app.cli")


def seed(force: bool = False) -> None:
    if settings.app_env == "production" and not force:
        log.warning("Refusing to seed demo users in production (use --force to override).")
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


def import_episodes(path: Path) -> None:
    import json

    with SessionLocal() as db:
        report = importer.import_episodes(db, None, path.name, path.read_bytes())
    print(json.dumps(report, indent=2, default=str))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    s = sub.add_parser("seed", help="create demo users (and sample episodes if enabled)")
    s.add_argument("--force", action="store_true")
    i = sub.add_parser("import-episodes", help="import an episodes CSV; prints the report")
    i.add_argument("file", type=Path)
    args = parser.parse_args(argv)
    if args.command == "seed":
        seed(args.force)
    else:
        import_episodes(args.file)


if __name__ == "__main__":
    sys.exit(main())
