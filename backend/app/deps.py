from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.db import get_db
from app.domain import ADMIN, STAFF_ROLES
from app.errors import Forbidden, Unauthorized
from app.models import Session, User
from app.security import hash_token

Db = Annotated[DbSession, Depends(get_db)]


def current_user(request: Request, db: Db) -> User:
    """Resolve the cookie to an active user. The role is read from the DB on every request, so a
    deactivation or role change takes effect immediately."""
    token = request.cookies.get(settings.cookie_name)
    if not token:
        raise Unauthorized("Authentication required.")
    user = db.scalar(
        select(User)
        .join(Session, Session.user_id == User.id)
        .where(
            Session.token_hash == hash_token(token),
            Session.expires_at > datetime.now(UTC),
            User.is_active.is_(True),
        )
    )
    if user is None:
        raise Unauthorized("Authentication required.")
    request.state.user_id = user.id
    return user


CurrentUser = Annotated[User, Depends(current_user)]


def require_roles(*roles: str):
    def checker(user: CurrentUser) -> User:
        if user.role not in roles:
            raise Forbidden("You do not have permission to perform this action.")
        return user

    return checker


Staff = Annotated[User, Depends(require_roles(*STAFF_ROLES))]
AdminUser = Annotated[User, Depends(require_roles(ADMIN))]
