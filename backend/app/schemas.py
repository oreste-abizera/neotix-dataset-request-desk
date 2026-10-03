from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.domain import ROLES, STATUSES
from app.text import normalize_task_name


def _task(value: str) -> str:
    value = normalize_task_name(value)
    if not value:
        raise ValueError("must not be blank")
    return value


TaskName = Annotated[str, Field(max_length=200), AfterValidator(_task)]
Role = Literal[*ROLES]
Status = Literal[*STATUSES]


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginIn(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)


class UserOut(Out):
    id: int
    email: str
    name: str
    organisation: str | None
    role: str
    is_active: bool


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    role: Role
    password: str = Field(min_length=8, max_length=200)
    organisation: str | None = Field(default=None, max_length=120)


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=8, max_length=200)


class RequestCreate(BaseModel):
    task_name: TaskName
    episodes_requested: int = Field(ge=1, le=100_000)
    deadline: date
    notes: str = Field(default="", max_length=2000)

    @field_validator("deadline")
    @classmethod
    def _not_in_past(cls, v: date) -> date:
        if v < date.today():
            raise ValueError("deadline must be today or later")
        return v


class TransitionIn(BaseModel):
    to: Status


class AssignIn(BaseModel):
    episode_ids: list[str] = Field(min_length=1, max_length=500)


class StatusEventOut(Out):
    from_status: str | None
    to_status: str
    actor_id: int
    actor_name: str
    created_at: datetime


class ExportOut(Out):
    status: str
    attempts: int
    max_attempts: int
    last_error: str | None
    next_attempt_at: datetime | None
    finished_at: datetime | None


class EpisodeOut(Out):
    episode_id: str
    robot_id: str
    task_name: str
    recorded_at: datetime
    duration_seconds: int
    operator_name: str | None
    quality: str
    assigned_request_id: int | None = None
    export: ExportOut | None = None  # staff only; null for clients


class RequestOut(Out):
    id: int
    client_id: int
    client_name: str
    client_organisation: str | None
    task_name: str
    episodes_requested: int
    deadline: date
    notes: str
    status: str
    assigned_count: int
    created_at: datetime
    updated_at: datetime


class RequestDetailOut(RequestOut):
    events: list[StatusEventOut]
    episodes: list[EpisodeOut]
    allowed_transitions: list[str]


class EpisodePage(BaseModel):
    items: list[EpisodeOut]
    total: int
    page: int
    page_size: int
