"""Queue operations for the per-episode export jobs (a Postgres-backed work queue).

Why this is safe to retry and to run from several workers:
* enqueue is idempotent: the primary key is the episode id, so a second enqueue is a no-op;
* claiming uses SELECT ... FOR UPDATE SKIP LOCKED, so two workers never get the same job;
* a claim is a lease; a worker that dies simply lets the lease expire and the job is re-claimed;
* completion is fenced by the attempt number, so a slow worker whose lease was taken over cannot
  overwrite the result of the newer attempt;
* a succeeded export is terminal and never claimed again.
"""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.domain import EXPORT_FAILED, EXPORT_PENDING, EXPORT_RUNNING, EXPORT_SUCCEEDED
from app.models import EpisodeExport

MAX_BACKOFF_SECONDS = 30


@dataclass(frozen=True)
class Claim:
    episode_id: str
    request_id: int
    attempt: int


def enqueue(db: DbSession, request_id: int, episode_ids: list[str]) -> None:
    """Add pending jobs in the caller's transaction (so they exist iff the assignment does)."""
    if not episode_ids:
        return
    db.execute(
        insert(EpisodeExport)
        .values([{"episode_id": e, "request_id": request_id} for e in episode_ids])
        .on_conflict_do_nothing(index_elements=["episode_id"])
    )


def cancel(db: DbSession, request_id: int, episode_id: str) -> None:
    """Called when an episode is unassigned. A job already running finishes harmlessly: its
    fenced completion matches no row."""
    db.execute(
        delete(EpisodeExport).where(
            EpisodeExport.episode_id == episode_id, EpisodeExport.request_id == request_id
        )
    )


def claim_next(db: DbSession, now: datetime | None = None) -> Claim | None:
    now = now or datetime.now(UTC)
    while True:
        job = db.scalar(
            select(EpisodeExport)
            .where(
                or_(
                    and_(
                        EpisodeExport.status == EXPORT_PENDING, EpisodeExport.next_attempt_at <= now
                    ),
                    and_(
                        EpisodeExport.status == EXPORT_RUNNING, EpisodeExport.lease_expires_at < now
                    ),
                )
            )
            .order_by(EpisodeExport.next_attempt_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if job is None:
            db.rollback()
            return None
        if job.attempts >= settings.export_max_attempts:
            # The previous worker died on its last allowed attempt: give up rather than loop.
            job.status, job.finished_at = EXPORT_FAILED, now
            job.last_error = job.last_error or "worker lost before finishing"
            job.lease_expires_at = None
            db.commit()
            continue
        job.status = EXPORT_RUNNING
        job.attempts += 1
        job.started_at = now
        job.lease_expires_at = now + timedelta(seconds=settings.export_lease_seconds)
        db.commit()
        return Claim(job.episode_id, job.request_id, job.attempts)


def complete(db: DbSession, claim: Claim, error: str | None, now: datetime | None = None) -> bool:
    """Record the outcome of one attempt. Returns False if this attempt no longer owns the job."""
    now = now or datetime.now(UTC)
    owned = and_(
        EpisodeExport.episode_id == claim.episode_id,
        EpisodeExport.status == EXPORT_RUNNING,
        EpisodeExport.attempts == claim.attempt,
    )
    if error is None:
        values = {
            "status": EXPORT_SUCCEEDED,
            "finished_at": now,
            "last_error": None,
            "lease_expires_at": None,
        }
    elif claim.attempt >= settings.export_max_attempts:
        values = {
            "status": EXPORT_FAILED,
            "finished_at": now,
            "last_error": error,
            "lease_expires_at": None,
        }
    else:
        backoff = min(
            MAX_BACKOFF_SECONDS, settings.export_backoff_seconds * 2 ** (claim.attempt - 1)
        )
        values = {
            "status": EXPORT_PENDING,
            "next_attempt_at": now + timedelta(seconds=backoff),
            "last_error": error,
            "lease_expires_at": None,
        }
    applied = db.execute(update(EpisodeExport).where(owned).values(**values)).rowcount == 1
    db.commit()
    return applied


def retry_failed(db: DbSession, request_id: int) -> int:
    """Manual re-queue of exports that ran out of attempts. Returns how many were re-queued."""
    result = db.execute(
        update(EpisodeExport)
        .where(EpisodeExport.request_id == request_id, EpisodeExport.status == EXPORT_FAILED)
        .values(
            status=EXPORT_PENDING,
            attempts=0,
            last_error=None,
            finished_at=None,
            next_attempt_at=datetime.now(UTC),
        )
    )
    db.commit()
    return result.rowcount


def exports_for_request(db: DbSession, request_id: int) -> dict[str, dict]:
    rows = db.scalars(select(EpisodeExport).where(EpisodeExport.request_id == request_id))
    return {
        r.episode_id: {
            "status": r.status,
            "attempts": r.attempts,
            "max_attempts": settings.export_max_attempts,
            "last_error": r.last_error,
            "next_attempt_at": r.next_attempt_at if r.status == EXPORT_PENDING else None,
            "finished_at": r.finished_at,
        }
        for r in rows
    }
