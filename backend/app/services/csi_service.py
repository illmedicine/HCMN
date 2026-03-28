"""Wi-Fi Channel State Information (CSI) sensing service.

Implements the data pipeline described in the project specification:

1. Collect raw CSI frames from edge hardware (ESP32 / Nexmon / Intel 5300).
2. Apply a low-pass filter to remove environmental noise.
3. Use PCA to reduce dimensionality.
4. Extract features with FFT.
5. Feed cleaned features into an ML classifier (CNN) for presence detection.

When no real hardware is available a *SimulatedCSICollector* generates
synthetic frames so the pipeline can be exercised end-to-end.
"""

from __future__ import annotations

import logging
import math
import time
from typing import Protocol

import numpy as np

from backend.app.config import Settings
from backend.app.models.schemas import (
    CSIFrame,
    CSIPrediction,
    PresenceEvent,
    RoomLayout,
    RoomZone,
    WallSegment,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Collector protocol
# ---------------------------------------------------------------------------

class CSICollector(Protocol):
    """Interface for a CSI data source."""

    def collect_frame(self) -> CSIFrame:
        """Return a single CSI measurement frame."""
        ...


class SimulatedCSICollector:
    """Generate synthetic CSI frames for development / demo purposes."""

    def __init__(self, subcarrier_count: int = 64) -> None:
        self._n = subcarrier_count
        self._rng = np.random.default_rng(42)
        self._step = 0

    def collect_frame(self) -> CSIFrame:
        self._step += 1
        t = self._step * 0.1

        # Base amplitude profile – a rough "empty room" signature
        base_amp = 0.5 + 0.3 * np.sin(np.linspace(0, np.pi, self._n))

        # Simulate a person moving: add a time-varying perturbation
        perturbation = 0.15 * np.sin(2 * np.pi * 0.3 * t + np.linspace(0, 2 * np.pi, self._n))
        amplitudes = base_amp + perturbation + self._rng.normal(0, 0.02, self._n)

        phases = np.linspace(-np.pi, np.pi, self._n) + self._rng.normal(0, 0.1, self._n)

        return CSIFrame(
            timestamp=time.time(),
            mac_address="AA:BB:CC:DD:EE:FF",
            rssi=-45.0 + self._rng.normal(0, 2),
            subcarrier_amplitudes=amplitudes.tolist(),
            subcarrier_phases=phases.tolist(),
        )


# ---------------------------------------------------------------------------
# Signal processing helpers
# ---------------------------------------------------------------------------

def lowpass_filter(signal: np.ndarray, cutoff_ratio: float = 0.1) -> np.ndarray:
    """Apply a simple frequency-domain low-pass filter.

    *cutoff_ratio* is the fraction of the Nyquist frequency to keep.
    Must satisfy 0 < cutoff_ratio < 0.5.
    """
    cutoff_ratio = max(0.01, min(cutoff_ratio, 0.49))
    spectrum = np.fft.fft(signal)
    n = len(spectrum)
    cutoff = max(1, int(n * cutoff_ratio))
    spectrum[cutoff: n - cutoff] = 0
    return np.real(np.fft.ifft(spectrum))


def pca_reduce(data: np.ndarray, n_components: int) -> np.ndarray:
    """Reduce *data* (samples × features) to *n_components* via PCA."""
    if data.shape[0] < 2 or data.shape[1] < n_components:
        return data

    mean = data.mean(axis=0)
    centered = data - mean
    cov = np.cov(centered, rowvar=False)
    eigenvalues, eigenvectors = np.linalg.eigh(cov)

    # Sort by descending eigenvalue
    idx = np.argsort(eigenvalues)[::-1][:n_components]
    components = eigenvectors[:, idx]
    return centered @ components


def extract_fft_features(signal: np.ndarray, window_size: int = 256) -> np.ndarray:
    """Compute magnitude spectrum features using FFT."""
    if len(signal) < window_size:
        padded = np.zeros(window_size)
        padded[: len(signal)] = signal
        signal = padded
    else:
        signal = signal[:window_size]

    spectrum = np.abs(np.fft.rfft(signal))
    return spectrum / (np.max(spectrum) + 1e-12)


# ---------------------------------------------------------------------------
# CSI Service
# ---------------------------------------------------------------------------

class CSIService:
    """Orchestrates the CSI data pipeline: collect → filter → PCA → FFT → classify."""

    # Class-level lookup of human-readable labels
    _PREDICTION_LABELS = ["empty", "person_walking", "person_sitting", "person_standing", "multiple_people"]

    def __init__(self, settings: Settings, collector: CSICollector | None = None) -> None:
        self._settings = settings
        self._collector = collector or SimulatedCSICollector(settings.csi_subcarrier_count)
        self._frame_buffer: list[CSIFrame] = []
        self._max_buffer = 256

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def collect_frames(self, count: int = 1) -> list[CSIFrame]:
        """Collect *count* CSI frames and append them to the internal buffer."""
        frames: list[CSIFrame] = []
        for _ in range(count):
            frame = self._collector.collect_frame()
            self._frame_buffer.append(frame)
            frames.append(frame)

        # Keep buffer bounded
        if len(self._frame_buffer) > self._max_buffer:
            self._frame_buffer = self._frame_buffer[-self._max_buffer:]

        return frames

    def process_pipeline(self, window: int | None = None) -> np.ndarray:
        """Run the full processing pipeline on the buffered frames.

        Returns the feature matrix (samples × features) ready for classification.
        """
        window = window or min(len(self._frame_buffer), 64)
        if window == 0:
            return np.array([])

        frames = self._frame_buffer[-window:]

        # Build a (window × subcarriers) amplitude matrix
        raw = np.array([f.subcarrier_amplitudes for f in frames])

        # Step 1: low-pass filter each subcarrier's time series
        filtered = np.apply_along_axis(lowpass_filter, axis=0, arr=raw)

        # Step 2: PCA dimensionality reduction
        n_comp = min(self._settings.csi_pca_components, filtered.shape[1], filtered.shape[0])
        reduced = pca_reduce(filtered, n_comp)

        # Step 3: FFT feature extraction per sample
        features = np.array([extract_fft_features(row, self._settings.csi_fft_window_size) for row in reduced])

        return features

    def predict(self) -> CSIPrediction:
        """Run the pipeline and return a classification prediction.

        In production this would invoke a trained CNN model.  For now we use
        a simple heuristic based on signal variance to demonstrate the pipeline.
        """
        features = self.process_pipeline()

        if features.size == 0:
            return CSIPrediction(timestamp=time.time(), prediction="unknown", confidence=0.0)

        # Heuristic classifier: variance in features indicates motion
        variance = float(np.var(features))
        if variance < 0.005:
            label, confidence = "empty", 0.85
        elif variance < 0.02:
            label, confidence = "person_sitting", 0.70
        elif variance < 0.05:
            label, confidence = "person_walking", 0.75
        else:
            label, confidence = "multiple_people", 0.60

        return CSIPrediction(
            timestamp=time.time(),
            prediction=label,
            confidence=confidence,
            zone="main",
        )

    def detect_presence(self) -> PresenceEvent:
        """High-level presence detection combining prediction with heuristics."""
        pred = self.predict()
        occupancy = 0 if pred.prediction == "empty" else (2 if pred.prediction == "multiple_people" else 1)
        return PresenceEvent(
            timestamp=pred.timestamp,
            zone=pred.zone,
            occupancy_count=occupancy,
            activity=pred.prediction,
            confidence=pred.confidence,
        )

    def reconstruct_layout(self) -> RoomLayout:
        """Build a simplified room layout from CSI multipath analysis.

        A full implementation would use time-of-flight and angle-of-arrival
        estimation from multiple transmitter/receiver pairs.  This stub
        returns a plausible placeholder layout derived from signal statistics.
        """
        if len(self._frame_buffer) < 10:
            return RoomLayout()

        amplitudes = np.array([f.subcarrier_amplitudes for f in self._frame_buffer[-64:]])
        mean_amp = amplitudes.mean(axis=0)

        # Derive room dimensions from signal spread (placeholder heuristic)
        width = float(5.0 + np.std(mean_amp) * 10)
        height = float(4.0 + np.std(mean_amp) * 8)

        walls = [
            WallSegment(x1=0, y1=0, x2=width, y2=0, confidence=0.9),
            WallSegment(x1=width, y1=0, x2=width, y2=height, confidence=0.9),
            WallSegment(x1=width, y1=height, x2=0, y2=height, confidence=0.9),
            WallSegment(x1=0, y1=height, x2=0, y2=0, confidence=0.9),
        ]

        zones = [
            RoomZone(id="zone-1", label="Main Area", center_x=width / 2, center_y=height / 2, radius_m=2.0),
        ]

        return RoomLayout(walls=walls, zones=zones, width_m=width, height_m=height)

    def get_buffer_size(self) -> int:
        return len(self._frame_buffer)
