"""Pure validation/normalisation of one CSV row. No I/O, no database: easy to unit test.

Every rejection has a stable machine-readable reason. Rules are documented in NOTES.md.
"""

import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.domain import MAX_DURATION_SECONDS, MIN_DURATION_SECONDS, QUALITIES
from app.text import normalize_task_name

REQUIRED_COLUMNS = (
    "episode_id",
    "robot_id",
    "task_name",
    "recorded_at",
    "duration_seconds",
    "operator_name",
    "quality",
)

_ID_RE = re.compile(r"^[A-Z0-9][A-Z0-9_.-]{0,63}$")
_INT_RE = re.compile(r"^\d+$")
# Day-first, because the one slash-formatted value in the export (14/08/2026) can only be day-first.
_DAY_FIRST_FORMATS = ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y")
_FUTURE_TOLERANCE = timedelta(minutes=5)


@dataclass(frozen=True)
class EpisodeRow:
    episode_id: str
    robot_id: str
    task_name: str
    recorded_at: datetime
    duration_seconds: int
    operator_name: str | None
    quality: str

    def comparable(self) -> tuple:
        """Everything except the id; used to tell identical duplicates from conflicting ones."""
        return (
            self.robot_id,
            self.task_name,
            self.recorded_at,
            self.duration_seconds,
            self.operator_name,
            self.quality,
        )


@dataclass(frozen=True)
class RowError:
    reason: str
    detail: str


def parse_timestamp(raw: str) -> datetime | None:
    value = raw.strip()
    parsed: datetime | None = None
    try:
        parsed = datetime.fromisoformat(value)  # handles 'T' or space separator and a 'Z' suffix
    except ValueError:
        for fmt in _DAY_FIRST_FORMATS:
            try:
                parsed = datetime.strptime(value, fmt)  # noqa: DTZ007  (made aware just below)
                break
            except ValueError:
                continue
    if parsed is None:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def validate_row(
    raw: dict[str, str], known_robots: frozenset[str], now: datetime | None = None
) -> tuple[EpisodeRow | None, RowError | None, list[str]]:
    """Return (row, error, warnings). Exactly one of row/error is set."""
    now = now or datetime.now(UTC)

    episode_id = raw["episode_id"].strip().upper()
    if not episode_id:
        return None, RowError("missing_episode_id", "episode_id is blank"), []
    if not _ID_RE.match(episode_id):
        return None, RowError("invalid_episode_id", f"unsupported id {episode_id!r}"), []

    robot_id = raw["robot_id"].strip().lower()
    if not robot_id:
        return None, RowError("missing_robot_id", "robot_id is blank"), []
    if robot_id not in known_robots:
        return None, RowError("unknown_robot", f"robot {robot_id!r} is not a known robot"), []

    task_name = normalize_task_name(raw["task_name"])
    if not task_name:
        return None, RowError("missing_task_name", "task_name is blank"), []
    if len(task_name) > 200:
        return None, RowError("invalid_task_name", "task_name longer than 200 characters"), []

    if not raw["recorded_at"].strip():
        return None, RowError("missing_recorded_at", "recorded_at is blank"), []
    recorded_at = parse_timestamp(raw["recorded_at"])
    if recorded_at is None or recorded_at.year < 2000:
        return None, RowError("invalid_recorded_at", f"cannot parse {raw['recorded_at']!r}"), []
    if recorded_at > now + _FUTURE_TOLERANCE:
        return (
            None,
            RowError("recorded_at_in_future", f"{recorded_at.isoformat()} is in the future"),
            [],
        )

    duration_raw = raw["duration_seconds"].strip()
    if not duration_raw:
        return None, RowError("missing_duration", "duration_seconds is blank"), []
    if not _INT_RE.match(duration_raw) or not (
        MIN_DURATION_SECONDS <= int(duration_raw) <= MAX_DURATION_SECONDS
    ):
        return (
            None,
            RowError(
                "invalid_duration",
                f"{duration_raw!r} is not a whole number of seconds between "
                f"{MIN_DURATION_SECONDS} and {MAX_DURATION_SECONDS}",
            ),
            [],
        )

    quality = raw["quality"].strip().lower()
    if not quality:
        return None, RowError("missing_quality", "quality is blank"), []
    if quality not in QUALITIES:
        return (
            None,
            RowError("invalid_quality", f"{raw['quality'].strip()!r} is not one of {QUALITIES}"),
            [],
        )

    warnings = []
    operator_name = " ".join(raw["operator_name"].split()) or None
    if operator_name is None:
        warnings.append("missing_operator_name")

    row = EpisodeRow(
        episode_id, robot_id, task_name, recorded_at, int(duration_raw), operator_name, quality
    )
    return row, None, warnings
