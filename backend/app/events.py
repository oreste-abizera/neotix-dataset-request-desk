"""Live updates for staff via Server-Sent Events.

An in-process broker: fine for the single API container in docker-compose. With several API
instances, publish() would go through Postgres LISTEN/NOTIFY or Redis instead (see NOTES.md).
Events carry only ids and the new status, never client data; the UI refetches through the normal,
authorised endpoints.
"""

import asyncio
import json
import threading
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Any

QUEUE_SIZE = 100


class Broker:
    def __init__(self) -> None:
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()
        self._lock = threading.Lock()

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        with self._lock:
            self._subscribers.add((asyncio.get_running_loop(), queue))
        return queue

    def unsubscribe(self, queue: asyncio.Queue) -> None:
        with self._lock:
            self._subscribers = {(loop, q) for loop, q in self._subscribers if q is not queue}

    def publish(self, event: dict[str, Any]) -> None:
        """Thread-safe: called from sync request handlers running in the threadpool."""
        with self._lock:
            targets = list(self._subscribers)
        for loop, queue in targets:
            loop.call_soon_threadsafe(self._offer, queue, event)

    @staticmethod
    def _offer(queue: asyncio.Queue, event: dict[str, Any]) -> None:
        if queue.full():  # a stalled client must never block or grow memory; it will resync
            queue.get_nowait()
            event = {"type": "resync"}
        queue.put_nowait(event)

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)


broker = Broker()


def _sse(event: dict[str, Any]) -> str:
    return f"event: {event['type']}\ndata: {json.dumps(event)}\n\n"


async def event_stream(
    queue: asyncio.Queue,
    is_disconnected: Callable[[], Awaitable[bool]],
    still_authorised: Callable[[], Awaitable[bool]],
    keepalive_seconds: float = 15.0,
) -> AsyncIterator[str]:
    """Yield SSE frames until the client leaves or its session stops being valid."""
    yield "retry: 3000\n\n"
    yield _sse({"type": "ready"})
    while True:
        try:
            event = await asyncio.wait_for(queue.get(), timeout=keepalive_seconds)
        except TimeoutError:
            # Idle tick: keep proxies from closing the connection, and drop deactivated users.
            if await is_disconnected() or not await still_authorised():
                return
            yield ": keepalive\n\n"
            continue
        yield _sse(event)
