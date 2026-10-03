from urllib.parse import urlparse

from fastapi import APIRouter, FastAPI, Request

from app.errors import error_response, register_error_handlers
from app.logging_setup import configure_logging, install_access_log
from app.routers import auth, episodes, health, requests, users

configure_logging()

app = FastAPI(
    title="Dataset Request Desk",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
    swagger_ui_oauth2_redirect_url=None,
)
register_error_handlers(app)

api = APIRouter(prefix="/api")
for module in (auth, users, requests, episodes):
    api.include_router(module.router)
app.include_router(api)
app.include_router(health.router)

_UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def csrf_origin_check(request: Request, call_next):
    """Cookie auth + SameSite=Lax already blocks cross-site form posts; this additionally rejects
    any state-changing request whose Origin header names a different host than the one served."""
    origin = request.headers.get("origin")
    if (
        request.method in _UNSAFE
        and origin
        and urlparse(origin).netloc != request.headers.get("host")
    ):
        return error_response(403, "csrf", "Cross-origin request rejected.")
    return await call_next(request)


# Added last so it is outermost: it logs responses produced by the other middleware too.
install_access_log(app)
