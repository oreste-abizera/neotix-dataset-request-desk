"""Assignment rules: quality, one request per episode (also under concurrency), lock on delivery."""

import contextlib
import threading
import time

import pytest
from sqlalchemy import func, select

from app.db import SessionLocal
from app.errors import Conflict
from app.models import Assignment
from app.services import assignments
from tests.conftest import make_episodes, make_request


def _assign(client, rid, ids):
    return client.post(f"/api/requests/{rid}/assignments", json={"episode_ids": ids})


def test_assigns_good_and_usable(db, client_a, as_operator):
    req = make_request(db, client_a, status="in_progress", count=2)
    good = make_episodes(db, 1, quality="good")
    usable = make_episodes(db, 1, quality="usable")
    r = _assign(as_operator, req.id, good + usable)
    assert r.status_code == 200
    assert r.json()["assigned_count"] == 2


def test_bad_quality_cannot_be_assigned(db, client_a, as_operator):
    req = make_request(db, client_a, status="in_progress")
    bad = make_episodes(db, 1, quality="bad")
    r = _assign(as_operator, req.id, bad)
    assert r.status_code == 409
    assert r.json()["error"]["details"]["failures"] == [
        {"episode_id": bad[0], "reason": "quality_not_assignable"}
    ]


def test_batch_is_all_or_nothing(db, client_a, as_operator):
    req = make_request(db, client_a, status="in_progress", count=2)
    ok = make_episodes(db, 1, quality="good")
    bad = make_episodes(db, 1, quality="bad")
    r = _assign(as_operator, req.id, [*ok, *bad, "EP-DOES-NOT-EXIST"])
    assert r.status_code == 409
    reasons = {f["reason"] for f in r.json()["error"]["details"]["failures"]}
    assert reasons == {"quality_not_assignable", "not_found"}
    assert db.scalar(select(func.count()).select_from(Assignment)) == 0


def test_episode_belongs_to_at_most_one_request(db, client_a, client_b, as_operator):
    r1 = make_request(db, client_a, status="in_progress")
    r2 = make_request(db, client_b, status="in_progress")
    ep = make_episodes(db, 1)
    assert _assign(as_operator, r1.id, ep).status_code == 200
    again_other = _assign(as_operator, r2.id, ep)
    assert again_other.status_code == 409
    assert again_other.json()["error"]["details"]["failures"][0]["reason"] == "already_assigned"
    again_same = _assign(as_operator, r1.id, ep)
    assert again_same.status_code == 409


def test_unassign_frees_the_episode(db, client_a, client_b, as_operator):
    r1 = make_request(db, client_a, status="in_progress")
    r2 = make_request(db, client_b, status="in_progress")
    ep = make_episodes(db, 1)
    _assign(as_operator, r1.id, ep)
    assert as_operator.delete(f"/api/requests/{r1.id}/assignments/{ep[0]}").status_code == 200
    assert _assign(as_operator, r2.id, ep).status_code == 200
    assert as_operator.delete(f"/api/requests/{r1.id}/assignments/{ep[0]}").status_code == 404


@pytest.mark.parametrize("status", ["delivered", "accepted", "rejected"])
def test_assignments_are_locked_outside_submitted_and_in_progress(
    db, client_a, as_operator, status
):
    req = make_request(db, client_a, status=status, assigned=1)
    spare = make_episodes(db, 1, prefix="EP-SPARE")
    assert _assign(as_operator, req.id, spare).status_code == 409
    existing = db.scalar(select(Assignment.episode_id).where(Assignment.request_id == req.id))
    r = as_operator.delete(f"/api/requests/{req.id}/assignments/{existing}")
    assert r.status_code == 409 and r.json()["error"]["code"] == "request_locked"


def test_can_assign_while_submitted(db, client_a, as_operator):
    req = make_request(db, client_a, status="submitted")
    assert _assign(as_operator, req.id, make_episodes(db, 1)).status_code == 200


def test_concurrent_assignment_of_same_episode_has_exactly_one_winner(
    db, operator, client_a, client_b
):
    r1 = make_request(db, client_a, status="in_progress")
    r2 = make_request(db, client_b, status="in_progress")
    ep = make_episodes(db, 1)
    barrier = threading.Barrier(2)
    outcomes: list[str] = []

    def worker(request_id: int):
        with SessionLocal() as session:
            barrier.wait()
            try:
                assignments.assign_episodes(session, operator, request_id, ep)
                outcomes.append("ok")
            except Conflict:
                outcomes.append("conflict")

    threads = [threading.Thread(target=worker, args=(r.id,)) for r in (r1, r2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(outcomes) == ["conflict", "ok"]
    assert db.scalar(select(func.count()).select_from(Assignment)) == 1


def test_collision_discovered_at_flush_time_is_a_409_not_a_500(db, operator, client_a, client_b):
    """Deterministic version of the race: session A holds an uncommitted assignment of the episode;
    operator B checks (sees it free), inserts, and blocks on A's row until A commits, then fails
    with a unique violation *inside* assign_episodes. That must surface as Conflict."""
    from app.models import Assignment

    r1 = make_request(db, client_a, status="in_progress")
    r2 = make_request(db, client_b, status="in_progress")
    (ep,) = make_episodes(db, 1)
    result: list[str] = []

    with SessionLocal() as holder:
        holder.add(Assignment(episode_id=ep, request_id=r1.id, assigned_by=operator.id))
        holder.flush()  # row exists but is not committed yet

        def second_operator():
            with SessionLocal() as s:
                try:
                    assignments.assign_episodes(s, operator, r2.id, [ep])
                    result.append("ok")
                except Conflict as exc:
                    result.append(exc.code)

        t = threading.Thread(target=second_operator)
        t.start()
        time.sleep(0.5)  # let it reach the blocked insert
        holder.commit()
        t.join(timeout=10)
    assert result == ["assignment_conflict"]


def test_delivery_cannot_race_past_an_unassign(db, operator, client_a):
    """Deliver and unassign contend for the same request row lock; whichever wins, the invariant
    'delivered => assigned >= requested' holds afterwards."""
    from app.services import requests as request_service

    req = make_request(db, client_a, status="in_progress", count=1, assigned=1)
    ep = db.scalar(select(Assignment.episode_id).where(Assignment.request_id == req.id))
    barrier = threading.Barrier(2)

    def deliver():
        with SessionLocal() as s:
            barrier.wait()
            with contextlib.suppress(Conflict):
                request_service.transition(s, operator, req.id, "delivered")

    def unassign():
        with SessionLocal() as s:
            barrier.wait()
            with contextlib.suppress(Conflict):
                assignments.unassign_episode(s, operator, req.id, ep)

    threads = [threading.Thread(target=deliver), threading.Thread(target=unassign)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    db.expire_all()
    status = db.get(type(req), req.id).status
    assigned = db.scalar(
        select(func.count()).select_from(Assignment).where(Assignment.request_id == req.id)
    )
    assert not (status == "delivered" and assigned < 1)


def test_episode_listing_filters_and_pagination(db, as_operator, client_a):
    make_episodes(db, 3, task="pick cup", quality="good", prefix="EP-A")
    make_episodes(db, 2, task="pick cup", quality="bad", prefix="EP-B")
    make_episodes(db, 4, task="fold towel", quality="usable", prefix="EP-C")
    req = make_request(db, client_a, status="in_progress")
    taken = make_episodes(db, 1, task="pick cup", quality="good", prefix="EP-D")
    _assign(as_operator, req.id, taken)

    def get(**params):
        return as_operator.get("/api/episodes", params=params).json()

    assert get()["total"] == 10
    assert get(task_name="Pick Cup")["total"] == 6  # filter is normalised
    assert get(task_name="pick cup", quality="good")["total"] == 4
    assert get(task_name="pick cup", quality="good", unassigned=True)["total"] == 3
    page = get(page=2, page_size=4)
    assert len(page["items"]) == 4 and page["total"] == 10
    assert as_operator.get("/api/episodes", params={"quality": "excellent"}).status_code == 422
    assert as_operator.get("/api/episodes/task-names").json() == ["fold towel", "pick cup"]
