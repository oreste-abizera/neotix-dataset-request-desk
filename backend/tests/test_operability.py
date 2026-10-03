"""Health endpoint, structured request log, error envelope."""

import json
import logging

from sqlalchemy import text

from tests.conftest import PASSWORD


def test_health_reports_database_up(anon):
    r = anon.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok", "database": "up"}


def test_health_returns_503_when_database_is_down(anon, monkeypatch):
    from app.routers import health

    class Broken:
        def connect(self):
            raise RuntimeError("db down")

    monkeypatch.setattr(health, "engine", Broken())
    r = anon.get("/health")
    assert r.status_code == 503 and r.json()["status"] == "unavailable"


def test_one_structured_log_line_per_request_with_user_id(operator, as_operator, caplog):
    caplog.set_level(logging.INFO, logger="app.access")
    caplog.clear()
    as_operator.get("/api/requests?limit=5")
    records = [r for r in caplog.records if r.name == "app.access"]
    assert len(records) == 1
    fields = records[0].fields
    assert fields["method"] == "GET" and fields["path"] == "/api/requests"
    assert fields["status"] == 200 and fields["user_id"] == operator.id
    assert fields["duration_ms"] >= 0 and fields["request_id"]


def test_log_line_is_json_and_user_id_is_null_when_anonymous(anon, caplog):
    from app.logging_setup import JsonFormatter

    caplog.set_level(logging.INFO, logger="app.access")
    caplog.clear()
    anon.get("/api/requests")
    record = next(r for r in caplog.records if r.name == "app.access")
    entry = json.loads(JsonFormatter().format(record))
    assert entry["status"] == 401 and entry["user_id"] is None and entry["path"] == "/api/requests"


def test_errors_use_one_envelope_and_do_not_leak_internals(as_operator, monkeypatch):
    missing = as_operator.get("/api/requests/424242")
    assert missing.status_code == 404
    assert set(missing.json()["error"]) == {"code", "message"}
    unknown_route = as_operator.get("/api/nope")
    assert unknown_route.status_code == 404 and "error" in unknown_route.json()

    def boom(*a, **k):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr("app.services.requests.list_requests", boom)
    r = as_operator.get("/api/requests")
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "internal_error", "message": "Internal server error."}}


def test_database_constraints_back_up_the_rules(db):
    """Even if application code were bypassed, the schema refuses invalid states."""
    import pytest
    from sqlalchemy.exc import IntegrityError

    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO episodes"
                " (episode_id, robot_id, task_name, recorded_at, duration_seconds, quality)"
                " VALUES ('X', 'arm-01', 't', now(), 10, 'excellent')"
            )
        )
    db.rollback()
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO episodes"
                " (episode_id, robot_id, task_name, recorded_at, duration_seconds, quality)"
                " VALUES ('X', 'arm-99', 't', now(), 10, 'good')"
            )
        )
    db.rollback()


def test_login_request_is_logged_with_the_user_id(operator, anon, caplog):
    caplog.set_level(logging.INFO, logger="app.access")
    caplog.clear()
    anon.post("/api/auth/login", json={"email": operator.email, "password": PASSWORD})
    record = next(r for r in caplog.records if r.name == "app.access")
    assert record.fields["path"] == "/api/auth/login" and record.fields["user_id"] == operator.id
