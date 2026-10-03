"""The demo seeder must produce data that obeys every domain rule, not merely look plausible."""

from collections import Counter, defaultdict
from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select

from app import demo_data
from app.config import settings
from app.models import Assignment, Episode, EpisodeExport, Request, StatusEvent, User
from app.services import users as user_service
from tests.conftest import api_client

# The brief's workflow, restated independently of the application code: (from, to) -> actor role.
EDGES = {
    ("submitted", "in_progress"): {"operator", "admin"},
    ("in_progress", "delivered"): {"operator", "admin"},
    ("delivered", "accepted"): {"client"},
    ("delivered", "rejected"): {"client"},
    ("rejected", "in_progress"): {"operator", "admin"},
}


@pytest.fixture
def populated(db):
    user_service.seed_users(db, settings.seed_dir / "users.json")
    result = demo_data.populate(db)
    return result


def test_creates_a_rich_dataset_covering_every_state(db, populated):
    assert populated["skipped"] is False
    assert populated["episodes_imported"] >= 1000
    assert populated["total_requests"] >= 40
    counts = Counter(db.scalars(select(Request.status)))
    assert set(counts) == {"submitted", "in_progress", "delivered", "accepted", "rejected"}
    assert all(n >= 3 for n in counts.values()), counts
    clients = db.scalar(select(func.count(func.distinct(Request.client_id))))
    assert clients >= 4  # several organisations, so the operator queue looks real


def test_history_follows_the_workflow_with_the_right_actors(db, populated):
    roles = {u.id: u.role for u in db.scalars(select(User))}
    events = defaultdict(list)
    for e in db.scalars(select(StatusEvent).order_by(StatusEvent.request_id, StatusEvent.id)):
        events[e.request_id].append(e)
    now = datetime.now(UTC)
    for request in db.scalars(select(Request)):
        chain = events[request.id]
        assert (chain[0].from_status, chain[0].to_status) == (None, "submitted")
        assert roles[chain[0].actor_id] == "client" and chain[0].actor_id == request.client_id
        assert chain[-1].to_status == request.status
        assert request.created_at == chain[0].created_at  # analytics counts by this timestamp
        for before, after in zip(chain, chain[1:], strict=False):
            assert after.from_status == before.to_status
            assert (after.from_status, after.to_status) in EDGES
            assert roles[after.actor_id] in EDGES[(after.from_status, after.to_status)]
            if after.to_status in ("accepted", "rejected"):
                assert after.actor_id == request.client_id  # only the owner decides
            assert after.created_at >= before.created_at
        assert chain[-1].created_at < now  # nothing recorded in the future


def test_assignment_and_export_rules_hold(db, populated):
    assignments = db.execute(
        select(Assignment.episode_id, Assignment.request_id, Episode.quality).join(
            Episode, Episode.episode_id == Assignment.episode_id
        )
    ).all()
    assert len({a.episode_id for a in assignments}) == len(assignments)  # one request per episode
    assert {a.quality for a in assignments} <= {"good", "usable"}
    per_request = Counter(a.request_id for a in assignments)
    for r in db.scalars(select(Request)):
        if r.status in ("delivered", "accepted", "rejected"):
            assert per_request[r.id] >= r.episodes_requested  # the delivery gate held
        if r.status == "submitted":
            assert per_request[r.id] == 0
    exports = Counter(db.scalars(select(EpisodeExport.status)))
    assert exports["succeeded"] > 100
    assert exports["failed"] >= 1  # something for the operator to retry
    assert exports["pending"] >= 1  # something for the live worker to pick up
    assert db.scalar(select(func.count()).select_from(EpisodeExport)) == len(assignments)


def test_is_idempotent(db, populated):
    before = (
        db.scalar(select(func.count()).select_from(Request)),
        db.scalar(select(func.count()).select_from(Episode)),
        db.scalar(select(func.count()).select_from(Assignment)),
    )
    assert demo_data.populate(db) == {"skipped": True}
    after = (
        db.scalar(select(func.count()).select_from(Request)),
        db.scalar(select(func.count()).select_from(Episode)),
        db.scalar(select(func.count()).select_from(Assignment)),
    )
    assert after == before


def test_the_application_works_on_top_of_it(db, populated):
    """Through the real API: queue, per-role visibility, analytics over the demo period."""
    operator = db.scalar(select(User).where(User.email == "ops1@oreste.dev"))
    client = db.scalar(select(User).where(User.email == "client-c@oreste.dev"))
    staff, mine = api_client(), api_client()
    assert (
        staff.post(
            "/api/auth/login", json={"email": operator.email, "password": "ops123"}
        ).status_code
        == 200
    )
    assert (
        mine.post(
            "/api/auth/login", json={"email": client.email, "password": "client123"}
        ).status_code
        == 200
    )

    all_rows = staff.get("/api/requests", params={"limit": 500}).json()
    own_rows = mine.get("/api/requests", params={"limit": 500}).json()
    assert len(all_rows) == populated["total_requests"]
    assert 0 < len(own_rows) < len(all_rows)
    assert {r["client_id"] for r in own_rows} == {client.id}

    data = staff.get("/api/analytics", params={"from": "2000-01-01", "to": "2100-01-01"}).json()
    assert data["requests"]["total"] == populated["total_requests"]
    assert data["requests"]["median_seconds_submitted_to_delivered"] > 3600
    assert len(data["top_tasks_by_good_episodes"]) == 5
    assert len(data["episodes_per_day_per_robot"]) > 100
