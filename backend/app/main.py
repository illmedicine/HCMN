"""HCMN – Human Centralized Mesh Network  ·  FastAPI application entry-point.

Brings together three modules:
  1. Public Observational Deck  – camera feed aggregation
  2. SDR RF Spectrum Visualisation – local software-defined radio mapping
  3. Wi-Fi CSI Sensing – presence detection & spatial reconstruction
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import Settings
from backend.app.routers import cameras, csi, sdr
from backend.app.services.camera_service import CameraService
from backend.app.services.csi_service import CSIService
from backend.app.services.sdr_service import SDRService

settings = Settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialise services on startup, clean up on shutdown."""
    camera_service = CameraService(settings)
    sdr_service = SDRService(settings)
    csi_service = CSIService(settings)

    cameras.init(camera_service)
    sdr.init(sdr_service)
    csi.init(csi_service)

    yield  # application runs


app = FastAPI(
    title=settings.app_name,
    description=(
        "Centralized surveillance observational deck featuring public camera "
        "aggregation, local SDR RF spectrum mapping, and Wi-Fi CSI-based "
        "presence detection & spatial reconstruction."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cameras.router)
app.include_router(sdr.router)
app.include_router(csi.router)


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
