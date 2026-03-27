"""API routes for the Wi-Fi CSI Sensing module."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.app.models.schemas import (
    CSIFrame,
    CSIPrediction,
    PresenceEvent,
    RoomLayout,
)
from backend.app.services.csi_service import CSIService

router = APIRouter(prefix="/api/csi", tags=["csi"])

_service: CSIService | None = None


def init(service: CSIService) -> None:
    global _service
    _service = service


def _svc() -> CSIService:
    if _service is None:
        raise HTTPException(status_code=503, detail="CSI service not initialised")
    return _service


@router.post("/collect", response_model=list[CSIFrame])
async def collect_frames(
    count: int = Query(1, ge=1, le=256, description="Number of frames to collect"),
) -> list[CSIFrame]:
    """Collect CSI frames from the edge hardware (or simulator)."""
    return _svc().collect_frames(count)


@router.get("/predict", response_model=CSIPrediction)
async def predict() -> CSIPrediction:
    """Run the processing pipeline and return a prediction."""
    return _svc().predict()


@router.get("/presence", response_model=PresenceEvent)
async def detect_presence() -> PresenceEvent:
    """Detect presence and activity in the monitored area."""
    return _svc().detect_presence()


@router.get("/layout", response_model=RoomLayout)
async def get_layout() -> RoomLayout:
    """Return the AI-reconstructed room layout."""
    return _svc().reconstruct_layout()


@router.get("/buffer/size")
async def buffer_size() -> dict[str, int]:
    """Return the current CSI frame buffer size."""
    return {"buffer_size": _svc().get_buffer_size()}
