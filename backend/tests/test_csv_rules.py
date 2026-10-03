"""Row-level import rules: one test per messy case found in seed/episodes.csv."""

from datetime import UTC, datetime

import pytest

from app.services.csv_rules import parse_timestamp, validate_row

ROBOTS = frozenset({"arm-01", "arm-02", "arm-03", "mobile-01", "humanoid-01"})
NOW = datetime(2026, 10, 3, tzinfo=UTC)


def row(**overrides):
    base = {
        "episode_id": "EP-00001",
        "robot_id": "arm-01",
        "task_name": "pick cup",
        "recorded_at": "2026-08-30T10:25:00",
        "duration_seconds": "102",
        "operator_name": "Diane",
        "quality": "good",
    }
    return {**base, **overrides}


def check(**overrides):
    return validate_row(row(**overrides), ROBOTS, NOW)


def test_clean_row_is_accepted_unchanged():
    parsed, error, warnings = check()
    assert error is None and warnings == []
    assert parsed.episode_id == "EP-00001" and parsed.duration_seconds == 102
    assert parsed.recorded_at == datetime(2026, 8, 30, 10, 25, tzinfo=UTC)


@pytest.mark.parametrize(
    "field,raw,expected",
    [
        ("episode_id", " ep-00003 ", "EP-00003"),
        ("robot_id", " arm-01", "arm-01"),
        ("task_name", "  Pick Cup ", "pick cup"),
        ("task_name", "PICK CUP", "pick cup"),
        ("task_name", "pick cup, then place", "pick cup, then place"),
        ("quality", "Good", "good"),
        ("quality", "USABLE", "usable"),
    ],
)
def test_normalisation(field, raw, expected):
    parsed, error, _ = check(**{field: raw})
    assert error is None
    assert getattr(parsed, field) == expected


@pytest.mark.parametrize(
    "overrides,reason",
    [
        ({"episode_id": ""}, "missing_episode_id"),
        ({"robot_id": ""}, "missing_robot_id"),
        ({"robot_id": "arm-99"}, "unknown_robot"),
        ({"quality": ""}, "missing_quality"),
        ({"quality": "excellent"}, "invalid_quality"),
        ({"duration_seconds": ""}, "missing_duration"),
        ({"duration_seconds": "45.5"}, "invalid_duration"),
        ({"duration_seconds": "-5"}, "invalid_duration"),
        ({"duration_seconds": "N/A"}, "invalid_duration"),
        ({"duration_seconds": "999999"}, "invalid_duration"),
        ({"duration_seconds": "0"}, "invalid_duration"),
        ({"recorded_at": "not a date"}, "invalid_recorded_at"),
        ({"recorded_at": ""}, "missing_recorded_at"),
        ({"recorded_at": "2031-01-01T00:00:00"}, "recorded_at_in_future"),
        ({"task_name": "   "}, "missing_task_name"),
    ],
)
def test_rejections(overrides, reason):
    parsed, error, _ = check(**overrides)
    assert parsed is None and error.reason == reason


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("2026-08-14T09:12:00", datetime(2026, 8, 14, 9, 12, tzinfo=UTC)),
        ("2026-08-14 09:12:00", datetime(2026, 8, 14, 9, 12, tzinfo=UTC)),
        ("2026-08-14T09:20:00Z", datetime(2026, 8, 14, 9, 20, tzinfo=UTC)),
        ("2026-08-14T11:20:00+02:00", datetime(2026, 8, 14, 9, 20, tzinfo=UTC)),
        ("14/08/2026 09:15", datetime(2026, 8, 14, 9, 15, tzinfo=UTC)),  # day-first
        ("03/08/2026 09:15", datetime(2026, 8, 3, 9, 15, tzinfo=UTC)),
    ],
)
def test_timestamp_formats_are_normalised_to_utc(raw, expected):
    assert parse_timestamp(raw) == expected


def test_blank_operator_is_a_warning_not_a_rejection():
    parsed, error, warnings = check(operator_name="  ")
    assert error is None and parsed.operator_name is None
    assert warnings == ["missing_operator_name"]
