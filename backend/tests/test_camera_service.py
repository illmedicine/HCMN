"""Tests for the Camera Service (Public Observational Deck)."""

import pytest

from backend.app.config import Settings
from backend.app.models.schemas import CameraFeed, CameraSource
from backend.app.services.camera_service import CameraService


@pytest.fixture()
def settings() -> Settings:
    return Settings()


@pytest.fixture()
def service(settings: Settings) -> CameraService:
    return CameraService(settings)


class TestCameraService:
    def test_demo_feeds_loaded(self, service: CameraService) -> None:
        feeds = service.list_feeds()
        assert len(feeds) >= 5

    def test_list_feeds_filter_by_source(self, service: CameraService) -> None:
        dot_feeds = service.list_feeds(source=CameraSource.DOT_TRAFFIC)
        assert all(f.source == CameraSource.DOT_TRAFFIC for f in dot_feeds)
        assert len(dot_feeds) >= 1

    def test_get_feed_by_id(self, service: CameraService) -> None:
        feed = service.get_feed("dot-nyc-times-square")
        assert feed is not None
        assert feed.name == "NYC Times Square - DOT Traffic Cam"

    def test_get_feed_not_found(self, service: CameraService) -> None:
        assert service.get_feed("nonexistent") is None

    def test_add_feed(self, service: CameraService) -> None:
        feed = CameraFeed(
            id="custom-1",
            name="My Custom Cam",
            source=CameraSource.CUSTOM,
            stream_url="https://example.com/stream",
        )
        result = service.add_feed(feed)
        assert result.id == "custom-1"
        assert service.get_feed("custom-1") is not None

    def test_remove_feed(self, service: CameraService) -> None:
        assert service.remove_feed("dot-nyc-times-square") is True
        assert service.get_feed("dot-nyc-times-square") is None

    def test_remove_feed_not_found(self, service: CameraService) -> None:
        assert service.remove_feed("nonexistent") is False
