from fastapi import APIRouter, File, UploadFile
from sqlalchemy import select

from app.config import settings
from app.deps import Db, Staff
from app.errors import NotFound, Unprocessable
from app.models import ImportRun
from app.services import importer

router = APIRouter(prefix="/imports", tags=["imports"])


@router.post("", status_code=201)
def upload_csv(staff: Staff, db: Db, file: UploadFile = File(...)):
    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise Unprocessable(
            f"File exceeds the {settings.max_upload_bytes // (1024 * 1024)} MB limit.",
            code="file_too_large",
        )
    return importer.import_episodes(db, staff.id, file.filename or "upload.csv", data)


@router.get("")
def list_imports(_: Staff, db: Db):
    runs = db.scalars(select(ImportRun).order_by(ImportRun.id.desc()).limit(50))
    return [
        {
            "id": r.id,
            "filename": r.filename,
            "created_at": r.created_at,
            "user_id": r.user_id,
            "imported": r.summary.get("imported"),
            "unchanged": r.summary.get("unchanged"),
            "skipped_count": r.summary.get("skipped_count"),
        }
        for r in runs
    ]


@router.get("/{run_id}")
def get_import(run_id: int, _: Staff, db: Db):
    run = db.get(ImportRun, run_id)
    if run is None:
        raise NotFound("Import not found.")
    return run.summary
