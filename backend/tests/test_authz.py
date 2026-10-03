"""Authorization is enforced by the server, regardless of what the UI shows."""

import pytest

from app.main import app
from tests.conftest import PASSWORD, api_client, make_request

PUBLIC = {("POST", "/api/auth/login"), ("GET", "/health")}


def _api_routes():
    # The OpenAPI schema is the authoritative list of routes (routers are included lazily).
    for path, operations in app.openapi()["paths"].items():
        for method in operations:
            if (method.upper(), path) not in PUBLIC:
                yield method.upper(), path


@pytest.mark.parametrize("method,path", sorted(_api_routes()))
def test_every_api_route_requires_authentication(anon, method, path):
    concrete = path.replace("{request_id}", "1").replace("{user_id}", "1")
    concrete = concrete.replace("{run_id}", "1").replace("{episode_id}", "EP-1")
    r = anon.request(method, concrete)
    assert r.status_code == 401, f"{method} {path} -> {r.status_code}"


def test_health_is_public(anon):
    assert anon.get("/health").status_code == 200


# (client_role, method, path, json) -> forbidden for that role
STAFF_ONLY = [
    ("GET", "/api/episodes", None),
    ("GET", "/api/episodes/task-names", None),
    ("GET", "/api/analytics?from=2026-01-01&to=2026-12-31", None),
    ("GET", "/api/imports", None),
    ("POST", "/api/requests/1/assignments", {"episode_ids": ["EP-1"]}),
    ("DELETE", "/api/requests/1/assignments/EP-1", None),
]


@pytest.mark.parametrize("method,path,body", STAFF_ONLY)
def test_clients_cannot_use_staff_endpoints(db, client_a, as_a, method, path, body):
    make_request(db, client_a)
    r = as_a.request(method, path, json=body)
    assert r.status_code == 403


def test_clients_cannot_import(as_a):
    r = as_a.post("/api/imports", files={"file": ("e.csv", b"episode_id\n", "text/csv")})
    assert r.status_code == 403


@pytest.mark.parametrize("who", ["as_operator", "as_a"])
def test_only_admin_manages_users(request, who):
    c = request.getfixturevalue(who)
    assert c.get("/api/users").status_code == 403
    body = {"email": "x@oreste.dev", "name": "X", "role": "admin", "password": "longenough1"}
    assert c.post("/api/users", json=body).status_code == 403
    assert c.patch("/api/users/1", json={"role": "admin"}).status_code == 403


def test_only_clients_create_requests(as_operator, as_admin, as_a):
    body = {"task_name": "pick cup", "episodes_requested": 2, "deadline": "2099-01-01"}
    assert as_operator.post("/api/requests", json=body).status_code == 403
    assert as_admin.post("/api/requests", json=body).status_code == 403
    assert as_a.post("/api/requests", json=body).status_code == 201


def test_client_sees_only_own_requests(db, client_a, client_b, as_a, as_b, as_operator):
    ra = make_request(db, client_a)
    rb = make_request(db, client_b)
    assert [r["id"] for r in as_a.get("/api/requests").json()] == [ra.id]
    assert [r["id"] for r in as_b.get("/api/requests").json()] == [rb.id]
    assert {r["id"] for r in as_operator.get("/api/requests").json()} == {ra.id, rb.id}
    # Direct access to someone else's request looks exactly like a missing one.
    assert as_b.get(f"/api/requests/{ra.id}").status_code == 404
    assert as_b.get("/api/requests/99999").status_code == 404
    assert (
        as_b.post(f"/api/requests/{ra.id}/transitions", json={"to": "accepted"}).status_code == 404
    )


def test_deactivated_user_loses_access_immediately(db, operator, as_admin, as_operator):
    assert as_operator.get("/api/requests").status_code == 200
    r = as_admin.patch(f"/api/users/{operator.id}", json={"is_active": False})
    assert r.status_code == 200
    assert as_operator.get("/api/requests").status_code == 401
    login = api_client().post(
        "/api/auth/login", json={"email": operator.email, "password": PASSWORD}
    )
    assert login.status_code == 401


def test_role_change_takes_effect_immediately(client_a, as_admin, as_a):
    assert as_a.get("/api/episodes").status_code == 403
    as_admin.patch(f"/api/users/{client_a.id}", json={"role": "operator"})
    assert as_a.get("/api/episodes").status_code == 200


def test_admin_cannot_demote_or_deactivate_self(admin, as_admin):
    assert as_admin.patch(f"/api/users/{admin.id}", json={"role": "operator"}).status_code == 409
    assert as_admin.patch(f"/api/users/{admin.id}", json={"is_active": False}).status_code == 409


def test_admin_can_create_user_who_can_log_in(as_admin):
    body = {
        "email": "New@oreste.dev",
        "name": "New",
        "role": "operator",
        "password": "longenough1",
    }
    r = as_admin.post("/api/users", json=body)
    assert r.status_code == 201
    assert r.json()["email"] == "new@oreste.dev"
    ok = api_client().post(
        "/api/auth/login", json={"email": "new@oreste.dev", "password": "longenough1"}
    )
    assert ok.status_code == 200
    dup = as_admin.post("/api/users", json=body)
    assert dup.status_code == 409


def test_login_failures_are_indistinguishable(operator, anon):
    wrong_pw = anon.post("/api/auth/login", json={"email": operator.email, "password": "nope"})
    no_user = anon.post("/api/auth/login", json={"email": "ghost@oreste.dev", "password": "nope"})
    assert wrong_pw.status_code == no_user.status_code == 401
    assert wrong_pw.json() == no_user.json()


def test_login_is_throttled_after_repeated_failures(operator, anon):
    for _ in range(10):
        anon.post("/api/auth/login", json={"email": operator.email, "password": "nope"})
    r = anon.post("/api/auth/login", json={"email": operator.email, "password": PASSWORD})
    assert r.status_code == 429


def test_passwords_are_hashed_and_sessions_store_only_hashes(db, operator):
    assert operator.password_hash.startswith("$argon2")
    assert PASSWORD not in operator.password_hash
    c = api_client(operator)
    token = c.cookies.get("neotix_session")
    from sqlalchemy import select

    from app.models import Session

    assert db.scalar(select(Session.token_hash)) != token


def test_logout_invalidates_session(as_operator):
    assert as_operator.get("/api/auth/me").status_code == 200
    assert as_operator.post("/api/auth/logout").status_code == 204
    assert as_operator.get("/api/auth/me").status_code == 401


def test_cross_origin_state_change_is_rejected(operator):
    c = api_client(operator)
    r = c.post("/api/auth/logout", headers={"origin": "https://evil.example"})
    assert r.status_code == 403
    same = c.post("/api/auth/logout", headers={"origin": "http://testserver"})
    assert same.status_code == 204


def test_clients_may_see_assigned_episodes_on_their_own_request(db, client_a, as_a):
    req = make_request(db, client_a, assigned=2)
    detail = as_a.get(f"/api/requests/{req.id}").json()
    assert len(detail["episodes"]) == 2


def test_inactive_flag_is_enforced_on_every_request_even_if_a_session_survives(
    db, operator, as_operator
):
    """Defence in depth: deactivation deletes sessions, but the lookup re-checks the flag too."""
    from sqlalchemy import update

    from app.models import User

    db.execute(update(User).where(User.id == operator.id).values(is_active=False))
    db.commit()
    assert as_operator.get("/api/requests").status_code == 401


def test_request_list_supports_paging(db, client_a, as_operator):
    for _ in range(5):
        make_request(db, client_a)
    first = as_operator.get("/api/requests", params={"limit": 2, "offset": 0}).json()
    second = as_operator.get("/api/requests", params={"limit": 2, "offset": 2}).json()
    third = as_operator.get("/api/requests", params={"limit": 2, "offset": 4}).json()
    ids = [r["id"] for r in first + second + third]
    assert len(first) == 2 and len(second) == 2 and len(third) == 1
    assert ids == sorted(ids, reverse=True) and len(set(ids)) == 5
