import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import ai, assets, auth, documents, exports, misc, projects, references, sync, templates, workspaces
from .config import get_settings
from .db import Base, SessionLocal, get_engine
from .services.ratelimit import limiter
from .services.templates import seed_builtin_templates

log = logging.getLogger("rsp")


def create_app(init_db: bool = True) -> FastAPI:
    s = get_settings()
    app = FastAPI(title="Report Studio PRO API", version="1.0.0",
                  description="Backend for Report Studio PRO — reports, editor documents, AI, references, exports, sync.")
    @app.middleware("http")
    async def security_mw(request: Request, call_next):
        ip = request.client.host if request.client else "unknown"
        key = f"ip:{ip}"
        if request.url.path.startswith("/auth/login") or request.url.path.startswith("/auth/register"):
            if not limiter.allow(f"auth:{ip}", 10):
                return JSONResponse({"detail": "Too many attempts, try again in a minute"}, status_code=429, headers={"Retry-After": "60"})
        elif request.method != "OPTIONS" and not limiter.allow(key, s.rate_limit_per_minute):
            return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429, headers={"Retry-After": "60"})
        resp = await call_next(request)
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        return resp

    @app.exception_handler(RequestValidationError)
    async def validation_handler(request, exc):
        errs = [{"loc": e.get("loc"), "msg": e.get("msg")} for e in exc.errors()]
        return JSONResponse({"detail": "Validation error", "errors": errs}, status_code=422)

    @app.exception_handler(Exception)
    async def unhandled(request, exc):
        if isinstance(exc, HTTPException):
            raise exc
        log.exception("Unhandled error on %s", request.url.path)
        return JSONResponse({"detail": "Internal server error"}, status_code=500)

    # Added last = outermost: every response (including 429s and errors) carries CORS headers,
    # so the browser shows the real error instead of a generic network failure.
    app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=True,
                       allow_methods=["*"], allow_headers=["*"], expose_headers=["Content-Disposition", "Retry-After"])

    for r in (auth, workspaces, projects, documents, templates, references, assets, ai, exports, sync, misc):
        app.include_router(r.router)

    @app.get("/health", tags=["system"])
    def health():
        return {"status": "ok", "app": s.app_name}

    if init_db:
        engine = get_engine()
        Base.metadata.create_all(engine)  # SQLite/dev; production PostgreSQL uses migrations/*.sql
        with SessionLocal() as db:
            seed_builtin_templates(db)
    return app


app = create_app()
