"""Tests for the CSI Service (Wi-Fi Sensing & Presence Detection)."""

import numpy as np
import pytest

from backend.app.config import Settings
from backend.app.services.csi_service import (
    CSIService,
    SimulatedCSICollector,
    extract_fft_features,
    lowpass_filter,
    pca_reduce,
)


@pytest.fixture()
def settings() -> Settings:
    return Settings()


@pytest.fixture()
def service(settings: Settings) -> CSIService:
    return CSIService(settings, collector=SimulatedCSICollector(64))


# ---------------------------------------------------------------------------
# Signal processing helpers
# ---------------------------------------------------------------------------

class TestLowpassFilter:
    def test_output_same_length(self) -> None:
        signal = np.random.default_rng(0).normal(0, 1, 128)
        filtered = lowpass_filter(signal)
        assert len(filtered) == len(signal)

    def test_reduces_high_frequency_content(self) -> None:
        rng = np.random.default_rng(0)
        low_freq = np.sin(np.linspace(0, 2 * np.pi, 256))
        high_freq = rng.normal(0, 0.5, 256)
        noisy = low_freq + high_freq
        filtered = lowpass_filter(noisy, cutoff_ratio=0.05)
        # Filtered signal should be smoother (lower std of differences)
        assert np.std(np.diff(filtered)) < np.std(np.diff(noisy))


class TestPCAReduce:
    def test_reduces_dimensions(self) -> None:
        data = np.random.default_rng(0).normal(0, 1, (20, 64))
        reduced = pca_reduce(data, 5)
        assert reduced.shape == (20, 5)

    def test_handles_small_data(self) -> None:
        data = np.random.default_rng(0).normal(0, 1, (1, 10))
        reduced = pca_reduce(data, 5)
        # Not enough samples – returns original
        assert reduced.shape == data.shape


class TestFFTFeatures:
    def test_output_length(self) -> None:
        signal = np.random.default_rng(0).normal(0, 1, 256)
        features = extract_fft_features(signal, window_size=256)
        assert len(features) == 129  # rfft of 256 → 129

    def test_normalized(self) -> None:
        signal = np.random.default_rng(0).normal(0, 1, 256)
        features = extract_fft_features(signal, window_size=256)
        assert np.max(features) <= 1.0 + 1e-9


# ---------------------------------------------------------------------------
# CSI Service
# ---------------------------------------------------------------------------

class TestCSIService:
    def test_collect_frames(self, service: CSIService) -> None:
        frames = service.collect_frames(count=10)
        assert len(frames) == 10
        assert service.get_buffer_size() == 10

    def test_collect_frames_trims_buffer(self, service: CSIService) -> None:
        service.collect_frames(count=300)
        assert service.get_buffer_size() == 256  # max buffer size

    def test_predict_returns_prediction(self, service: CSIService) -> None:
        service.collect_frames(count=20)
        pred = service.predict()
        assert pred.prediction in ["empty", "person_walking", "person_sitting", "person_standing", "multiple_people", "unknown"]
        assert 0.0 <= pred.confidence <= 1.0

    def test_detect_presence(self, service: CSIService) -> None:
        service.collect_frames(count=20)
        event = service.detect_presence()
        assert event.occupancy_count >= 0
        assert event.activity != ""

    def test_reconstruct_layout(self, service: CSIService) -> None:
        service.collect_frames(count=20)
        layout = service.reconstruct_layout()
        assert layout.width_m > 0
        assert layout.height_m > 0
        assert len(layout.walls) == 4
        assert len(layout.zones) >= 1

    def test_reconstruct_layout_insufficient_data(self, service: CSIService) -> None:
        layout = service.reconstruct_layout()
        assert layout.width_m == 0.0
        assert layout.height_m == 0.0

    def test_process_pipeline_empty_buffer(self, service: CSIService) -> None:
        features = service.process_pipeline()
        assert features.size == 0
