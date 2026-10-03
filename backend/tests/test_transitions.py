"""The workflow state machine: valid edges, role ownership, delivery gate, audit trail."""

import itertools

import pytest
from sqlalchemy import select

from app.domain import STATUSES
from app.models import Assignment, StatusEvent
from tests.conftest import api_client, make_request

# Written out by hand (not imported from the app) so the test is an independent statement of
# the brief: (from, to) -> role that may perform it.
EXPECTED = {
    ("submitted", "in_progress"): {"operator", "admin"},
    ("in_progress", "delivered"): {"operator", "admin"},
    ("delivered", "accepted"): {"client"},
    ("delivered", "rejected"): {"client"},
    ("rejected", "in_progress"): {"operator", "admin"},
}


@pytest.mark.parametrize(
    "frm,to,role", list(itertools.product(STATUSES, STATUSES, ["client", "operator", "admin"]))
)
def test_transition_matrix(db, client_a, operator, admin, frm, to, role):
    # Fully assigned so the delivery gate never interferes with this matrix.
    req = make_request(db, client_a, status=frm, count=1, assigned=1)
    actor = {"client": client_a, "operator": operator, "admin": admin}[role]
    r = api_client(actor).post(f"/api/requests/{req.id}/transitions", json={"to": to})
    allowed = EXPECTED.get((frm, to))
    if allowed is None:
        assert r.status_code == 409 and r.json()["error"]["code"] == "invalid_transition"
    elif role in allowed:
        assert r.status_code == 200 and r.json()["status"] == to
    else:
        assert r.status_code == 403


def test_full_happy_path_with_rework_records_every_change(
    db, client_a, operator, as_a, as_operator
):
    created = as_a.post(
        "/api/requests",
        json={"task_name": "  Pick   CUP ", "episodes_requested": 1, "deadline": "2099-01-01"},
    )
    assert created.status_code == 201
    rid = created.json()["id"]
    assert created.json()["task_name"] == "pick cup"  # normalised

    from tests.conftest import make_episodes

    ep = make_episodes(db, 1)[0]
    assert (
        as_operator.post(f"/api/requests/{rid}/transitions", json={"to": "in_progress"}).status_code
        == 200
    )
    assert (
        as_operator.post(f"/api/requests/{rid}/assignments", json={"episode_ids": [ep]}).status_code
        == 200
    )
    assert (
        as_operator.post(f"/api/requests/{rid}/transitions", json={"to": "delivered"}).status_code
        == 200
    )
    assert as_a.post(f"/api/requests/{rid}/transitions", json={"to": "rejected"}).status_code == 200
    assert (
        as_operator.post(f"/api/requests/{rid}/transitions", json={"to": "in_progress"}).status_code
        == 200
    )
    # Rework keeps the previously assigned episodes.
    assert db.scalar(select(Assignment.episode_id).where(Assignment.request_id == rid)) == ep
    assert (
        as_operator.post(f"/api/requests/{rid}/transitions", json={"to": "delivered"}).status_code
        == 200
    )
    final = as_a.post(f"/api/requests/{rid}/transitions", json={"to": "accepted"})
    assert final.status_code == 200

    events = final.json()["events"]
    assert [(e["from_status"], e["to_status"]) for e in events] == [
        (None, "submitted"),
        ("submitted", "in_progress"),
        ("in_progress", "delivered"),
        ("delivered", "rejected"),
        ("rejected", "in_progress"),
        ("in_progress", "delivered"),
        ("delivered", "accepted"),
    ]
    c, o = client_a.id, operator.id
    assert [e["actor_id"] for e in events] == [c, o, o, c, o, o, c]
    assert all(e["created_at"] for e in events)


def test_cannot_deliver_without_enough_episodes(db, client_a, as_operator):
    req = make_request(db, client_a, status="in_progress", count=3, assigned=2)
    r = as_operator.post(f"/api/requests/{req.id}/transitions", json={"to": "delivered"})
    assert r.status_code == 409
    err = r.json()["error"]
    assert err["code"] == "insufficient_episodes"
    assert err["details"] == {"assigned": 2, "required": 3}
    # Nothing was recorded for the refused change.
    assert db.query(StatusEvent).filter_by(request_id=req.id).count() == 1
    assert db.get(type(req), req.id).status == "in_progress"


def test_can_deliver_with_exactly_or_more_than_requested(db, client_a, as_operator):
    exact = make_request(db, client_a, status="in_progress", count=2, assigned=2)
    more = make_request(db, client_a, status="in_progress", count=1, assigned=3)
    for req in (exact, more):
        r = as_operator.post(f"/api/requests/{req.id}/transitions", json={"to": "delivered"})
        assert r.status_code == 200


def test_allowed_transitions_are_advertised_per_role(db, client_a, as_a, as_operator):
    req = make_request(db, client_a, status="delivered", assigned=1)
    assert as_a.get(f"/api/requests/{req.id}").json()["allowed_transitions"] == [
        "accepted",
        "rejected",
    ]
    assert as_operator.get(f"/api/requests/{req.id}").json()["allowed_transitions"] == []


def test_request_validation(as_a):
    bad = [
        {"task_name": "  ", "episodes_requested": 1, "deadline": "2099-01-01"},
        {"task_name": "x", "episodes_requested": 0, "deadline": "2099-01-01"},
        {"task_name": "x", "episodes_requested": 1, "deadline": "2000-01-01"},
        {"task_name": "x", "episodes_requested": 1, "deadline": "not-a-date"},
        {"task_name": "x", "episodes_requested": 1, "deadline": "2099-01-01", "notes": "n" * 2001},
    ]
    for body in bad:
        r = as_a.post("/api/requests", json=body)
        assert r.status_code == 422, body
        assert r.json()["error"]["code"] == "validation_error"
