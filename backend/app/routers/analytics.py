from datetime import date

from fastapi import APIRouter, Query

from app.deps import Db, Staff
from app.errors import Unprocessable
from app.services import analytics as svc

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("")
def get_analytics(
    _: Staff,
    db: Db,
    date_from: date = Query(alias="from"),
    date_to: date = Query(alias="to"),
):
    if date_from > date_to:
        raise Unprocessable("'from' must not be after 'to'.", code="invalid_range")
    return svc.analytics(db, date_from, date_to)
