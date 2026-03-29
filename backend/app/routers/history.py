"""API routes for historical telemetry replay and ADS-B ingest."""

from __future__ import annotations

import time

from fastapi import APIRouter, HTTPException, Query

from backend.app.services.history_service import HistoryService

router = APIRouter(prefix="/api/history", tags=["history"])

_service: HistoryService | None = None


def init(service: HistoryService) -> None:
    global _service
    _service = service


def _svc() -> HistoryService:
    if _service is None:
        raise HTTPException(status_code=503, detail="History service not initialised")
    return _service


# ---------------------------------------------------------------------------
# Telemetry replay
# ---------------------------------------------------------------------------

@router.get("/telemetry")
async def get_telemetry(
    entity_id: str = Query(..., min_length=1),
    start_time: float = Query(..., description="Unix epoch start"),
    end_time: float = Query(..., description="Unix epoch end"),
) -> dict:
    """Return telemetry points for an entity within a time window.

    Used by the Cesium time-playback UI to reconstruct historical tracks.
    """
    svc = _svc()
    if not svc.arango_available:
        raise HTTPException(status_code=503, detail="ArangoDB not configured")

    points = svc.query_telemetry(entity_id, start_time, end_time)
    # Strip internal Arango keys
    cleaned = [
        {k: v for k, v in p.items() if not k.startswith("_")}
        for p in points
    ]
    return {
        "entity_id": entity_id,
        "start_time": start_time,
        "end_time": end_time,
        "count": len(cleaned),
        "points": cleaned,
    }


@router.get("/interpolate")
async def interpolate_position(
    entity_id: str = Query(..., min_length=1),
    ts: float = Query(..., description="Exact Unix epoch to interpolate"),
) -> dict:
    """Interpolate an entity's position at an exact timestamp.

    Uses linear interpolation between the two nearest recorded points:
        P(Tq) = P1 + (P2 - P1) * ((Tq - T1) / (T2 - T1))
    """
    svc = _svc()
    if not svc.arango_available:
        raise HTTPException(status_code=503, detail="ArangoDB not configured")

    result = svc.interpolate_position(entity_id, ts)
    if not result:
        raise HTTPException(status_code=404, detail="No telemetry found for entity")
    return result


# ---------------------------------------------------------------------------
# Entity listing
# ---------------------------------------------------------------------------

@router.get("/entities")
async def list_entities(
    entity_type: str = Query("aircraft"),
) -> dict:
    """List known entities of a given type."""
    svc = _svc()
    entities = svc.list_entities(entity_type)
    cleaned = [
        {k: v for k, v in e.items() if not k.startswith("_")}
        for e in entities
    ]
    return {"type": entity_type, "count": len(cleaned), "entities": cleaned}


# ---------------------------------------------------------------------------
# Camera events (frame history)
# ---------------------------------------------------------------------------

@router.get("/camera-events")
async def get_camera_events(
    camera_id: str = Query(..., min_length=1),
    start_time: float = Query(...),
    end_time: float = Query(...),
) -> dict:
    """Return camera frame events (S3 URLs) within a time window."""
    svc = _svc()
    events = svc.query_camera_events(camera_id, start_time, end_time)
    cleaned = [
        {k: v for k, v in e.items() if not k.startswith("_")}
        for e in events
    ]
    return {
        "camera_id": camera_id,
        "count": len(cleaned),
        "events": cleaned,
    }


# ---------------------------------------------------------------------------
# ADS-B ingest trigger
# ---------------------------------------------------------------------------

@router.post("/ingest/adsb")
async def trigger_adsb_ingest(
    lat: float = Query(42.8864, ge=-90, le=90),
    lon: float = Query(-78.8784, ge=-180, le=180),
    radius_nm: int = Query(25, ge=1, le=250),
) -> dict:
    """Manually trigger an ADS-B ingest cycle from adsb.fi.

    Fetches live aircraft data and stores it in the Entities + Telemetry
    collections for historical replay.
    """
    svc = _svc()
    return await svc.fetch_and_ingest_adsb(lat, lon, radius_nm)


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

@router.post("/purge")
async def purge_old_telemetry() -> dict:
    """Remove telemetry older than the configured retention period."""
    svc = _svc()
    count = svc.purge_old_telemetry()
    return {"purged": count, "retention_days": svc._settings.data_retention_days}


# ---------------------------------------------------------------------------
# Service status
# ---------------------------------------------------------------------------

@router.get("/status")
async def get_status() -> dict:
    """Check health of the history subsystem."""
    svc = _svc()
    return {
        "arango_available": svc.arango_available,
        "s3_available": svc.s3_available,
        "arango_url": svc._settings.arango_url,
        "database": svc._settings.arango_db_name,
        "retention_days": svc._settings.data_retention_days,
    }
