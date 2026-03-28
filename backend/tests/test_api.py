"""Tests for the FastAPI application endpoints."""

import pytest
from fastapi.testclient import TestClient

from backend.app.main import app


@pytest.fixture()
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


class TestHealthEndpoint:
    def test_health(self, client: TestClient) -> None:
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestCameraEndpoints:
    def test_list_feeds(self, client: TestClient) -> None:
        resp = client.get("/api/cameras/")
        assert resp.status_code == 200
        feeds = resp.json()
        assert isinstance(feeds, list)
        assert len(feeds) >= 5

    def test_get_feed(self, client: TestClient) -> None:
        resp = client.get("/api/cameras/dot-nyc-times-square")
        assert resp.status_code == 200
        assert resp.json()["id"] == "dot-nyc-times-square"

    def test_get_feed_not_found(self, client: TestClient) -> None:
        resp = client.get("/api/cameras/nonexistent")
        assert resp.status_code == 404


class TestSDREndpoints:
    def test_sweep(self, client: TestClient) -> None:
        resp = client.post("/api/sdr/sweep?start_freq=88000000&end_freq=108000000&step=5000000")
        assert resp.status_code == 200
        data = resp.json()
        assert "samples" in data
        assert len(data["samples"]) > 0

    def test_latest_sweep_initially_none(self, client: TestClient) -> None:
        resp = client.get("/api/sdr/sweep/latest")
        assert resp.status_code == 200


class TestCSIEndpoints:
    def test_collect_frames(self, client: TestClient) -> None:
        resp = client.post("/api/csi/collect?count=5")
        assert resp.status_code == 200
        frames = resp.json()
        assert len(frames) == 5

    def test_predict(self, client: TestClient) -> None:
        # Collect some frames first
        client.post("/api/csi/collect?count=20")
        resp = client.get("/api/csi/predict")
        assert resp.status_code == 200
        assert "prediction" in resp.json()

    def test_presence(self, client: TestClient) -> None:
        client.post("/api/csi/collect?count=20")
        resp = client.get("/api/csi/presence")
        assert resp.status_code == 200
        assert "occupancy_count" in resp.json()

    def test_layout(self, client: TestClient) -> None:
        client.post("/api/csi/collect?count=20")
        resp = client.get("/api/csi/layout")
        assert resp.status_code == 200
        data = resp.json()
        assert "walls" in data
        assert "zones" in data

    def test_buffer_size(self, client: TestClient) -> None:
        resp = client.get("/api/csi/buffer/size")
        assert resp.status_code == 200
        assert "buffer_size" in resp.json()
