"""Seeding: idempotent, hashes passwords, refuses to run in production."""

import json

from sqlalchemy import func, select

from app import cli
from app.config import settings
from app.models import Episode, User
from tests.conftest import api_client


def test_seed_creates_the_documented_users_once_with_hashed_passwords(db, capsys):
    cli.seed()
    cli.seed()  # second run must be a no-op
    users = db.scalars(select(User).order_by(User.id)).all()
    expected = json.loads((settings.seed_dir / "users.json").read_text())
    assert [u.email for u in users] == [e["email"] for e in expected]
    assert all(u.password_hash.startswith("$argon2") for u in users)
    assert [u.organisation for u in users if u.role == "client"] == ["Acme Robotics", "Beta Labs"]
    for entry in expected:  # every documented credential really logs in
        r = api_client().post(
            "/api/auth/login", json={"email": entry["email"], "password": entry["password"]}
        )
        assert r.status_code == 200, entry["email"]
        assert r.json()["role"] == entry["role"]


def test_seed_loads_sample_episodes_only_when_enabled_and_empty(db, monkeypatch):
    cli.seed()
    assert db.scalar(select(func.count()).select_from(Episode)) == 0
    monkeypatch.setattr(settings, "seed_sample_episodes", True)
    cli.seed()
    cli.seed()
    assert db.scalar(select(func.count()).select_from(Episode)) == 172


def test_seed_refuses_in_production(db, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    cli.seed()
    assert db.scalar(select(func.count()).select_from(User)) == 0


def test_create_admin_bootstraps_a_working_admin_and_rejects_weak_or_duplicate(db, capsys):
    import pytest

    with pytest.raises(SystemExit, match="at least 12"):
        cli.create_admin("root@example.com", "Root", "short")
    cli.create_admin("Root@Example.com", "Root", "a-long-enough-password")
    r = api_client().post(
        "/api/auth/login", json={"email": "root@example.com", "password": "a-long-enough-password"}
    )
    assert r.status_code == 200 and r.json()["role"] == "admin"
    with pytest.raises(SystemExit, match="already exists"):
        cli.create_admin("root@example.com", "Root", "a-long-enough-password")
