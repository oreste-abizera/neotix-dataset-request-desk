from fastapi import APIRouter, Request, Response

from app.config import settings
from app.deps import CurrentUser, Db
from app.schemas import LoginIn, UserOut
from app.services import users

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, request: Request, response: Response, db: Db):
    user, token = users.login(db, data.email, data.password)
    request.state.user_id = user.id  # so the access log line names who just signed in
    response.set_cookie(
        settings.cookie_name,
        token,
        max_age=settings.session_ttl_hours * 3600,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
    )
    return user


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, db: Db, _: CurrentUser):
    users.logout(db, request.cookies[settings.cookie_name])
    response.delete_cookie(settings.cookie_name, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user
