"""Service for aggregating public camera feeds from DOT, weather, and EarthCam APIs."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from backend.app.config import Settings
from backend.app.models.schemas import CameraFeed, CameraSource, GeoLocation

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Built-in demo / fallback feeds (publicly available streams)
# ---------------------------------------------------------------------------

_DEMO_FEEDS: list[dict[str, Any]] = [
    {
        "id": "dot-nyc-times-square",
        "name": "NYC Times Square - DOT Traffic Cam",
        "source": CameraSource.DOT_TRAFFIC,
        "stream_url": "https://webcams.nyctmc.org/api/cameras/8",
        "location": {"latitude": 40.758, "longitude": -73.9855, "label": "Times Square, NYC"},
        "description": "New York City DOT traffic camera at Times Square.",
    },
    {
        "id": "dot-chicago-lsd",
        "name": "Chicago Lake Shore Drive - DOT",
        "source": CameraSource.DOT_TRAFFIC,
        "stream_url": "https://traveler.chicago.gov/cameras/1",
        "location": {"latitude": 41.8781, "longitude": -87.6298, "label": "Lake Shore Dr, Chicago"},
        "description": "Chicago DOT camera on Lake Shore Drive.",
    },
    {
        "id": "weather-miami-beach",
        "name": "Miami Beach Weather Cam",
        "source": CameraSource.WEATHER,
        "stream_url": "https://www.earthcam.com/usa/florida/miamibeach/",
        "location": {"latitude": 25.7907, "longitude": -80.13, "label": "Miami Beach, FL"},
        "description": "Live weather cam overlooking Miami Beach.",
    },
    {
        "id": "earthcam-abbey-road",
        "name": "Abbey Road Crossing – EarthCam",
        "source": CameraSource.EARTHCAM,
        "stream_url": "https://www.earthcam.com/world/england/london/abbeyroad/",
        "location": {"latitude": 51.5320, "longitude": -0.1778, "label": "Abbey Road, London"},
        "description": "Famous Abbey Road pedestrian crossing in London.",
    },
    {
        "id": "earthcam-dublin",
        "name": "Dublin City Centre – EarthCam",
        "source": CameraSource.EARTHCAM,
        "stream_url": "https://www.earthcam.com/world/ireland/dublin/",
        "location": {"latitude": 53.3498, "longitude": -6.2603, "label": "Dublin, Ireland"},
        "description": "Live view of Dublin city centre.",
    },
]


class CameraService:
    """Manages discovery and retrieval of public camera feeds."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._feeds: dict[str, CameraFeed] = {}
        self._load_demo_feeds()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def list_feeds(
        self,
        source: CameraSource | None = None,
    ) -> list[CameraFeed]:
        """Return all known feeds, optionally filtered by *source*."""
        feeds = list(self._feeds.values())
        if source is not None:
            feeds = [f for f in feeds if f.source == source]
        return feeds

    def get_feed(self, feed_id: str) -> CameraFeed | None:
        """Look up a single feed by its id."""
        return self._feeds.get(feed_id)

    def add_feed(self, feed: CameraFeed) -> CameraFeed:
        """Register a new camera feed."""
        self._feeds[feed.id] = feed
        return feed

    def remove_feed(self, feed_id: str) -> bool:
        """Remove a feed by id. Returns True if it existed."""
        return self._feeds.pop(feed_id, None) is not None

    async def refresh_dot_feeds(self) -> list[CameraFeed]:
        """Fetch latest traffic camera list from DOT API."""
        if not self._settings.dot_api_key:
            logger.info("DOT API key not configured – skipping refresh")
            return []

        url = f"{self._settings.dot_api_base_url}/cameras"
        params = {"api_key": self._settings.dot_api_key, "format": "json"}
        new_feeds: list[CameraFeed] = []

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data = resp.json()

            for cam in data if isinstance(data, list) else []:
                feed = CameraFeed(
                    id=f"dot-{cam.get('id', '')}",
                    name=cam.get("name", "DOT Camera"),
                    source=CameraSource.DOT_TRAFFIC,
                    stream_url=cam.get("streamUrl", cam.get("imageUrl", "")),
                    location=GeoLocation(
                        latitude=cam.get("latitude", 0),
                        longitude=cam.get("longitude", 0),
                    ),
                    description=cam.get("description", ""),
                )
                self._feeds[feed.id] = feed
                new_feeds.append(feed)
        except httpx.HTTPError:
            logger.exception("Failed to refresh DOT feeds")

        return new_feeds

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _load_demo_feeds(self) -> None:
        for raw in _DEMO_FEEDS:
            loc_data = raw.pop("location", None)
            loc = GeoLocation(**loc_data) if loc_data else None
            feed = CameraFeed(**raw, location=loc)
            self._feeds[feed.id] = feed
