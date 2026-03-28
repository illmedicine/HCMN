"""Service for Module 2 – Satellite/GPS/AIS/FAA/Crime tracking.

Aggregates data from multiple sources for a pinned geographic location:
  - OpenSky Network (live aircraft)
  - AIS / MarineTraffic (vessel positions)
  - N2YO / NASA (satellite passes, ISS)
  - FAA (flight data)
  - Crimeometer / public crime APIs
  - Nearby camera feeds from Module 1
"""

from __future__ import annotations

import logging
import math
import time
from typing import Any

import httpx

from backend.app.config import Settings
from backend.app.models.schemas import (
    AircraftTrack,
    CameraFeed,
    CrimeReport,
    GeoLocation,
    PinnedLocation,
    SatellitePass,
    TrackingAreaData,
    VesselTrack,
)

logger = logging.getLogger(__name__)

# ISS NORAD ID
ISS_NORAD_ID = 25544
# Starlink constellation NORAD IDs are dynamic; we track a representative set
STARLINK_SAMPLE_IDS = [44713, 44714, 44715, 44716, 44717]


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two lat/lon points."""
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class TrackingService:
    """Aggregates tracking data from external APIs for a pinned location."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pinned: dict[str, PinnedLocation] = {}

    # ------------------------------------------------------------------
    # Pinned locations
    # ------------------------------------------------------------------

    def pin_location(self, pin: PinnedLocation) -> PinnedLocation:
        self._pinned[pin.id] = pin
        return pin

    def remove_pin(self, pin_id: str) -> bool:
        return self._pinned.pop(pin_id, None) is not None

    def list_pins(self) -> list[PinnedLocation]:
        return list(self._pinned.values())

    # ------------------------------------------------------------------
    # Aggregated area query
    # ------------------------------------------------------------------

    async def get_area_data(
        self,
        pin: PinnedLocation,
        camera_feeds: list[CameraFeed] | None = None,
    ) -> TrackingAreaData:
        """Fetch all available data for a pinned location."""
        aircraft = await self.fetch_aircraft(pin.location, pin.radius_km)
        vessels = await self.fetch_vessels(pin.location, pin.radius_km)
        satellites = await self.fetch_satellites(pin.location)
        crimes = await self.fetch_crime_data(pin.location, pin.radius_km)
        nearby_cams = self._find_nearby_cameras(pin.location, pin.radius_km, camera_feeds or [])

        summary_parts = []
        if aircraft:
            summary_parts.append(f"{len(aircraft)} aircraft detected in vicinity")
        if vessels:
            summary_parts.append(f"{len(vessels)} vessels tracked nearby")
        if satellites:
            summary_parts.append(f"{len(satellites)} satellite passes recorded")
        if crimes:
            summary_parts.append(f"{len(crimes)} recent crime reports")
        if nearby_cams:
            summary_parts.append(f"{len(nearby_cams)} live camera feeds available")

        summary = "; ".join(summary_parts) if summary_parts else "No data available for this area."

        return TrackingAreaData(
            pinned_location=pin,
            aircraft=aircraft,
            vessels=vessels,
            satellites=satellites,
            crime_reports=crimes,
            nearby_cameras=nearby_cams,
            summary=summary,
        )

    # ------------------------------------------------------------------
    # Aircraft (OpenSky Network)
    # ------------------------------------------------------------------

    async def fetch_aircraft(self, location: GeoLocation, radius_km: float) -> list[AircraftTrack]:
        """Fetch live aircraft from OpenSky Network within bounding box."""
        # Compute bounding box
        delta_lat = radius_km / 111.0
        delta_lon = radius_km / (111.0 * max(math.cos(math.radians(location.latitude)), 0.01))

        lamin = location.latitude - delta_lat
        lamax = location.latitude + delta_lat
        lomin = location.longitude - delta_lon
        lomax = location.longitude + delta_lon

        url = f"{self._settings.opensky_base_url}/states/all"
        params = {"lamin": lamin, "lamax": lamax, "lomin": lomin, "lomax": lomax}

        auth = None
        if self._settings.opensky_username and self._settings.opensky_password:
            auth = (self._settings.opensky_username, self._settings.opensky_password)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=params, auth=auth)
                resp.raise_for_status()
                data = resp.json()

            tracks: list[AircraftTrack] = []
            states = data.get("states") or []
            for s in states[:100]:  # cap at 100
                if s[6] is None or s[5] is None:
                    continue
                tracks.append(AircraftTrack(
                    icao24=s[0] or "",
                    callsign=(s[1] or "").strip(),
                    origin_country=s[2] or "",
                    latitude=s[6],
                    longitude=s[5],
                    altitude_m=s[7] or 0.0,
                    velocity_ms=s[9] or 0.0,
                    heading=s[10] or 0.0,
                    on_ground=bool(s[8]),
                    last_contact=s[4] or 0.0,
                ))
            return tracks
        except httpx.HTTPError:
            logger.exception("Failed to fetch OpenSky data")
            return self._demo_aircraft(location)

    # ------------------------------------------------------------------
    # Vessels (AIS)
    # ------------------------------------------------------------------

    async def fetch_vessels(self, location: GeoLocation, radius_km: float) -> list[VesselTrack]:
        """Fetch AIS vessel data. Falls back to demo data if no API key."""
        if not self._settings.ais_api_key:
            return self._demo_vessels(location)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._settings.ais_base_url}/exportvessels/v:8",
                    params={
                        "v": "8",
                        "LATITUDE": location.latitude,
                        "LONGITUDE": location.longitude,
                        "RANGE": int(min(radius_km, 100)),
                        "PROTOCOL": "jsono",
                        "API_KEY": self._settings.ais_api_key,
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            vessels: list[VesselTrack] = []
            for v in (data if isinstance(data, list) else [])[:50]:
                vessels.append(VesselTrack(
                    mmsi=str(v.get("MMSI", "")),
                    name=v.get("SHIPNAME", ""),
                    vessel_type=v.get("SHIPTYPE", ""),
                    latitude=float(v.get("LAT", 0)),
                    longitude=float(v.get("LON", 0)),
                    speed_knots=float(v.get("SPEED", 0)) / 10.0,
                    heading=float(v.get("HEADING", 0)),
                    destination=v.get("DESTINATION", ""),
                    last_update=float(v.get("TIMESTAMP", 0)),
                ))
            return vessels
        except httpx.HTTPError:
            logger.exception("Failed to fetch AIS data")
            return self._demo_vessels(location)

    # ------------------------------------------------------------------
    # Satellites (N2YO / NASA)
    # ------------------------------------------------------------------

    async def fetch_satellites(self, location: GeoLocation) -> list[SatellitePass]:
        """Fetch satellite pass data for ISS and Starlink."""
        passes: list[SatellitePass] = []

        norad_ids = [ISS_NORAD_ID] + STARLINK_SAMPLE_IDS

        if not self._settings.n2yo_api_key:
            return self._demo_satellites(location)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                for norad_id in norad_ids[:6]:
                    url = (
                        f"{self._settings.n2yo_base_url}/positions/{norad_id}"
                        f"/{location.latitude}/{location.longitude}/0/1"
                        f"/&apiKey={self._settings.n2yo_api_key}"
                    )
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    info = data.get("info", {})
                    positions = data.get("positions", [])
                    for pos in positions[:1]:
                        passes.append(SatellitePass(
                            norad_id=norad_id,
                            name=info.get("satname", f"SAT-{norad_id}"),
                            latitude=pos.get("satlatitude", 0),
                            longitude=pos.get("satlongitude", 0),
                            altitude_km=pos.get("sataltitude", 0),
                            azimuth=pos.get("azimuth", 0),
                            elevation=pos.get("elevation", 0),
                            timestamp=pos.get("timestamp", time.time()),
                            is_visible=pos.get("eclipsed", False) is False,
                        ))
        except httpx.HTTPError:
            logger.exception("Failed to fetch satellite data")
            return self._demo_satellites(location)

        return passes or self._demo_satellites(location)

    # ------------------------------------------------------------------
    # Crime data
    # ------------------------------------------------------------------

    async def fetch_crime_data(self, location: GeoLocation, radius_km: float) -> list[CrimeReport]:
        """Fetch recent crime reports for an area."""
        if not self._settings.crime_api_key:
            return self._demo_crime_data(location)

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._settings.crime_api_base_url}/incidents/raw-data",
                    params={
                        "lat": location.latitude,
                        "lon": location.longitude,
                        "distance": f"{min(radius_km, 50)}km",
                        "datetime_ini": "2025-01-01T00:00:00.000Z",
                        "datetime_end": "2026-12-31T23:59:59.000Z",
                        "page": 1,
                    },
                    headers={"x-api-key": self._settings.crime_api_key},
                )
                resp.raise_for_status()
                data = resp.json()

            reports: list[CrimeReport] = []
            for inc in (data.get("incidents") or [])[:100]:
                reports.append(CrimeReport(
                    id=str(inc.get("incident_code", "")),
                    latitude=float(inc.get("incident_latitude", location.latitude)),
                    longitude=float(inc.get("incident_longitude", location.longitude)),
                    incident_type=inc.get("incident_offense", ""),
                    description=inc.get("incident_offense_detail_description", ""),
                    timestamp=time.time(),
                    source="crimeometer",
                    severity=inc.get("incident_offense_crime_against", "unknown"),
                ))
            return reports
        except httpx.HTTPError:
            logger.exception("Failed to fetch crime data")
            return self._demo_crime_data(location)

    # ------------------------------------------------------------------
    # Nearby cameras
    # ------------------------------------------------------------------

    def _find_nearby_cameras(
        self,
        location: GeoLocation,
        radius_km: float,
        feeds: list[CameraFeed],
    ) -> list[CameraFeed]:
        nearby: list[CameraFeed] = []
        for feed in feeds:
            if feed.location is None:
                continue
            dist = _haversine_km(
                location.latitude, location.longitude,
                feed.location.latitude, feed.location.longitude,
            )
            if dist <= radius_km:
                nearby.append(feed)
        return nearby

    # ------------------------------------------------------------------
    # Demo / fallback data
    # ------------------------------------------------------------------

    @staticmethod
    def _demo_aircraft(location: GeoLocation) -> list[AircraftTrack]:
        now = time.time()
        return [
            AircraftTrack(
                icao24="a00001", callsign="UAL123",
                origin_country="United States",
                latitude=location.latitude + 0.05,
                longitude=location.longitude - 0.03,
                altitude_m=10668, velocity_ms=230, heading=45,
                on_ground=False, last_contact=now,
            ),
            AircraftTrack(
                icao24="a00002", callsign="DAL456",
                origin_country="United States",
                latitude=location.latitude - 0.02,
                longitude=location.longitude + 0.04,
                altitude_m=8534, velocity_ms=210, heading=180,
                on_ground=False, last_contact=now,
            ),
            AircraftTrack(
                icao24="a00003", callsign="AAL789",
                origin_country="United States",
                latitude=location.latitude + 0.01,
                longitude=location.longitude + 0.01,
                altitude_m=0, velocity_ms=0, heading=270,
                on_ground=True, last_contact=now,
            ),
        ]

    @staticmethod
    def _demo_vessels(location: GeoLocation) -> list[VesselTrack]:
        now = time.time()
        return [
            VesselTrack(
                mmsi="211331640", name="EVER GIVEN",
                vessel_type="Container Ship",
                latitude=location.latitude - 0.1,
                longitude=location.longitude + 0.15,
                speed_knots=12.5, heading=95,
                destination="NEW YORK", last_update=now,
            ),
            VesselTrack(
                mmsi="244780731", name="MAERSK SENTINEL",
                vessel_type="Tanker",
                latitude=location.latitude + 0.08,
                longitude=location.longitude - 0.12,
                speed_knots=8.2, heading=220,
                destination="HOUSTON", last_update=now,
            ),
        ]

    @staticmethod
    def _demo_satellites(location: GeoLocation) -> list[SatellitePass]:
        now = time.time()
        return [
            SatellitePass(
                norad_id=ISS_NORAD_ID, name="ISS (ZARYA)",
                latitude=location.latitude + 5.0,
                longitude=location.longitude - 10.0,
                altitude_km=420.0, azimuth=180, elevation=35,
                timestamp=now, is_visible=True,
            ),
            SatellitePass(
                norad_id=44713, name="STARLINK-1007",
                latitude=location.latitude - 3.0,
                longitude=location.longitude + 7.0,
                altitude_km=550.0, azimuth=90, elevation=60,
                timestamp=now, is_visible=True,
            ),
            SatellitePass(
                norad_id=44714, name="STARLINK-1008",
                latitude=location.latitude + 8.0,
                longitude=location.longitude + 2.0,
                altitude_km=550.0, azimuth=45, elevation=40,
                timestamp=now, is_visible=False,
            ),
        ]

    @staticmethod
    def _demo_crime_data(location: GeoLocation) -> list[CrimeReport]:
        now = time.time()
        return [
            CrimeReport(
                id="cr-001", latitude=location.latitude + 0.005,
                longitude=location.longitude - 0.003,
                incident_type="Theft", description="Larceny from vehicle reported",
                timestamp=now - 3600, source="demo", severity="property",
            ),
            CrimeReport(
                id="cr-002", latitude=location.latitude - 0.003,
                longitude=location.longitude + 0.004,
                incident_type="Assault", description="Simple assault reported",
                timestamp=now - 7200, source="demo", severity="person",
            ),
            CrimeReport(
                id="cr-003", latitude=location.latitude + 0.002,
                longitude=location.longitude + 0.001,
                incident_type="Vandalism", description="Property damage reported",
                timestamp=now - 1800, source="demo", severity="property",
            ),
            CrimeReport(
                id="cr-004", latitude=location.latitude - 0.001,
                longitude=location.longitude - 0.002,
                incident_type="Burglary", description="Commercial breaking & entering",
                timestamp=now - 14400, source="demo", severity="property",
            ),
        ]
