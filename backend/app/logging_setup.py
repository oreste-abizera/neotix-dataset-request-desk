import json
import logging
import re
import sys
import time
import uuid
from datetime import UTC, datetime

from fastapi import FastAPI, Request
from starlette.responses import Response

from app.errors import error_response

access_logger = logging.getLogger("app.access")
_SAFE_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        entry.update(getattr(record, "fields", {}))
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(logging.INFO)
    # Our middleware emits the access line; silence uvicorn's duplicate.
    logging.getLogger("uvicorn.access").disabled = True
    logging.getLogger("httpx").setLevel(logging.WARNING)


def install_access_log(app: FastAPI) -> None:
    @app.middleware("http")
    async def access_log(request: Request, call_next) -> Response:
        # Honour a caller-supplied id (useful for tracing through a proxy) only if it is harmless;
        # otherwise an arbitrary header would be echoed back and written into every log line.
        supplied = request.headers.get("x-request-id", "")
        request_id = supplied if _SAFE_REQUEST_ID.match(supplied) else uuid.uuid4().hex[:12]
        request.state.user_id = None  # filled in by the auth dependency
        start = time.perf_counter()
        status = 500
        try:
            response = await call_next(request)
            status = response.status_code
        except Exception:
            access_logger.exception("unhandled error", extra={"fields": {"request_id": request_id}})
            response = error_response(500, "internal_error", "Internal server error.")
        response.headers["x-request-id"] = request_id
        access_logger.info(
            "request",
            extra={
                "fields": {
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status": status,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 2),
                    "user_id": request.state.user_id,
                }
            },
        )
        return response
