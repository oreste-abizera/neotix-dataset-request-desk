"""Tests run against a real PostgreSQL (percentile_cont, ON CONFLICT, row locks: not fakeable).

A dedicated database is created next to the dev one, migrated with Alembic once per session, and
emptied (not dropped) between tests.
"""

import os
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

import psycopg
import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.engine import make_url

BASE_URL = os.environ.get(
    "DATABASE_URL", "postgresql+psycopg://neotix:neotix_dev_password@localhost:5433/neotix"
)
_url = make_url(BASE_URL)
TEST_DB = f"{_url.database}_test"
os.environ["DATABASE_URL"] = _url.set(database=TEST_DB).render_as_string(hide_password=False)

from app.db import SessionLocal, engine  # noqa: E402
from app.domain import STATUSES  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Assignment, Episode, Request, StatusEvent, User  # noqa: E402
from app.security import login_throttle  # noqa: E402
from app.services import users as user_service  # noqa: E402

PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session", autouse=True)
def _database() -> Iterator[None]:
    admin_dsn = _url.set(drivername="postgresql", database="postgres").render_as_string(
        hide_password=False
    )
    with psycopg.connect(admin_dsn, autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (TEST_DB,)).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{TEST_DB}"')
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option(
        "script_location", os.path.join(os.path.dirname(__file__), "..", "migrations")
    )
    command.upgrade(cfg, "head")
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def _clean() -> None:
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "TRUNCATE assignments, request_status_events, requests, episodes, import_runs, "
            "sessions, users RESTART IDENTITY CASCADE"
        )
    login_throttle.reset()


@pytest.fixture
def db() -> Iterator:
    with SessionLocal() as session:
        yield session


def _make_user(db, email: str, role: str, name: str | None = None, org: str | None = None) -> User:
    return user_service.create_user(
        db,
        email=email,
        name=name or email.split("@")[0],
        role=role,
        password=PASSWORD,
        organisation=org,
    )


@pytest.fixture
def admin(db) -> User:
    return _make_user(db, "admin@oreste.dev", "admin")


@pytest.fixture
def operator(db) -> User:
    return _make_user(db, "op@oreste.dev", "operator")


@pytest.fixture
def client_a(db) -> User:
    return _make_user(db, "a@oreste.dev", "client", org="Acme")


@pytest.fixture
def client_b(db) -> User:
    return _make_user(db, "b@oreste.dev", "client", org="Beta")


def api_client(user: User | None = None) -> TestClient:
    """A fresh client (own cookie jar), logged in as `user` when given."""
    c = TestClient(app)
    if user is not None:
        r = c.post("/api/auth/login", json={"email": user.email, "password": PASSWORD})
        assert r.status_code == 200, r.text
    return c


@pytest.fixture
def anon() -> TestClient:
    return api_client()


@pytest.fixture
def as_admin(admin) -> TestClient:
    return api_client(admin)


@pytest.fixture
def as_operator(operator) -> TestClient:
    return api_client(operator)


@pytest.fixture
def as_a(client_a) -> TestClient:
    return api_client(client_a)


@pytest.fixture
def as_b(client_b) -> TestClient:
    return api_client(client_b)


# ---- data builders -------------------------------------------------------------------------


def make_episodes(
    db,
    n: int = 1,
    *,
    quality: str = "good",
    task: str = "pick cup",
    prefix: str = "EP-T",
    robot: str = "arm-01",
    recorded_at: datetime | None = None,
) -> list[str]:
    ids = []
    base = recorded_at or datetime(2026, 8, 1, 10, 0, tzinfo=UTC)
    start = db.query(Episode).count()
    for i in range(n):
        eid = f"{prefix}{start + i:05d}"
        db.add(
            Episode(
                episode_id=eid,
                robot_id=robot,
                task_name=task,
                recorded_at=base,
                duration_seconds=30,
                operator_name="Aline",
                quality=quality,
            )
        )
        ids.append(eid)
    db.commit()
    return ids


def make_request(
    db,
    client: User,
    *,
    status: str = "submitted",
    count: int = 1,
    task: str = "pick cup",
    assigned: int = 0,
) -> Request:
    assert status in STATUSES
    req = Request(
        client_id=client.id,
        task_name=task,
        episodes_requested=count,
        deadline=date.today() + timedelta(days=30),
        notes="",
        status=status,
    )
    db.add(req)
    db.flush()
    db.add(
        StatusEvent(request_id=req.id, from_status=None, to_status="submitted", actor_id=client.id)
    )
    db.commit()
    if assigned:
        for eid in make_episodes(db, assigned, prefix=f"EP-R{req.id}-"):
            db.add(Assignment(episode_id=eid, request_id=req.id, assigned_by=client.id))
        db.commit()
    return req
