from fastapi import APIRouter

from app.deps import AdminUser, Db
from app.schemas import UserCreate, UserOut, UserUpdate
from app.services import users

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(_: AdminUser, db: Db):
    return users.list_users(db)


@router.post("", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, _: AdminUser, db: Db):
    return users.create_user(db, **data.model_dump())


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, admin: AdminUser, db: Db):
    return users.update_user(db, admin, user_id, **data.model_dump())
