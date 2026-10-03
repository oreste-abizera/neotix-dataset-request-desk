"""Import: end-to-end behaviour on the real messy export, and idempotency."""

from collections import Counter
from pathlib import Path

from sqlalchemy import func, select

from app.models import Assignment, Episode
from app.services import importer
from tests.conftest import make_request

SEED_CSV = Path(__file__).resolve().parents[2] / "seed" / "episodes.csv"
HEADER = "episode_id,robot_id,task_name,recorded_at,duration_seconds,operator_name,quality\n"


def upload(client, data: bytes, name="episodes.csv"):
    return client.post("/api/imports", files={"file": (name, data, "text/csv")})


def count(db):
    return db.scalar(select(func.count()).select_from(Episode))


def test_real_export_report(as_operator, db):
    r = upload(as_operator, SEED_CSV.read_bytes())
    assert r.status_code == 201
    rep = r.json()
    assert rep["total_rows"] == 189 and rep["blank_lines"] == 2
    assert rep["imported"] == 172 and rep["unchanged"] == 0
    assert rep["imported"] + rep["skipped_count"] == rep["total_rows"]
    assert rep["skipped_by_reason"] == {
        "duplicate_in_file": 2,
        "conflicting_duplicate_in_file": 2,  # EP-00011 (bad vs good) and ep-00003 vs EP-00003
        "missing_episode_id": 1,
        "missing_robot_id": 1,
        "unknown_robot": 1,
        "missing_quality": 1,
        "invalid_quality": 1,
        "missing_duration": 1,
        "invalid_duration": 4,  # 45.5, -5, N/A, 999999
        "invalid_recorded_at": 1,
        "recorded_at_in_future": 1,
        "malformed_row": 1,
    }
    assert rep["warnings_by_code"] == {"missing_operator_name": 1}
    assert count(db) == 172
    assert all(s["reason"] and s["line"] for s in rep["skipped"])


def test_import_is_idempotent(as_operator, db):
    first = upload(as_operator, SEED_CSV.read_bytes()).json()
    snapshot = sorted(db.execute(select(Episode.episode_id, Episode.quality)).all())
    second = upload(as_operator, SEED_CSV.read_bytes()).json()
    third = upload(as_operator, SEED_CSV.read_bytes()).json()
    for rep in (second, third):
        assert rep["imported"] == 0
        assert rep["unchanged"] == first["imported"]
        # Same rows rejected for the same reasons every time.
        assert rep["skipped_by_reason"].get("conflict_with_existing") is None
    assert count(db) == 172
    db.expire_all()
    assert sorted(db.execute(select(Episode.episode_id, Episode.quality)).all()) == snapshot


def test_first_occurrence_wins_for_conflicting_duplicates(as_operator, db):
    upload(as_operator, SEED_CSV.read_bytes())
    # EP-00011 appears first as 'bad' then as 'good'; the first stays and the second is reported.
    assert db.get(Episode, "EP-00011").quality == "bad"
    # ep-00003 is normalised to EP-00003 and collides with the earlier row, which stays.
    assert db.get(Episode, "EP-00003").robot_id == "humanoid-01"
    assert db.get(Episode, "EP-00003").task_name == "fold towel"


def test_normalised_values_are_stored(as_operator, db):
    upload(as_operator, SEED_CSV.read_bytes())
    assert db.get(Episode, "EP-00006").task_name == "pick cup"
    assert db.get(Episode, "EP-00007").task_name == "pick cup"
    assert db.get(Episode, "EP-00008").robot_id == "arm-01"
    assert db.get(Episode, "EP-00009").quality == "good"
    assert db.get(Episode, "EP-00014").recorded_at.isoformat() == "2026-08-14T09:15:00+00:00"
    assert db.get(Episode, "EP-90002").task_name == "pick cup, then place"
    assert db.get(Episode, "EP-90005").operator_name is None
    assert Counter(e.robot_id for e in db.scalars(select(Episode))).keys() <= {
        "arm-01",
        "arm-02",
        "arm-03",
        "mobile-01",
        "humanoid-01",
    }


def test_existing_episode_is_never_overwritten_even_if_assigned(as_operator, db, client_a):
    upload(
        as_operator, HEADER.encode() + b"EP-1,arm-01,pick cup,2026-08-01T10:00:00,30,Aline,good\n"
    )
    req = make_request(db, client_a, status="in_progress")
    as_operator.post(f"/api/requests/{req.id}/assignments", json={"episode_ids": ["EP-1"]})
    # A later export claims the same episode is now 'bad'.
    rep = upload(
        as_operator, HEADER.encode() + b"EP-1,arm-01,pick cup,2026-08-01T10:00:00,30,Aline,bad\n"
    ).json()
    assert rep["imported"] == 0
    assert rep["skipped_by_reason"] == {"conflict_with_existing": 1}
    assert "quality: stored 'good', file 'bad'" in rep["skipped"][0]["detail"]
    db.expire_all()
    assert db.get(Episode, "EP-1").quality == "good"
    assert db.scalar(select(func.count()).select_from(Assignment)) == 1


def test_rejects_files_without_required_columns(as_operator):
    r = upload(as_operator, b"episode_id,robot_id\nEP-1,arm-01\n")
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_header"
    assert upload(as_operator, b"").status_code == 422


def test_rejects_non_utf8_and_oversized(as_operator, monkeypatch):
    assert upload(as_operator, b"\xff\xfe\x00bad").status_code == 422
    monkeypatch.setattr("app.config.settings.max_upload_bytes", 10)
    r = upload(as_operator, HEADER.encode())
    assert r.status_code == 422 and r.json()["error"]["code"] == "file_too_large"


def test_import_run_is_recorded_and_retrievable(as_operator, operator):
    rep = upload(as_operator, SEED_CSV.read_bytes()).json()
    runs = as_operator.get("/api/imports").json()
    assert runs[0]["id"] == rep["import_run_id"] and runs[0]["user_id"] == operator.id
    stored = as_operator.get(f"/api/imports/{rep['import_run_id']}").json()
    assert stored["imported"] == 172


def test_bom_crlf_and_quoted_fields(as_operator, db):
    data = (
        b"\xef\xbb\xbf"
        + HEADER.replace("\n", "\r\n").encode()
        + b'EP-9,arm-02,"wipe, then dry",2026-08-01T10:00:00,20,Eric,usable\r\n'
    )
    rep = upload(as_operator, data).json()
    assert rep["imported"] == 1
    assert db.get(Episode, "EP-9").task_name == "wipe, then dry"


def test_large_import_is_chunked_and_idempotent(db):
    n = importer.CHUNK * 2 + 17
    lines = [f"EP-L{i},arm-01,pick cup,2026-08-01T10:00:00,30,Aline,good" for i in range(n)]
    data = (HEADER + "\n".join(lines) + "\n").encode()
    first = importer.import_episodes(db, None, "big.csv", data)
    second = importer.import_episodes(db, None, "big.csv", data)
    assert (first["imported"], second["imported"], second["unchanged"]) == (n, 0, n)
    assert count(db) == n


def test_unparseable_files_are_rejected_cleanly_not_500(as_operator, db):
    huge_field = b"EP-1,arm-01," + b"x" * 200_000 + b",2026-08-01T10:00:00,30,Aline,good\n"
    r = upload(as_operator, HEADER.encode() + huge_field)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_csv"
    r = upload(
        as_operator, HEADER.encode() + b"EP-2,arm-01,pick\x00cup,2026-08-01T10:00:00,30,A,good\n"
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_csv"
    assert count(db) == 0  # nothing from either file was imported
