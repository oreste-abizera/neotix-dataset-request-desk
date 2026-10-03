"""Analytics on a small hand-computed fixture (all aggregation is done by the database)."""

from datetime import UTC, date, datetime, timedelta

from app.models import Request, StatusEvent
from tests.conftest import make_episodes


def at(day: int, hour: int = 12, month: int = 8) -> datetime:
    return datetime(2026, month, day, hour, 0, tzinfo=UTC)


def make_timed_request(
    db, client, *, submitted: datetime, delivered_after: timedelta | None, status: str | None = None
):
    req = Request(
        client_id=client.id,
        task_name="pick cup",
        episodes_requested=1,
        deadline=date(2099, 1, 1),
        notes="",
        status="submitted",
    )
    db.add(req)
    db.flush()
    db.add(
        StatusEvent(
            request_id=req.id,
            from_status=None,
            to_status="submitted",
            actor_id=client.id,
            created_at=submitted,
        )
    )
    if delivered_after is not None:
        db.add(
            StatusEvent(
                request_id=req.id,
                from_status="in_progress",
                to_status="delivered",
                actor_id=client.id,
                created_at=submitted + delivered_after,
            )
        )
        req.status = "delivered"
    if status:
        req.status = status
    db.commit()
    return req


def get(client, frm="2026-08-01", to="2026-08-31"):
    r = client.get("/api/analytics", params={"from": frm, "to": to})
    assert r.status_code == 200, r.text
    return r.json()


def test_episodes_per_day_per_robot(db, as_operator):
    make_episodes(db, 2, robot="arm-01", recorded_at=at(1), prefix="A")
    make_episodes(db, 1, robot="arm-02", recorded_at=at(1), prefix="B")
    make_episodes(db, 3, robot="arm-01", recorded_at=at(2), prefix="C")
    # Late evening UTC stays on its own UTC day.
    make_episodes(db, 1, robot="arm-01", recorded_at=at(2, 23), prefix="D")
    result = get(as_operator)["episodes_per_day_per_robot"]
    assert result == [
        {"day": "2026-08-01", "robot_id": "arm-01", "episodes": 2},
        {"day": "2026-08-01", "robot_id": "arm-02", "episodes": 1},
        {"day": "2026-08-02", "robot_id": "arm-01", "episodes": 4},
    ]


def test_date_range_is_inclusive_of_both_days_and_excludes_outside(db, as_operator):
    make_episodes(db, 1, recorded_at=at(31, 23), prefix="IN")  # last second-ish of the 'to' day
    make_episodes(db, 1, recorded_at=datetime(2026, 9, 1, 0, 0, tzinfo=UTC), prefix="OUT1")
    make_episodes(db, 1, recorded_at=datetime(2026, 7, 31, 23, 59, tzinfo=UTC), prefix="OUT2")
    result = get(as_operator)["episodes_per_day_per_robot"]
    assert [r["day"] for r in result] == ["2026-08-31"]


def test_top_five_tasks_by_good_episodes_with_tiebreak(db, as_operator):
    plan = {"t-a": 5, "t-b": 4, "t-c": 4, "t-d": 3, "t-e": 2, "t-f": 1, "t-g": 9}
    for task, n in plan.items():
        make_episodes(db, n, task=task, quality="good", recorded_at=at(3), prefix=f"{task}-g")
    make_episodes(db, 50, task="t-f", quality="usable", recorded_at=at(3), prefix="f-u")  # not good
    make_episodes(db, 50, task="t-e", quality="bad", recorded_at=at(3), prefix="e-b")
    top = get(as_operator)["top_tasks_by_good_episodes"]
    assert top == [
        {"task_name": "t-g", "good_episodes": 9},
        {"task_name": "t-a", "good_episodes": 5},
        {"task_name": "t-b", "good_episodes": 4},  # tie with t-c, broken alphabetically
        {"task_name": "t-c", "good_episodes": 4},
        {"task_name": "t-d", "good_episodes": 3},
    ]


def test_request_counts_and_median_odd(db, client_a, as_operator):
    for hours in (1, 3, 10):  # median of 1h, 3h, 10h = 3h
        make_timed_request(db, client_a, submitted=at(5), delivered_after=timedelta(hours=hours))
    make_timed_request(db, client_a, submitted=at(6), delivered_after=None)
    make_timed_request(db, client_a, submitted=at(7), delivered_after=None, status="in_progress")
    r = get(as_operator)["requests"]
    assert r["by_status"] == {
        "submitted": 1,
        "in_progress": 1,
        "delivered": 3,
        "accepted": 0,
        "rejected": 0,
    }
    assert r["total"] == 5 and r["delivered_count"] == 3
    assert r["median_seconds_submitted_to_delivered"] == 3 * 3600


def test_median_even_interpolates_and_undelivered_are_ignored(db, client_a, as_operator):
    for hours in (1, 2, 4, 9):  # median = (2h + 4h) / 2 = 3h
        make_timed_request(db, client_a, submitted=at(5), delivered_after=timedelta(hours=hours))
    make_timed_request(db, client_a, submitted=at(5), delivered_after=None)
    assert get(as_operator)["requests"]["median_seconds_submitted_to_delivered"] == 3 * 3600


def test_median_is_null_when_nothing_delivered_and_zero_filled_statuses(db, client_a, as_operator):
    r = get(as_operator)["requests"]
    assert r["median_seconds_submitted_to_delivered"] is None
    assert r["by_status"] == dict.fromkeys(
        ["submitted", "in_progress", "delivered", "accepted", "rejected"], 0
    )
    assert r["total"] == 0


def test_rework_measures_to_first_delivery(db, client_a, as_operator):
    req = make_timed_request(db, client_a, submitted=at(5), delivered_after=timedelta(hours=2))
    db.add(
        StatusEvent(
            request_id=req.id,
            from_status="in_progress",
            to_status="delivered",
            actor_id=client_a.id,
            created_at=at(5) + timedelta(days=3),
        )
    )
    db.commit()
    assert get(as_operator)["requests"]["median_seconds_submitted_to_delivered"] == 2 * 3600


def test_requests_are_filtered_by_submission_date(db, client_a, as_operator):
    make_timed_request(db, client_a, submitted=at(5), delivered_after=timedelta(hours=1))
    make_timed_request(db, client_a, submitted=at(5, month=9), delivered_after=timedelta(hours=1))
    assert get(as_operator)["requests"]["total"] == 1


def test_invalid_ranges_are_rejected(as_operator):
    r = as_operator.get("/api/analytics", params={"from": "2026-09-01", "to": "2026-08-01"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_range"
    assert as_operator.get("/api/analytics").status_code == 422
    assert as_operator.get("/api/analytics", params={"from": "x", "to": "y"}).status_code == 422
