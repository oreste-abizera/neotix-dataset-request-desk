"""CSV episode import. Safe to re-run: new rows are inserted, existing ones are never modified."""

import csv
import hashlib
import io
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session as DbSession

from app.errors import Unprocessable
from app.models import Episode, ImportRun, Robot
from app.services.csv_rules import REQUIRED_COLUMNS, EpisodeRow, validate_row

CHUNK = 2000
MAX_REPORTED = 1000  # per-row detail is capped in the stored/returned report; counts are exact

_COMPARED = ("robot_id", "task_name", "recorded_at", "duration_seconds", "operator_name", "quality")


def _parse(data: bytes, known_robots: frozenset[str], now: datetime):
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise Unprocessable("File is not valid UTF-8.", code="invalid_encoding") from None
    reader = csv.reader(io.StringIO(text, newline=""))
    header = next(reader, None)
    if header is None:
        raise Unprocessable("File is empty.", code="invalid_header")
    header = [h.strip().lower() for h in header]
    missing = [c for c in REQUIRED_COLUMNS if c not in header]
    if missing:
        raise Unprocessable(
            f"Missing required columns: {', '.join(missing)}.",
            code="invalid_header",
            details={"missing": missing},
        )

    blank = 0
    total = 0
    skipped: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    first_seen: dict[str, tuple[int, EpisodeRow]] = {}
    for fields in reader:
        line = reader.line_num
        if not any(f.strip() for f in fields):
            blank += 1
            continue
        total += 1
        if len(fields) != len(header):
            skipped.append(
                {
                    "line": line,
                    "episode_id": (fields[0].strip().upper() or None) if fields else None,
                    "reason": "malformed_row",
                    "detail": f"expected {len(header)} fields, found {len(fields)}",
                }
            )
            continue
        row, error, row_warnings = validate_row(
            dict(zip(header, fields, strict=True)), known_robots, now
        )
        if error:
            raw_id = fields[header.index("episode_id")].strip().upper()
            skipped.append(
                {
                    "line": line,
                    "episode_id": raw_id or None,
                    "reason": error.reason,
                    "detail": error.detail,
                }
            )
            continue
        for code in row_warnings:
            warnings.append({"line": line, "episode_id": row.episode_id, "code": code})
        earlier = first_seen.get(row.episode_id)
        if earlier is None:
            first_seen[row.episode_id] = (line, row)
        elif earlier[1].comparable() == row.comparable():
            skipped.append(
                {
                    "line": line,
                    "episode_id": row.episode_id,
                    "reason": "duplicate_in_file",
                    "detail": f"identical to line {earlier[0]}",
                }
            )
        else:
            skipped.append(
                {
                    "line": line,
                    "episode_id": row.episode_id,
                    "reason": "conflicting_duplicate_in_file",
                    "detail": f"same id as line {earlier[0]} but different values; first kept",
                }
            )
    return total, blank, skipped, warnings, first_seen


def _as_values(row: EpisodeRow, run_id: int) -> dict[str, Any]:
    return {
        "episode_id": row.episode_id,
        "robot_id": row.robot_id,
        "task_name": row.task_name,
        "recorded_at": row.recorded_at,
        "duration_seconds": row.duration_seconds,
        "operator_name": row.operator_name,
        "quality": row.quality,
        "import_run_id": run_id,
    }


def import_episodes(
    db: DbSession, user_id: int | None, filename: str, data: bytes
) -> dict[str, Any]:
    now = datetime.now(UTC)
    known_robots = frozenset(db.scalars(select(Robot.robot_id)))
    total, blank, skipped, warnings, first_seen = _parse(data, known_robots, now)

    run = ImportRun(
        user_id=user_id,
        filename=filename[:255],
        sha256=hashlib.sha256(data).hexdigest(),
        summary={},
    )
    db.add(run)
    db.flush()

    pending = list(first_seen.values())  # (line, row) in file order
    inserted = 0
    unchanged = 0
    for start in range(0, len(pending), CHUNK):
        chunk = pending[start : start + CHUNK]
        # One cached statement executed with a list of parameter sets (batched by SQLAlchemy),
        # rather than a giant per-chunk VALUES clause that would be recompiled every time.
        stmt = (
            insert(Episode.__table__)
            .on_conflict_do_nothing(index_elements=["episode_id"])
            .returning(Episode.episode_id)
        )
        new_ids = set(db.scalars(stmt, [_as_values(row, run.id) for _, row in chunk]))
        inserted += len(new_ids)
        existing = [(line, row) for line, row in chunk if row.episode_id not in new_ids]
        if not existing:
            continue
        stored = {
            e.episode_id: e
            for e in db.scalars(
                select(Episode).where(Episode.episode_id.in_([r.episode_id for _, r in existing]))
            )
        }
        for line, row in existing:
            current = stored[row.episode_id]
            diffs = [
                f"{col}: stored {getattr(current, col)!r}, file {getattr(row, col)!r}"
                for col in _COMPARED
                if getattr(current, col) != getattr(row, col)
            ]
            if diffs:
                skipped.append(
                    {
                        "line": line,
                        "episode_id": row.episode_id,
                        "reason": "conflict_with_existing",
                        "detail": "; ".join(diffs) + " (existing record kept)",
                    }
                )
            else:
                unchanged += 1

    skipped.sort(key=lambda s: s["line"])
    counts = dict(Counter(s["reason"] for s in skipped))
    warning_counts = dict(Counter(w["code"] for w in warnings))
    report = {
        "import_run_id": run.id,
        "filename": run.filename,
        "sha256": run.sha256,
        "total_rows": total,
        "blank_lines": blank,
        "imported": inserted,
        "unchanged": unchanged,
        "skipped_count": len(skipped),
        "skipped_by_reason": counts,
        "warnings_by_code": warning_counts,
        "skipped": skipped[:MAX_REPORTED],
        "warnings": warnings[:MAX_REPORTED],
        "details_truncated": len(skipped) > MAX_REPORTED or len(warnings) > MAX_REPORTED,
    }
    run.summary = report
    db.commit()
    return report


def episode_count(db: DbSession) -> int:
    return db.scalar(select(func.count()).select_from(Episode)) or 0
