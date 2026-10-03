from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.domain import QUALITIES, ROLES, STATUSES


def _in(column: str, values: tuple[str, ...]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint(_in("role", ROLES), name="ck_users_role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True)  # stored lower-cased
    name: Mapped[str] = mapped_column(String(120))
    organisation: Mapped[str | None] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(16))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Session(Base):
    """Server-side login session. Only a hash of the cookie token is stored."""

    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Robot(Base):
    __tablename__ = "robots"

    robot_id: Mapped[str] = mapped_column(String(64), primary_key=True)


class ImportRun(Base):
    __tablename__ = "import_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    filename: Mapped[str] = mapped_column(String(255))
    sha256: Mapped[str] = mapped_column(String(64))
    summary: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (
        CheckConstraint(_in("quality", QUALITIES), name="ck_episodes_quality"),
        CheckConstraint("duration_seconds BETWEEN 1 AND 3600", name="ck_episodes_duration"),
        Index("ix_episodes_recorded_at", "recorded_at"),
        Index("ix_episodes_task_quality", "task_name", "quality"),
        # Serves "top tasks by good episodes" without touching other rows.
        Index("ix_episodes_good_task", "task_name", postgresql_where=text("quality = 'good'")),
    )

    episode_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    robot_id: Mapped[str] = mapped_column(ForeignKey("robots.robot_id"))
    task_name: Mapped[str] = mapped_column(String(200))
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[int] = mapped_column(Integer)
    operator_name: Mapped[str | None] = mapped_column(String(120))
    quality: Mapped[str] = mapped_column(String(16))
    import_run_id: Mapped[int | None] = mapped_column(ForeignKey("import_runs.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    assignment: Mapped["Assignment | None"] = relationship(back_populates="episode")


class Request(Base):
    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint(_in("status", STATUSES), name="ck_requests_status"),
        CheckConstraint("episodes_requested > 0", name="ck_requests_count"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    task_name: Mapped[str] = mapped_column(String(200))
    episodes_requested: Mapped[int] = mapped_column(Integer)
    deadline: Mapped[date] = mapped_column(Date)
    notes: Mapped[str] = mapped_column(Text, default="", server_default="")
    status: Mapped[str] = mapped_column(String(16), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    client: Mapped[User] = relationship()
    events: Mapped[list["StatusEvent"]] = relationship(
        order_by="StatusEvent.id", back_populates="request"
    )
    assignments: Mapped[list["Assignment"]] = relationship(back_populates="request")


class StatusEvent(Base):
    """Append-only history of every status change (from_status is NULL for creation)."""

    __tablename__ = "request_status_events"
    __table_args__ = (Index("ix_status_events_request", "request_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"))
    from_status: Mapped[str | None] = mapped_column(String(16))
    to_status: Mapped[str] = mapped_column(String(16))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[Request] = relationship(back_populates="events")
    actor: Mapped[User] = relationship()


class Assignment(Base):
    """episode_id is the primary key: an episode belongs to at most one request, by construction."""

    __tablename__ = "assignments"
    __table_args__ = (Index("ix_assignments_request", "request_id"),)

    episode_id: Mapped[str] = mapped_column(ForeignKey("episodes.episode_id"), primary_key=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"))
    assigned_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    episode: Mapped[Episode] = relationship(back_populates="assignment")
    request: Mapped[Request] = relationship(back_populates="assignments")
