"""Service for aggregating public camera feeds from DOT, weather, and EarthCam APIs."""

from __future__ import annotations

import logging
import math
from typing import Any

import httpx

from backend.app.config import Settings
from backend.app.models.schemas import CameraFeed, CameraSource, GeoLocation

logger = logging.getLogger(__name__)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


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
        "id": "dot-nyc-brooklyn-bridge",
        "name": "NYC Brooklyn Bridge - DOT Traffic Cam",
        "source": CameraSource.DOT_TRAFFIC,
        "stream_url": "https://webcams.nyctmc.org/api/cameras/102",
        "location": {"latitude": 40.7061, "longitude": -73.9969, "label": "Brooklyn Bridge, NYC"},
        "description": "DOT camera at Brooklyn Bridge approach.",
    },
    {
        "id": "dot-nyc-fdr-drive",
        "name": "NYC FDR Drive - DOT Traffic Cam",
        "source": CameraSource.DOT_TRAFFIC,
        "stream_url": "https://webcams.nyctmc.org/api/cameras/55",
        "location": {"latitude": 40.7282, "longitude": -73.9742, "label": "FDR Drive, NYC"},
        "description": "DOT camera on FDR Drive, East Side Manhattan.",
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
        "id": "dot-la-101",
        "name": "LA Highway 101 - CalTrans",
        "source": CameraSource.DOT_TRAFFIC,
        "stream_url": "https://cwwp2.dot.ca.gov/tools/cctvview.htm",
        "location": {"latitude": 34.0522, "longitude": -118.2437, "label": "US-101, Los Angeles"},
        "description": "CalTrans camera on US-101 in Los Angeles.",
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
        "id": "weather-sf-golden-gate",
        "name": "San Francisco Golden Gate",
        "source": CameraSource.WEATHER,
        "stream_url": "https://www.earthcam.com/usa/california/sanfrancisco/goldengate/",
        "location": {"latitude": 37.8199, "longitude": -122.4783, "label": "Golden Gate Bridge, SF"},
        "description": "Live view of the Golden Gate Bridge.",
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
    {
        "id": "earthcam-nyc-5th-ave",
        "name": "NYC 5th Avenue – EarthCam",
        "source": CameraSource.EARTHCAM,
        "stream_url": "https://www.earthcam.com/usa/newyork/fifthavenue/",
        "location": {"latitude": 40.7484, "longitude": -73.9857, "label": "5th Avenue, NYC"},
        "description": "Live view of 5th Avenue, New York City.",
    },
    {
        "id": "earthcam-tokyo-shibuya",
        "name": "Tokyo Shibuya Crossing – EarthCam",
        "source": CameraSource.EARTHCAM,
        "stream_url": "https://www.earthcam.com/world/japan/tokyo/shibuya/",
        "location": {"latitude": 35.6595, "longitude": 139.7004, "label": "Shibuya Crossing, Tokyo"},
        "description": "Live view of Shibuya Crossing, Tokyo.",
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
        feeds = list(self._feeds.values())
        if source is not None:
            feeds = [f for f in feeds if f.source == source]
        return feeds

    def get_feed(self, feed_id: str) -> CameraFeed | None:
        return self._feeds.get(feed_id)

    def add_feed(self, feed: CameraFeed) -> CameraFeed:
        self._feeds[feed.id] = feed
        return feed

    def remove_feed(self, feed_id: str) -> bool:
        return self._feeds.pop(feed_id, None) is not None

    def search_by_location(
        self,
        latitude: float,
        longitude: float,
        radius_km: float = 50.0,
    ) -> list[CameraFeed]:
        """Find camera feeds within radius_km of the given coordinates."""
        results: list[CameraFeed] = []
        for feed in self._feeds.values():
            if feed.location is None:
                continue
            dist = _haversine_km(latitude, longitude, feed.location.latitude, feed.location.longitude)
            if dist <= radius_km:
                results.append(feed)
        return results

    async def refresh_dot_feeds(self) -> list[CameraFeed]:
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
            raw_copy = dict(raw)
            loc_data = raw_copy.pop("location", None)
            loc = GeoLocation(**loc_data) if loc_data else None
            feed = CameraFeed(**raw_copy, location=loc)
            self._feeds[feed.id] = feed
