from typing import Literal

from fastapi import APIRouter, Query

from app.deps import Db, Staff
from app.domain import QUALITIES
from app.schemas import EpisodePage
from app.services import assignments

router = APIRouter(prefix="/episodes", tags=["episodes"])


@router.get("", response_model=EpisodePage)
def list_episodes(
    _: Staff,
    db: Db,
    task_name: str | None = Query(None, max_length=200),
    quality: Literal[*QUALITIES] | None = None,
    unassigned: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    items, total = assignments.list_episodes(
        db,
        task_name=task_name.strip().lower() if task_name else None,
        quality=quality,
        unassigned=unassigned,
        page=page,
        page_size=page_size,
    )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/task-names", response_model=list[str])
def task_names(_: Staff, db: Db):
    return assignments.list_task_names(db)
