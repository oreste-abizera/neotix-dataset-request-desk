"""episode exports

Revision ID: 0003
Revises: 0002
"""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "episode_exports",
        sa.Column("episode_id", sa.String(length=64), nullable=False),
        sa.Column("request_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="pending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'succeeded', 'failed')", name="ck_exports_status"
        ),
        sa.ForeignKeyConstraint(["episode_id"], ["episodes.episode_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["request_id"], ["requests.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("episode_id"),
    )
    op.create_index(
        "ix_exports_claim", "episode_exports", ["status", "next_attempt_at"], unique=False
    )
    op.create_index("ix_exports_request", "episode_exports", ["request_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_exports_request", table_name="episode_exports")
    op.drop_index("ix_exports_claim", table_name="episode_exports")
    op.drop_table("episode_exports")
