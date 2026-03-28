import type { FastifyPluginAsync } from 'fastify';
import { aggregateLocationData } from './aggregator.service.js';
import type { PinRequest } from '../../types/index.js';

export const globeRoutes: FastifyPluginAsync = async (app) => {
  // Pin a location and get aggregated intelligence
  app.post('/pin', async (request, reply) => {
    const body = request.body as PinRequest;

    if (body.latitude === undefined || body.longitude === undefined) {
      return reply.status(400).send({ error: 'latitude and longitude are required' });
    }

    if (body.latitude < -90 || body.latitude > 90 || body.longitude < -180 || body.longitude > 180) {
      return reply.status(400).send({ error: 'Invalid coordinates' });
    }

    const result = await aggregateLocationData({
      latitude: body.latitude,
      longitude: body.longitude,
      radiusKm: body.radiusKm || 50,
    });

    return result;
  });

  // Quick ISS position endpoint
  app.get('/iss', async () => {
    const { getISSPosition } = await import('./providers/nasa.provider.js');
    const pos = await getISSPosition();
    return pos || { error: 'ISS position unavailable' };
  });

  // Get aircraft near coordinates (lightweight)
  app.get('/aircraft', async (request) => {
    const { lat, lon, radius } = request.query as {
      lat?: string;
      lon?: string;
      radius?: string;
    };
    const { getAircraftNearby } = await import('./providers/faa.provider.js');
    return getAircraftNearby(
      parseFloat(lat || '0'),
      parseFloat(lon || '0'),
      parseFloat(radius || '100')
    );
  });

  // Get vessels near coordinates (lightweight)
  app.get('/vessels', async (request) => {
    const { lat, lon, radius } = request.query as {
      lat?: string;
      lon?: string;
      radius?: string;
    };
    const { getVesselsNearby } = await import('./providers/ais.provider.js');
    return getVesselsNearby(
      parseFloat(lat || '0'),
      parseFloat(lon || '0'),
      parseFloat(radius || '50')
    );
  });

  // Get crime reports near coordinates
  app.get('/crimes', async (request) => {
    const { lat, lon, radius } = request.query as {
      lat?: string;
      lon?: string;
      radius?: string;
    };
    const { getCrimeReports } = await import('./providers/crime.provider.js');
    return getCrimeReports(
      parseFloat(lat || '0'),
      parseFloat(lon || '0'),
      parseFloat(radius || '10')
    );
  });
};
