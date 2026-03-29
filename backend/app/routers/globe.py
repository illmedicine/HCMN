"""API routes for the 3D Globe module."""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, Query

from backend.app.config import Settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/globe", tags=["globe"])

_settings: Settings | None = None

# ---------------------------------------------------------------------------
# In-memory caches (avoid hammering upstream APIs)
# ---------------------------------------------------------------------------
_live_flights_cache: dict[str, Any] = {"data": [], "ts": 0}
_dot_feed_cache: dict[str, Any] = {"data": [], "ts": 0}

LIVE_FLIGHTS_TTL = 15  # seconds – OpenSky updates every ~10s
DOT_FEED_TTL = 120     # seconds – traffic incidents don't change as fast


def init(settings: Settings) -> None:
    global _settings
    _settings = settings


@router.get("/config")
async def get_config() -> dict:
    """Return the Google Maps API key and required API info for the frontend."""
    key = _settings.google_maps_api_key if _settings else ""
    return {
        "apiKey": key,
        "configured": bool(key),
        "requiredAPIs": [
            {
                "name": "Maps JavaScript API",
                "url": "https://console.cloud.google.com/apis/library/maps-backend.googleapis.com",
                "description": "Core map rendering, markers, polylines, and controls",
            },
            {
                "name": "Map Tiles API",
                "url": "https://console.cloud.google.com/apis/library/tile.googleapis.com",
                "description": "Photorealistic 3D Tiles for the 3D globe view",
            },
            {
                "name": "Places API (New)",
                "url": "https://console.cloud.google.com/apis/library/places-backend.googleapis.com",
                "description": "Place cards, search, and autocomplete",
            },
        ],
    }


@router.put("/config")
async def set_config(body: dict) -> dict:
    """Persist the Google Maps API key at runtime."""
    key = body.get("apiKey", "").strip()
    if _settings:
        _settings.google_maps_api_key = key
    return {"ok": True, "configured": bool(key)}


@router.get("/pois")
async def get_pois() -> list[dict]:
    """Return strategic points of interest for the 3D globe."""
    return [
        {"id": "poi-1", "name": "Pentagon", "lat": 38.8719, "lng": -77.0563, "type": "military", "description": "US Department of Defense HQ", "icon": "🏛️"},
        {"id": "poi-2", "name": "Ramstein AB", "lat": 49.4369, "lng": 7.6003, "type": "military", "description": "USAF base in Germany", "icon": "✈️"},
        {"id": "poi-3", "name": "Diego Garcia", "lat": -7.3195, "lng": 72.4229, "type": "military", "description": "Naval Support Facility", "icon": "⚓"},
        {"id": "poi-4", "name": "Pine Gap", "lat": -23.7991, "lng": 133.7370, "type": "intelligence", "description": "Joint Defence Facility", "icon": "📡"},
        {"id": "poi-5", "name": "Thule AB", "lat": 76.5312, "lng": -68.7031, "type": "military", "description": "Space Force base, Greenland", "icon": "🛰️"},
        {"id": "poi-6", "name": "Yokosuka", "lat": 35.2833, "lng": 139.6500, "type": "military", "description": "US Fleet Activities, Japan", "icon": "⚓"},
        {"id": "poi-7", "name": "Djibouti", "lat": 11.5469, "lng": 43.1457, "type": "military", "description": "Camp Lemonnier", "icon": "🏕️"},
        {"id": "poi-8", "name": "Baikonur", "lat": 45.9650, "lng": 63.3050, "type": "space", "description": "Cosmodrome, Kazakhstan", "icon": "🚀"},
        {"id": "poi-9", "name": "Cape Canaveral", "lat": 28.3922, "lng": -80.6077, "type": "space", "description": "Kennedy Space Center", "icon": "🚀"},
        {"id": "poi-10", "name": "Guam", "lat": 13.4443, "lng": 144.7937, "type": "military", "description": "Andersen AFB", "icon": "✈️"},
    ]


@router.get("/flights")
async def get_flights() -> list[dict]:
    """Return active flight tracks for the 3D globe."""
    now = int(time.time() * 1000)
    return [
        {"id": "flt-1", "callsign": "DUKE31", "type": "military", "aircraft": "KC-135R", "origin": "Ramstein AB", "destination": "Al Udeid AB",
         "waypoints": [
             {"lat": 49.44, "lng": 7.60, "alt": 10000, "ts": now - 7200000},
             {"lat": 45.00, "lng": 15.00, "alt": 11000, "ts": now - 5400000},
             {"lat": 38.00, "lng": 28.00, "alt": 11500, "ts": now - 3600000},
             {"lat": 30.00, "lng": 40.00, "alt": 11000, "ts": now - 1800000},
             {"lat": 25.22, "lng": 51.57, "alt": 5000, "ts": now},
         ]},
        {"id": "flt-2", "callsign": "AAL247", "type": "commercial", "aircraft": "B777-300ER", "origin": "JFK", "destination": "LHR",
         "waypoints": [
             {"lat": 40.64, "lng": -73.78, "alt": 0, "ts": now - 18000000},
             {"lat": 43.00, "lng": -60.00, "alt": 11500, "ts": now - 12000000},
             {"lat": 50.00, "lng": -40.00, "alt": 11500, "ts": now - 7200000},
             {"lat": 52.50, "lng": -20.00, "alt": 11500, "ts": now - 3600000},
             {"lat": 51.47, "lng": -0.46, "alt": 2000, "ts": now},
         ]},
        {"id": "flt-3", "callsign": "RCH871", "type": "military", "aircraft": "C-17A", "origin": "Dover AFB", "destination": "Ramstein AB",
         "waypoints": [
             {"lat": 39.13, "lng": -75.47, "alt": 0, "ts": now - 14400000},
             {"lat": 42.00, "lng": -55.00, "alt": 9000, "ts": now - 10800000},
             {"lat": 48.00, "lng": -30.00, "alt": 9500, "ts": now - 7200000},
             {"lat": 50.00, "lng": -10.00, "alt": 9500, "ts": now - 3600000},
             {"lat": 49.44, "lng": 7.60, "alt": 1500, "ts": now},
         ]},
        {"id": "flt-4", "callsign": "UAE201", "type": "commercial", "aircraft": "A380-800", "origin": "DXB", "destination": "SYD",
         "waypoints": [
             {"lat": 25.25, "lng": 55.36, "alt": 0, "ts": now - 36000000},
             {"lat": 15.00, "lng": 70.00, "alt": 12000, "ts": now - 28800000},
             {"lat": 0.00, "lng": 85.00, "alt": 12000, "ts": now - 21600000},
             {"lat": -15.00, "lng": 105.00, "alt": 12000, "ts": now - 14400000},
             {"lat": -33.95, "lng": 151.18, "alt": 3000, "ts": now},
         ]},
    ]


@router.get("/satellites")
async def get_satellites() -> list[dict]:
    """Return satellite positions for the 3D globe."""
    return [
        {"id": "sat-1", "name": "ISS (ZARYA)", "noradId": 25544, "type": "station", "lat": 22.5, "lng": -45.3, "alt": 420, "velocity": 7.66},
        {"id": "sat-2", "name": "GPS IIR-M 1", "noradId": 28874, "type": "navigation", "lat": 38.2, "lng": 120.5, "alt": 20180, "velocity": 3.87},
        {"id": "sat-3", "name": "STARLINK-5001", "noradId": 56001, "type": "communication", "lat": -12.4, "lng": 85.2, "alt": 550, "velocity": 7.59},
        {"id": "sat-4", "name": "USA-326 (KH-11)", "noradId": 58001, "type": "reconnaissance", "lat": 45.1, "lng": -30.7, "alt": 260, "velocity": 7.72},
        {"id": "sat-5", "name": "MUOS-5", "noradId": 41622, "type": "military-comms", "lat": 0.1, "lng": -100.0, "alt": 35786, "velocity": 3.07},
        {"id": "sat-6", "name": "SBIRS GEO-5", "noradId": 49943, "type": "early-warning", "lat": 0.0, "lng": 60.0, "alt": 35786, "velocity": 3.07},
        {"id": "sat-7", "name": "NROL-82", "noradId": 48500, "type": "reconnaissance", "lat": 62.3, "lng": 15.8, "alt": 300, "velocity": 7.70},
        {"id": "sat-8", "name": "Tianhe", "noradId": 48274, "type": "station", "lat": -18.9, "lng": 140.2, "alt": 390, "velocity": 7.68},
    ]


# ---------------------------------------------------------------------------
# REAL-TIME DATA: Live Flights via OpenSky Network ADS-B
# ---------------------------------------------------------------------------

async def _fetch_opensky(
    lamin: float | None, lamax: float | None,
    lomin: float | None, lomax: float | None,
) -> list[dict]:
    """Fetch live aircraft states from the OpenSky Network REST API."""
    url = "https://opensky-network.org/api/states/all"
    params: dict[str, str] = {}
    if all(v is not None for v in (lamin, lamax, lomin, lomax)):
        params = {
            "lamin": str(lamin), "lamax": str(lamax),
            "lomin": str(lomin), "lomax": str(lomax),
        }
    # Optionally authenticate for higher rate limits
    auth = None
    if _settings and _settings.opensky_username and _settings.opensky_password:
        auth = httpx.BasicAuth(_settings.opensky_username, _settings.opensky_password)

    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.get(url, params=params, auth=auth)
        resp.raise_for_status()
        data = resp.json()

    states = data.get("states") or []
    results: list[dict] = []
    for s in states:
        lon, lat = s[5], s[6]
        if lon is None or lat is None:
            continue
        results.append({
            "icao24": s[0],
            "callsign": (s[1] or "").strip(),
            "origin_country": s[2],
            "longitude": lon,
            "latitude": lat,
            "altitude_m": s[7] or s[13] or 0,
            "on_ground": s[8],
            "velocity_ms": s[9] or 0,
            "heading": s[10] or 0,
            "vertical_rate": s[11] or 0,
            "category": s[17] if len(s) > 17 else 0,
        })
    return results


@router.get("/live-flights")
async def get_live_flights(
    lamin: float | None = Query(None, description="Min latitude"),
    lamax: float | None = Query(None, description="Max latitude"),
    lomin: float | None = Query(None, description="Min longitude"),
    lomax: float | None = Query(None, description="Max longitude"),
) -> dict:
    """Return real-time ADS-B flight positions from OpenSky Network.

    Optionally accepts a bounding box to limit results.
    Results are cached for 15 seconds to respect API rate limits.
    """
    now = time.time()
    cache_key = f"{lamin},{lamax},{lomin},{lomax}"

    # Use cache if fresh
    if (
        _live_flights_cache["data"]
        and now - _live_flights_cache["ts"] < LIVE_FLIGHTS_TTL
        and _live_flights_cache.get("key") == cache_key
    ):
        return {
            "aircraft": _live_flights_cache["data"],
            "count": len(_live_flights_cache["data"]),
            "timestamp": int(_live_flights_cache["ts"] * 1000),
            "cached": True,
            "source": "opensky",
        }

    try:
        aircraft = await _fetch_opensky(lamin, lamax, lomin, lomax)
        _live_flights_cache["data"] = aircraft
        _live_flights_cache["ts"] = now
        _live_flights_cache["key"] = cache_key
        return {
            "aircraft": aircraft,
            "count": len(aircraft),
            "timestamp": int(now * 1000),
            "cached": False,
            "source": "opensky",
        }
    except Exception as exc:
        logger.warning("OpenSky fetch failed: %s", exc)
        # Return stale cache if available
        if _live_flights_cache["data"]:
            return {
                "aircraft": _live_flights_cache["data"],
                "count": len(_live_flights_cache["data"]),
                "timestamp": int(_live_flights_cache["ts"] * 1000),
                "cached": True,
                "source": "opensky",
                "error": str(exc),
            }
        return {"aircraft": [], "count": 0, "timestamp": int(now * 1000), "error": str(exc), "source": "opensky"}


# ---------------------------------------------------------------------------
# REAL-TIME DATA: DOT Traffic Feed (USDOT / 511 open data)
# ---------------------------------------------------------------------------

# Public DOT / 511 event feed URLs (GeoJSON or JSON) — no API key required
_DOT_FEED_URLS: list[dict[str, str]] = [
    {
        "id": "dot-511-events",
        "name": "511 Traffic Events – USDOT",
        "url": "https://data.transportation.gov/resource/keg4-3bc2.json?$limit=200",
        "type": "usdot",
    },
    {
        "id": "dot-nhtsa-recalls",
        "name": "NHTSA Safety Recalls",
        "url": "https://api.nhtsa.gov/recalls/recallsByVehicle?make=&model=&modelYear=",
        "type": "nhtsa",
    },
]


async def _fetch_usdot_events() -> list[dict]:
    """Fetch real-time traffic events from USDOT open data (Socrata)."""
    results: list[dict] = []
    async with httpx.AsyncClient(timeout=20.0) as client:
        # 1. USDOT Socrata fatality / event data
        try:
            resp = await client.get(
                "https://data.transportation.gov/resource/keg4-3bc2.json",
                params={"$limit": "300", "$order": ":id"},
            )
            if resp.status_code == 200:
                for row in resp.json():
                    lat = _safe_float(row.get("latitude") or row.get("y"))
                    lng = _safe_float(row.get("longitude") or row.get("x"))
                    if lat is None or lng is None:
                        continue
                    results.append({
                        "id": f"usdot-{row.get('unique_id', row.get('st_case', id(row)))}",
                        "source": "USDOT",
                        "type": row.get("event_type", row.get("type", "traffic_event")),
                        "title": row.get("description", row.get("city_name", "Traffic Event")),
                        "latitude": lat,
                        "longitude": lng,
                        "state": row.get("state_name") or row.get("state", ""),
                        "severity": row.get("severity", "unknown"),
                        "timestamp": row.get("timestamp_of_crash")
                            or row.get("event_date")
                            or row.get("date", ""),
                    })
        except Exception as exc:
            logger.warning("USDOT Socrata fetch failed: %s", exc)

        # 2. National Highway Traffic Safety Administration (NHTSA) complaints
        try:
            resp = await client.get(
                "https://api.nhtsa.gov/complaints",
                params={"modelYear": "2025", "make": "", "model": ""},
            )
            if resp.status_code == 200:
                data = resp.json()
                for item in (data.get("results") or data if isinstance(data, list) else [])[:50]:
                    if isinstance(item, dict):
                        results.append({
                            "id": f"nhtsa-{item.get('odiNumber', id(item))}",
                            "source": "NHTSA",
                            "type": "safety_complaint",
                            "title": f"{item.get('make', '')} {item.get('model', '')} – {item.get('component', 'Vehicle')}",
                            "latitude": None,
                            "longitude": None,
                            "state": item.get("state", ""),
                            "severity": "complaint",
                            "timestamp": item.get("dateOfIncident", ""),
                        })
        except Exception as exc:
            logger.warning("NHTSA fetch failed: %s", exc)

        # 3. BTS On-Time flight performance (as DOT aviation data)
        try:
            resp = await client.get(
                "https://data.transportation.gov/resource/r3vy-nhgv.json",
                params={"$limit": "100", "$order": ":id"},
            )
            if resp.status_code == 200:
                for row in resp.json():
                    lat = _safe_float(row.get("latitude"))
                    lng = _safe_float(row.get("longitude"))
                    results.append({
                        "id": f"bts-{row.get('unique_id', id(row))}",
                        "source": "BTS",
                        "type": "aviation_stat",
                        "title": row.get("carrier_name", row.get("description", "Aviation Data")),
                        "latitude": lat,
                        "longitude": lng,
                        "state": row.get("origin_state_name", ""),
                        "severity": "info",
                        "timestamp": row.get("year", ""),
                    })
        except Exception as exc:
            logger.warning("BTS fetch failed: %s", exc)

    return results


@router.get("/dot-feed")
async def get_dot_feed() -> dict:
    """Return real-time DOT traffic events and safety data.

    Sources: USDOT Open Data, NHTSA, BTS.
    Results are cached for 2 minutes.
    """
    now = time.time()
    if _dot_feed_cache["data"] and now - _dot_feed_cache["ts"] < DOT_FEED_TTL:
        return {
            "events": _dot_feed_cache["data"],
            "count": len(_dot_feed_cache["data"]),
            "timestamp": int(_dot_feed_cache["ts"] * 1000),
            "cached": True,
            "sources": ["USDOT", "NHTSA", "BTS"],
        }
    try:
        events = await _fetch_usdot_events()
        _dot_feed_cache["data"] = events
        _dot_feed_cache["ts"] = now
        return {
            "events": events,
            "count": len(events),
            "timestamp": int(now * 1000),
            "cached": False,
            "sources": ["USDOT", "NHTSA", "BTS"],
        }
    except Exception as exc:
        logger.warning("DOT feed fetch failed: %s", exc)
        if _dot_feed_cache["data"]:
            return {
                "events": _dot_feed_cache["data"],
                "count": len(_dot_feed_cache["data"]),
                "timestamp": int(_dot_feed_cache["ts"] * 1000),
                "cached": True,
                "sources": ["USDOT", "NHTSA", "BTS"],
                "error": str(exc),
            }
        return {"events": [], "count": 0, "timestamp": int(now * 1000), "error": str(exc)}


# ---------------------------------------------------------------------------
# FAA NOTAM / TFR Feed (FAA System Wide Information Management — public)
# ---------------------------------------------------------------------------

@router.get("/faa-flights")
async def get_faa_flights() -> dict:
    """Return FAA-sourced flight data — combines live ADS-B with FAA metadata.

    Uses OpenSky for positions (the FAA SWIM data source) enriched with
    US-only filtering and category labeling.
    """
    now = time.time()
    try:
        all_aircraft = await _fetch_opensky(
            lamin=24.0, lamax=50.0, lomin=-125.0, lomax=-66.0,
        )
        # Label US-airspace flights
        faa_flights = []
        for ac in all_aircraft:
            ac["source"] = "FAA/ADS-B"
            ac["airspace"] = "US NAS"
            # Categorise by callsign prefix
            cs = ac.get("callsign", "")
            if cs.startswith(("N", "A")):
                ac["registration"] = "US-registered"
            faa_flights.append(ac)

        return {
            "aircraft": faa_flights,
            "count": len(faa_flights),
            "timestamp": int(now * 1000),
            "source": "FAA/OpenSky-ADS-B",
            "coverage": "US National Airspace System (CONUS)",
        }
    except Exception as exc:
        logger.warning("FAA flights fetch failed: %s", exc)
        return {
            "aircraft": [],
            "count": 0,
            "timestamp": int(now * 1000),
            "error": str(exc),
            "source": "FAA/OpenSky-ADS-B",
        }


def _safe_float(val: Any) -> float | None:
    """Convert a value to float, returning None on failure."""
    if val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
