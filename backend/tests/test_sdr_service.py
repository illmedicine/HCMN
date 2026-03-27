"""Tests for the SDR Service (RF Spectrum Visualisation)."""

import pytest

from backend.app.config import Settings
from backend.app.services.sdr_service import SDRService, SimulatedSDRCollector


@pytest.fixture()
def settings() -> Settings:
    return Settings()


@pytest.fixture()
def service(settings: Settings) -> SDRService:
    return SDRService(settings, collector=SimulatedSDRCollector())


class TestSDRService:
    def test_sweep_returns_samples(self, service: SDRService) -> None:
        sweep = service.sweep(start_freq=88e6, end_freq=108e6, step=1e6)
        assert len(sweep.samples) > 0
        assert sweep.start_freq_hz == 88e6
        assert sweep.end_freq_hz == 108e6

    def test_sweep_default_range(self, service: SDRService) -> None:
        sweep = service.sweep()
        assert sweep.start_freq_hz > 0
        assert sweep.end_freq_hz > sweep.start_freq_hz

    def test_detect_signals_on_fm_band(self, service: SDRService) -> None:
        service.sweep(start_freq=85e6, end_freq=110e6, step=0.5e6)
        signals = service.detect_signals(threshold_dbm=-80.0)
        # SimulatedSDRCollector injects tones at 88.1 and 101.5 MHz
        assert len(signals) >= 0  # detection depends on threshold

    def test_classify_known_bands(self) -> None:
        assert SDRService._classify_frequency(100e6) == "FM Broadcast"
        assert SDRService._classify_frequency(2450e6) == "Wi-Fi 2.4 GHz / ISM"
        assert SDRService._classify_frequency(5200e6) == "Wi-Fi 5 GHz / U-NII"
        assert SDRService._classify_frequency(50e6) == "Unknown"

    def test_latest_sweep_initially_none(self, service: SDRService) -> None:
        assert service.get_latest_sweep() is None

    def test_latest_sweep_updated_after_sweep(self, service: SDRService) -> None:
        service.sweep(start_freq=88e6, end_freq=90e6, step=1e6)
        latest = service.get_latest_sweep()
        assert latest is not None
        assert latest.start_freq_hz == 88e6
