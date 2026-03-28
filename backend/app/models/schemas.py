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
    IP_CAMERA = "ip_camera"
    CCTV = "cctv"


class GeoLocation(BaseModel):
    """Geographic coordinates."""

    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    label: str = ""


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


class RoomLayout(BaseModel):
    """AI-reconstructed room layout from CSI data."""

    walls: list[WallSegment] = []
    zones: list[RoomZone] = []
    width_m: float = 0.0
    height_m: float = 0.0


class DetectedEntity(BaseModel):
    """An entity detected via CSI signal analysis."""

    id: str
    entity_type: str = "unknown"  # person, furniture, wall, pet
    density_score: float = 0.0
    x: float = 0.0
    y: float = 0.0
    confidence: float = 0.0
    signal_variance: float = 0.0


class CSIEnvironmentMap(BaseModel):
    """Full environment map built from CSI analysis."""

    layout: RoomLayout = RoomLayout()
    entities: list[DetectedEntity] = []
    router_position: GeoLocation | None = None
    signal_strength_map: list[list[float]] = []
    timestamp: float = 0.0


# ---------------------------------------------------------------------------
# Module 2 – Tracking / Satellite / GPS models
# ---------------------------------------------------------------------------

class TrackingSource(str, Enum):
    """Data source for tracking information."""

    OPENSKY = "opensky"
    AIS = "ais"
    SATELLITE = "satellite"
    NASA = "nasa"
    FAA = "faa"
    CRIME = "crime"
    CAMERA = "camera"


class PinnedLocation(BaseModel):
    """User-pinned area of interest on the map."""

    id: str
    location: GeoLocation
    radius_km: float = Field(default=10.0, ge=0.1, le=500.0)
    label: str = ""


class AircraftTrack(BaseModel):
    """Live aircraft position from OpenSky / FAA."""

    icao24: str
    callsign: str = ""
    origin_country: str = ""
    latitude: float
    longitude: float
    altitude_m: float = 0.0
    velocity_ms: float = 0.0
    heading: float = 0.0
    on_ground: bool = False
    last_contact: float = 0.0


class VesselTrack(BaseModel):
    """AIS vessel tracking data."""

    mmsi: str
    name: str = ""
    vessel_type: str = ""
    latitude: float
    longitude: float
    speed_knots: float = 0.0
    heading: float = 0.0
    destination: str = ""
    last_update: float = 0.0


class SatellitePass(BaseModel):
    """Satellite pass / position data."""

    norad_id: int
    name: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    altitude_km: float = 0.0
    azimuth: float = 0.0
    elevation: float = 0.0
    timestamp: float = 0.0
    is_visible: bool = False


class CrimeReport(BaseModel):
    """Police crime report data point."""

    id: str = ""
    latitude: float
    longitude: float
    incident_type: str = ""
    description: str = ""
    timestamp: float = 0.0
    source: str = ""
    severity: str = "unknown"


class TrackingAreaData(BaseModel):
    """Aggregate data for a pinned location area."""

    pinned_location: PinnedLocation
    aircraft: list[AircraftTrack] = []
    vessels: list[VesselTrack] = []
    satellites: list[SatellitePass] = []
    crime_reports: list[CrimeReport] = []
    nearby_cameras: list[CameraFeed] = []
    summary: str = ""


# ---------------------------------------------------------------------------
# AI Chat models
# ---------------------------------------------------------------------------

class ChatMessage(BaseModel):
    """A single chat message."""

    role: str = "user"
    content: str


class ChatRequest(BaseModel):
    """Request to the AI chat endpoint."""

    messages: list[ChatMessage]
    context: dict = {}  # feed IDs, location data, etc.


class ChatResponse(BaseModel):
    """Response from the AI chat endpoint."""

    reply: str
    sources: list[str] = []
