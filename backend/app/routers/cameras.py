"""API routes for the Public Observational Deck (camera aggregation)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.app.models.schemas import CameraFeed, CameraSource
from backend.app.services.camera_service import CameraService

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

_service: CameraService | None = None


def init(service: CameraService) -> None:
    global _service
    _service = service


def _svc() -> CameraService:
    if _service is None:
        raise HTTPException(status_code=503, detail="Camera service not initialised")
    return _service


@router.get("/", response_model=list[CameraFeed])
async def list_feeds(source: CameraSource | None = None) -> list[CameraFeed]:
    """Return all registered camera feeds, optionally filtered by source."""
    return _svc().list_feeds(source)


@router.get("/search", response_model=list[CameraFeed])
async def search_by_location(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(50.0, ge=0.1, le=500),
) -> list[CameraFeed]:
    """Find camera feeds within radius of given coordinates."""
    return _svc().search_by_location(lat, lon, radius_km)


@router.get("/{feed_id}", response_model=CameraFeed)
async def get_feed(feed_id: str) -> CameraFeed:
    """Look up a single camera feed by id."""
    feed = _svc().get_feed(feed_id)
    if feed is None:
        raise HTTPException(status_code=404, detail="Feed not found")
    return feed


@router.post("/", response_model=CameraFeed, status_code=201)
async def add_feed(feed: CameraFeed) -> CameraFeed:
    """Register a new camera feed."""
    return _svc().add_feed(feed)


@router.delete("/{feed_id}", status_code=204)
async def remove_feed(feed_id: str) -> None:
    """Remove a camera feed."""
    if not _svc().remove_feed(feed_id):
        raise HTTPException(status_code=404, detail="Feed not found")


@router.post("/refresh/dot", response_model=list[CameraFeed])
async def refresh_dot_feeds() -> list[CameraFeed]:
    """Refresh traffic camera list from the DOT API."""
    return await _svc().refresh_dot_feeds()
