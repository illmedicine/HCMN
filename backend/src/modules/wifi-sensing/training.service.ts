import type { TrainingSession } from '../../types/index.js';
import { collectFrames } from './csi.collector.js';
import { bufferFrames } from './presence.classifier.js';

const sessions: Map<string, TrainingSession> = new Map();

/**
 * Start a new training session.
 * Collects labeled CSI data for training the presence classifier.
 */
export function startTraining(zones: string[]): TrainingSession {
  const session: TrainingSession = {
    id: crypto.randomUUID(),
    status: 'collecting',
    framesCollected: 0,
    zones,
    startedAt: new Date().toISOString(),
  };

  sessions.set(session.id, session);
  return session;
}

/**
 * Collect training frames for a specific zone.
 */
export async function collectTrainingData(
  sessionId: string,
  zone: string,
  frameCount: number = 50
): Promise<TrainingSession | null> {
  const session = sessions.get(sessionId);
  if (!session) return null;

  const frames = await collectFrames(frameCount);
  bufferFrames(frames);

  session.framesCollected += frames.length;

  return session;
}

/**
 * Finalize training session.
 * In a real implementation, this would train the TensorFlow.js model.
 */
export function finishTraining(sessionId: string): TrainingSession | null {
  const session = sessions.get(sessionId);
  if (!session) return null;

  session.status = 'training';

  // Simulate training (in real implementation: train TF.js CNN model)
  setTimeout(() => {
    session.status = 'complete';
    session.accuracy = 0.78 + Math.random() * 0.15; // Simulated accuracy
  }, 2000);

  return session;
}

export function getSession(sessionId: string): TrainingSession | null {
  return sessions.get(sessionId) || null;
}
