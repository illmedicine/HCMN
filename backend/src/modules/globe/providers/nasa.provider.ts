import type { SatellitePass, ISSPosition } from '../../../types/index.js';
import { config } from '../../../config.js';

/**
 * Fetch ISS current position from open-notify.org
 */
export async function getISSPosition(): Promise<ISSPosition | null> {
  try {
    const res = await fetch('http://api.open-notify.org/iss-now.json', {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return simulateISSPosition();

    const data = (await res.json()) as {
      iss_position: { latitude: string; longitude: string };
      timestamp: number;
    };

    return {
      latitude: parseFloat(data.iss_position.latitude),
      longitude: parseFloat(data.iss_position.longitude),
      altitude: 408, // ISS orbits at ~408km
      velocity: 27600, // ~27,600 km/h
      timestamp: new Date(data.timestamp * 1000).toISOString(),
    };
  } catch {
    return simulateISSPosition();
  }
}

/**
 * Fetch satellite visual passes over a location using N2YO API.
 */
export async function getSatellitePasses(
  lat: number,
  lon: number,
  days: number = 5
): Promise<SatellitePass[]> {
  if (config.n2yoApiKey) {
    try {
      return await fetchN2YOPasses(lat, lon, days);
    } catch (err) {
      console.warn('N2YO API error:', (err as Error).message);
    }
  }

  return generateSimulatedPasses(lat, lon);
}

async function fetchN2YOPasses(
  lat: number,
  lon: number,
  days: number
): Promise<SatellitePass[]> {
  // Fetch ISS (NORAD ID 25544) visual passes
  const url = `https://api.n2yo.com/rest/v1/satellite/visualpasses/25544/${lat}/${lon}/0/${days}/300/&apiKey=${config.n2yoApiKey}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    passes?: Array<{
      startUTC: number;
      endUTC: number;
      maxEl: number;
      startAz: number;
    }>;
    info?: { satname: string; satid: number };
  };

  return (data.passes || []).map((p) => ({
    satName: data.info?.satname || 'ISS',
    satId: data.info?.satid || 25544,
    startTime: new Date(p.startUTC * 1000).toISOString(),
    endTime: new Date(p.endUTC * 1000).toISOString(),
    maxElevation: p.maxEl,
    startAzimuth: p.startAz,
  }));
}

function generateSimulatedPasses(lat: number, lon: number): SatellitePass[] {
  const satellites = [
    { name: 'ISS (ZARYA)', id: 25544 },
    { name: 'STARLINK-1234', id: 44713 },
    { name: 'STARLINK-5678', id: 48274 },
    { name: 'GOES 16', id: 41866 },
    { name: 'LANDSAT 9', id: 49260 },
  ];

  const passes: SatellitePass[] = [];
  const now = Date.now();

  for (const sat of satellites) {
    const passCount = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < passCount; i++) {
      const startOffset = Math.floor(Math.random() * 86400000 * 3); // within 3 days
      const duration = Math.floor(Math.random() * 300 + 120) * 1000; // 2-7 minutes

      passes.push({
        satName: sat.name,
        satId: sat.id,
        startTime: new Date(now + startOffset).toISOString(),
        endTime: new Date(now + startOffset + duration).toISOString(),
        maxElevation: Math.floor(Math.random() * 80 + 10),
        startAzimuth: Math.floor(Math.random() * 360),
      });
    }
  }

  return passes.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

function simulateISSPosition(): ISSPosition {
  // ISS moves fast; simulate a position
  const t = Date.now() / 1000;
  return {
    latitude: 51.5 * Math.sin(t / 2760),
    longitude: ((t / 23) % 360) - 180,
    altitude: 408,
    velocity: 27600,
    timestamp: new Date().toISOString(),
  };
}
