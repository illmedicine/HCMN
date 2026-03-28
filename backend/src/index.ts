import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { feedRoutes } from './modules/feeds/feed.controller.js';
import { chatRoutes } from './modules/chat/chat.controller.js';
import { globeRoutes } from './modules/globe/location.controller.js';
import { sensingRoutes } from './modules/wifi-sensing/sensing.controller.js';

const app = Fastify({ logger: true });

// Register plugins
await app.register(cors, {
  origin: config.cors.origins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
});

await app.register(websocket);

// Health check
app.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// Register module routes
await app.register(feedRoutes, { prefix: '/api/feeds' });
await app.register(chatRoutes, { prefix: '/api/chat' });
await app.register(globeRoutes, { prefix: '/api/globe' });
await app.register(sensingRoutes, { prefix: '/api/sensing' });

// Start server
try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`HCMN Backend running on http://${config.host}:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

export default app;
