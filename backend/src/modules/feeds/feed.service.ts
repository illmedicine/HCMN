import type { CameraFeed, CameraSource, GeoPoint } from '../../types/index.js';
import { config } from '../../config.js';

// In-memory feed store
const feeds: Map<string, CameraFeed> = new Map();

// Initialize with demo feeds
function initDemoFeeds(): void {
  const demoFeeds: CameraFeed[] = [
    {
      id: 'nyc-times-square',
      name: 'NYC Times Square',
      source: 'earthcam',
      streamUrl: 'https://hddn1.earthcam.com/fecnetwork/timessquare.flv/playlist.m3u8',
      hlsUrl: 'https://hddn1.earthcam.com/fecnetwork/timessquare.flv/playlist.m3u8',
      location: { latitude: 40.758, longitude: -73.9855, label: 'Times Square, NYC' },
      thumbnailUrl: '',
      isLive: true,
      description: 'Live view of Times Square, New York City',
      city: 'New York',
      tags: ['tourist', 'urban', 'traffic'],
    },
    {
      id: 'chicago-lakeshore',
      name: 'Chicago Lake Shore Drive',
      source: 'dot_traffic',
      streamUrl: 'https://chicagodot.stream/lakeshore-north.m3u8',
      hlsUrl: 'https://chicagodot.stream/lakeshore-north.m3u8',
      location: { latitude: 41.8827, longitude: -87.6233, label: 'Lake Shore Drive, Chicago' },
      thumbnailUrl: '',
      isLive: true,
      description: 'Traffic camera on Lake Shore Drive',
      city: 'Chicago',
      tags: ['traffic', 'highway'],
    },
    {
      id: 'miami-beach',
      name: 'Miami Beach Cam',
      source: 'weather',
      streamUrl: 'https://miamibeach.stream/south-beach.m3u8',
      hlsUrl: 'https://miamibeach.stream/south-beach.m3u8',
      location: { latitude: 25.7617, longitude: -80.1918, label: 'South Beach, Miami' },
      thumbnailUrl: '',
      isLive: true,
      description: 'Live weather and beach view from South Beach',
      city: 'Miami',
      tags: ['beach', 'weather'],
    },
    {
      id: 'la-hollywood',
      name: 'Hollywood Blvd',
      source: 'earthcam',
      streamUrl: 'https://hddn1.earthcam.com/fecnetwork/hollywood.flv/playlist.m3u8',
      hlsUrl: 'https://hddn1.earthcam.com/fecnetwork/hollywood.flv/playlist.m3u8',
      location: { latitude: 34.1016, longitude: -118.3267, label: 'Hollywood Blvd, Los Angeles' },
      thumbnailUrl: '',
      isLive: true,
      description: 'Live view of Hollywood Boulevard',
      city: 'Los Angeles',
      tags: ['tourist', 'urban'],
    },
    {
      id: 'london-abbey-road',
      name: 'Abbey Road Crossing',
      source: 'public_cctv',
      streamUrl: 'https://abbeyroad.stream/crossing.m3u8',
      hlsUrl: 'https://abbeyroad.stream/crossing.m3u8',
      location: { latitude: 51.5320, longitude: -0.1778, label: 'Abbey Road, London' },
      thumbnailUrl: '',
      isLive: true,
      description: 'The famous Abbey Road pedestrian crossing',
      city: 'London',
      tags: ['tourist', 'landmark'],
    },
    {
      id: 'sf-golden-gate',
      name: 'Golden Gate Bridge',
      source: 'dot_traffic',
      streamUrl: 'https://dot.ca.gov/stream/golden-gate.m3u8',
      hlsUrl: 'https://dot.ca.gov/stream/golden-gate.m3u8',
      location: { latitude: 37.8199, longitude: -122.4783, label: 'Golden Gate Bridge, SF' },
      thumbnailUrl: '',
      isLive: true,
      description: 'Traffic view of Golden Gate Bridge',
      city: 'San Francisco',
      tags: ['traffic', 'landmark', 'bridge'],
    },
    {
      id: 'tokyo-shibuya',
      name: 'Shibuya Crossing',
      source: 'public_cctv',
      streamUrl: 'https://shibuya.stream/crossing.m3u8',
      hlsUrl: 'https://shibuya.stream/crossing.m3u8',
      location: { latitude: 35.6595, longitude: 139.7004, label: 'Shibuya Crossing, Tokyo' },
      thumbnailUrl: '',
      isLive: true,
      description: 'The world\'s busiest pedestrian crossing',
      city: 'Tokyo',
      tags: ['tourist', 'urban', 'traffic'],
    },
    {
      id: 'dubai-burj',
      name: 'Burj Khalifa View',
      source: 'earthcam',
      streamUrl: 'https://hddn1.earthcam.com/fecnetwork/burjkhalifa.flv/playlist.m3u8',
      hlsUrl: 'https://hddn1.earthcam.com/fecnetwork/burjkhalifa.flv/playlist.m3u8',
      location: { latitude: 25.1972, longitude: 55.2744, label: 'Burj Khalifa, Dubai' },
      thumbnailUrl: '',
      isLive: true,
      description: 'Live view of the Burj Khalifa and surrounding area',
      city: 'Dubai',
      tags: ['tourist', 'landmark', 'skyline'],
    },
  ];

  for (const feed of demoFeeds) {
    feeds.set(feed.id, feed);
  }
}

initDemoFeeds();

export function getAllFeeds(source?: CameraSource): CameraFeed[] {
  const all = Array.from(feeds.values());
  if (source) {
    return all.filter((f) => f.source === source);
  }
  return all;
}

export function getFeedById(id: string): CameraFeed | undefined {
  return feeds.get(id);
}

export function addFeed(feed: CameraFeed): CameraFeed {
  feeds.set(feed.id, feed);
  return feed;
}

export function removeFeed(id: string): boolean {
  return feeds.delete(id);
}

export function searchFeeds(query: string): CameraFeed[] {
  const q = query.toLowerCase();
  return Array.from(feeds.values()).filter(
    (f) =>
      f.name.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.city?.toLowerCase().includes(q) ||
      f.tags?.some((t) => t.toLowerCase().includes(q))
  );
}

export function getFeedsNearLocation(lat: number, lon: number, radiusKm: number): CameraFeed[] {
  return Array.from(feeds.values()).filter((f) => {
    const dist = haversineDistance(lat, lon, f.location.latitude, f.location.longitude);
    return dist <= radiusKm;
  });
}

function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
