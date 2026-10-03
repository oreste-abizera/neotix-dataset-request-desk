"""index requests by created_at

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_requests_created_at", "requests", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_requests_created_at", table_name="requests")
