"""Realistic demo activity, so a staging or local demo never opens on empty screens.

Creates extra demo clients, about 1,400 recorded episodes spread over the last 80 days (imported
through the real importer, in three files), and 48 requests in every workflow state with a plausible
history: who did what, when, assigned episodes, export jobs (including a failed batch to retry and
a fresh batch that the worker picks up live). Everything obeys the domain rules by construction.

Idempotent: once the extra demo clients have requests, nothing is added again.
Run with `python -m app.cli seed-demo`, or automatically by `seed` when SEED_DEMO_ACTIVITY=true.
"""

import csv
import io
import random
from collections import defaultdict
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.domain import ASSIGNABLE_QUALITIES, KNOWN_ROBOTS
from app.models import (
    Assignment,
    Episode,
    EpisodeExport,
    ImportRun,
    Request,
    StatusEvent,
    User,
)
from app.services import importer, users

EPISODE_PREFIX = "EP-D"
DEMO_PASSWORD = "client123"  # noqa: S105  (public demo credential, documented in the README)
EXTRA_CLIENTS = (
    ("client-c@oreste.dev", "Northwind Labs"),
    ("client-d@oreste.dev", "Globex Robotics"),
)
TASKS = (
    "pick cup",
    "place cup on shelf",
    "open drawer",
    "fold towel",
    "pour water",
    "stack blocks",
    "wipe table",
)
RECORDERS = ("Aline", "Eric", "Diane", "Patrick", "Jeanne", "Kevin")
NOTES = (
    "Need varied lighting and at least two robots.",
    "Mostly interested in clean grasps; failures are useful too if labelled.",
    "Please avoid episodes shorter than 20 seconds.",
    "For a perception benchmark; diversity of backgrounds matters more than volume.",
    "Kitchen-like environments preferred.",
    "Second batch for our fine-tuning run. Same spec as last time.",
    "Deadline is firm: it feeds a customer demo.",
    "",
    "",
)
# (final status, how many, created this many days ago: min, max)
PLAN = (
    ("accepted", 16, 22, 58),
    ("delivered", 8, 4, 20),
    ("rejected", 4, 6, 25),
    ("in_progress", 9, 2, 16),
    ("submitted", 11, 0, 9),
)
REQUESTED = (5, 8, 10, 12, 15, 20, 25, 40)
EXPORT_ERROR = "ExportError: simulated transient export failure"


def _episodes_csv(rng: random.Random, now: datetime, first: int, count: int, days: int) -> bytes:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(
        [
            "episode_id",
            "robot_id",
            "task_name",
            "recorded_at",
            "duration_seconds",
            "operator_name",
            "quality",
        ]
    )
    for i in range(first, first + count):
        recorded = now - timedelta(minutes=rng.randint(30, days * 24 * 60))
        w.writerow(
            [
                f"{EPISODE_PREFIX}{i:05d}",
                rng.choice(KNOWN_ROBOTS),
                rng.choice(TASKS),
                recorded.strftime("%Y-%m-%dT%H:%M:%S"),
                rng.randint(8, 120),
                rng.choice(RECORDERS),
                rng.choices(["good", "usable", "bad"], weights=[6, 3, 1])[0],
            ]
        )
    return out.getvalue().encode()


def _ensure_clients(db: Session) -> list[User]:
    for email, name in EXTRA_CLIENTS:
        if not db.scalar(select(User.id).where(User.email == email)):
            users.create_user(
                db, email=email, name=name, role="client", password=DEMO_PASSWORD, organisation=name
            )
    return list(db.scalars(select(User).where(User.role == "client").order_by(User.email)))


def _timeline(
    rng: random.Random, created: datetime, final: str, rework: bool
) -> list[tuple[str | None, str, str, datetime]]:
    """[(from, to, actor_kind, time)] ending in `final`. actor_kind is 'client' or 'operator'."""
    hours = lambda lo, hi: timedelta(hours=rng.uniform(lo, hi))  # noqa: E731
    t = created
    steps: list[tuple[str | None, str, str, datetime]] = [(None, "submitted", "client", t)]
    if final == "submitted":
        return steps
    t += hours(2, 30)
    steps.append(("submitted", "in_progress", "operator", t))
    if final == "in_progress" and not rework:
        return steps
    t += hours(30, 150)
    steps.append(("in_progress", "delivered", "operator", t))
    if final == "delivered":
        return steps
    t += hours(3, 60)
    if final == "accepted" and not rework:
        steps.append(("delivered", "accepted", "client", t))
        return steps
    steps.append(("delivered", "rejected", "client", t))
    if final == "rejected":
        return steps
    t += hours(2, 24)
    steps.append(("rejected", "in_progress", "operator", t))
    if final == "in_progress":
        return steps
    t += hours(20, 90)
    steps.append(("in_progress", "delivered", "operator", t))
    t += hours(3, 60)
    steps.append(("delivered", "accepted", "client", t))
    return steps


def populate(db: Session, now: datetime | None = None, seed: int = 7) -> dict[str, Any]:
    now = now or datetime.now(UTC)
    rng = random.Random(seed)  # noqa: S311  (deterministic demo data, not security)

    clients = _ensure_clients(db)
    marker = db.scalar(
        select(Request.id)
        .join(User, User.id == Request.client_id)
        .where(User.email == EXTRA_CLIENTS[0][0])
        .limit(1)
    )
    if marker is not None:
        return {"skipped": True}

    operators = list(db.scalars(select(User).where(User.role == "operator").order_by(User.email)))
    if not operators or not clients:
        raise RuntimeError("Seed the demo users first (python -m app.cli seed).")

    # --- episodes, imported through the real importer in three files -------------------------
    imports = []
    first = 1
    for i, (count, days, age) in enumerate(((700, 80, 28), (450, 45, 14), (250, 20, 2))):
        data = _episodes_csv(rng, now, first, count, days)
        run_user = operators[i % len(operators)].id
        label = (now - timedelta(days=age)).isocalendar()
        report = importer.import_episodes(
            db, run_user, f"recordings-{label.year}-w{label.week:02d}.csv", data
        )
        run = db.get(ImportRun, report["import_run_id"])
        run.created_at = now - timedelta(days=age)
        imports.append(report["imported"])
        first += count
    db.commit()

    pool: dict[str, list[str]] = defaultdict(list)
    rows = db.execute(
        select(Episode.episode_id, Episode.task_name, Episode.quality)
        .where(Episode.episode_id.like(f"{EPISODE_PREFIX}%"))
        .outerjoin(Assignment, Assignment.episode_id == Episode.episode_id)
        .where(Assignment.episode_id.is_(None))
        .order_by(Episode.episode_id)
    ).all()
    for eid, task, quality in rows:
        if quality in ASSIGNABLE_QUALITIES:
            pool[task].append(eid)
    for ids in pool.values():
        rng.shuffle(ids)

    def take(task: str, n: int) -> list[str]:
        picked = [pool[task].pop() for _ in range(min(n, len(pool[task])))]
        return picked

    # --- requests -----------------------------------------------------------------------------
    stats: dict[str, int] = defaultdict(int)
    special_failed = special_fresh = False
    n = 0
    for final, count, age_lo, age_hi in PLAN:
        for k in range(count):
            n += 1
            client = clients[n % len(clients)]  # round-robin: every organisation has history
            operator = operators[(n + k) % len(operators)]
            task = TASKS[(n * 3 + k) % len(TASKS)]
            requested = rng.choice(REQUESTED)
            rework = final in ("accepted", "in_progress") and rng.random() < 0.25
            if final == "in_progress" and not rework and k == 0:
                rework = False
            created = now - timedelta(days=rng.uniform(age_lo, age_hi))
            steps = _timeline(rng, created, final, rework)
            overshoot = steps[-1][3] - (now - timedelta(minutes=20))
            if overshoot > timedelta(0):  # never record events in the future
                steps = [(a, b, c, t - overshoot) for a, b, c, t in steps]
            created = steps[0][3]
            last = steps[-1][3]

            request = Request(
                client_id=client.id,
                task_name=task,
                episodes_requested=requested,
                deadline=(created + timedelta(days=rng.randint(10, 45))).date(),
                notes=rng.choice(NOTES),
                status=final,
                created_at=created,
                updated_at=last,
            )
            db.add(request)
            db.flush()
            for frm, to, kind, at in steps:
                db.add(
                    StatusEvent(
                        request_id=request.id,
                        from_status=frm,
                        to_status=to,
                        actor_id=client.id if kind == "client" else operator.id,
                        created_at=at,
                    )
                )
            stats[final] += 1

            # assignments: only once work has started
            if final == "submitted":
                continue
            started = next(t for _, to, _, t in steps if to == "in_progress")
            # k=5 / k=6 hold the failed and the freshly queued export batches (>= 4 episodes)
            ready_full = final == "in_progress" and k in (1, 2, 3, 5, 6)
            if final == "in_progress" and not ready_full:
                want = rng.randint(1, max(1, requested - 1)) if requested > 1 else 0
            elif final == "in_progress":
                want = requested
            else:
                want = requested + rng.choice((0, 0, 0, 1, 2))
            chosen = take(task, want)
            window_end = (
                now
                if final == "in_progress"
                else next(t for _, to, _, t in steps if to == "delivered")
            )
            for idx, eid in enumerate(chosen):
                at = started + (window_end - started) * rng.uniform(0.08, 0.92)
                db.add(
                    Assignment(
                        episode_id=eid,
                        request_id=request.id,
                        assigned_by=operator.id,
                        assigned_at=at,
                    )
                )
                status, attempts, error, finished = (
                    "succeeded",
                    rng.choice((1, 1, 1, 2)),
                    None,
                    at + timedelta(seconds=rng.randint(3, 9)),
                )
                if final == "in_progress":
                    if (
                        not special_failed
                        and k == 5
                        and idx >= len(chosen) - 2
                        and len(chosen) >= 3
                    ):
                        status, attempts, error, finished = (
                            "failed",
                            5,
                            EXPORT_ERROR,
                            at + timedelta(minutes=1),
                        )
                    elif (
                        not special_fresh and k == 6 and idx >= len(chosen) - 3 and len(chosen) >= 4
                    ):
                        status, attempts, error, finished, at = "pending", 0, None, None, now
                db.add(
                    EpisodeExport(
                        episode_id=eid,
                        request_id=request.id,
                        status=status,
                        attempts=attempts,
                        last_error=error,
                        next_attempt_at=at,
                        finished_at=finished,
                        created_at=at,
                    )
                )
            if final == "in_progress" and k == 5 and len(chosen) >= 3:
                special_failed = True
            if final == "in_progress" and k == 6 and len(chosen) >= 4:
                special_fresh = True

    db.commit()
    return {
        "skipped": False,
        "episodes_imported": sum(imports),
        "requests": dict(stats),
        "total_requests": sum(stats.values()),
    }
