from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse

from app.config import settings
from app.db import SessionLocal
from app.deps import user_for_token
from app.domain import STAFF_ROLES
from app.errors import Forbidden, Unauthorized
from app.events import broker, event_stream

router = APIRouter(tags=["events"])


def _lookup(token: str | None) -> tuple[int, str] | None:
    # Short-lived session on purpose: a stream must not pin a pooled DB connection for hours.
    with SessionLocal() as db:
        user = user_for_token(db, token)
        return (user.id, user.role) if user else None


@router.get("/events")
async def events(request: Request):
    token = request.cookies.get(settings.cookie_name)
    user = await run_in_threadpool(_lookup, token)
    if user is None:
        raise Unauthorized("Authentication required.")
    if user[1] not in STAFF_ROLES:
        raise Forbidden("You do not have permission to perform this action.")
    request.state.user_id = user[0]

    queue = broker.subscribe()

    async def still_authorised() -> bool:
        current = await run_in_threadpool(_lookup, token)
        return current is not None and current[1] in STAFF_ROLES

    async def stream():
        try:
            async for frame in event_stream(queue, request.is_disconnected, still_authorised):
                yield frame
        finally:
            broker.unsubscribe(queue)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
