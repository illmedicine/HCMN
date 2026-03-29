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
    CELL_TOWER = "cell_tower"


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


class CellTower(BaseModel):
    """A single cell tower / base station with its geographic location."""

    mcc: int = Field(description="Mobile Country Code")
    mnc: int = Field(description="Mobile Network Code")
    lac: int = Field(description="Location Area Code")
    cell_id: int = Field(description="Cell ID")
    latitude: float = 0.0
    longitude: float = 0.0
    range_m: float = Field(default=0.0, description="Estimated coverage range in metres")
    radio: str = Field(default="", description="Radio type: GSM, LTE, UMTS, CDMA, 5G-NR")
    operator: str = ""
    source: str = Field(default="", description="Data source: opencellid, beacondb, wigle")
    signal_strength: float = Field(default=0.0, description="Signal strength in dBm")
    samples: int = Field(default=0, description="Number of measurements / samples")
    last_seen: float = Field(default=0.0, description="Unix timestamp of last observation")


class CellTowerPing(BaseModel):
    """A device ping event observed at a particular cell tower."""

    cell_tower: CellTower
    timestamp: float = Field(description="Unix epoch when the device was observed")
    signal_dbm: float = Field(default=0.0, description="Signal strength at time of ping")
    device_id: str = Field(default="", description="Anonymised device / IMSI identifier")
    phone_number: str = Field(default="", description="Associated phone number if known")


class DeviceCellHistory(BaseModel):
    """Cross-referenced cell tower ping history for a tracked device."""

    device_id: str
    phone_number: str = ""
    pings: list[CellTowerPing] = []
    towers_visited: list[CellTower] = []
    first_seen: float = 0.0
    last_seen: float = 0.0
    summary: str = ""


class TrackingAreaData(BaseModel):
    """Aggregate data for a pinned location area."""

    pinned_location: PinnedLocation
    aircraft: list[AircraftTrack] = []
    vessels: list[VesselTrack] = []
    satellites: list[SatellitePass] = []
    crime_reports: list[CrimeReport] = []
    cell_towers: list[CellTower] = []
    nearby_cameras: list[CameraFeed] = []
    summary: str = ""


# ---------------------------------------------------------------------------
# CDR (Call Detail Record) analysis models – inspired by gigaTrace & Cellyzer
# ---------------------------------------------------------------------------

class CDRRecord(BaseModel):
    """A single Call Detail Record parsed from telco data."""

    id: str = ""
    calling_number: str = Field(description="Calling party (A-number)")
    called_number: str = Field(description="Called party (B-number)")
    call_type: str = Field(default="voice", description="voice, sms, data")
    start_time: float = Field(description="Unix epoch of call start")
    duration_sec: float = Field(default=0.0, description="Duration in seconds")
    cell_id_start: int = Field(default=0, description="Cell tower at call start")
    cell_id_end: int = Field(default=0, description="Cell tower at call end")
    lac_start: int = Field(default=0, description="LAC at call start")
    lac_end: int = Field(default=0, description="LAC at call end")
    mcc: int = Field(default=0, description="Mobile Country Code")
    mnc: int = Field(default=0, description="Mobile Network Code")
    imei: str = Field(default="", description="Device IMEI")
    imsi: str = Field(default="", description="Subscriber IMSI")


class CDRUploadResult(BaseModel):
    """Result of uploading and parsing CDR data."""

    total_records: int = 0
    unique_numbers: int = 0
    unique_imeis: int = 0
    unique_towers: int = 0
    date_range_start: float = 0.0
    date_range_end: float = 0.0
    summary: str = ""


class ContactNode(BaseModel):
    """A node in the CDR contact graph (a phone number / subscriber)."""

    phone_number: str
    call_count: int = 0
    total_duration_sec: float = 0.0
    sms_count: int = 0
    imei: str = ""
    imsi: str = ""
    first_seen: float = 0.0
    last_seen: float = 0.0
    most_used_tower: int = 0
    home_location: GeoLocation | None = None
    work_location: GeoLocation | None = None
    label: str = ""


class ContactEdge(BaseModel):
    """An edge in the contact graph (calls/SMS between two numbers)."""

    source: str = Field(description="Calling number")
    target: str = Field(description="Called number")
    call_count: int = 0
    total_duration_sec: float = 0.0
    sms_count: int = 0
    first_contact: float = 0.0
    last_contact: float = 0.0
    weight: float = Field(default=0.0, description="Edge weight based on communication frequency")


class ContactGraph(BaseModel):
    """Contact graph built from CDR data – nodes are subscribers, edges are calls/SMS."""

    nodes: list[ContactNode] = []
    edges: list[ContactEdge] = []
    total_calls: int = 0
    total_sms: int = 0
    date_range_start: float = 0.0
    date_range_end: float = 0.0
    communities: list[list[str]] = Field(default=[], description="Detected communities (groups of connected numbers)")


class IMEIDevice(BaseModel):
    """IMEI/IMSI device tracking record."""

    imei: str
    imsi: str = ""
    phone_numbers: list[str] = Field(default=[], description="Numbers associated with this IMEI")
    first_seen: float = 0.0
    last_seen: float = 0.0
    tower_history: list[CellTower] = []
    pings: list[CellTowerPing] = []
    is_shared: bool = Field(default=False, description="True if multiple SIMs used on this device")
    summary: str = ""


class LocationProfile(BaseModel):
    """Location behavior profile derived from CDR tower data."""

    phone_number: str
    home_location: GeoLocation | None = None
    work_location: GeoLocation | None = None
    frequent_locations: list[GeoLocation] = []
    route_points: list[GeoLocation] = Field(default=[], description="Ordered route reconstruction from tower pings")
    tower_distances_km: list[float] = Field(default=[], description="Distances between consecutive towers in route")
    total_distance_km: float = 0.0
    active_hours: list[int] = Field(default=[], description="Hours of day with most activity (0-23)")
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
