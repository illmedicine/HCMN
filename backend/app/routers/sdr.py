"""API routes for the SDR RF Spectrum Visualisation module."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.app.models.schemas import DetectedSignal, SpectrumSweep
from backend.app.services.sdr_service import SDRService

router = APIRouter(prefix="/api/sdr", tags=["sdr"])

_service: SDRService | None = None


def init(service: SDRService) -> None:
    global _service
    _service = service


def _svc() -> SDRService:
    if _service is None:
        raise HTTPException(status_code=503, detail="SDR service not initialised")
    return _service


@router.post("/sweep", response_model=SpectrumSweep)
async def perform_sweep(
    start_freq: float | None = Query(None, description="Start frequency in Hz"),
    end_freq: float | None = Query(None, description="End frequency in Hz"),
    step: float | None = Query(None, description="Step size in Hz"),
) -> SpectrumSweep:
    """Trigger a frequency sweep and return the power spectrum."""
    return _svc().sweep(start_freq, end_freq, step)


@router.get("/sweep/latest", response_model=SpectrumSweep | None)
async def get_latest_sweep() -> SpectrumSweep | None:
    """Return the most recent sweep result."""
    return _svc().get_latest_sweep()


@router.get("/signals", response_model=list[DetectedSignal])
async def detect_signals(
    threshold_dbm: float = Query(-60.0, description="Detection threshold in dBm"),
) -> list[DetectedSignal]:
    """Detect signals above *threshold_dbm* in the latest sweep."""
    return _svc().detect_signals(threshold_dbm=threshold_dbm)
