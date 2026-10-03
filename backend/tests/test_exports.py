"""Stretch item: background export jobs. Idempotent, retried safely, visible per episode."""

import threading
import time
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app import worker
from app.config import settings
from app.db import SessionLocal
from app.models import EpisodeExport
from app.services import exports
from tests.conftest import make_episodes, make_request


@pytest.fixture(autouse=True)
def fast_exports(monkeypatch):
    monkeypatch.setattr(settings, "export_min_seconds", 0.0)
    monkeypatch.setattr(settings, "export_max_seconds", 0.0)
    monkeypatch.setattr(settings, "export_failure_rate", 0.0)
    monkeypatch.setattr(settings, "export_max_attempts", 3)
    monkeypatch.setattr(worker, "POLL_SECONDS", 0.02)
    monkeypatch.setattr(settings, "export_backoff_seconds", 2.0)


def assign(client, request_id, ids):
    r = client.post(f"/api/requests/{request_id}/assignments", json={"episode_ids": ids})
    assert r.status_code == 200, r.text
    return r.json()


def job(db, episode_id):
    db.expire_all()
    return db.get(EpisodeExport, episode_id)


def setup_one(db, client_a, as_operator, n=1):
    req = make_request(db, client_a, status="in_progress", count=n)
    ids = make_episodes(db, n)
    assign(as_operator, req.id, ids)
    return req, ids


def test_assignment_enqueues_one_pending_job_per_episode_and_unassign_removes_it(
    db, client_a, as_operator
):
    req, ids = setup_one(db, client_a, as_operator, n=3)
    assert [job(db, e).status for e in ids] == ["pending"] * 3
    r = as_operator.delete(f"/api/requests/{req.id}/assignments/{ids[0]}")
    assert r.status_code == 200
    assert job(db, ids[0]) is None and job(db, ids[1]) is not None


def test_enqueue_is_idempotent(db, client_a, as_operator):
    req, ids = setup_one(db, client_a, as_operator, n=2)
    for _ in range(3):
        exports.enqueue(db, req.id, ids)
        db.commit()
    assert db.scalar(select(func.count()).select_from(EpisodeExport)) == 2


def test_success_is_terminal_and_never_runs_twice(db, client_a, as_operator):
    _, ids = setup_one(db, client_a, as_operator)
    calls = []
    assert worker.process_next(simulate=calls.append) is True
    j = job(db, ids[0])
    assert (j.status, j.attempts, j.last_error) == ("succeeded", 1, None)
    assert worker.process_next(simulate=calls.append) is False  # nothing left to do
    assert calls == ids


def test_failure_backs_off_then_retries_and_eventually_succeeds(db, client_a, as_operator):
    _, ids = setup_one(db, client_a, as_operator)
    now = datetime.now(UTC)

    with SessionLocal() as s:
        c1 = exports.claim_next(s, now)
    assert c1.attempt == 1
    with SessionLocal() as s:
        exports.complete(s, c1, "boom", now)
    j = job(db, ids[0])
    assert j.status == "pending" and j.last_error == "boom"
    assert j.next_attempt_at > now  # backoff: not eligible right away

    with SessionLocal() as s:
        assert exports.claim_next(s, now) is None
        c2 = exports.claim_next(s, now + timedelta(seconds=10))
    assert c2.attempt == 2
    with SessionLocal() as s:
        assert exports.complete(s, c2, None) is True
    j = job(db, ids[0])
    assert (j.status, j.attempts, j.last_error) == ("succeeded", 2, None)


def test_gives_up_after_max_attempts_and_manual_retry_requeues(db, client_a, as_operator, as_a):
    req, ids = setup_one(db, client_a, as_operator)
    now = datetime.now(UTC)
    for attempt in range(1, settings.export_max_attempts + 1):
        with SessionLocal() as s:
            claim = exports.claim_next(s, now + timedelta(minutes=attempt))
            exports.complete(s, claim, "still broken", now + timedelta(minutes=attempt))
    j = job(db, ids[0])
    assert (j.status, j.attempts) == ("failed", settings.export_max_attempts)
    with SessionLocal() as s:
        assert exports.claim_next(s, now + timedelta(days=1)) is None  # failed is not auto-retried

    assert as_a.post(f"/api/requests/{req.id}/exports/retry").status_code == 403
    r = as_operator.post(f"/api/requests/{req.id}/exports/retry")
    assert r.status_code == 200
    assert r.json()["episodes"][0]["export"]["status"] == "pending"
    j = job(db, ids[0])
    assert (j.status, j.attempts, j.last_error) == ("pending", 0, None)


def test_two_workers_never_claim_the_same_job(db, client_a, as_operator):
    setup_one(db, client_a, as_operator)
    barrier = threading.Barrier(8)
    claims = []

    def grab():
        with SessionLocal() as s:
            barrier.wait()
            claims.append(exports.claim_next(s))

    threads = [threading.Thread(target=grab) for _ in range(8)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert len([c for c in claims if c is not None]) == 1


def test_expired_lease_is_taken_over_and_the_stale_worker_cannot_overwrite(
    db, client_a, as_operator
):
    _, ids = setup_one(db, client_a, as_operator)
    t0 = datetime.now(UTC)
    with SessionLocal() as s:
        stale = exports.claim_next(s, t0)
        assert exports.claim_next(s, t0 + timedelta(seconds=5)) is None  # lease still valid
        fresh = exports.claim_next(s, t0 + timedelta(seconds=settings.export_lease_seconds + 1))
    assert (stale.attempt, fresh.attempt) == (1, 2)
    with SessionLocal() as s:
        assert exports.complete(s, fresh, None) is True
        assert exports.complete(s, stale, "late failure from the old worker") is False
    j = job(db, ids[0])
    assert (j.status, j.last_error) == ("succeeded", None)


def test_worker_that_dies_on_the_last_attempt_does_not_loop_forever(db, client_a, as_operator):
    _, ids = setup_one(db, client_a, as_operator)
    t = datetime.now(UTC)
    for _ in range(settings.export_max_attempts):
        t += timedelta(seconds=settings.export_lease_seconds + 1)
        with SessionLocal() as s:
            assert exports.claim_next(s, t) is not None  # claimed, then the worker "crashes"
    t += timedelta(seconds=settings.export_lease_seconds + 1)
    with SessionLocal() as s:
        assert exports.claim_next(s, t) is None
    j = job(db, ids[0])
    assert j.status == "failed" and "worker lost" in j.last_error


def test_unassigning_while_running_discards_the_result(db, client_a, as_operator):
    req, ids = setup_one(db, client_a, as_operator)
    with SessionLocal() as s:
        claim = exports.claim_next(s)
    assert as_operator.delete(f"/api/requests/{req.id}/assignments/{ids[0]}").status_code == 200
    with SessionLocal() as s:
        assert exports.complete(s, claim, None) is False
    assert job(db, ids[0]) is None


def test_export_status_is_visible_to_staff_but_not_to_clients(db, client_a, as_a, as_operator):
    req, ids = setup_one(db, client_a, as_operator)
    worker.process_next(simulate=lambda _: None)
    staff = as_operator.get(f"/api/requests/{req.id}").json()["episodes"][0]
    assert staff["export"]["status"] == "succeeded" and staff["export"]["attempts"] == 1
    client_view = as_a.get(f"/api/requests/{req.id}").json()["episodes"][0]
    assert client_view["export"] is None


def test_retry_endpoint_only_touches_failed_jobs(db, client_a, as_operator):
    req, ids = setup_one(db, client_a, as_operator, n=2)
    worker.process_next(simulate=lambda _: None)  # one succeeds
    assert as_operator.post(f"/api/requests/{req.id}/exports/retry").status_code == 200
    statuses = sorted(job(db, e).status for e in ids)
    assert statuses == ["pending", "succeeded"]


def test_worker_pool_drains_the_queue_and_retries_failures(db, client_a, as_operator, monkeypatch):
    """End to end with real threads: every episode fails its first attempt, then succeeds."""
    monkeypatch.setattr(settings, "export_backoff_seconds", 0.01)
    failed_once: set[str] = set()

    def flaky(episode_id: str) -> None:
        if episode_id not in failed_once:
            failed_once.add(episode_id)
            raise worker.ExportError("first attempt always fails")

    monkeypatch.setattr(worker, "simulated_export", flaky)
    _, ids = setup_one(db, client_a, as_operator, n=12)
    pool = worker.WorkerPool(concurrency=4)
    pool.start()
    try:
        deadline = time.time() + 20
        while time.time() < deadline:
            db.expire_all()
            if db.scalar(select(func.count()).where(EpisodeExport.status == "succeeded")) == 12:
                break
            time.sleep(0.05)
    finally:
        pool.stop()
    db.expire_all()
    rows = db.scalars(select(EpisodeExport)).all()
    assert [r.status for r in rows] == ["succeeded"] * 12
    assert {r.attempts for r in rows} == {2}  # one failure, one success: no duplicate work
