from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.deps import CurrentUser, Db, Staff, require_roles
from app.domain import CLIENT
from app.schemas import (
    AssignIn,
    RequestCreate,
    RequestDetailOut,
    RequestOut,
    Status,
    TransitionIn,
)
from app.services import assignments, requests

router = APIRouter(prefix="/requests", tags=["requests"])

ClientUser = Annotated[object, Depends(require_roles(CLIENT))]


@router.post("", response_model=RequestDetailOut, status_code=201)
def create_request(data: RequestCreate, client: ClientUser, db: Db):
    created = requests.create_request(db, client, data)
    return requests.get_request_detail(db, client, created.id)


@router.get("", response_model=list[RequestOut])
def list_requests(
    user: CurrentUser,
    db: Db,
    status: Status | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    return requests.list_requests(db, user, status=status, limit=limit, offset=offset)


@router.get("/{request_id}", response_model=RequestDetailOut)
def get_request(request_id: int, user: CurrentUser, db: Db):
    return requests.get_request_detail(db, user, request_id)


@router.post("/{request_id}/transitions", response_model=RequestDetailOut)
def transition(request_id: int, data: TransitionIn, user: CurrentUser, db: Db):
    requests.transition(db, user, request_id, data.to)
    return requests.get_request_detail(db, user, request_id)


@router.post("/{request_id}/assignments", response_model=RequestDetailOut)
def assign(request_id: int, data: AssignIn, staff: Staff, db: Db):
    assignments.assign_episodes(db, staff, request_id, data.episode_ids)
    return requests.get_request_detail(db, staff, request_id)


@router.delete("/{request_id}/assignments/{episode_id}", response_model=RequestDetailOut)
def unassign(request_id: int, episode_id: str, staff: Staff, db: Db):
    assignments.unassign_episode(db, staff, request_id, episode_id)
    return requests.get_request_detail(db, staff, request_id)
