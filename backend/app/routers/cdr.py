"""API routes for CDR (Call Detail Record) analysis.

Provides endpoints for:
  - CDR / tower-dump upload and parsing
  - Contact graph construction (BFS-style, inspired by gigaTrace)
  - IMEI / IMSI device tracking
  - Location profiling (home/work detection, inspired by Cellyzer)
  - Export to Gotham knowledge graph for link analysis
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, UploadFile, File

from backend.app.models.schemas import (
    CDRRecord,
    CDRUploadResult,
    ContactGraph,
    IMEIDevice,
    LocationProfile,
)
from backend.app.services.cdr_service import CDRService
from backend.app.services.gotham_service import GothamService

router = APIRouter(prefix="/api/cdr", tags=["cdr"])

_service: CDRService | None = None
_gotham: GothamService | None = None


def init(service: CDRService, gotham_service: GothamService) -> None:
    global _service, _gotham
    _service = service
    _gotham = gotham_service


def _svc() -> CDRService:
    if _service is None:
        raise HTTPException(status_code=503, detail="CDR service not initialised")
    return _service


# ------------------------------------------------------------------
# CDR Upload & Parsing
# ------------------------------------------------------------------


@router.post("/upload", response_model=CDRUploadResult)
async def upload_cdr(file: UploadFile = File(...)) -> CDRUploadResult:
    """Upload a CDR CSV file for parsing and analysis.

    Accepts CSV files with columns like:
      calling_number, called_number, call_type, start_time, duration_sec,
      cell_id_start, cell_id_end, lac_start, lac_end, mcc, mnc, imei, imsi

    Also handles gigaTrace-style column names (MSISDN, OTHER_PARTY, etc.).
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    try:
        csv_text = content.decode("utf-8")
    except UnicodeDecodeError:
        csv_text = content.decode("latin-1")

    return _svc().parse_cdr_csv(csv_text)


@router.post("/upload/towerdump", response_model=CDRUploadResult)
async def upload_tower_dump(file: UploadFile = File(...)) -> CDRUploadResult:
    """Upload a tower dump CSV for parsing.

    Tower dumps list all devices observed on specific cell towers.
    Expected columns: MSISDN/phone, IMEI, IMSI, cell_id, lac, mcc, mnc, timestamp.
    """
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    try:
        csv_text = content.decode("utf-8")
    except UnicodeDecodeError:
        csv_text = content.decode("latin-1")

    return _svc().parse_tower_dump_csv(csv_text)


@router.get("/records", response_model=list[CDRRecord])
async def get_records(
    phone: str = Query("", description="Filter by phone number"),
) -> list[CDRRecord]:
    """Return loaded CDR records, optionally filtered by phone number."""
    return _svc().get_records(phone)


@router.delete("/records", status_code=204)
async def clear_records() -> None:
    """Clear all loaded CDR records."""
    _svc().clear_records()


# ------------------------------------------------------------------
# Contact Graph
# ------------------------------------------------------------------


@router.get("/graph", response_model=ContactGraph)
async def get_contact_graph(
    target: str = Query("", description="Seed phone number for BFS expansion"),
    depth: int = Query(1, ge=1, le=5, description="BFS depth (hops from target)"),
) -> ContactGraph:
    """Build a contact graph from loaded CDR data.

    If *target* is provided, the graph is seeded from that number and
    expanded via BFS to *depth* hops (inspired by gigaTrace).
    If omitted, the full graph of all loaded records is returned.
    """
    return _svc().build_contact_graph(target, depth)


# ------------------------------------------------------------------
# IMEI / IMSI Tracking
# ------------------------------------------------------------------


@router.get("/imei/{imei}", response_model=IMEIDevice)
async def track_imei(imei: str) -> IMEIDevice:
    """Track a device by IMEI — shows associated SIMs, phone numbers,
    tower history, and multi-SIM detection."""
    if len(imei) < 8:
        raise HTTPException(status_code=400, detail="IMEI must be at least 8 characters")
    return _svc().track_imei(imei)


# ------------------------------------------------------------------
# Location Profiling
# ------------------------------------------------------------------


@router.get("/profile/{phone_number}", response_model=LocationProfile)
async def get_location_profile(phone_number: str) -> LocationProfile:
    """Build a location profile for a phone number.

    Detects home/work locations based on time-of-day heuristics,
    reconstructs routes between towers, and calculates distances
    (inspired by Cellyzer).
    """
    if len(phone_number) < 4:
        raise HTTPException(status_code=400, detail="Phone number must be at least 4 characters")
    return _svc().build_location_profile(phone_number)


# ------------------------------------------------------------------
# Gotham Export
# ------------------------------------------------------------------


@router.post("/export/gotham")
async def export_to_gotham(
    target: str = Query("", description="Seed phone number"),
    depth: int = Query(1, ge=1, le=5, description="BFS depth"),
) -> dict:
    """Export CDR contact graph to the Gotham knowledge graph.

    Creates nodes (phone/device objects) and links (call/SMS edges)
    compatible with the Gotham ontology, and loads them into the
    Gotham service for interactive link analysis.
    """
    data = _svc().export_to_gotham(target, depth)

    # Load into Gotham if available
    if _gotham:
        existing = _gotham.get_ontology()
        # Merge: existing objects first, then CDR data (CDR overrides duplicates)
        obj_map = {o["id"]: o for o in existing.get("objects", [])}
        for o in data["objects"]:
            obj_map[o["id"]] = o
        link_map = {l["id"]: l for l in existing.get("links", [])}
        for l in data["links"]:
            link_map[l["id"]] = l
        _gotham.load(list(obj_map.values()), list(link_map.values()))

    return {
        "objects_count": len(data["objects"]),
        "links_count": len(data["links"]),
        "message": "CDR data exported to Gotham knowledge graph.",
    }
