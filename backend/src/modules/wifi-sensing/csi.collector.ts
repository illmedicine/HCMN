import type { CSIFrame } from '../../types/index.js';
import { config } from '../../config.js';

const SUBCARRIER_COUNT = 64;

/**
 * Collects CSI frames from the configured device or simulator.
 */
export async function collectFrames(count: number): Promise<CSIFrame[]> {
  if (config.csiDeviceType === 'simulated') {
    return simulateFrames(count);
  }

  // Real device collection placeholder
  // For ESP32, Nexmon, or Intel 5300 — would use serial or socket connection
  return simulateFrames(count);
}

/**
 * Simulated CSI data generator for development and testing.
 * Generates realistic-looking CSI frames with time-varying perturbations.
 */
function simulateFrames(count: number): CSIFrame[] {
  const frames: CSIFrame[] = [];
  const now = Date.now();
  const baseAmplitudes = generateBaseProfile();

  for (let i = 0; i < count; i++) {
    const t = (now + i * 50) / 1000; // 50ms intervals
    const perturbation = generatePerturbation(t);

    const amplitudes = baseAmplitudes.map(
      (a, idx) => a + perturbation[idx]
    );

    const phases = Array.from({ length: SUBCARRIER_COUNT }, (_, idx) =>
      Math.sin(t * 0.3 + idx * 0.1) * Math.PI * (0.5 + perturbation[idx] * 0.1)
    );

    frames.push({
      timestamp: new Date(now + i * 50).toISOString(),
      macAddress: '00:11:22:33:44:55',
      rssi: -45 + Math.random() * 10,
      subcarrierAmplitudes: amplitudes,
      subcarrierPhases: phases,
    });
  }

  return frames;
}

function generateBaseProfile(): number[] {
  // Simulate an empty room base amplitude profile
  return Array.from({ length: SUBCARRIER_COUNT }, (_, i) => {
    const center = SUBCARRIER_COUNT / 2;
    const dist = Math.abs(i - center) / center;
    return 20 - dist * 8 + Math.random() * 0.5;
  });
}

function generatePerturbation(t: number): number[] {
  // Simulate presence: breathing (0.3Hz) and micro-movement (0.1Hz)
  return Array.from({ length: SUBCARRIER_COUNT }, (_, i) => {
    const breathing = Math.sin(2 * Math.PI * 0.3 * t + i * 0.2) * 1.5;
    const movement = Math.sin(2 * Math.PI * 0.05 * t + i * 0.5) * 0.8;
    const noise = (Math.random() - 0.5) * 0.3;
    return breathing + movement + noise;
  });
}
