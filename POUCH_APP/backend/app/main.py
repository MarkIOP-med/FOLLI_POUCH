"""FOLLI POUCH_APP backend — FastAPI + SQLite.

Run:  uvicorn app.main:app --reload --port 8000   (from POUCH_APP/backend/)

Layout
------
    core/          pure domain logic — no I/O, no framework
    db/            schema, connection handling, the get_db dependency
    repositories/  every SQL statement in the application
    services/      orchestration (snapshot building, alert raising)
    transport/     serial and mock links to the pouch, plus the device registry
    routers/       HTTP surface
    schemas/       pydantic request/response models
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import init_db
from .db.session import session_scope
from .repositories import devices as devices_repo
from .routers import devices, patients, system
from .services.provisioning import provision_detected_pouches
from .transport.registry import registry


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Startup and shutdown. Replaces the deprecated @app.on_event hooks."""
    init_db()
    with session_scope() as conn:
        registry.load(devices_repo.list_all(conn))
        # First run with no roster: adopt any pouch already on a serial port, so
        # the operator app is never a dead end waiting for a device it gives no
        # way to add. No-op once any device exists.
        provision_detected_pouches(conn)

    yield

    # Close serial ports cleanly so a reload does not leave the port locked.
    registry.disconnect_all()


def create_app() -> FastAPI:
    app = FastAPI(
        title="FOLLI POUCH_APP",
        version="0.1.0",
        summary="Clinical control surface for the FOLLI pneumatic headband.",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system.router, prefix="/api")
    app.include_router(devices.router, prefix="/api")
    app.include_router(patients.router, prefix="/api")

    return app


app = create_app()
