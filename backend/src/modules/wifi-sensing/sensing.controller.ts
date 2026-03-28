import type { FastifyPluginAsync } from 'fastify';
import { collectFrames } from './csi.collector.js';
import {
  bufferFrames,
  getBufferSize,
  predict,
  detectPresence,
  reconstructLayout,
} from './presence.classifier.js';
import { getRouterInfo, testRouterConnection } from './router.adapter.js';
import {
  startTraining,
  collectTrainingData,
  finishTraining,
  getSession,
} from './training.service.js';

export const sensingRoutes: FastifyPluginAsync = async (app) => {
  // Collect CSI frames
  app.post('/collect', async (request) => {
    const { count } = request.query as { count?: string };
    const frameCount = parseInt(count || '10', 10);
    const frames = await collectFrames(Math.min(frameCount, 100));
    const bufferSize = bufferFrames(frames);
    return {
      collected: frames.length,
      bufferSize,
      timestamp: new Date().toISOString(),
    };
  });

  // Run pipeline and predict presence
  app.get('/predict', async () => {
    return predict();
  });

  // Detect presence with full event details
  app.get('/presence', async () => {
    return detectPresence();
  });

  // Reconstruct room layout
  app.get('/layout', async () => {
    return reconstructLayout();
  });

  // Get current buffer size
  app.get('/buffer/size', async () => {
    return { size: getBufferSize() };
  });

  // Get router info
  app.get('/router', async () => {
    return getRouterInfo();
  });

  // Test router connection
  app.post('/router/test', async (request) => {
    const { url, username, password } = request.body as {
      url: string;
      username: string;
      password: string;
    };
    return testRouterConnection(url, username, password);
  });

  // Start training session
  app.post('/training/start', async (request) => {
    const { zones } = request.body as { zones: string[] };
    return startTraining(zones || ['main_room']);
  });

  // Collect training data
  app.post('/training/:sessionId/collect', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { zone, count } = request.body as { zone: string; count?: number };
    const result = await collectTrainingData(sessionId, zone, count || 50);
    if (!result) {
      return reply.status(404).send({ error: 'Training session not found' });
    }
    return result;
  });

  // Finish training
  app.post('/training/:sessionId/finish', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const result = finishTraining(sessionId);
    if (!result) {
      return reply.status(404).send({ error: 'Training session not found' });
    }
    return result;
  });

  // Get training session status
  app.get('/training/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const result = getSession(sessionId);
    if (!result) {
      return reply.status(404).send({ error: 'Training session not found' });
    }
    return result;
  });
};
