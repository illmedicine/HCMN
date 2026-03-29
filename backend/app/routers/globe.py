"""API routes for the 3D Globe module."""

from __future__ import annotations

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
