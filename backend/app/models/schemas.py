"""Pydantic models for the HCMN application."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Camera / Observational Deck models
# ---------------------------------------------------------------------------

class CameraSource(str, Enum):
    """Supported public camera feed sources."""

    DOT_TRAFFIC = "dot_traffic"
    WEATHER = "weather"
    EARTHCAM = "earthcam"
    CUSTOM = "custom"


class CameraFeed(BaseModel):
    """Represents a single public camera feed."""

    id: str
    name: str
    source: CameraSource
    stream_url: str
    location: GeoLocation | None = None
    thumbnail_url: str | None = None
    is_live: bool = True
    description: str = ""


class GeoLocation(BaseModel):
    """Geographic coordinates."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    label: str = ""


# ---------------------------------------------------------------------------
# SDR / RF Spectrum models
# ---------------------------------------------------------------------------

class RFSample(BaseModel):
    """A single RF power-spectrum sample from an SDR sweep."""

    frequency_hz: float = Field(description="Center frequency in Hz")
    power_dbm: float = Field(description="Power level in dBm")
    timestamp: float = Field(description="Unix epoch timestamp")


class SpectrumSweep(BaseModel):
    """A complete sweep across a frequency range."""

    start_freq_hz: float
    end_freq_hz: float
    step_hz: float
    samples: list[RFSample] = []
    sweep_id: str = ""
    timestamp: float = 0.0


class DetectedSignal(BaseModel):
    """An identified RF signal above the noise floor."""

    frequency_hz: float
    bandwidth_hz: float
    power_dbm: float
    signal_type: str = "unknown"
    label: str = ""


# ---------------------------------------------------------------------------
# Wi-Fi CSI models
# ---------------------------------------------------------------------------

class CSIFrame(BaseModel):
    """Raw Channel State Information frame."""

    timestamp: float
    mac_address: str = ""
    rssi: float = 0.0
    subcarrier_amplitudes: list[float] = []
    subcarrier_phases: list[float] = []


class CSIPrediction(BaseModel):
    """Result of running the CSI data through the ML classifier."""

    timestamp: float
    prediction: str = Field(description="Predicted state, e.g. 'empty', 'person_walking', 'person_sitting'")
    confidence: float = Field(ge=0.0, le=1.0)
    zone: str = ""


class PresenceEvent(BaseModel):
    """High-level presence detection event."""

    timestamp: float
    zone: str
    occupancy_count: int = 0
    activity: str = "unknown"
    confidence: float = 0.0


class RoomLayout(BaseModel):
    """AI-reconstructed room layout from CSI data."""

    walls: list[WallSegment] = []
    zones: list[RoomZone] = []
    width_m: float = 0.0
    height_m: float = 0.0


class WallSegment(BaseModel):
    """A detected wall segment in 2-D space."""

    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float = 0.0


class RoomZone(BaseModel):
    """A labelled zone within the reconstructed layout."""

    id: str
    label: str
    center_x: float
    center_y: float
    radius_m: float = 1.0


# Rebuild models to resolve forward references
CameraFeed.model_rebuild()
RoomLayout.model_rebuild()
