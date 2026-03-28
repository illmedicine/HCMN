import type { CameraFeed } from '../../../types/index.js';
import { getFeedsNearLocation } from '../../feeds/feed.service.js';

/**
 * Find camera feeds near a pinned location.
 */
export function getNearbyFeeds(
  lat: number,
  lon: number,
  radiusKm: number
): CameraFeed[] {
  return getFeedsNearLocation(lat, lon, radiusKm);
}
