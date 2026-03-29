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

import base64
import logging
import math
import time
from typing import Any

import httpx

from backend.app.config import Settings
from backend.app.models.schemas import (
    AircraftTrack,
    CameraFeed,
    CellTower,
    CellTowerPing,
    CrimeReport,
    DeviceCellHistory,
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
        cell_towers = await self.fetch_cell_towers(pin.location, pin.radius_km)
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
        if cell_towers:
            summary_parts.append(f"{len(cell_towers)} cell towers identified")
        if nearby_cams:
            summary_parts.append(f"{len(nearby_cams)} live camera feeds available")

        summary = "; ".join(summary_parts) if summary_parts else "No data available for this area."

        return TrackingAreaData(
            pinned_location=pin,
            aircraft=aircraft,
            vessels=vessels,
            satellites=satellites,
            crime_reports=crimes,
            cell_towers=cell_towers,
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
    # Cell Towers (OpenCelliD / beaconDB / WiGLE)
    # ------------------------------------------------------------------

    async def fetch_cell_towers(self, location: GeoLocation, radius_km: float) -> list[CellTower]:
        """Fetch cell towers near a location from all configured sources."""
        towers: list[CellTower] = []

        # Query all sources concurrently and merge results
        opencellid_towers = await self._fetch_opencellid_towers(location, radius_km)
        beacondb_towers = await self._fetch_beacondb_towers(location, radius_km)
        wigle_towers = await self._fetch_wigle_towers(location, radius_km)

        towers.extend(opencellid_towers)
        towers.extend(beacondb_towers)
        towers.extend(wigle_towers)

        if not towers:
            return self._demo_cell_towers(location)

        # De-duplicate by (MCC, MNC, LAC, CID) – keep best source
        seen: dict[tuple[int, int, int, int], CellTower] = {}
        for t in towers:
            key = (t.mcc, t.mnc, t.lac, t.cell_id)
            existing = seen.get(key)
            if existing is None or t.samples > existing.samples:
                seen[key] = t
        return list(seen.values())

    async def lookup_cell_tower(
        self,
        mcc: int,
        mnc: int,
        lac: int,
        cell_id: int,
    ) -> CellTower | None:
        """Look up a specific cell tower by its identifiers across all sources."""
        # Try OpenCelliD first (largest database)
        tower = await self._lookup_opencellid(mcc, mnc, lac, cell_id)
        if tower:
            return tower

        # Fall back to beaconDB geolocation API
        tower = await self._lookup_beacondb(mcc, mnc, lac, cell_id)
        if tower:
            return tower

        # Fall back to WiGLE search
        tower = await self._lookup_wigle(mcc, mnc, lac, cell_id)
        if tower:
            return tower

        return None

    async def search_cell_ids_by_phone(self, phone_number: str) -> DeviceCellHistory:
        """Search for cell tower pings associated with a phone number.

        This performs a cross-reference lookup: for the given phone number we
        simulate the retrieval of cell IDs the device has connected to and then
        resolve each tower's location via the cell tower databases.  In a real
        deployment this data would come from a lawful-intercept / CDR (Call
        Detail Record) feed; here we demonstrate the cross-referencing logic
        with the open-source geolocation databases.
        """
        # In production, CDR data would be ingested from telecom provider.
        # We simulate a set of cell IDs that the phone was observed on.
        demo_pings = self._demo_cdr_pings(phone_number)

        resolved_towers: list[CellTower] = []
        resolved_pings: list[CellTowerPing] = []

        for ping in demo_pings:
            tower = await self.lookup_cell_tower(
                ping.cell_tower.mcc,
                ping.cell_tower.mnc,
                ping.cell_tower.lac,
                ping.cell_tower.cell_id,
            )
            if tower:
                resolved_towers.append(tower)
                resolved_pings.append(CellTowerPing(
                    cell_tower=tower,
                    timestamp=ping.timestamp,
                    signal_dbm=ping.signal_dbm,
                    device_id=ping.device_id,
                    phone_number=phone_number,
                ))
            else:
                # Keep the unresolved tower data
                resolved_towers.append(ping.cell_tower)
                resolved_pings.append(ping)

        first_ts = min((p.timestamp for p in resolved_pings), default=0)
        last_ts = max((p.timestamp for p in resolved_pings), default=0)

        return DeviceCellHistory(
            device_id=f"dev-{phone_number[-4:]}",
            phone_number=phone_number,
            pings=resolved_pings,
            towers_visited=resolved_towers,
            first_seen=first_ts,
            last_seen=last_ts,
            summary=(
                f"Device associated with {phone_number} observed on "
                f"{len(resolved_towers)} cell towers between "
                f"{len(resolved_pings)} ping events."
            ),
        )

    async def cross_reference_device(
        self,
        cell_ids: list[dict[str, int]],
    ) -> DeviceCellHistory:
        """Cross-reference a list of cell IDs to locate tower positions.

        Each entry in *cell_ids* is a dict with keys mcc, mnc, lac, cell_id
        and optionally timestamp and signal_dbm.
        """
        resolved_towers: list[CellTower] = []
        pings: list[CellTowerPing] = []

        for entry in cell_ids:
            mcc = entry.get("mcc", 0)
            mnc = entry.get("mnc", 0)
            lac = entry.get("lac", 0)
            cid = entry.get("cell_id", 0)
            ts = entry.get("timestamp", time.time())
            sig = entry.get("signal_dbm", 0.0)

            tower = await self.lookup_cell_tower(mcc, mnc, lac, cid)
            if tower is None:
                tower = CellTower(
                    mcc=mcc, mnc=mnc, lac=lac, cell_id=cid,
                    source="unknown",
                )
            resolved_towers.append(tower)
            pings.append(CellTowerPing(
                cell_tower=tower,
                timestamp=ts,
                signal_dbm=sig,
            ))

        first_ts = min((p.timestamp for p in pings), default=0)
        last_ts = max((p.timestamp for p in pings), default=0)

        # De-duplicate towers
        unique: dict[tuple[int, int, int, int], CellTower] = {}
        for t in resolved_towers:
            unique[(t.mcc, t.mnc, t.lac, t.cell_id)] = t

        return DeviceCellHistory(
            device_id="xref-query",
            pings=pings,
            towers_visited=list(unique.values()),
            first_seen=first_ts,
            last_seen=last_ts,
            summary=(
                f"Cross-referenced {len(cell_ids)} cell IDs → "
                f"{len(unique)} unique towers resolved."
            ),
        )

    # ------------------------------------------------------------------
    # OpenCelliD helpers
    # ------------------------------------------------------------------

    async def _fetch_opencellid_towers(
        self, location: GeoLocation, radius_km: float,
    ) -> list[CellTower]:
        """Query OpenCelliD / Unwired Labs nearby cell tower API."""
        if not self._settings.opencellid_api_key:
            return []
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self._settings.opencellid_base_url}/process.php",
                    json={
                        "token": self._settings.opencellid_api_key,
                        "radio": "omit",
                        "mcc": 0,
                        "mnc": 0,
                        "cells": [],
                        "wifi": [],
                        "address": 0,
                        "lat": location.latitude,
                        "lon": location.longitude,
                        "range": int(radius_km * 1000),
                    },
                )
                resp.raise_for_status()
                data = resp.json()

            towers: list[CellTower] = []
            for cell in data.get("cells", []):
                towers.append(CellTower(
                    mcc=int(cell.get("mcc", 0)),
                    mnc=int(cell.get("mnc", 0)),
                    lac=int(cell.get("lac", 0)),
                    cell_id=int(cell.get("cid", 0)),
                    latitude=float(cell.get("lat", 0)),
                    longitude=float(cell.get("lon", 0)),
                    range_m=float(cell.get("range", 0)),
                    radio=cell.get("radio", ""),
                    samples=int(cell.get("samples", 0)),
                    source="opencellid",
                ))
            return towers
        except httpx.HTTPError:
            logger.exception("Failed to fetch OpenCelliD nearby towers")
            return []

    async def _lookup_opencellid(
        self, mcc: int, mnc: int, lac: int, cell_id: int,
    ) -> CellTower | None:
        """Resolve a single cell tower via OpenCelliD / Unwired Labs."""
        if not self._settings.opencellid_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self._settings.opencellid_base_url}/process.php",
                    json={
                        "token": self._settings.opencellid_api_key,
                        "cells": [{"lac": lac, "cid": cell_id, "mcc": mcc, "mnc": mnc}],
                        "address": 0,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            if data.get("status") == "ok":
                return CellTower(
                    mcc=mcc, mnc=mnc, lac=lac, cell_id=cell_id,
                    latitude=float(data.get("lat", 0)),
                    longitude=float(data.get("lon", 0)),
                    range_m=float(data.get("accuracy", 0)),
                    source="opencellid",
                )
        except httpx.HTTPError:
            logger.debug("OpenCelliD lookup failed for %d/%d/%d/%d", mcc, mnc, lac, cell_id)
        return None

    # ------------------------------------------------------------------
    # beaconDB helpers
    # ------------------------------------------------------------------

    async def _fetch_beacondb_towers(
        self, location: GeoLocation, radius_km: float,
    ) -> list[CellTower]:
        """Query beaconDB geolocation API for nearby towers."""
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    f"{self._settings.beacondb_base_url}/geolocate",
                    json={
                        "cellTowers": [],
                        "wifiAccessPoints": [],
                        "fallbacks": {"lacf": True},
                    },
                )
                if resp.status_code != 200:
                    return []
                data = resp.json()

            # beaconDB returns a single resolved location; we cannot
            # enumerate towers from it, but we record the response if useful.
            lat = data.get("location", {}).get("lat")
            lng = data.get("location", {}).get("lng")
            if lat is not None and lng is not None:
                dist = _haversine_km(location.latitude, location.longitude, lat, lng)
                if dist <= radius_km:
                    return [CellTower(
                        mcc=0, mnc=0, lac=0, cell_id=0,
                        latitude=lat, longitude=lng,
                        range_m=float(data.get("accuracy", 0)),
                        source="beacondb",
                    )]
            return []
        except httpx.HTTPError:
            logger.debug("beaconDB query failed")
            return []

    async def _lookup_beacondb(
        self, mcc: int, mnc: int, lac: int, cell_id: int,
    ) -> CellTower | None:
        """Resolve a cell tower via beaconDB geolocation."""
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{self._settings.beacondb_base_url}/geolocate",
                    json={
                        "cellTowers": [{
                            "mobileCountryCode": mcc,
                            "mobileNetworkCode": mnc,
                            "locationAreaCode": lac,
                            "cellId": cell_id,
                        }],
                    },
                )
                if resp.status_code != 200:
                    return None
                data = resp.json()
            lat = data.get("location", {}).get("lat")
            lng = data.get("location", {}).get("lng")
            if lat is not None and lng is not None:
                return CellTower(
                    mcc=mcc, mnc=mnc, lac=lac, cell_id=cell_id,
                    latitude=lat, longitude=lng,
                    range_m=float(data.get("accuracy", 0)),
                    source="beacondb",
                )
        except httpx.HTTPError:
            logger.debug("beaconDB lookup failed for %d/%d/%d/%d", mcc, mnc, lac, cell_id)
        return None

    # ------------------------------------------------------------------
    # WiGLE helpers
    # ------------------------------------------------------------------

    async def _fetch_wigle_towers(
        self, location: GeoLocation, radius_km: float,
    ) -> list[CellTower]:
        """Query WiGLE cell tower search API for towers near a location."""
        if not self._settings.wigle_api_key:
            return []

        # Compute lat/lon bounding box
        delta_lat = radius_km / 111.0
        delta_lon = radius_km / (111.0 * max(math.cos(math.radians(location.latitude)), 0.01))

        try:
            headers = self._wigle_auth_headers()
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{self._settings.wigle_base_url}/cell/search",
                    params={
                        "latrange1": location.latitude - delta_lat,
                        "latrange2": location.latitude + delta_lat,
                        "longrange1": location.longitude - delta_lon,
                        "longrange2": location.longitude + delta_lon,
                        "resultsPerPage": 100,
                    },
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()

            towers: list[CellTower] = []
            for r in data.get("results", [])[:100]:
                rid = r.get("id", {}) if isinstance(r.get("id"), dict) else {}
                towers.append(CellTower(
                    mcc=int(rid.get("mcc", 0)),
                    mnc=int(rid.get("mnc", 0)),
                    lac=int(rid.get("lac", 0)),
                    cell_id=int(rid.get("cid", 0)),
                    latitude=float(r.get("trilat", 0)),
                    longitude=float(r.get("trilong", 0)),
                    radio=r.get("type", ""),
                    operator=r.get("operator", ""),
                    source="wigle",
                    last_seen=float(r.get("lasttime", 0)) if r.get("lasttime") else 0,
                ))
            return towers
        except httpx.HTTPError:
            logger.exception("Failed to fetch WiGLE cell tower data")
            return []

    async def _lookup_wigle(
        self, mcc: int, mnc: int, lac: int, cell_id: int,
    ) -> CellTower | None:
        """Search WiGLE for a specific cell tower by its identifiers."""
        if not self._settings.wigle_api_key:
            return None
        try:
            headers = self._wigle_auth_headers()
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(
                    f"{self._settings.wigle_base_url}/cell/search",
                    params={
                        "cellId": cell_id,
                        "lac": lac,
                        "mcc": mcc,
                        "mnc": mnc,
                        "resultsPerPage": 1,
                    },
                    headers=headers,
                )
                resp.raise_for_status()
                data = resp.json()
            results = data.get("results", [])
            if results:
                r = results[0]
                return CellTower(
                    mcc=mcc, mnc=mnc, lac=lac, cell_id=cell_id,
                    latitude=float(r.get("trilat", 0)),
                    longitude=float(r.get("trilong", 0)),
                    radio=r.get("type", ""),
                    operator=r.get("operator", ""),
                    source="wigle",
                )
        except httpx.HTTPError:
            logger.debug("WiGLE lookup failed for %d/%d/%d/%d", mcc, mnc, lac, cell_id)
        return None

    def _wigle_auth_headers(self) -> dict[str, str]:
        """Build WiGLE authorization headers from the configured API key."""
        key = self._settings.wigle_api_key
        # If it looks like "user:pass" encode as Basic auth
        if ":" in key:
            encoded = base64.b64encode(key.encode()).decode()
            return {"Authorization": f"Basic {encoded}"}
        return {"Authorization": f"Basic {key}"}

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

    @staticmethod
    def _demo_cell_towers(location: GeoLocation) -> list[CellTower]:
        """Generate demo cell tower data around a location."""
        return [
            CellTower(
                mcc=310, mnc=410, lac=30000, cell_id=12345,
                latitude=location.latitude + 0.008,
                longitude=location.longitude - 0.005,
                range_m=1500, radio="LTE", operator="AT&T",
                source="demo", signal_strength=-65, samples=1200,
                last_seen=time.time() - 120,
            ),
            CellTower(
                mcc=310, mnc=260, lac=30001, cell_id=23456,
                latitude=location.latitude - 0.004,
                longitude=location.longitude + 0.007,
                range_m=2200, radio="LTE", operator="T-Mobile",
                source="demo", signal_strength=-72, samples=890,
                last_seen=time.time() - 300,
            ),
            CellTower(
                mcc=311, mnc=480, lac=30002, cell_id=34567,
                latitude=location.latitude + 0.003,
                longitude=location.longitude + 0.009,
                range_m=3000, radio="5G-NR", operator="Verizon",
                source="demo", signal_strength=-58, samples=2100,
                last_seen=time.time() - 60,
            ),
            CellTower(
                mcc=310, mnc=410, lac=30003, cell_id=45678,
                latitude=location.latitude - 0.006,
                longitude=location.longitude - 0.003,
                range_m=1800, radio="UMTS", operator="AT&T",
                source="demo", signal_strength=-80, samples=450,
                last_seen=time.time() - 600,
            ),
            CellTower(
                mcc=310, mnc=260, lac=30004, cell_id=56789,
                latitude=location.latitude + 0.010,
                longitude=location.longitude + 0.002,
                range_m=2500, radio="GSM", operator="T-Mobile",
                source="demo", signal_strength=-88, samples=320,
                last_seen=time.time() - 900,
            ),
        ]

    @staticmethod
    def _demo_cdr_pings(phone_number: str) -> list[CellTowerPing]:
        """Generate simulated CDR (Call Detail Record) pings for a phone number.

        In a production system these would come from a lawful-intercept feed or
        CDR database provided by the telecom operator.
        """
        now = time.time()
        device_id = f"dev-{phone_number[-4:]}" if len(phone_number) >= 4 else "dev-0000"

        towers = [
            CellTower(mcc=310, mnc=410, lac=30000, cell_id=12345, radio="LTE", source="cdr"),
            CellTower(mcc=310, mnc=410, lac=30001, cell_id=12346, radio="LTE", source="cdr"),
            CellTower(mcc=310, mnc=260, lac=30010, cell_id=23456, radio="LTE", source="cdr"),
            CellTower(mcc=311, mnc=480, lac=30020, cell_id=34567, radio="5G-NR", source="cdr"),
            CellTower(mcc=310, mnc=260, lac=30010, cell_id=23457, radio="LTE", source="cdr"),
            CellTower(mcc=310, mnc=410, lac=30000, cell_id=12345, radio="LTE", source="cdr"),
        ]

        pings: list[CellTowerPing] = []
        for i, tower in enumerate(towers):
            pings.append(CellTowerPing(
                cell_tower=tower,
                timestamp=now - (len(towers) - i) * 3600,  # spaced 1 hour apart
                signal_dbm=-60 - i * 5,
                device_id=device_id,
                phone_number=phone_number,
            ))
        return pings
