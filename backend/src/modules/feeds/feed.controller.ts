import type { FastifyPluginAsync } from 'fastify';
import {
  getAllFeeds,
  getFeedById,
  addFeed,
  removeFeed,
  searchFeeds,
  getFeedsNearLocation,
} from './feed.service.js';
import type { CameraFeed, CameraSource } from '../../types/index.js';

export const feedRoutes: FastifyPluginAsync = async (app) => {
  // List all feeds, optionally filter by source
  app.get('/', async (request) => {
    const { source, q } = request.query as { source?: CameraSource; q?: string };
    if (q) {
      return searchFeeds(q);
    }
    return getAllFeeds(source);
  });

  // Get a single feed
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const feed = getFeedById(id);
    if (!feed) {
      return reply.status(404).send({ error: 'Feed not found' });
    }
    return feed;
  });

  // Register a new feed
  app.post('/', async (request, reply) => {
    const body = request.body as CameraFeed;
    if (!body.id || !body.name || !body.streamUrl) {
      return reply.status(400).send({ error: 'id, name, and streamUrl are required' });
    }
    const feed = addFeed(body);
    return reply.status(201).send(feed);
  });

  // Delete a feed
  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = removeFeed(id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Feed not found' });
    }
    return { deleted: true };
  });

  // Find feeds near a location
  app.get('/nearby', async (request) => {
    const { lat, lon, radius } = request.query as {
      lat?: string;
      lon?: string;
      radius?: string;
    };
    const latitude = parseFloat(lat || '0');
    const longitude = parseFloat(lon || '0');
    const radiusKm = parseFloat(radius || '50');
    return getFeedsNearLocation(latitude, longitude, radiusKm);
  });
};
