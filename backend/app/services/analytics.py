"""Analytics, computed entirely in SQL. Range is [from, to] by calendar day, UTC, both inclusive."""

from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session as DbSession

from app.domain import GOOD, STATUSES
from app.models import Episode

# A request's submission time is requests.created_at: the 'submitted' status event is written in the
# same transaction, so the two are identical, and filtering on the indexed column lets Postgres
# touch only requests in range. Time to delivery is measured to the *first* 'delivered' event
# (a reworked request is delivered more than once).
_REQUEST_TIMINGS = text(
    """
    WITH in_range AS (
        SELECT id, status, created_at AS submitted_at
        FROM requests
        WHERE created_at >= :start AND created_at < :end
    ), timings AS (
        SELECT r.status, r.submitted_at, MIN(e.created_at) AS delivered_at
        FROM in_range r
        LEFT JOIN request_status_events e ON e.request_id = r.id AND e.to_status = 'delivered'
        GROUP BY r.id, r.status, r.submitted_at
    )
    SELECT status,
           COUNT(*) AS n,
           COUNT(delivered_at) AS delivered_n,
           percentile_cont(0.5) WITHIN GROUP (
               ORDER BY EXTRACT(EPOCH FROM (delivered_at - submitted_at))
           ) AS median_seconds
    FROM timings
    GROUP BY ROLLUP (status)
    """
)


def _bounds(date_from: date, date_to: date) -> tuple[datetime, datetime]:
    start = datetime.combine(date_from, time.min, tzinfo=UTC)
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
    return start, end


def episodes_per_day_per_robot(
    db: DbSession, start: datetime, end: datetime
) -> list[dict[str, Any]]:
    day = func.date(func.timezone("UTC", Episode.recorded_at)).label("day")
    rows = db.execute(
        select(day, Episode.robot_id, func.count().label("episodes"))
        .where(Episode.recorded_at >= start, Episode.recorded_at < end)
        .group_by(day, Episode.robot_id)
        .order_by(day, Episode.robot_id)
    ).all()
    return [{"day": r.day, "robot_id": r.robot_id, "episodes": r.episodes} for r in rows]


def request_fulfilment(db: DbSession, start: datetime, end: datetime) -> dict[str, Any]:
    by_status = dict.fromkeys(STATUSES, 0)
    median = None
    delivered = 0
    for row in db.execute(_REQUEST_TIMINGS, {"start": start, "end": end}):
        if row.status is None:  # ROLLUP grand-total row carries the overall median
            median = float(row.median_seconds) if row.median_seconds is not None else None
            delivered = row.delivered_n
        else:
            by_status[row.status] = row.n
    return {
        "by_status": by_status,
        "total": sum(by_status.values()),
        "delivered_count": delivered,
        "median_seconds_submitted_to_delivered": median,
    }


def top_tasks_by_good_episodes(
    db: DbSession, start: datetime, end: datetime, limit: int = 5
) -> list[dict[str, Any]]:
    n = func.count().label("good_episodes")
    rows = db.execute(
        select(Episode.task_name, n)
        .where(Episode.quality == GOOD, Episode.recorded_at >= start, Episode.recorded_at < end)
        .group_by(Episode.task_name)
        .order_by(n.desc(), Episode.task_name)
        .limit(limit)
    ).all()
    return [{"task_name": r.task_name, "good_episodes": r.good_episodes} for r in rows]


def analytics(db: DbSession, date_from: date, date_to: date) -> dict[str, Any]:
    start, end = _bounds(date_from, date_to)
    return {
        "from": date_from,
        "to": date_to,
        "episodes_per_day_per_robot": episodes_per_day_per_robot(db, start, end),
        "requests": request_fulfilment(db, start, end),
        "top_tasks_by_good_episodes": top_tasks_by_good_episodes(db, start, end),
    }
