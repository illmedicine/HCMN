const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Helpers — try backend first, fall back to demo data
// ---------------------------------------------------------------------------

async function tryFetch(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function jitter(base, pct = 0.15) {
  return base + base * (Math.random() * 2 - 1) * pct;
}

// ---------------------------------------------------------------------------
// DEMO DATA GENERATORS
// ---------------------------------------------------------------------------

function demoFeeds() {
  return [
    { id: 'nyc-times-sq', name: 'NYC Times Square', source: 'earthcam', is_live: true, stream_url: 'https://www.earthcam.com/usa/newyork/timessquare/', location: { label: 'New York, NY', latitude: 40.758, longitude: -73.9855 } },
    { id: 'nyc-brooklyn-bridge', name: 'NYC Brooklyn Bridge', source: 'dot_traffic', is_live: true, stream_url: 'https://webcams.nyctmc.org/google_popup.php?cid=208', location: { label: 'New York, NY', latitude: 40.7061, longitude: -73.9969 } },
    { id: 'nyc-fdr-drive', name: 'NYC FDR Drive @ 42nd', source: 'dot_traffic', is_live: true, stream_url: 'https://webcams.nyctmc.org/google_popup.php?cid=373', location: { label: 'New York, NY', latitude: 40.749, longitude: -73.969 } },
    { id: 'nyc-5th-ave', name: 'NYC 5th Avenue', source: 'earthcam', is_live: true, stream_url: 'https://www.earthcam.com/usa/newyork/5thavenue/', location: { label: 'New York, NY', latitude: 40.7484, longitude: -73.9967 } },
    { id: 'la-hwy-101', name: 'LA Highway 101', source: 'dot_traffic', is_live: true, stream_url: 'https://cwwp2.dot.ca.gov/vm/streamlist.htm', location: { label: 'Los Angeles, CA', latitude: 34.0522, longitude: -118.2437 } },
    { id: 'sf-golden-gate', name: 'SF Golden Gate Bridge', source: 'earthcam', is_live: true, stream_url: 'https://www.earthcam.com/usa/california/sanfrancisco/goldengate/', location: { label: 'San Francisco, CA', latitude: 37.8199, longitude: -122.4783 } },
    { id: 'chi-michigan-ave', name: 'Chicago Michigan Ave', source: 'dot_traffic', is_live: true, stream_url: 'https://www.travelmidwest.com/', location: { label: 'Chicago, IL', latitude: 41.8827, longitude: -87.6233 } },
    { id: 'miami-south-beach', name: 'Miami South Beach', source: 'earthcam', is_live: true, stream_url: 'https://www.earthcam.com/usa/florida/miamibeach/', location: { label: 'Miami, FL', latitude: 25.7826, longitude: -80.1341 } },
    { id: 'london-abbey-road', name: 'London Abbey Road', source: 'earthcam', is_live: true, stream_url: 'https://www.earthcam.com/world/england/london/abbeyroad/', location: { label: 'London, UK', latitude: 51.5320, longitude: -0.1778 } },
    { id: 'tokyo-shibuya', name: 'Tokyo Shibuya Crossing', source: 'earthcam', is_live: true, stream_url: 'https://www.earthcam.com/world/japan/tokyo/shibuya/', location: { label: 'Tokyo, Japan', latitude: 35.6595, longitude: 139.7004 } },
    { id: 'wx-radar-us', name: 'US Weather Radar', source: 'weather', is_live: true, stream_url: 'https://radar.weather.gov/', location: { label: 'United States', latitude: 39.8283, longitude: -98.5795 } },
    { id: 'wx-storm-chaser', name: 'Storm Chaser Feed', source: 'weather', is_live: false, stream_url: 'https://www.windy.com/', location: { label: 'Central US', latitude: 35.0, longitude: -97.0 } },
  ];
}

function demoAreaData(lat, lon, radiusKm, label) {
  const rnd = (lo, hi) => lo + Math.random() * (hi - lo);
  const around = (base, spread) => base + (Math.random() - 0.5) * spread;
  const n = (max) => Math.floor(Math.random() * max) + 1;

  const aircraft = Array.from({ length: n(8) + 3 }, (_, i) => ({
    icao24: (0xa00000 + Math.floor(Math.random() * 0xfffff)).toString(16),
    callsign: ['UAL', 'DAL', 'AAL', 'SWA', 'JBU', 'FDX', 'SKW'][i % 7] + (100 + Math.floor(Math.random() * 900)),
    origin_country: ['United States', 'Canada', 'United Kingdom', 'Germany', 'Japan'][i % 5],
    longitude: around(lon, radiusKm / 55),
    latitude: around(lat, radiusKm / 55),
    altitude_m: Math.round(rnd(3000, 12000)),
    velocity_ms: Math.round(rnd(120, 280)),
    heading: Math.round(rnd(0, 360)),
    on_ground: Math.random() < 0.1,
  }));

  const vessels = Array.from({ length: n(5) + 2 }, (_, i) => ({
    mmsi: String(200000000 + Math.floor(Math.random() * 99999999)),
    name: ['MSC ANNA', 'EVER GIVEN', 'MAERSK ESSEX', 'OASIS', 'HARMONY', 'CMA CGM MARCO POLO', 'ATLANTIC SUN'][i % 7],
    vessel_type: ['Cargo', 'Tanker', 'Container', 'Passenger', 'Fishing'][i % 5],
    longitude: around(lon, radiusKm / 55),
    latitude: around(lat, radiusKm / 55),
    speed_knots: Math.round(rnd(2, 22) * 10) / 10,
    heading: Math.round(rnd(0, 360)),
    destination: ['NEW YORK', 'MIAMI', 'LONDON', 'ROTTERDAM', 'SINGAPORE', 'TOKYO', 'HOUSTON'][i % 7],
  }));

  const satellites = [
    { name: 'ISS (ZARYA)', norad_id: '25544', altitude_km: Math.round(jitter(420)), azimuth: Math.round(rnd(0, 360)), elevation: Math.round(rnd(10, 85)), is_visible: Math.random() > 0.3, latitude: around(lat, 20), longitude: around(lon, 40) },
    { name: 'STARLINK-1007', norad_id: '44713', altitude_km: Math.round(jitter(550)), azimuth: Math.round(rnd(0, 360)), elevation: Math.round(rnd(5, 60)), is_visible: Math.random() > 0.5, latitude: around(lat, 25), longitude: around(lon, 35) },
    { name: 'STARLINK-1008', norad_id: '44714', altitude_km: Math.round(jitter(550)), azimuth: Math.round(rnd(0, 360)), elevation: Math.round(rnd(5, 60)), is_visible: Math.random() > 0.5, latitude: around(lat, 30), longitude: around(lon, 30) },
    { name: 'STARLINK-1009', norad_id: '44715', altitude_km: Math.round(jitter(550)), azimuth: Math.round(rnd(0, 360)), elevation: Math.round(rnd(5, 60)), is_visible: Math.random() > 0.5, latitude: around(lat, 15), longitude: around(lon, 45) },
    { name: 'HUBBLE', norad_id: '20580', altitude_km: Math.round(jitter(540)), azimuth: Math.round(rnd(0, 360)), elevation: Math.round(rnd(5, 70)), is_visible: Math.random() > 0.4, latitude: around(lat, 22), longitude: around(lon, 28) },
    { name: 'NOAA 19', norad_id: '33591', altitude_km: Math.round(jitter(870)), azimuth: Math.round(rnd(0, 360)), elevation: Math.round(rnd(5, 50)), is_visible: Math.random() > 0.6, latitude: around(lat, 18), longitude: around(lon, 32) },
  ];

  const crimeTypes = ['Theft', 'Burglary', 'Assault', 'Vandalism', 'Vehicle Theft', 'Robbery', 'Trespassing'];
  const crime_reports = Array.from({ length: n(6) + 2 }, (_, i) => ({
    incident_type: crimeTypes[i % crimeTypes.length],
    description: `Reported ${crimeTypes[i % crimeTypes.length].toLowerCase()} incident in the ${label || 'area'}`,
    severity: Math.random() > 0.4 ? 'property' : 'person',
    longitude: around(lon, radiusKm / 80),
    latitude: around(lat, radiusKm / 80),
  }));

  const nearby_cameras = demoFeeds().slice(0, 4).map(f => ({ ...f }));

  return {
    summary: `Area intelligence for ${label || `${lat.toFixed(2)}, ${lon.toFixed(2)}`} (${radiusKm} km radius): ${aircraft.length} aircraft tracked, ${vessels.length} vessels detected, ${satellites.length} satellites in view, ${crime_reports.length} crime reports.`,
    aircraft,
    vessels,
    satellites,
    crime_reports,
    nearby_cameras,
  };
}

function demoPrediction() {
  const predictions = ['empty', 'person_walking', 'person_sitting', 'person_standing', 'multiple_people'];
  const pred = predictions[Math.floor(Math.random() * predictions.length)];
  return { prediction: pred, confidence: 0.55 + Math.random() * 0.4 };
}

function demoPresence() {
  const count = Math.floor(Math.random() * 4);
  return {
    occupancy_count: count,
    activity: count === 0 ? 'none' : count === 1 ? 'light_movement' : 'active',
    zone: ['living_room', 'office', 'hallway', 'bedroom'][Math.floor(Math.random() * 4)],
  };
}

function demoLayout() {
  return {
    width_m: 8, height_m: 6,
    walls: [
      { x1: 0, y1: 0, x2: 8, y2: 0 },
      { x1: 8, y1: 0, x2: 8, y2: 6 },
      { x1: 8, y1: 6, x2: 0, y2: 6 },
      { x1: 0, y1: 6, x2: 0, y2: 0 },
      { x1: 5, y1: 0, x2: 5, y2: 3.5 },
    ],
    zones: [
      { center_x: 2.5, center_y: 3, radius_m: 2.2, label: 'Living Area' },
      { center_x: 6.5, center_y: 1.5, radius_m: 1.4, label: 'Office' },
      { center_x: 6.5, center_y: 4.5, radius_m: 1.3, label: 'Kitchen' },
    ],
  };
}

function demoSweep(startFreq, endFreq, step) {
  const sf = Number(startFreq) || 88e6;
  const ef = Number(endFreq) || 108e6;
  const st = Number(step) || 5e5;
  const samples = [];
  for (let f = sf; f <= ef; f += st) {
    const base = -90 + Math.random() * 20;
    const isStation = Math.random() < 0.08;
    samples.push({ frequency_hz: f, power_dbm: isStation ? base + 30 + Math.random() * 15 : base });
  }
  return { start_frequency_hz: sf, end_frequency_hz: ef, step_hz: st, samples, sample_count: samples.length };
}

function demoSignals(sweep) {
  if (!sweep) return [];
  return sweep.samples
    .filter(s => s.power_dbm > -65)
    .map(s => {
      const mhz = s.frequency_hz / 1e6;
      let label = 'Unknown';
      if (mhz >= 88 && mhz <= 108) label = `FM Radio ${mhz.toFixed(1)} MHz`;
      else if (mhz >= 470 && mhz <= 608) label = 'TV Broadcast';
      else if (mhz >= 824 && mhz <= 894) label = 'Cellular 850 MHz';
      else if (mhz >= 1850 && mhz <= 1990) label = 'Cellular PCS';
      else if (mhz >= 2400 && mhz <= 2500) label = 'WiFi 2.4 GHz';
      return { frequency_hz: s.frequency_hz, power_dbm: s.power_dbm, bandwidth_hz: 200000, label };
    });
}

function demoChatReply(messages) {
  const last = (messages[messages.length - 1]?.content || '').toLowerCase();
  if (last.includes('camera') || last.includes('feed'))
    return { reply: 'The system currently tracks 12 public camera feeds across NYC, LA, SF, Chicago, Miami, London, and Tokyo. Select feeds from the sidebar to view up to 4 simultaneously in the quad-view display. All feeds link to their original public sources.' };
  if (last.includes('aircraft') || last.includes('plane') || last.includes('flight'))
    return { reply: 'Aircraft tracking uses ADS-B data from OpenSky Network. In the current view you can see commercial flights with their callsigns, altitudes, speeds, and headings. The data refreshes when you search a new area.' };
  if (last.includes('satellite') || last.includes('iss') || last.includes('starlink'))
    return { reply: 'Satellite tracking shows objects like the ISS (NORAD 25544), Starlink constellation satellites, Hubble, and NOAA weather satellites. Visibility depends on your location and time of day. The ISS orbits at ~420km altitude completing an orbit every 90 minutes.' };
  if (last.includes('crime') || last.includes('safety'))
    return { reply: 'Crime data shows reported incidents in the selected area, categorized by type (theft, assault, burglary, etc.) and severity (person vs property). Heat map dots on the tracking map indicate incident density. Red = person-related, orange = property-related.' };
  if (last.includes('csi') || last.includes('wifi') || last.includes('presence') || last.includes('signal'))
    return { reply: 'Wi-Fi CSI (Channel State Information) analyzes how wireless signals reflect off objects and people in a room. By measuring amplitude and phase changes across OFDM subcarriers, the system can detect presence, count occupants, and classify activity (walking, sitting, standing) without cameras.' };
  if (last.includes('vessel') || last.includes('ship') || last.includes('boat'))
    return { reply: 'Vessel tracking uses AIS (Automatic Identification System) data showing cargo ships, tankers, passenger vessels, and fishing boats. Each vessel reports its MMSI, position, heading, speed, and destination port.' };
  return { reply: `HCMN is a mesh network intelligence platform with three modules:\n\n1. **Video Deck** — 12 public camera feeds (DOT traffic, EarthCam, weather)\n2. **Tracking** — Aircraft (ADS-B), vessels (AIS), satellites (ISS/Starlink), crime reports\n3. **Wi-Fi CSI** — Room presence detection via wireless signal analysis\n\nAsk me about any specific module or data source for more details.` };
}

// ---------------------------------------------------------------------------
// Module 1 – Camera / Observational Deck
// ---------------------------------------------------------------------------

export async function fetchFeeds(source = null) {
  try {
    const url = source ? `${API_BASE}/cameras/?source=${source}` : `${API_BASE}/cameras/`;
    return await tryFetch(url);
  } catch {
    let feeds = demoFeeds();
    if (source) feeds = feeds.filter(f => f.source === source);
    return feeds;
  }
}

export async function getFeed(feedId) {
  try {
    return await tryFetch(`${API_BASE}/cameras/${encodeURIComponent(feedId)}`);
  } catch {
    return demoFeeds().find(f => f.id === feedId) || demoFeeds()[0];
  }
}

export async function searchCamerasByLocation(lat, lon, radiusKm = 50) {
  try {
    const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
    return await tryFetch(`${API_BASE}/cameras/search?${params}`);
  } catch {
    return demoFeeds().filter(f => f.location);
  }
}

export async function addFeed(feed) {
  try {
    const res = await fetch(`${API_BASE}/cameras/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(feed),
    });
    return res.json();
  } catch {
    return { ...feed, id: 'custom-' + Date.now() };
  }
}

// ---------------------------------------------------------------------------
// Module 2 – Tracking / Satellite / GPS
// ---------------------------------------------------------------------------

export async function getAreaData(lat, lon, radiusKm = 50, label = '') {
  try {
    const params = new URLSearchParams({ lat, lon, radius_km: radiusKm, label });
    return await tryFetch(`${API_BASE}/tracking/area?${params}`);
  } catch {
    return demoAreaData(lat, lon, radiusKm, label);
  }
}

export async function getAircraft(lat, lon, radiusKm = 50) {
  try {
    const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
    return await tryFetch(`${API_BASE}/tracking/aircraft?${params}`);
  } catch {
    return demoAreaData(lat, lon, radiusKm, '').aircraft;
  }
}

export async function getVessels(lat, lon, radiusKm = 50) {
  try {
    const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
    return await tryFetch(`${API_BASE}/tracking/vessels?${params}`);
  } catch {
    return demoAreaData(lat, lon, radiusKm, '').vessels;
  }
}

export async function getSatellites(lat, lon) {
  try {
    const params = new URLSearchParams({ lat, lon });
    return await tryFetch(`${API_BASE}/tracking/satellites?${params}`);
  } catch {
    return demoAreaData(lat, lon, 50, '').satellites;
  }
}

export async function getCrimeData(lat, lon, radiusKm = 10) {
  try {
    const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
    return await tryFetch(`${API_BASE}/tracking/crime?${params}`);
  } catch {
    return demoAreaData(lat, lon, radiusKm, '').crime_reports;
  }
}

export async function pinLocation(pin) {
  try {
    return await tryFetch(`${API_BASE}/tracking/pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pin),
    });
  } catch {
    return { id: 'pin-' + Date.now(), ...pin };
  }
}

export async function listPins() {
  try {
    return await tryFetch(`${API_BASE}/tracking/pins`);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// AI Chat
// ---------------------------------------------------------------------------

export async function sendChatMessage(messages, context = {}) {
  try {
    return await tryFetch(`${API_BASE}/chat/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, context }),
    });
  } catch {
    return demoChatReply(messages);
  }
}

// ---------------------------------------------------------------------------
// SDR / RF Spectrum
// ---------------------------------------------------------------------------

let _lastSweep = null;

export async function performSweep(startFreq, endFreq, step) {
  try {
    const params = new URLSearchParams();
    if (startFreq) params.set('start_freq', startFreq);
    if (endFreq) params.set('end_freq', endFreq);
    if (step) params.set('step', step);
    const data = await tryFetch(`${API_BASE}/sdr/sweep?${params}`, { method: 'POST' });
    _lastSweep = data;
    return data;
  } catch {
    _lastSweep = demoSweep(startFreq, endFreq, step);
    return _lastSweep;
  }
}

export async function detectSignals(threshold = -60) {
  try {
    return await tryFetch(`${API_BASE}/sdr/signals?threshold_dbm=${threshold}`);
  } catch {
    return demoSignals(_lastSweep);
  }
}

// ---------------------------------------------------------------------------
// Module 3 – Wi-Fi CSI
// ---------------------------------------------------------------------------

export async function collectCSIFrames(count = 10) {
  try {
    return await tryFetch(`${API_BASE}/csi/collect?count=${count}`, { method: 'POST' });
  } catch {
    return Array.from({ length: count }, () => ({ subcarriers: 64, timestamp: Date.now() }));
  }
}

export async function getCSIPrediction() {
  try {
    return await tryFetch(`${API_BASE}/csi/predict`);
  } catch {
    return demoPrediction();
  }
}

export async function getPresence() {
  try {
    return await tryFetch(`${API_BASE}/csi/presence`);
  } catch {
    return demoPresence();
  }
}

export async function getRoomLayout() {
  try {
    return await tryFetch(`${API_BASE}/csi/layout`);
  } catch {
    return demoLayout();
  }
}
