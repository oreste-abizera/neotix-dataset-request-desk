import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.config import settings
from app.domain import CLIENT
from app.errors import Conflict, NotFound, TooManyRequests, Unauthorized
from app.models import Session, User
from app.security import (
    hash_password,
    hash_token,
    login_throttle,
    new_session_token,
    verify_password,
)


def login(db: DbSession, email: str, password: str) -> tuple[User, str]:
    """Return the user and a fresh raw session token. Failures are indistinguishable."""
    key = email.strip().lower()
    if login_throttle.blocked(key):
        raise TooManyRequests("Too many failed attempts. Try again later.")
    user = db.scalar(select(User).where(User.email == key))
    ok = verify_password(password, user.password_hash if user else None)
    if not (ok and user and user.is_active):
        login_throttle.record_failure(key)
        raise Unauthorized("Invalid email or password.")
    login_throttle.reset(key)
    token = new_session_token()
    db.add(
        Session(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(hours=settings.session_ttl_hours),
        )
    )
    # Opportunistic cleanup keeps the sessions table small without a scheduler.
    db.execute(delete(Session).where(Session.expires_at < datetime.now(UTC)))
    db.commit()
    return user, token


def logout(db: DbSession, token: str) -> None:
    db.execute(delete(Session).where(Session.token_hash == hash_token(token)))
    db.commit()


def create_user(
    db: DbSession,
    *,
    email: str,
    name: str,
    role: str,
    password: str,
    organisation: str | None = None,
) -> User:
    user = User(
        email=email.strip().lower(),
        name=name,
        role=role,
        organisation=organisation if role == CLIENT else None,
        password_hash=hash_password(password),
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise Conflict("A user with this email already exists.", code="email_taken") from None
    return user


def list_users(db: DbSession) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)))


def update_user(
    db: DbSession,
    actor: User,
    user_id: int,
    *,
    name: str | None,
    role: str | None,
    is_active: bool | None,
    password: str | None,
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise NotFound("User not found.")
    if user.id == actor.id and ((role is not None and role != user.role) or is_active is False):
        # Guarantees at least one active admin always remains (the one making the change).
        raise Conflict(
            "You cannot change your own role or deactivate yourself.", code="self_change"
        )
    revoke = False
    if name is not None:
        user.name = name
    if role is not None and role != user.role:
        user.role = role
        if role != CLIENT:
            user.organisation = None
    if is_active is not None and is_active != user.is_active:
        user.is_active = is_active
        revoke = not is_active
    if password is not None:
        user.password_hash = hash_password(password)
        revoke = True
    if revoke:
        db.execute(delete(Session).where(Session.user_id == user.id))
    db.commit()
    return user


def seed_users(db: DbSession, path: Path) -> list[str]:
    """Create any seed user that does not exist yet. Never touches existing accounts."""
    created = []
    for entry in json.loads(path.read_text()):
        email = entry["email"].strip().lower()
        if db.scalar(select(User.id).where(User.email == email)):
            continue
        create_user(
            db,
            email=email,
            name=entry["name"],
            role=entry["role"],
            password=entry["password"],
            organisation=entry.get("organisation"),
        )
        created.append(email)
    return created
