"""API routes for Module 2 – Satellite/GPS/AIS/FAA/Crime tracking."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.app.models.schemas import (
    GeoLocation,
    PinnedLocation,
    TrackingAreaData,
    AircraftTrack,
    VesselTrack,
    SatellitePass,
    CrimeReport,
)
from backend.app.services.tracking_service import TrackingService
from backend.app.services.camera_service import CameraService

router = APIRouter(prefix="/api/tracking", tags=["tracking"])

_service: TrackingService | None = None
_camera_service: CameraService | None = None


def init(service: TrackingService, camera_service: CameraService) -> None:
    global _service, _camera_service
    _service = service
    _camera_service = camera_service


def _svc() -> TrackingService:
    if _service is None:
        raise HTTPException(status_code=503, detail="Tracking service not initialised")
    return _service


@router.post("/pin", response_model=PinnedLocation, status_code=201)
async def pin_location(pin: PinnedLocation) -> PinnedLocation:
    """Pin a location on the map for monitoring."""
    return _svc().pin_location(pin)


@router.get("/pins", response_model=list[PinnedLocation])
async def list_pins() -> list[PinnedLocation]:
    """Return all pinned locations."""
    return _svc().list_pins()


@router.delete("/pin/{pin_id}", status_code=204)
async def remove_pin(pin_id: str) -> None:
    """Remove a pinned location."""
    if not _svc().remove_pin(pin_id):
        raise HTTPException(status_code=404, detail="Pin not found")


@router.get("/area", response_model=TrackingAreaData)
async def get_area_data(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(50.0, ge=0.1, le=500),
    label: str = Query(""),
) -> TrackingAreaData:
    """Fetch all tracking data for a geographic area."""
    pin = PinnedLocation(
        id="query",
        location=GeoLocation(latitude=lat, longitude=lon, label=label),
        radius_km=radius_km,
        label=label,
    )
    camera_feeds = _camera_service.list_feeds() if _camera_service else []
    return await _svc().get_area_data(pin, camera_feeds)


@router.get("/aircraft", response_model=list[AircraftTrack])
async def get_aircraft(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(50.0, ge=0.1, le=500),
) -> list[AircraftTrack]:
    """Fetch live aircraft near coordinates."""
    loc = GeoLocation(latitude=lat, longitude=lon)
    return await _svc().fetch_aircraft(loc, radius_km)


@router.get("/vessels", response_model=list[VesselTrack])
async def get_vessels(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(50.0, ge=0.1, le=500),
) -> list[VesselTrack]:
    """Fetch AIS vessel data near coordinates."""
    loc = GeoLocation(latitude=lat, longitude=lon)
    return await _svc().fetch_vessels(loc, radius_km)


@router.get("/satellites", response_model=list[SatellitePass])
async def get_satellites(
    lat: float = Query(0, ge=-90, le=90),
    lon: float = Query(0, ge=-180, le=180),
) -> list[SatellitePass]:
    """Fetch satellite pass data for coordinates."""
    loc = GeoLocation(latitude=lat, longitude=lon)
    return await _svc().fetch_satellites(loc)


@router.get("/crime", response_model=list[CrimeReport])
async def get_crime(
    lat: float = Query(..., ge=-90, le=90),
    lon: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(10.0, ge=0.1, le=100),
) -> list[CrimeReport]:
    """Fetch crime reports near coordinates."""
    loc = GeoLocation(latitude=lat, longitude=lon)
    return await _svc().fetch_crime_data(loc, radius_km)
