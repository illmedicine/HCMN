import type { PinRequest, PinResult } from '../../types/index.js';
import { getAircraftNearby } from './providers/faa.provider.js';
import { getVesselsNearby } from './providers/ais.provider.js';
import { getISSPosition, getSatellitePasses } from './providers/nasa.provider.js';
import { getCrimeReports, buildCrimeHeatmap } from './providers/crime.provider.js';
import { getNearbyFeeds } from './providers/camera.provider.js';

/**
 * Aggregate data from all providers for a pinned location.
 * Fans out to all sources in parallel.
 */
export async function aggregateLocationData(pin: PinRequest): Promise<PinResult> {
  const { latitude, longitude, radiusKm = 50 } = pin;

  // Fan out to all providers in parallel
  const [aircraft, vessels, issPosition, satellites, crimes, nearbyFeeds] =
    await Promise.all([
      getAircraftNearby(latitude, longitude, radiusKm).catch(() => []),
      getVesselsNearby(latitude, longitude, radiusKm).catch(() => []),
      getISSPosition().catch(() => null),
      getSatellitePasses(latitude, longitude).catch(() => []),
      getCrimeReports(latitude, longitude, radiusKm).catch(() => []),
      Promise.resolve(getNearbyFeeds(latitude, longitude, radiusKm)),
    ]);

  // Build heatmaps from collected data
  const heatmaps = [];
  if (crimes.length > 0) {
    heatmaps.push(buildCrimeHeatmap(crimes));
  }

  return {
    pin: { latitude, longitude, label: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` },
    aircraft,
    vessels,
    satellites,
    issPosition,
    crimes,
    nearbyFeeds,
    heatmaps,
    timestamp: new Date().toISOString(),
  };
}
