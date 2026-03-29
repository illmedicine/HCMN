"""API routes for the 3D Globe module."""

from __future__ import annotations

import time

from fastapi import APIRouter

from backend.app.config import Settings

router = APIRouter(prefix="/api/globe", tags=["globe"])

_settings: Settings | None = None


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
