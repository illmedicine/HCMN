"""Service for Software Defined Radio (SDR) spectrum analysis and RF mapping.

This module provides the software pipeline for ingesting, processing, and
visualising RF spectrum data captured by a local SDR device such as an
RTL-SDR or HackRF One.  The actual hardware interaction is abstracted behind
a pluggable *collector* so the rest of the application can work with
simulated data when no SDR hardware is present.
"""

from __future__ import annotations

import logging
import math
import time
from typing import Protocol

import numpy as np

from backend.app.config import Settings
from backend.app.models.schemas import DetectedSignal, RFSample, SpectrumSweep

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Collector protocol – implemented by hardware drivers or a simulator
# ---------------------------------------------------------------------------

class SDRCollector(Protocol):
    """Interface for an SDR data source."""

    def read_samples(self, center_freq: float, num_samples: int) -> np.ndarray:
        """Return complex IQ samples at *center_freq*."""
        ...


class SimulatedSDRCollector:
    """Generate synthetic RF spectrum data for development/demo purposes.

    Injects a handful of artificial signals at well-known frequencies so
    the dashboard has something to display without real hardware.
    """

    _SIMULATED_SIGNALS: list[tuple[float, float, str]] = [
        # (center_freq_hz, power_dbm, label)
        (88.1e6, -30.0, "FM Radio 88.1"),
        (101.5e6, -25.0, "FM Radio 101.5"),
        (462.5625e6, -50.0, "FRS Ch1"),
        (915e6, -45.0, "ISM 915 MHz"),
        (2.437e9, -35.0, "Wi-Fi Ch6 2.4 GHz"),
        (5.180e9, -40.0, "Wi-Fi Ch36 5 GHz"),
    ]

    def read_samples(self, center_freq: float, num_samples: int) -> np.ndarray:
        """Return simulated IQ samples with injected tones."""
        rng = np.random.default_rng()
        noise = rng.normal(0, 0.01, num_samples) + 1j * rng.normal(0, 0.01, num_samples)

        for sig_freq, sig_power, _ in self._SIMULATED_SIGNALS:
            offset = sig_freq - center_freq
            if abs(offset) < 1e6:
                amplitude = 10 ** (sig_power / 20)
                t = np.arange(num_samples) / 2.4e6
                tone = amplitude * np.exp(2j * np.pi * offset * t)
                noise = noise + tone

        return noise


# ---------------------------------------------------------------------------
# SDR Service
# ---------------------------------------------------------------------------

class SDRService:
    """Processes SDR samples into spectrum sweeps and detected signals."""

    def __init__(self, settings: Settings, collector: SDRCollector | None = None) -> None:
        self._settings = settings
        self._collector = collector or SimulatedSDRCollector()
        self._latest_sweep: SpectrumSweep | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def sweep(
        self,
        start_freq: float | None = None,
        end_freq: float | None = None,
        step: float | None = None,
    ) -> SpectrumSweep:
        """Perform a frequency sweep and return the power spectrum."""
        start = start_freq or self._settings.sdr_freq_min
        end = end_freq or self._settings.sdr_freq_max
        step_hz = step or self._settings.sdr_sweep_step

        samples: list[RFSample] = []
        now = time.time()
        freq = start

        while freq <= end:
            iq = self._collector.read_samples(freq, 1024)
            power = self._compute_power_dbm(iq)
            samples.append(RFSample(frequency_hz=freq, power_dbm=power, timestamp=now))
            freq += step_hz

        sweep = SpectrumSweep(
            start_freq_hz=start,
            end_freq_hz=end,
            step_hz=step_hz,
            samples=samples,
            sweep_id=f"sweep-{int(now)}",
            timestamp=now,
        )
        self._latest_sweep = sweep
        return sweep

    def detect_signals(self, sweep: SpectrumSweep | None = None, threshold_dbm: float = -60.0) -> list[DetectedSignal]:
        """Identify peaks above *threshold_dbm* in the latest or given sweep."""
        sweep = sweep or self._latest_sweep
        if sweep is None:
            return []

        detected: list[DetectedSignal] = []
        for sample in sweep.samples:
            if sample.power_dbm > threshold_dbm:
                label = self._classify_frequency(sample.frequency_hz)
                detected.append(
                    DetectedSignal(
                        frequency_hz=sample.frequency_hz,
                        bandwidth_hz=sweep.step_hz,
                        power_dbm=sample.power_dbm,
                        signal_type=label,
                        label=label,
                    )
                )
        return detected

    def get_latest_sweep(self) -> SpectrumSweep | None:
        return self._latest_sweep

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _compute_power_dbm(iq_samples: np.ndarray) -> float:
        """Compute average power in dBm from complex IQ samples."""
        power_watts = float(np.mean(np.abs(iq_samples) ** 2))
        if power_watts <= 0:
            return -120.0
        return 10.0 * math.log10(power_watts) + 30.0

    @staticmethod
    def _classify_frequency(freq_hz: float) -> str:
        """Return a human-readable band label for common frequency ranges."""
        bands = [
            (87.5e6, 108e6, "FM Broadcast"),
            (118e6, 137e6, "Aviation VHF"),
            (144e6, 148e6, "2m Amateur"),
            (420e6, 450e6, "70cm Amateur"),
            (462e6, 468e6, "FRS/GMRS"),
            (824e6, 849e6, "Cellular 850 MHz"),
            (869e6, 894e6, "Cellular 850 MHz"),
            (902e6, 928e6, "ISM 900 MHz"),
            (1710e6, 1755e6, "AWS-1 Uplink"),
            (1850e6, 1910e6, "PCS Uplink"),
            (2400e6, 2500e6, "Wi-Fi 2.4 GHz / ISM"),
            (5150e6, 5850e6, "Wi-Fi 5 GHz / U-NII"),
        ]
        for lo, hi, label in bands:
            if lo <= freq_hz <= hi:
                return label
        return "Unknown"
