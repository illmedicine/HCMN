import type { CSIFrame, PresencePrediction, PresenceEvent, RoomLayout } from '../../types/index.js';
import { lowPassFilter, performPCA, extractFFTFeatures } from './csi.processor.js';

// Circular buffer for CSI frames
const frameBuffer: CSIFrame[] = [];
const MAX_BUFFER_SIZE = 512;

/**
 * Add frames to the circular buffer.
 */
export function bufferFrames(frames: CSIFrame[]): number {
  frameBuffer.push(...frames);
  if (frameBuffer.length > MAX_BUFFER_SIZE) {
    frameBuffer.splice(0, frameBuffer.length - MAX_BUFFER_SIZE);
  }
  return frameBuffer.length;
}

export function getBufferSize(): number {
  return frameBuffer.length;
}

/**
 * Run the full CSI processing pipeline and classify presence.
 */
export function predict(): PresencePrediction {
  if (frameBuffer.length < 10) {
    return {
      timestamp: new Date().toISOString(),
      prediction: 'empty',
      confidence: 0.5,
      zone: 'unknown',
    };
  }

  // Run pipeline: Filter → PCA → FFT
  const window = frameBuffer.slice(-Math.min(frameBuffer.length, 256));
  const filtered = lowPassFilter(window);
  const pcaResult = performPCA(filtered, 10);
  const features = extractFFTFeatures(pcaResult);

  // Classify based on feature statistics
  return classify(features);
}

/**
 * Heuristic classifier (placeholder for trained CNN model).
 * Uses feature variance to differentiate presence states.
 */
function classify(features: number[]): PresencePrediction {
  if (features.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      prediction: 'empty',
      confidence: 0.5,
      zone: 'unknown',
    };
  }

  // Calculate overall feature variance
  const mean = features.reduce((s, f) => s + f, 0) / features.length;
  const variance = features.reduce((s, f) => s + (f - mean) ** 2, 0) / features.length;

  let prediction: PresencePrediction['prediction'];
  let confidence: number;

  if (variance < 0.005) {
    prediction = 'empty';
    confidence = 0.85;
  } else if (variance < 0.02) {
    prediction = 'person_sitting';
    confidence = 0.70;
  } else if (variance < 0.05) {
    prediction = 'person_walking';
    confidence = 0.75;
  } else {
    prediction = 'multiple_people';
    confidence = 0.60;
  }

  return {
    timestamp: new Date().toISOString(),
    prediction,
    confidence,
    zone: 'main_room',
  };
}

/**
 * Detect presence and generate an event.
 */
export function detectPresence(): PresenceEvent {
  const pred = predict();

  const occupancy: Record<string, number> = {
    empty: 0,
    person_sitting: 1,
    person_walking: 1,
    multiple_people: 2,
  };

  return {
    timestamp: pred.timestamp,
    zone: pred.zone || 'main_room',
    occupancyCount: occupancy[pred.prediction] || 0,
    activity: pred.prediction.replace(/_/g, ' '),
    confidence: pred.confidence,
  };
}

/**
 * Reconstruct room layout from CSI signal patterns.
 * Uses signal attenuation statistics to estimate boundaries.
 */
export function reconstructLayout(): RoomLayout {
  if (frameBuffer.length < 20) {
    return defaultLayout();
  }

  // Analyze amplitude statistics to estimate room dimensions
  const recentFrames = frameBuffer.slice(-50);
  const avgAmplitudes = new Array(recentFrames[0].subcarrierAmplitudes.length).fill(0);

  for (const frame of recentFrames) {
    for (let i = 0; i < frame.subcarrierAmplitudes.length; i++) {
      avgAmplitudes[i] += frame.subcarrierAmplitudes[i] / recentFrames.length;
    }
  }

  // Derive room dimensions from signal statistics (heuristic)
  const maxAmp = Math.max(...avgAmplitudes);
  const minAmp = Math.min(...avgAmplitudes);
  const range = maxAmp - minAmp;

  const widthM = Math.max(3, Math.min(15, range * 0.8));
  const heightM = Math.max(2.5, Math.min(12, range * 0.6));

  return {
    widthM,
    heightM,
    walls: [
      { x1: 0, y1: 0, x2: widthM, y2: 0, confidence: 0.9 },
      { x1: widthM, y1: 0, x2: widthM, y2: heightM, confidence: 0.9 },
      { x1: widthM, y1: heightM, x2: 0, y2: heightM, confidence: 0.9 },
      { x1: 0, y1: heightM, x2: 0, y2: 0, confidence: 0.9 },
    ],
    zones: [
      { id: 'zone-1', label: 'Living Area', centerX: widthM * 0.3, centerY: heightM * 0.5, radiusM: widthM * 0.2 },
      { id: 'zone-2', label: 'Kitchen Area', centerX: widthM * 0.7, centerY: heightM * 0.3, radiusM: widthM * 0.15 },
      { id: 'zone-3', label: 'Hallway', centerX: widthM * 0.5, centerY: heightM * 0.8, radiusM: widthM * 0.1 },
    ],
  };
}

function defaultLayout(): RoomLayout {
  return {
    widthM: 8,
    heightM: 6,
    walls: [
      { x1: 0, y1: 0, x2: 8, y2: 0, confidence: 0.5 },
      { x1: 8, y1: 0, x2: 8, y2: 6, confidence: 0.5 },
      { x1: 8, y1: 6, x2: 0, y2: 6, confidence: 0.5 },
      { x1: 0, y1: 6, x2: 0, y2: 0, confidence: 0.5 },
    ],
    zones: [
      { id: 'zone-1', label: 'Main Room', centerX: 4, centerY: 3, radiusM: 2 },
    ],
  };
}
