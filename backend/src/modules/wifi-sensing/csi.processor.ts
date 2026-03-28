import type { CSIFrame } from '../../types/index.js';

const SUBCARRIER_COUNT = 64;

/**
 * CSI Signal Processing Pipeline
 * Steps: Low-pass Filter → PCA → FFT Feature Extraction
 */

/**
 * Low-pass filter on CSI subcarrier amplitudes.
 * Removes high-frequency noise while preserving presence signals (< 1Hz).
 */
export function lowPassFilter(
  frames: CSIFrame[],
  cutoffRatio: number = 0.1
): number[][] {
  if (frames.length === 0) return [];

  const matrix = frames.map((f) => f.subcarrierAmplitudes);
  const filtered: number[][] = [];

  for (let sc = 0; sc < SUBCARRIER_COUNT; sc++) {
    const signal = matrix.map((row) => row[sc]);
    const filteredSignal = applyFrequencyFilter(signal, cutoffRatio);
    for (let t = 0; t < frames.length; t++) {
      if (!filtered[t]) filtered[t] = new Array(SUBCARRIER_COUNT).fill(0);
      filtered[t][sc] = filteredSignal[t];
    }
  }

  return filtered;
}

function applyFrequencyFilter(signal: number[], cutoffRatio: number): number[] {
  // Simple moving average as low-pass filter
  const windowSize = Math.max(3, Math.floor(signal.length * cutoffRatio));
  const result: number[] = [];

  for (let i = 0; i < signal.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - windowSize); j <= Math.min(signal.length - 1, i + windowSize); j++) {
      sum += signal[j];
      count++;
    }
    result.push(sum / count);
  }

  return result;
}

/**
 * Principal Component Analysis (PCA) for dimensionality reduction.
 * Reduces subcarrier dimensions to principal components.
 */
export function performPCA(
  data: number[][],
  numComponents: number = 10
): number[][] {
  if (data.length === 0) return [];

  const cols = data[0].length;
  const means = new Array(cols).fill(0);

  // Calculate means
  for (const row of data) {
    for (let j = 0; j < cols; j++) {
      means[j] += row[j] / data.length;
    }
  }

  // Center data
  const centered = data.map((row) => row.map((v, j) => v - means[j]));

  // Simplified PCA using power iteration for top components
  const components: number[][] = [];

  for (let comp = 0; comp < Math.min(numComponents, cols); comp++) {
    let vector = Array.from({ length: cols }, () => Math.random());
    const norm = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    vector = vector.map((v) => v / norm);

    // Power iteration (10 iterations)
    for (let iter = 0; iter < 10; iter++) {
      const projected = centered.map((row) =>
        row.reduce((s, v, j) => s + v * vector[j], 0)
      );

      const newVector = new Array(cols).fill(0);
      for (let i = 0; i < centered.length; i++) {
        for (let j = 0; j < cols; j++) {
          newVector[j] += centered[i][j] * projected[i];
        }
      }

      const newNorm = Math.sqrt(newVector.reduce((s, v) => s + v * v, 0));
      vector = newVector.map((v) => v / (newNorm || 1));
    }

    // Project data onto this component
    const projection = centered.map((row) =>
      row.reduce((s, v, j) => s + v * vector[j], 0)
    );

    components.push(projection);

    // Deflate: remove this component from centered data
    for (let i = 0; i < centered.length; i++) {
      for (let j = 0; j < cols; j++) {
        centered[i][j] -= projection[i] * vector[j];
      }
    }
  }

  // Transpose: return [timeSteps][numComponents]
  const result: number[][] = [];
  for (let t = 0; t < data.length; t++) {
    result.push(components.map((c) => c[t]));
  }

  return result;
}

/**
 * FFT-based feature extraction.
 * Extracts frequency-domain features from PCA components.
 */
export function extractFFTFeatures(
  pcaData: number[][],
  windowSize: number = 256
): number[] {
  if (pcaData.length === 0) return [];

  const numComponents = pcaData[0]?.length || 0;
  const features: number[] = [];

  for (let comp = 0; comp < numComponents; comp++) {
    const signal = pcaData.map((row) => row[comp]);

    // Zero-pad or truncate to window size
    const padded = new Array(windowSize).fill(0);
    for (let i = 0; i < Math.min(signal.length, windowSize); i++) {
      padded[i] = signal[i];
    }

    // Compute DFT magnitude (simplified)
    const magnitudes: number[] = [];
    const halfSize = Math.floor(windowSize / 2);

    for (let k = 0; k < halfSize; k++) {
      let realPart = 0;
      let imagPart = 0;
      for (let n = 0; n < windowSize; n++) {
        const angle = (2 * Math.PI * k * n) / windowSize;
        realPart += padded[n] * Math.cos(angle);
        imagPart -= padded[n] * Math.sin(angle);
      }
      magnitudes.push(Math.sqrt(realPart * realPart + imagPart * imagPart) / windowSize);
    }

    // Extract spectral features for this component
    const maxMag = Math.max(...magnitudes, 1e-10);
    const meanMag = magnitudes.reduce((a, b) => a + b, 0) / magnitudes.length;
    const variance =
      magnitudes.reduce((s, m) => s + (m - meanMag) ** 2, 0) / magnitudes.length;

    features.push(maxMag, meanMag, variance);
  }

  return features;
}
