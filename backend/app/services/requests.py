from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession
from sqlalchemy.orm import joinedload

from app.domain import (
    ACCEPTED,
    ADMIN,
    CLIENT,
    DELIVERED,
    IN_PROGRESS,
    OPERATOR,
    REJECTED,
    SUBMITTED,
)
from app.errors import Conflict, Forbidden, NotFound
from app.events import broker
from app.models import Assignment, Request, StatusEvent, User
from app.schemas import RequestCreate

STAFF = frozenset({OPERATOR, ADMIN})
CLIENT_ONLY = frozenset({CLIENT})

# The workflow. (from, to) -> roles allowed to perform it. Anything not listed is invalid.
TRANSITIONS: dict[tuple[str, str], frozenset[str]] = {
    (SUBMITTED, IN_PROGRESS): STAFF,
    (IN_PROGRESS, DELIVERED): STAFF,
    (DELIVERED, ACCEPTED): CLIENT_ONLY,
    (DELIVERED, REJECTED): CLIENT_ONLY,
    (REJECTED, IN_PROGRESS): STAFF,  # rework
}


def allowed_transitions(request: Request, user: User) -> list[str]:
    owns = user.role != CLIENT or request.client_id == user.id
    return [
        to
        for (frm, to), roles in TRANSITIONS.items()
        if owns and frm == request.status and user.role in roles
    ]


def _assigned_count_subquery():
    return (
        select(func.count(Assignment.episode_id))
        .where(Assignment.request_id == Request.id)
        .correlate(Request)
        .scalar_subquery()
    )


def _row(request: Request, assigned_count: int) -> dict:
    """Serialisable view of a request (shared by list and detail)."""
    return {
        "id": request.id,
        "client_id": request.client_id,
        "client_name": request.client.name,
        "client_organisation": request.client.organisation,
        "task_name": request.task_name,
        "episodes_requested": request.episodes_requested,
        "deadline": request.deadline,
        "notes": request.notes,
        "status": request.status,
        "assigned_count": assigned_count,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
    }


def create_request(db: DbSession, client: User, data: RequestCreate) -> Request:
    request = Request(
        client_id=client.id,
        task_name=data.task_name,
        episodes_requested=data.episodes_requested,
        deadline=data.deadline,
        notes=data.notes,
        status=SUBMITTED,
    )
    db.add(request)
    db.flush()
    db.add(
        StatusEvent(
            request_id=request.id, from_status=None, to_status=SUBMITTED, actor_id=client.id
        )
    )
    db.commit()
    broker.publish({"type": "request.created", "request_id": request.id, "status": SUBMITTED})
    return request


def list_requests(
    db: DbSession, user: User, *, status: str | None, limit: int, offset: int
) -> list[dict]:
    assigned = _assigned_count_subquery()
    stmt = (
        select(Request, assigned)
        .options(joinedload(Request.client))
        .order_by(Request.id.desc())
        .limit(limit)
        .offset(offset)
    )
    if user.role == CLIENT:
        stmt = stmt.where(Request.client_id == user.id)
    if status:
        stmt = stmt.where(Request.status == status)
    rows = db.execute(stmt).all()
    return [_row(r, count) for r, count in rows]


def get_visible_request(
    db: DbSession, user: User, request_id: int, *, lock: bool = False
) -> Request:
    """404 (not 403) when a client asks for someone else's request: no existence leak."""
    stmt = select(Request).options(joinedload(Request.client)).where(Request.id == request_id)
    if lock:
        stmt = stmt.with_for_update(of=Request)
    request = db.scalar(stmt)
    if request is None or (user.role == CLIENT and request.client_id != user.id):
        raise NotFound("Request not found.")
    return request


def get_request_detail(db: DbSession, user: User, request_id: int) -> dict:
    from app.services.assignments import episodes_for_request

    request = get_visible_request(db, user, request_id)
    events = db.scalars(
        select(StatusEvent)
        .options(joinedload(StatusEvent.actor))
        .where(StatusEvent.request_id == request.id)
        .order_by(StatusEvent.id)
    ).all()
    assigned = db.scalar(
        select(func.count(Assignment.episode_id)).where(Assignment.request_id == request.id)
    )
    return {
        **_row(request, assigned or 0),
        "events": [
            {
                "from_status": e.from_status,
                "to_status": e.to_status,
                "actor_id": e.actor_id,
                "actor_name": e.actor.name,
                "created_at": e.created_at,
            }
            for e in events
        ],
        "episodes": episodes_for_request(db, request.id),
        "allowed_transitions": allowed_transitions(request, user),
    }


def transition(db: DbSession, actor: User, request_id: int, to: str) -> Request:
    # Row lock serialises this against concurrent assign/unassign/transition on the same request,
    # so the delivery gate below cannot be invalidated between the check and the commit.
    request = get_visible_request(db, actor, request_id, lock=True)
    roles = TRANSITIONS.get((request.status, to))
    if roles is None:
        raise Conflict(
            f"Cannot move a request from '{request.status}' to '{to}'.",
            code="invalid_transition",
            details={"from": request.status, "to": to},
        )
    if actor.role not in roles:
        raise Forbidden(f"Your role cannot move a request from '{request.status}' to '{to}'.")
    if to == DELIVERED:
        assigned = db.scalar(
            select(func.count(Assignment.episode_id)).where(Assignment.request_id == request.id)
        )
        if assigned < request.episodes_requested:
            raise Conflict(
                "Not enough episodes assigned to deliver this request.",
                code="insufficient_episodes",
                details={"assigned": assigned, "required": request.episodes_requested},
            )
    db.add(
        StatusEvent(
            request_id=request.id, from_status=request.status, to_status=to, actor_id=actor.id
        )
    )
    request.status = to
    db.commit()
    broker.publish({"type": "request.status_changed", "request_id": request.id, "status": to})
    return request
