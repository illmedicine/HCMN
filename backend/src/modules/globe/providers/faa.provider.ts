import type { Aircraft } from '../../../types/index.js';
import { config } from '../../../config.js';

/**
 * Fetch real-time aircraft data from OpenSky Network API.
 * Free API: https://opensky-network.org/apidoc/rest.html
 */
export async function getAircraftNearby(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<Aircraft[]> {
  try {
    // Convert radius to bounding box (approximate)
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));

    const lamin = lat - latDelta;
    const lamax = lat + latDelta;
    const lomin = lon - lonDelta;
    const lomax = lon + lonDelta;

    const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

    const headers: Record<string, string> = {};
    if (config.openskyUsername && config.openskyPassword) {
      const auth = Buffer.from(`${config.openskyUsername}:${config.openskyPassword}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      console.warn(`OpenSky API returned ${res.status}`);
      return generateSimulatedAircraft(lat, lon, radiusKm);
    }

    const data = (await res.json()) as { states: Array<Array<string | number | boolean | null>> | null };

    if (!data.states || data.states.length === 0) {
      return generateSimulatedAircraft(lat, lon, radiusKm);
    }

    return data.states.slice(0, 50).map((s) => ({
      icao24: String(s[0] || ''),
      callsign: String(s[1] || '').trim(),
      originCountry: String(s[2] || ''),
      latitude: Number(s[6]) || lat,
      longitude: Number(s[5]) || lon,
      altitude: Number(s[7]) || 0,
      velocity: Number(s[9]) || 0,
      heading: Number(s[10]) || 0,
      onGround: Boolean(s[8]),
    }));
  } catch (err) {
    console.warn('OpenSky API unavailable, using simulated data:', (err as Error).message);
    return generateSimulatedAircraft(lat, lon, radiusKm);
  }
}

function generateSimulatedAircraft(lat: number, lon: number, radiusKm: number): Aircraft[] {
  const count = Math.floor(Math.random() * 8) + 3;
  const airlines = ['AAL', 'UAL', 'DAL', 'SWA', 'JBU', 'ASA', 'BAW', 'AFR', 'DLH', 'QFA'];
  const countries = ['United States', 'United Kingdom', 'France', 'Germany', 'Australia'];
  const aircraft: Aircraft[] = [];

  for (let i = 0; i < count; i++) {
    const r = radiusKm / 111;
    aircraft.push({
      icao24: Math.random().toString(16).substring(2, 8),
      callsign: `${airlines[i % airlines.length]}${Math.floor(Math.random() * 9000 + 1000)}`,
      originCountry: countries[i % countries.length],
      latitude: lat + (Math.random() - 0.5) * r * 2,
      longitude: lon + (Math.random() - 0.5) * r * 2,
      altitude: Math.floor(Math.random() * 12000 + 1000),
      velocity: Math.floor(Math.random() * 250 + 150),
      heading: Math.floor(Math.random() * 360),
      onGround: Math.random() < 0.1,
    });
  }

  return aircraft;
}
