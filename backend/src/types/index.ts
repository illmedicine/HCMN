// ─── Shared Types ────────────────────────────────────────────

export interface GeoPoint {
  latitude: number;
  longitude: number;
  label?: string;
}

// ─── Module 1: Feeds ─────────────────────────────────────────

export type CameraSource = 'dot_traffic' | 'weather' | 'earthcam' | 'custom' | 'public_cctv';

export interface CameraFeed {
  id: string;
  name: string;
  source: CameraSource;
  streamUrl: string;
  hlsUrl?: string;
  location: GeoPoint;
  thumbnailUrl?: string;
  isLive: boolean;
  description: string;
  city?: string;
  tags?: string[];
}

// ─── Module 1: Chat ──────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  feedIds?: string[];
  timestamp: string;
}

// ─── Module 2: Globe Intelligence ────────────────────────────

export interface PinRequest {
  latitude: number;
  longitude: number;
  radiusKm?: number;
}

export interface Aircraft {
  icao24: string;
  callsign: string;
  originCountry: string;
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  heading: number;
  onGround: boolean;
}

export interface Vessel {
  mmsi: string;
  name: string;
  shipType: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  destination?: string;
}

export interface SatellitePass {
  satName: string;
  satId: number;
  startTime: string;
  endTime: string;
  maxElevation: number;
  startAzimuth: number;
}

export interface ISSPosition {
  latitude: number;
  longitude: number;
  altitude: number;
  velocity: number;
  timestamp: string;
}

export interface CrimeReport {
  id: string;
  type: string;
  description: string;
  latitude: number;
  longitude: number;
  date: string;
  address?: string;
}

export interface HeatmapPoint {
  latitude: number;
  longitude: number;
  weight: number;
}

export interface HeatmapLayer {
  name: string;
  type: 'crime' | 'traffic' | 'activity';
  points: HeatmapPoint[];
}

export interface PinResult {
  pin: GeoPoint;
  aircraft: Aircraft[];
  vessels: Vessel[];
  satellites: SatellitePass[];
  issPosition: ISSPosition | null;
  crimes: CrimeReport[];
  nearbyFeeds: CameraFeed[];
  heatmaps: HeatmapLayer[];
  timestamp: string;
}

// ─── Module 3: Wi-Fi Sensing ─────────────────────────────────

export interface CSIFrame {
  timestamp: string;
  macAddress: string;
  rssi: number;
  subcarrierAmplitudes: number[];
  subcarrierPhases: number[];
}

export interface PresencePrediction {
  timestamp: string;
  prediction: 'empty' | 'person_sitting' | 'person_walking' | 'multiple_people';
  confidence: number;
  zone?: string;
}

export interface PresenceEvent {
  timestamp: string;
  zone: string;
  occupancyCount: number;
  activity: string;
  confidence: number;
}

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence: number;
}

export interface RoomZone {
  id: string;
  label: string;
  centerX: number;
  centerY: number;
  radiusM: number;
}

export interface RoomLayout {
  walls: WallSegment[];
  zones: RoomZone[];
  widthM: number;
  heightM: number;
}

export interface TrainingSession {
  id: string;
  status: 'collecting' | 'training' | 'complete' | 'error';
  framesCollected: number;
  accuracy?: number;
  zones: string[];
  startedAt: string;
}

export interface RouterInfo {
  model: string;
  connectedDevices: number;
  channel: number;
  signalStrength: number;
  status: 'connected' | 'disconnected' | 'error';
}
