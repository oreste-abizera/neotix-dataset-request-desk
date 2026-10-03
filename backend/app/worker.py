"""Background export worker: simulates exporting each assigned episode (sleep 2-5 s, fails 20%).

Runs as threads inside the API process (RUN_WORKER=true) so progress can be pushed to the browser
over the same SSE channel; it can equally run on its own (`python -m app.worker`) because all
coordination goes through the database queue in services/exports.py.
"""

import logging
import random
import threading
import time
from collections.abc import Callable

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.events import broker
from app.services import exports

log = logging.getLogger("app.worker")
POLL_SECONDS = 1.0


class ExportError(Exception):
    pass


def simulated_export(episode_id: str) -> None:
    time.sleep(random.uniform(settings.export_min_seconds, settings.export_max_seconds))  # noqa: S311
    if random.random() < settings.export_failure_rate:  # noqa: S311
        raise ExportError("simulated transient export failure")


def process_next(
    session_factory: Callable[[], Session] = SessionLocal,
    simulate: Callable[[str], None] | None = None,
) -> bool:
    """Claim and run one job. Returns False when there was nothing to do."""
    simulate = simulate or simulated_export  # looked up late so tests can patch settings
    with session_factory() as db:
        claim = exports.claim_next(db)
    if claim is None:
        return False
    broker.publish({"type": "request.exports_changed", "request_id": claim.request_id})
    started = time.perf_counter()
    error: str | None = None
    try:
        simulate(claim.episode_id)
    except Exception as exc:  # any failure is retried; the reason is kept for the operator
        error = f"{type(exc).__name__}: {exc}"[:500]
    with session_factory() as db:
        applied = exports.complete(db, claim, error)
    log.info(
        "export attempt finished",
        extra={
            "fields": {
                "episode_id": claim.episode_id,
                "request_id": claim.request_id,
                "attempt": claim.attempt,
                "outcome": "ok" if error is None else "error",
                "error": error,
                "applied": applied,
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
            }
        },
    )
    broker.publish({"type": "request.exports_changed", "request_id": claim.request_id})
    return True


class WorkerPool:
    def __init__(self, concurrency: int) -> None:
        self._stop = threading.Event()
        self._threads = [
            threading.Thread(target=self._loop, name=f"export-worker-{i}", daemon=True)
            for i in range(concurrency)
        ]

    def _loop(self) -> None:
        while not self._stop.is_set():
            try:
                busy = process_next()
            except Exception:
                log.exception("export worker error")
                busy = False
            if not busy:
                self._stop.wait(POLL_SECONDS)

    def start(self) -> None:
        for t in self._threads:
            t.start()

    def stop(self) -> None:
        self._stop.set()
        for t in self._threads:
            t.join(timeout=10)


if __name__ == "__main__":  # standalone worker process
    from app.logging_setup import configure_logging

    configure_logging()
    pool = WorkerPool(settings.worker_concurrency)
    pool.start()
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        pool.stop()
