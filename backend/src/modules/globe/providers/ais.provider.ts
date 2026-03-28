import type { Vessel } from '../../../types/index.js';
import { config } from '../../../config.js';

/**
 * Fetch vessel data from AIS/MarineTraffic sources.
 * Falls back to simulated data when API key is not configured.
 */
export async function getVesselsNearby(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<Vessel[]> {
  if (config.marineTrafficApiKey) {
    try {
      return await fetchMarineTraffic(lat, lon, radiusKm);
    } catch (err) {
      console.warn('MarineTraffic API error:', (err as Error).message);
    }
  }

  return generateSimulatedVessels(lat, lon, radiusKm);
}

async function fetchMarineTraffic(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<Vessel[]> {
  const latDelta = radiusKm / 111;
  const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

  const url = `https://services.marinetraffic.com/api/exportvessels/v:8/${config.marineTrafficApiKey}/MINLAT:${lat - latDelta}/MAXLAT:${lat + latDelta}/MINLON:${lon - lonDelta}/MAXLON:${lon + lonDelta}/protocol:jsono`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];

  const data = (await res.json()) as Array<Record<string, string>>;

  return data.slice(0, 30).map((v) => ({
    mmsi: v.MMSI || '',
    name: v.SHIPNAME || 'Unknown Vessel',
    shipType: v.SHIPTYPE || 'Cargo',
    latitude: parseFloat(v.LAT || '0'),
    longitude: parseFloat(v.LON || '0'),
    speed: parseFloat(v.SPEED || '0') / 10,
    heading: parseFloat(v.HEADING || '0'),
    destination: v.DESTINATION,
  }));
}

function generateSimulatedVessels(lat: number, lon: number, radiusKm: number): Vessel[] {
  // Only generate vessels if near water (rough heuristic - coastal or oceanic coordinates)
  const isCoastal = isNearCoast(lat, lon);
  if (!isCoastal) return [];

  const count = Math.floor(Math.random() * 6) + 2;
  const shipTypes = ['Cargo', 'Tanker', 'Container Ship', 'Fishing', 'Passenger', 'Tug', 'Yacht'];
  const names = ['MSC GENEVA', 'EVER GIVEN', 'MAERSK STAR', 'PACIFIC VOYAGER', 'OCEAN LIBERTY', 'NORDIC WIND', 'SEA BREEZE'];
  const vessels: Vessel[] = [];

  for (let i = 0; i < count; i++) {
    const r = radiusKm / 111;
    vessels.push({
      mmsi: String(200000000 + Math.floor(Math.random() * 99999999)),
      name: names[i % names.length],
      shipType: shipTypes[i % shipTypes.length],
      latitude: lat + (Math.random() - 0.5) * r,
      longitude: lon + (Math.random() - 0.5) * r,
      speed: Math.floor(Math.random() * 20 + 2),
      heading: Math.floor(Math.random() * 360),
      destination: ['Rotterdam', 'Shanghai', 'Singapore', 'New York', 'Dubai'][i % 5],
    });
  }

  return vessels;
}

function isNearCoast(lat: number, lon: number): boolean {
  // Simplified heuristic for demo: major coastal cities/regions
  const coastalRegions = [
    { lat: 40.7, lon: -74.0, r: 2 }, // NYC
    { lat: 25.8, lon: -80.2, r: 2 }, // Miami
    { lat: 37.8, lon: -122.4, r: 2 }, // SF
    { lat: 33.7, lon: -118.3, r: 2 }, // LA
    { lat: 51.5, lon: 0.1, r: 3 },    // London
    { lat: 35.7, lon: 139.7, r: 2 },  // Tokyo
    { lat: 1.3, lon: 103.8, r: 2 },   // Singapore
    { lat: 25.2, lon: 55.3, r: 2 },   // Dubai
    { lat: 22.3, lon: 114.2, r: 2 },  // Hong Kong
  ];

  return coastalRegions.some(
    (c) => Math.abs(lat - c.lat) < c.r && Math.abs(lon - c.lon) < c.r
  );
}
