from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.domain import ASSIGNABLE_QUALITIES, ASSIGNMENT_OPEN_STATUSES
from app.errors import Conflict, NotFound
from app.models import Assignment, Episode, User
from app.services.requests import get_visible_request


def _episode_dict(episode: Episode, assigned_request_id: int | None) -> dict:
    return {
        "episode_id": episode.episode_id,
        "robot_id": episode.robot_id,
        "task_name": episode.task_name,
        "recorded_at": episode.recorded_at,
        "duration_seconds": episode.duration_seconds,
        "operator_name": episode.operator_name,
        "quality": episode.quality,
        "assigned_request_id": assigned_request_id,
    }


def list_episodes(
    db: DbSession,
    *,
    task_name: str | None,
    quality: str | None,
    unassigned: bool,
    page: int,
    page_size: int,
) -> tuple[list[dict], int]:
    stmt = select(Episode, Assignment.request_id).outerjoin(
        Assignment, Assignment.episode_id == Episode.episode_id
    )
    if task_name:
        stmt = stmt.where(Episode.task_name == task_name)
    if quality:
        stmt = stmt.where(Episode.quality == quality)
    if unassigned:
        stmt = stmt.where(Assignment.episode_id.is_(None))
    total = db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = db.execute(
        stmt.order_by(Episode.recorded_at.desc(), Episode.episode_id)
        .limit(page_size)
        .offset((page - 1) * page_size)
    ).all()
    return [_episode_dict(e, rid) for e, rid in rows], total or 0


def list_task_names(db: DbSession) -> list[str]:
    return list(db.scalars(select(Episode.task_name).distinct().order_by(Episode.task_name)))


def episodes_for_request(db: DbSession, request_id: int) -> list[dict]:
    rows = db.scalars(
        select(Episode)
        .join(Assignment, Assignment.episode_id == Episode.episode_id)
        .where(Assignment.request_id == request_id)
        .order_by(Episode.episode_id)
    ).all()
    return [_episode_dict(e, request_id) for e in rows]


def assign_episodes(db: DbSession, actor: User, request_id: int, episode_ids: list[str]) -> int:
    """Assign episodes to a request, all-or-nothing. Returns the new assigned count.

    Rules: request still open for assignment, episode exists, quality good/usable, and not already
    assigned anywhere. The last rule is ultimately enforced by the assignments primary key, which
    also covers two operators racing for the same episode on *different* requests.
    """
    request = get_visible_request(db, actor, request_id, lock=True)
    if request.status not in ASSIGNMENT_OPEN_STATUSES:
        raise Conflict(
            f"Episodes cannot be changed while the request is '{request.status}'.",
            code="request_locked",
        )
    ids = list(dict.fromkeys(episode_ids))
    found = {
        e.episode_id: e for e in db.scalars(select(Episode).where(Episode.episode_id.in_(ids)))
    }
    taken = dict(
        db.execute(
            select(Assignment.episode_id, Assignment.request_id).where(
                Assignment.episode_id.in_(ids)
            )
        ).all()
    )
    failures = []
    for eid in ids:
        if eid not in found:
            failures.append({"episode_id": eid, "reason": "not_found"})
        elif found[eid].quality not in ASSIGNABLE_QUALITIES:
            failures.append({"episode_id": eid, "reason": "quality_not_assignable"})
        elif eid in taken:
            reason = (
                "already_assigned_to_this_request"
                if taken[eid] == request.id
                else "already_assigned"
            )
            failures.append({"episode_id": eid, "reason": reason})
    if failures:
        raise Conflict(
            "Some episodes cannot be assigned. Nothing was assigned.",
            code="assignment_rejected",
            details={"failures": failures},
        )
    db.add_all(
        Assignment(episode_id=eid, request_id=request.id, assigned_by=actor.id) for eid in ids
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict(
            "An episode was assigned by someone else at the same moment. Refresh and retry.",
            code="assignment_conflict",
        ) from None
    return db.scalar(select(func.count()).where(Assignment.request_id == request_id)) or 0


def unassign_episode(db: DbSession, actor: User, request_id: int, episode_id: str) -> None:
    request = get_visible_request(db, actor, request_id, lock=True)
    if request.status not in ASSIGNMENT_OPEN_STATUSES:
        raise Conflict(
            f"Episodes cannot be changed while the request is '{request.status}'.",
            code="request_locked",
        )
    result = db.execute(
        delete(Assignment).where(
            Assignment.request_id == request.id, Assignment.episode_id == episode_id
        )
    )
    if result.rowcount == 0:
        db.rollback()
        raise NotFound("That episode is not assigned to this request.")
    db.commit()
