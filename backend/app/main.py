"""HCMN – Human Centralized Mesh Network  ·  FastAPI application entry-point.

Brings together three modules:
  1. Video Observational Deck – camera feed aggregation with quad-view & AI chat
  2. Satellite/GPS Tracking – global tracking with aircraft, vessels, satellites, crime data
  3. Wi-Fi CSI Sensing – presence detection & spatial reconstruction
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.config import Settings
from backend.app.routers import cameras, chat, csi, gotham, sdr, tracking
from backend.app.services.camera_service import CameraService
from backend.app.services.chat_service import ChatService
from backend.app.services.csi_service import CSIService
from backend.app.services.gotham_service import GothamService
from backend.app.services.sdr_service import SDRService
from backend.app.services.tracking_service import TrackingService

settings = Settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Initialise services on startup, clean up on shutdown."""
    camera_service = CameraService(settings)
    sdr_service = SDRService(settings)
    csi_service = CSIService(settings)
    tracking_service = TrackingService(settings)
    chat_service = ChatService(settings)
    gotham_service = GothamService(settings)

    cameras.init(camera_service)
    sdr.init(sdr_service)
    csi.init(csi_service)
    tracking.init(tracking_service, camera_service)
    chat.init(chat_service)
    gotham.init(gotham_service)

    yield  # application runs


app = FastAPI(
    title=settings.app_name,
    description=(
        "Multi-module surveillance and monitoring platform:\n"
        "• Module 1: Video Observational Deck with quad-view & AI chat\n"
        "• Module 2: Satellite/GPS/AIS/FAA tracking with crime heat maps\n"
        "• Module 3: Wi-Fi CSI presence detection & environment mapping"
    ),
    version="0.2.0",
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
app.include_router(tracking.router)
app.include_router(chat.router)
app.include_router(gotham.router)


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
