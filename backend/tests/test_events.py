"""Stretch item: live updates for staff over Server-Sent Events."""

import asyncio

from app.db import SessionLocal
from app.events import Broker, broker, event_stream
from app.schemas import RequestCreate
from app.services import assignments, requests
from tests.conftest import make_episodes, make_request


def test_only_staff_may_open_the_stream(client_a, as_a, anon):
    assert anon.get("/api/events").status_code == 401
    assert as_a.get("/api/events").status_code == 403


def test_service_actions_publish_events_to_subscribers(db, client_a, operator):
    req = make_request(db, client_a, status="submitted", count=1)
    ep = make_episodes(db, 1)

    def act():
        with SessionLocal() as s:
            requests.transition(s, operator, req.id, "in_progress")
            assignments.assign_episodes(s, operator, req.id, ep)
            requests.create_request(
                s,
                client_a,
                RequestCreate(task_name="x", episodes_requested=1, deadline="2099-01-01"),
            )

    async def scenario():
        queue = broker.subscribe()
        try:
            await asyncio.to_thread(act)  # sync handlers run in worker threads in production too
            return [await asyncio.wait_for(queue.get(), 2) for _ in range(3)]
        finally:
            broker.unsubscribe(queue)

    events = asyncio.run(scenario())
    assert [e["type"] for e in events] == [
        "request.status_changed",
        "request.assignments_changed",
        "request.created",
    ]
    assert events[0] == {
        "type": "request.status_changed",
        "request_id": req.id,
        "status": "in_progress",
    }
    assert broker.subscriber_count == 0


def test_slow_consumer_is_resynced_instead_of_blocking_publishers():
    async def scenario():
        b = Broker()
        queue = b.subscribe()
        for i in range(250):
            b.publish({"type": "request.created", "request_id": i})
        await asyncio.sleep(0.05)  # let call_soon_threadsafe callbacks run
        assert queue.qsize() <= 100
        items = [queue.get_nowait() for _ in range(queue.qsize())]
        assert {"type": "resync"} in items

    asyncio.run(scenario())


def test_stream_frames_and_ends_when_session_is_revoked():
    async def scenario():
        queue: asyncio.Queue = asyncio.Queue()
        valid = True

        async def disconnected() -> bool:
            return False

        async def authorised() -> bool:
            return valid

        stream = event_stream(queue, disconnected, authorised, keepalive_seconds=0.05)
        assert await anext(stream) == "retry: 3000\n\n"
        assert "event: ready" in await anext(stream)
        await queue.put({"type": "request.created", "request_id": 7, "status": "submitted"})
        frame = await anext(stream)
        assert frame.startswith("event: request.created\n") and '"request_id": 7' in frame
        assert await anext(stream) == ": keepalive\n\n"
        valid = False  # e.g. the operator was deactivated while connected
        remaining = [f async for f in stream]
        assert remaining == []

    asyncio.run(scenario())
