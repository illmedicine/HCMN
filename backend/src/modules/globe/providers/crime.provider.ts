import type { CrimeReport, HeatmapLayer, HeatmapPoint } from '../../../types/index.js';
import { config } from '../../../config.js';

/**
 * Fetch crime reports near a location.
 * Tries real APIs first, falls back to simulated data.
 */
export async function getCrimeReports(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<CrimeReport[]> {
  // Try CrimeMapping / SpotCrime if key is available
  if (config.spotcrimeApiKey) {
    try {
      return await fetchSpotCrime(lat, lon, radiusKm);
    } catch (err) {
      console.warn('SpotCrime API error:', (err as Error).message);
    }
  }

  return generateSimulatedCrimeReports(lat, lon, radiusKm);
}

async function fetchSpotCrime(
  lat: number,
  lon: number,
  radiusKm: number
): Promise<CrimeReport[]> {
  const url = `https://api.spotcrime.com/crimes.json?lat=${lat}&lon=${lon}&radius=${radiusKm * 0.621371}&key=${config.spotcrimeApiKey}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return [];

  const data = (await res.json()) as {
    crimes?: Array<{
      cdid: string;
      type: string;
      description: string;
      lat: number;
      lon: number;
      date: string;
      address: string;
    }>;
  };

  return (data.crimes || []).slice(0, 50).map((c) => ({
    id: String(c.cdid),
    type: c.type,
    description: c.description || c.type,
    latitude: c.lat,
    longitude: c.lon,
    date: c.date,
    address: c.address,
  }));
}

function generateSimulatedCrimeReports(
  lat: number,
  lon: number,
  radiusKm: number
): CrimeReport[] {
  const crimeTypes = [
    'Theft', 'Burglary', 'Assault', 'Vandalism', 'Robbery',
    'Vehicle Break-in', 'Fraud', 'Disturbance', 'Trespassing', 'DUI'
  ];

  const count = Math.floor(Math.random() * 15) + 5;
  const reports: CrimeReport[] = [];

  for (let i = 0; i < count; i++) {
    const r = radiusKm / 111;
    const crimeType = crimeTypes[Math.floor(Math.random() * crimeTypes.length)];
    const daysAgo = Math.floor(Math.random() * 7);
    const date = new Date(Date.now() - daysAgo * 86400000);

    reports.push({
      id: `crime-${Date.now()}-${i}`,
      type: crimeType,
      description: `${crimeType} reported in the area`,
      latitude: lat + (Math.random() - 0.5) * r * 2,
      longitude: lon + (Math.random() - 0.5) * r * 2,
      date: date.toISOString(),
      address: `${Math.floor(Math.random() * 9999)} ${['Main St', 'Broadway', '5th Ave', 'Oak Lane', 'Park Rd'][i % 5]}`,
    });
  }

  return reports.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * Generate a crime heatmap layer from reports.
 */
export function buildCrimeHeatmap(crimes: CrimeReport[]): HeatmapLayer {
  const points: HeatmapPoint[] = crimes.map((c) => ({
    latitude: c.latitude,
    longitude: c.longitude,
    weight: getWeightByType(c.type),
  }));

  return {
    name: 'Crime Reports',
    type: 'crime',
    points,
  };
}

function getWeightByType(type: string): number {
  const weights: Record<string, number> = {
    Assault: 1.0,
    Robbery: 0.9,
    Burglary: 0.7,
    'Vehicle Break-in': 0.6,
    Theft: 0.5,
    Vandalism: 0.4,
    DUI: 0.5,
    Fraud: 0.3,
    Disturbance: 0.3,
    Trespassing: 0.2,
  };
  return weights[type] || 0.5;
}
