"""initial schema

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "robots",
        sa.Column("robot_id", sa.String(length=64), nullable=False),
        sa.PrimaryKeyConstraint("robot_id"),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("organisation", sa.String(length=120), nullable=True),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("role IN ('client', 'operator', 'admin')", name="ck_users_role"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
    )
    op.create_table(
        "import_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("summary", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "requests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("client_id", sa.Integer(), nullable=False),
        sa.Column("task_name", sa.String(length=200), nullable=False),
        sa.Column("episodes_requested", sa.Integer(), nullable=False),
        sa.Column("deadline", sa.Date(), nullable=False),
        sa.Column("notes", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('submitted', 'in_progress', 'delivered', 'accepted', 'rejected')",
            name="ck_requests_status",
        ),
        sa.CheckConstraint("episodes_requested > 0", name="ck_requests_count"),
        sa.ForeignKeyConstraint(
            ["client_id"],
            ["users.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_requests_client_id"), "requests", ["client_id"], unique=False)
    op.create_index(op.f("ix_requests_status"), "requests", ["status"], unique=False)
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index(op.f("ix_sessions_user_id"), "sessions", ["user_id"], unique=False)
    op.create_table(
        "episodes",
        sa.Column("episode_id", sa.String(length=64), nullable=False),
        sa.Column("robot_id", sa.String(length=64), nullable=False),
        sa.Column("task_name", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_seconds", sa.Integer(), nullable=False),
        sa.Column("operator_name", sa.String(length=120), nullable=True),
        sa.Column("quality", sa.String(length=16), nullable=False),
        sa.Column("import_run_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("quality IN ('good', 'usable', 'bad')", name="ck_episodes_quality"),
        sa.CheckConstraint("duration_seconds BETWEEN 1 AND 3600", name="ck_episodes_duration"),
        sa.ForeignKeyConstraint(
            ["import_run_id"],
            ["import_runs.id"],
        ),
        sa.ForeignKeyConstraint(
            ["robot_id"],
            ["robots.robot_id"],
        ),
        sa.PrimaryKeyConstraint("episode_id"),
    )
    op.create_index(
        "ix_episodes_good_task",
        "episodes",
        ["task_name"],
        unique=False,
        postgresql_where=sa.text("quality = 'good'"),
    )
    op.create_index("ix_episodes_recorded_at", "episodes", ["recorded_at"], unique=False)
    op.create_index("ix_episodes_task_quality", "episodes", ["task_name", "quality"], unique=False)
    op.create_table(
        "request_status_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("from_status", sa.String(length=16), nullable=True),
        sa.Column("to_status", sa.String(length=16), nullable=False),
        sa.Column("actor_id", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_status_events_request",
        "request_status_events",
        ["request_id", "created_at"],
        unique=False,
    )
    op.create_table(
        "assignments",
        sa.Column("episode_id", sa.String(length=64), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("assigned_by", sa.Integer(), nullable=False),
        sa.Column(
            "assigned_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["assigned_by"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["episode_id"],
            ["episodes.episode_id"],
        ),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["requests.id"],
        ),
        sa.PrimaryKeyConstraint("episode_id"),
    )
    op.create_index("ix_assignments_request", "assignments", ["request_id"], unique=False)

    # Reference data: the robots the recording system is known to emit.
    robots = sa.table("robots", sa.column("robot_id", sa.String))
    op.bulk_insert(
        robots,
        [{"robot_id": r} for r in ("arm-01", "arm-02", "arm-03", "mobile-01", "humanoid-01")],
    )


def downgrade() -> None:
    op.drop_index("ix_assignments_request", table_name="assignments")
    op.drop_table("assignments")
    op.drop_index("ix_status_events_request", table_name="request_status_events")
    op.drop_table("request_status_events")
    op.drop_index("ix_episodes_task_quality", table_name="episodes")
    op.drop_index("ix_episodes_recorded_at", table_name="episodes")
    op.drop_index(
        "ix_episodes_good_task", table_name="episodes", postgresql_where=sa.text("quality = 'good'")
    )
    op.drop_table("episodes")
    op.drop_index(op.f("ix_sessions_user_id"), table_name="sessions")
    op.drop_table("sessions")
    op.drop_index(op.f("ix_requests_status"), table_name="requests")
    op.drop_index(op.f("ix_requests_client_id"), table_name="requests")
    op.drop_table("requests")
    op.drop_table("import_runs")
    op.drop_table("users")
    op.drop_table("robots")
