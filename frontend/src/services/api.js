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
// LIVE OPEN-SOURCE APIs (called directly from frontend)
// ---------------------------------------------------------------------------

// OpenSky Network — free anonymous access, returns real ADS-B aircraft positions
// https://openskynetwork.github.io/opensky-api/rest.html
export async function fetchLiveAircraft(lat, lon, radiusKm = 100) {
  const deg = radiusKm / 111;
  const url = `https://opensky-network.org/api/states/all?lamin=${lat - deg}&lamax=${lat + deg}&lomin=${lon - deg}&lomax=${lon + deg}`;
  try {
    const data = await (await fetch(url)).json();
    if (!data.states) return [];
    return data.states
      .filter(s => s[5] != null && s[6] != null)
      .map(s => ({
        icao24: s[0],
        callsign: (s[1] || '').trim(),
        origin_country: s[2],
        longitude: s[5],
        latitude: s[6],
        altitude_m: s[7] || s[13] || 0,
        on_ground: s[8],
        velocity_ms: s[9] || 0,
        heading: s[10] || 0,
        vertical_rate: s[11] || 0,
      }));
  } catch {
    return null; // will trigger demo fallback
  }
}

// CelesTrak — free TLE data in JSON format for satellite orbit propagation
// https://celestrak.org/NORAD/elements/
export async function fetchTLEs(group = 'stations') {
  const groups = {
    stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
    starlink: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json',
    active: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
    visual: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json',
    weather: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json',
    gps: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json',
  };
  try {
    const url = groups[group] || groups.stations;
    const data = await (await fetch(url)).json();
    return data.map(gp => ({
      name: gp.OBJECT_NAME,
      norad_id: String(gp.NORAD_CAT_ID),
      tle1: gp.TLE_LINE1,
      tle2: gp.TLE_LINE2,
      epoch: gp.EPOCH,
      inclination: gp.INCLINATION,
      period_min: gp.PERIOD,
      object_type: gp.OBJECT_TYPE,
    }));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CAMERA FEED DATABASE — expanded with embeddable live streams
// ---------------------------------------------------------------------------

function demoFeeds() {
  return [
    // YouTube Live streams (embeddable via iframe)
    { id: 'yt-jackson-hole', name: 'Jackson Hole Town Square', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/DoLMfjRDmSM?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=DoLMfjRDmSM', location: { label: 'Jackson Hole, WY', latitude: 43.4799, longitude: -110.7624 } },
    { id: 'yt-miami-beach', name: 'Miami Beach Live', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/IFzwnhJMFm8?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=IFzwnhJMFm8', location: { label: 'Miami Beach, FL', latitude: 25.7907, longitude: -80.1300 } },
    { id: 'yt-tokyo-shibuya', name: 'Shibuya Scramble Crossing', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/DjdUEyjx8GM?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=DjdUEyjx8GM', location: { label: 'Tokyo, Japan', latitude: 35.6595, longitude: 139.7004 } },
    { id: 'yt-nyc-times-sq', name: 'NYC Times Square 4K', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/eJ7ZkQ5TC08?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=eJ7ZkQ5TC08', location: { label: 'New York, NY', latitude: 40.758, longitude: -73.9855 } },
    { id: 'yt-iss-live', name: 'ISS Earth Live Feed (NASA)', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/P9C25Un7xaM?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=P9C25Un7xaM', location: { label: 'Low Earth Orbit', latitude: 0, longitude: 0 } },
    { id: 'yt-naples-vesuvius', name: 'Naples – Mt. Vesuvius', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/RtU_mdL2vBM?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=RtU_mdL2vBM', location: { label: 'Naples, Italy', latitude: 40.8518, longitude: 14.2681 } },
    { id: 'yt-la-airport', name: 'LAX Airport Live', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/lc4kn8ZnFhk?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=lc4kn8ZnFhk', location: { label: 'Los Angeles, CA', latitude: 33.9425, longitude: -118.4081 } },
    { id: 'yt-rio-copacabana', name: 'Rio Copacabana Beach', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/oL2pnFSMdBE?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=oL2pnFSMdBE', location: { label: 'Rio de Janeiro, Brazil', latitude: -22.9714, longitude: -43.1823 } },
    { id: 'yt-dublin', name: 'Dublin City Live', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/S60pTMhHXx8?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=S60pTMhHXx8', location: { label: 'Dublin, Ireland', latitude: 53.3498, longitude: -6.2603 } },
    { id: 'yt-st-maarten', name: 'St. Maarten Airport (Maho Beach)', source: 'youtube_live', is_live: true, embed_url: 'https://www.youtube.com/embed/wUZ-EU2B8kU?autoplay=1&mute=1', stream_url: 'https://www.youtube.com/watch?v=wUZ-EU2B8kU', location: { label: "St. Maarten", latitude: 18.0425, longitude: -63.1089 } },
    // Skyline Webcams (embed via iframe)
    { id: 'sky-ny-brooklyn', name: 'NYC Brooklyn Bridge Pan', source: 'skyline', is_live: true, embed_url: 'https://www.skylinewebcams.com/webcam.html?id=nyc-brooklyn', stream_url: 'https://www.skylinewebcams.com/en/webcam/united-states/new-york/new-york/brooklyn-bridge.html', location: { label: 'New York, NY', latitude: 40.7061, longitude: -73.9969 } },
    { id: 'sky-rome-colosseum', name: 'Rome Colosseum', source: 'skyline', is_live: true, embed_url: 'https://www.skylinewebcams.com/webcam.html?id=rome-colosseum', stream_url: 'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/colosseo.html', location: { label: 'Rome, Italy', latitude: 41.8902, longitude: 12.4922 } },
    { id: 'sky-santorini', name: 'Santorini Sunset', source: 'skyline', is_live: true, embed_url: 'https://www.skylinewebcams.com/webcam.html?id=santorini', stream_url: 'https://www.skylinewebcams.com/en/webcam/ellada/notio-aigaio/santorini/santorini.html', location: { label: 'Santorini, Greece', latitude: 36.3932, longitude: 25.4615 } },
    // EarthCam
    { id: 'ec-times-sq', name: 'Times Square EarthCam', source: 'earthcam', is_live: true, embed_url: 'https://www.earthcam.com/cams/common/icons/ec-embed-player.html?cam=tsrobo3', stream_url: 'https://www.earthcam.com/usa/newyork/timessquare/', location: { label: 'New York, NY', latitude: 40.758, longitude: -73.9855 } },
    { id: 'ec-abbey-road', name: 'London Abbey Road', source: 'earthcam', is_live: true, embed_url: 'https://www.earthcam.com/cams/common/icons/ec-embed-player.html?cam=abbeyroad', stream_url: 'https://www.earthcam.com/world/england/london/abbeyroad/', location: { label: 'London, UK', latitude: 51.5320, longitude: -0.1778 } },
    { id: 'ec-bourbon-st', name: 'New Orleans Bourbon St', source: 'earthcam', is_live: true, embed_url: 'https://www.earthcam.com/cams/common/icons/ec-embed-player.html?cam=bourbonstreet', stream_url: 'https://www.earthcam.com/usa/louisiana/neworleans/bourbonstreet/', location: { label: 'New Orleans, LA', latitude: 29.9584, longitude: -90.0654 } },
    // DOT traffic cams
    { id: 'dot-nyc-lincoln', name: 'NYC Lincoln Tunnel', source: 'dot_traffic', is_live: true, stream_url: 'https://webcams.nyctmc.org/google_popup.php?cid=650', location: { label: 'New York, NY', latitude: 40.7608, longitude: -74.0021 } },
    { id: 'dot-sf-bay-bridge', name: 'SF Bay Bridge', source: 'dot_traffic', is_live: true, stream_url: 'https://cwwp2.dot.ca.gov/vm/streamlist.htm', location: { label: 'San Francisco, CA', latitude: 37.7983, longitude: -122.3778 } },
    { id: 'dot-la-i405', name: 'LA I-405 Freeway', source: 'dot_traffic', is_live: true, stream_url: 'https://cwwp2.dot.ca.gov/vm/streamlist.htm', location: { label: 'Los Angeles, CA', latitude: 33.9800, longitude: -118.3900 } },
    { id: 'dot-chi-i90', name: 'Chicago I-90/94', source: 'dot_traffic', is_live: true, stream_url: 'https://www.travelmidwest.com/', location: { label: 'Chicago, IL', latitude: 41.8827, longitude: -87.6233 } },
    // Weather cams
    { id: 'wx-radar-us', name: 'US Weather Radar', source: 'weather', is_live: true, embed_url: 'https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=default&metricWind=default&zoom=4&overlay=radar&product=radar&level=surface&lat=39&lon=-96&pressure=true&message=true', stream_url: 'https://www.windy.com/', location: { label: 'United States', latitude: 39.8283, longitude: -98.5795 } },
    { id: 'wx-windy-global', name: 'Windy Global Wind Map', source: 'weather', is_live: true, embed_url: 'https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=default&metricWind=default&zoom=3&overlay=wind&product=ecmwf&level=surface&lat=30&lon=0', stream_url: 'https://www.windy.com/', location: { label: 'Global', latitude: 30, longitude: 0 } },
    { id: 'wx-hurricane-tracker', name: 'Hurricane Tracker', source: 'weather', is_live: true, embed_url: 'https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=default&metricTemp=default&metricWind=default&zoom=4&overlay=wind&product=ecmwf&level=surface&lat=25&lon=-75', stream_url: 'https://www.windy.com/', location: { label: 'Atlantic Basin', latitude: 25, longitude: -75 } },
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

  const radioTypes = ['LTE', '5G-NR', 'UMTS', 'GSM', 'CDMA'];
  const operators = ['AT&T', 'T-Mobile', 'Verizon', 'Sprint', 'US Cellular'];
  const cell_towers = Array.from({ length: n(5) + 3 }, (_, i) => ({
    mcc: 310,
    mnc: [410, 260, 480, 120, 330][i % 5],
    lac: 30000 + i,
    cell_id: 10000 + Math.floor(Math.random() * 90000),
    latitude: around(lat, radiusKm / 100),
    longitude: around(lon, radiusKm / 100),
    range_m: Math.round(rnd(500, 4000)),
    radio: radioTypes[i % radioTypes.length],
    operator: operators[i % operators.length],
    source: ['opencellid', 'wigle', 'beacondb'][i % 3],
    signal_strength: -Math.round(rnd(50, 100)),
    samples: Math.floor(rnd(50, 3000)),
    last_seen: Date.now() / 1000 - Math.floor(rnd(60, 7200)),
  }));

  const nearby_cameras = demoFeeds().slice(0, 4).map(f => ({ ...f }));

  return {
    summary: `Area intelligence for ${label || `${lat.toFixed(2)}, ${lon.toFixed(2)}`} (${radiusKm} km radius): ${aircraft.length} aircraft tracked, ${vessels.length} vessels detected, ${satellites.length} satellites in view, ${crime_reports.length} crime reports, ${cell_towers.length} cell towers.`,
    aircraft,
    vessels,
    satellites,
    crime_reports,
    cell_towers,
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
  const rooms = ['living_room', 'master_bedroom', 'office', 'kitchen', 'hallway', 'bathroom', 'kids_room'];
  const activeRooms = rooms.slice(0, Math.max(1, count)).map(r => ({
    room: r,
    occupancy: r === rooms[0] ? Math.min(count, 2) : (Math.random() > 0.5 ? 1 : 0),
    activity: ['idle', 'light_movement', 'active', 'sleeping'][Math.floor(Math.random() * 4)],
    confidence: 0.6 + Math.random() * 0.35,
    last_motion_sec: Math.floor(Math.random() * 300),
  }));
  return {
    occupancy_count: count,
    activity: count === 0 ? 'none' : count === 1 ? 'light_movement' : 'active',
    zone: rooms[Math.floor(Math.random() * rooms.length)],
    per_room: activeRooms,
  };
}

function demoLayout() {
  return {
    width_m: 16, height_m: 12,
    // Outer walls
    walls: [
      { x1: 0, y1: 0, x2: 16, y2: 0 },
      { x1: 16, y1: 0, x2: 16, y2: 12 },
      { x1: 16, y1: 12, x2: 0, y2: 12 },
      { x1: 0, y1: 12, x2: 0, y2: 0 },
      // Interior walls
      { x1: 6, y1: 0, x2: 6, y2: 5 },      // living/hallway divider
      { x1: 6, y1: 5, x2: 0, y2: 5 },       // hallway top
      { x1: 0, y1: 7, x2: 6, y2: 7 },       // hallway bottom
      { x1: 6, y1: 7, x2: 6, y2: 12 },      // master bedroom left
      { x1: 10, y1: 0, x2: 10, y2: 5 },     // kitchen left
      { x1: 10, y1: 5, x2: 16, y2: 5 },     // kitchen/office divider
      { x1: 10, y1: 7, x2: 10, y2: 12 },    // bathroom/kids divider
      { x1: 10, y1: 7, x2: 6, y2: 7 },      // bathroom top
    ],
    // Rooms with bounds for rendering
    rooms: [
      { id: 'living_room', label: 'Living Room', x: 0, y: 0, w: 6, h: 5, color: '#1a2744' },
      { id: 'kitchen', label: 'Kitchen', x: 10, y: 0, w: 6, h: 5, color: '#1a3328' },
      { id: 'office', label: 'Office', x: 6, y: 0, w: 4, h: 5, color: '#2a1a44' },
      { id: 'hallway', label: 'Hallway', x: 0, y: 5, w: 6, h: 2, color: '#1e293b' },
      { id: 'master_bedroom', label: 'Master Bedroom', x: 0, y: 7, w: 6, h: 5, color: '#1a2744' },
      { id: 'bathroom', label: 'Bathroom', x: 6, y: 7, w: 4, h: 5, color: '#0f3042' },
      { id: 'kids_room', label: "Kid's Room", x: 10, y: 7, w: 6, h: 5, color: '#2a1a44' },
      { id: 'dining', label: 'Dining Area', x: 10, y: 5, w: 6, h: 2, color: '#1a3328' },
    ],
    // Furniture items positioned in rooms
    furniture: [
      { room: 'living_room', type: 'couch', label: 'Couch', x: 1.5, y: 2.5, w: 3, h: 1, icon: '🛋' },
      { room: 'living_room', type: 'tv', label: 'Smart TV', x: 3, y: 0.5, w: 2, h: 0.3, icon: '📺' },
      { room: 'living_room', type: 'table', label: 'Coffee Table', x: 2, y: 1.6, w: 1.5, h: 0.8, icon: '' },
      { room: 'kitchen', type: 'counter', label: 'Counter', x: 11, y: 0.5, w: 4.5, h: 0.8, icon: '' },
      { room: 'kitchen', type: 'fridge', label: 'Smart Fridge', x: 15, y: 1.5, w: 0.8, h: 1, icon: '🧊' },
      { room: 'kitchen', type: 'stove', label: 'Stove', x: 13, y: 0.5, w: 1, h: 0.8, icon: '' },
      { room: 'office', type: 'desk', label: 'Desk', x: 7, y: 1, w: 2, h: 1, icon: '🖥' },
      { room: 'office', type: 'chair', label: 'Chair', x: 7.8, y: 2.2, w: 0.8, h: 0.8, icon: '' },
      { room: 'master_bedroom', type: 'bed', label: 'Bed', x: 1.5, y: 9, w: 3, h: 2.2, icon: '🛏' },
      { room: 'master_bedroom', type: 'dresser', label: 'Dresser', x: 5, y: 8, w: 0.8, h: 1.5, icon: '' },
      { room: 'master_bedroom', type: 'nightstand', label: 'Nightstand', x: 0.3, y: 9.5, w: 0.7, h: 0.5, icon: '' },
      { room: 'kids_room', type: 'bed', label: "Kid's Bed", x: 11, y: 9, w: 2, h: 1.8, icon: '🛏' },
      { room: 'kids_room', type: 'desk', label: 'Study Desk', x: 14, y: 8, w: 1.5, h: 1, icon: '📚' },
      { room: 'bathroom', type: 'tub', label: 'Bathtub', x: 6.5, y: 9.5, w: 1.8, h: 1, icon: '🛁' },
      { room: 'bathroom', type: 'sink', label: 'Sink', x: 9, y: 8, w: 0.6, h: 0.5, icon: '' },
      { room: 'dining', type: 'table', label: 'Dining Table', x: 12, y: 5.3, w: 2, h: 1.2, icon: '' },
    ],
    // Doors / openings
    doors: [
      { x: 2, y: 5, dir: 'h', room1: 'living_room', room2: 'hallway' },
      { x: 8, y: 5, dir: 'h', room1: 'office', room2: 'bathroom' },
      { x: 2, y: 7, dir: 'h', room1: 'hallway', room2: 'master_bedroom' },
      { x: 6, y: 2, dir: 'v', room1: 'living_room', room2: 'office' },
      { x: 10, y: 2, dir: 'v', room1: 'office', room2: 'kitchen' },
      { x: 10, y: 9, dir: 'v', room1: 'bathroom', room2: 'kids_room' },
      { x: 13, y: 5, dir: 'h', room1: 'kitchen', room2: 'dining' },
    ],
    // WiFi access points / routers
    access_points: [
      { id: 'router-main', label: 'Main Router', x: 8, y: 3, band: '2.4/5 GHz', channel: 6, ssid: 'HomeNetwork' },
      { id: 'ap-ext', label: 'Range Extender', x: 3, y: 9, band: '5 GHz', channel: 36, ssid: 'HomeNetwork-5G' },
    ],
    // Connected network devices with positions inferred from signal strength
    devices: [
      { id: 'dev-1', name: 'iPhone 15 Pro', type: 'phone', ip: '192.168.1.101', mac: 'A4:83:E7:2F:00:11', room: 'living_room', x: 2, y: 3, signal_dbm: -42, band: '5 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-2', name: 'MacBook Pro', type: 'laptop', ip: '192.168.1.102', mac: 'A4:83:E7:2F:00:22', room: 'office', x: 7.5, y: 1.5, signal_dbm: -38, band: '5 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-3', name: 'Samsung Smart TV', type: 'smart_tv', ip: '192.168.1.103', mac: 'B8:27:EB:AA:00:33', room: 'living_room', x: 3, y: 0.8, signal_dbm: -45, band: '2.4 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-4', name: 'Echo Dot (Bedroom)', type: 'smart_speaker', ip: '192.168.1.104', mac: 'FC:65:DE:CC:00:44', room: 'master_bedroom', x: 0.5, y: 9.8, signal_dbm: -58, band: '2.4 GHz', connected_ap: 'ap-ext', online: true },
      { id: 'dev-5', name: 'iPad Air', type: 'tablet', ip: '192.168.1.105', mac: 'A4:83:E7:2F:00:55', room: 'kids_room', x: 14.5, y: 8.5, signal_dbm: -52, band: '5 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-6', name: 'Smart Thermostat', type: 'iot', ip: '192.168.1.106', mac: '18:B4:30:EE:00:66', room: 'hallway', x: 4, y: 6, signal_dbm: -50, band: '2.4 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-7', name: 'Ring Doorbell', type: 'camera', ip: '192.168.1.107', mac: 'D4:73:D7:FF:00:77', room: 'hallway', x: 0.2, y: 6, signal_dbm: -62, band: '2.4 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-8', name: 'LG Smart Fridge', type: 'iot', ip: '192.168.1.108', mac: 'CC:50:E3:BB:00:88', room: 'kitchen', x: 15.2, y: 1.8, signal_dbm: -48, band: '2.4 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-9', name: 'PlayStation 5', type: 'console', ip: '192.168.1.109', mac: 'A8:E3:EE:DD:00:99', room: 'living_room', x: 4.5, y: 0.6, signal_dbm: -40, band: '5 GHz', connected_ap: 'router-main', online: false },
      { id: 'dev-10', name: 'Work Laptop', type: 'laptop', ip: '192.168.1.110', mac: '00:1A:2B:CC:00:AA', room: 'office', x: 7.2, y: 1.3, signal_dbm: -36, band: '5 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-11', name: 'Smart Plug (Lamp)', type: 'iot', ip: '192.168.1.111', mac: '68:C6:3A:DD:00:BB', room: 'master_bedroom', x: 5.2, y: 8.5, signal_dbm: -55, band: '2.4 GHz', connected_ap: 'ap-ext', online: true },
      { id: 'dev-12', name: 'Roomba i7', type: 'iot', ip: '192.168.1.112', mac: '50:14:79:EE:00:CC', room: 'hallway', x: 3, y: 5.5, signal_dbm: -47, band: '2.4 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-13', name: 'Google Pixel Watch', type: 'wearable', ip: '192.168.1.113', mac: 'DC:A6:32:FF:00:DD', room: 'master_bedroom', x: 1, y: 10, signal_dbm: -60, band: '2.4 GHz', connected_ap: 'ap-ext', online: true },
      { id: 'dev-14', name: 'HP Printer', type: 'printer', ip: '192.168.1.114', mac: '3C:D9:2B:11:00:EE', room: 'office', x: 9, y: 3.5, signal_dbm: -44, band: '2.4 GHz', connected_ap: 'router-main', online: true },
      { id: 'dev-15', name: 'Baby Monitor Cam', type: 'camera', ip: '192.168.1.115', mac: '00:1E:C2:22:00:FF', room: 'kids_room', x: 13, y: 10, signal_dbm: -56, band: '2.4 GHz', connected_ap: 'router-main', online: true },
    ],
    zones: [
      { center_x: 3, center_y: 2.5, radius_m: 2.5, label: 'Living Room' },
      { center_x: 8, center_y: 2.5, radius_m: 1.8, label: 'Office' },
      { center_x: 13, center_y: 2.5, radius_m: 2.5, label: 'Kitchen' },
      { center_x: 3, center_y: 6, radius_m: 1, label: 'Hallway' },
      { center_x: 3, center_y: 9.5, radius_m: 2.5, label: 'Master Bedroom' },
      { center_x: 8, center_y: 9.5, radius_m: 1.8, label: 'Bathroom' },
      { center_x: 13, center_y: 9.5, radius_m: 2.5, label: "Kid's Room" },
      { center_x: 13, center_y: 6, radius_m: 1.5, label: 'Dining Area' },
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
  if (last.includes('cell') || last.includes('tower') || last.includes('phone') || last.includes('imsi'))
    return { reply: 'Cell tower tracking uses data from OpenCelliD, beaconDB, and WiGLE to locate cell towers by MCC/MNC/LAC/CID. You can search for cell IDs associated with a phone number, cross-reference tower pings to track device movement, and visualise tower positions on the map. Each tower shows its radio type (LTE/5G-NR/UMTS/GSM), operator, signal strength, and coverage range.' };
  return { reply: `HCMN is a mesh network intelligence platform with three modules:\n\n1. **Video Deck** — 12 public camera feeds (DOT traffic, EarthCam, weather)\n2. **Tracking** — Aircraft (ADS-B), vessels (AIS), satellites (ISS/Starlink), crime reports, cell towers (OpenCelliD/beaconDB/WiGLE)\n3. **Wi-Fi CSI** — Room presence detection via wireless signal analysis\n\nAsk me about any specific module or data source for more details.` };
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

export async function getCellTowers(lat, lon, radiusKm = 10) {
  try {
    const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
    return await tryFetch(`${API_BASE}/tracking/celltowers?${params}`);
  } catch {
    return demoAreaData(lat, lon, radiusKm, '').cell_towers;
  }
}

export async function lookupCellTower(mcc, mnc, lac, cellId) {
  try {
    const params = new URLSearchParams({ mcc, mnc, lac, cell_id: cellId });
    return await tryFetch(`${API_BASE}/tracking/celltower/lookup?${params}`);
  } catch {
    return null;
  }
}

export async function searchCellByPhone(phoneNumber) {
  try {
    const params = new URLSearchParams({ phone_number: phoneNumber });
    return await tryFetch(`${API_BASE}/tracking/celltower/search?${params}`, {
      method: 'POST',
    });
  } catch {
    // Return demo cross-reference data
    return demoCellHistory(phoneNumber);
  }
}

export async function crossReferenceCells(cellIds) {
  try {
    return await tryFetch(`${API_BASE}/tracking/celltower/crossref`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cellIds),
    });
  } catch {
    return { device_id: 'xref-query', pings: [], towers_visited: [], summary: 'Cross-reference failed – using demo mode.' };
  }
}

function demoCellHistory(phoneNumber) {
  const now = Date.now() / 1000;
  const suffix = phoneNumber.slice(-4) || '0000';
  const towers = [
    { mcc: 310, mnc: 410, lac: 30000, cell_id: 12345, latitude: 40.7128 + 0.008, longitude: -74.006 - 0.005, range_m: 1500, radio: 'LTE', operator: 'AT&T', source: 'demo' },
    { mcc: 310, mnc: 260, lac: 30001, cell_id: 23456, latitude: 40.7128 - 0.004, longitude: -74.006 + 0.007, range_m: 2200, radio: 'LTE', operator: 'T-Mobile', source: 'demo' },
    { mcc: 311, mnc: 480, lac: 30002, cell_id: 34567, latitude: 40.7128 + 0.012, longitude: -74.006 + 0.009, range_m: 3000, radio: '5G-NR', operator: 'Verizon', source: 'demo' },
    { mcc: 310, mnc: 410, lac: 30003, cell_id: 45678, latitude: 40.7128 - 0.006, longitude: -74.006 - 0.003, range_m: 1800, radio: 'UMTS', operator: 'AT&T', source: 'demo' },
  ];
  const pings = towers.map((t, i) => ({
    cell_tower: t,
    timestamp: now - (towers.length - i) * 3600,
    signal_dbm: -60 - i * 5,
    device_id: `dev-${suffix}`,
    phone_number: phoneNumber,
  }));
  return {
    device_id: `dev-${suffix}`,
    phone_number: phoneNumber,
    pings,
    towers_visited: towers,
    first_seen: pings[0]?.timestamp || 0,
    last_seen: pings[pings.length - 1]?.timestamp || 0,
    summary: `Device associated with ${phoneNumber} observed on ${towers.length} cell towers across ${pings.length} ping events.`,
  };
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

export async function getNetworkDevices() {
  try {
    return await tryFetch(`${API_BASE}/csi/devices`);
  } catch {
    return demoLayout().devices;
  }
}

// ---------------------------------------------------------------------------
// Module 4 – Gotham: Knowledge Graph & Link Analysis
// ---------------------------------------------------------------------------

function demoOntology() {
  const now = Date.now();
  const day = 86400000;
  const hr = 3600000;

  // ── OBJECTS (Nodes) ──
  const objects = [
    // People
    { id: 'p-001', type: 'person', label: 'Marcus Chen', properties: { age: 34, occupation: 'Software Engineer', employer: 'org-001', phone: '+1-555-0101', email: 'mchen@example.com', risk_score: 0.12 }, geo: { lat: 40.7128, lon: -74.006 }, created: now - 90 * day },
    { id: 'p-002', type: 'person', label: 'Elena Volkov', properties: { age: 29, occupation: 'Data Analyst', employer: 'org-002', phone: '+1-555-0202', email: 'evolkov@example.com', risk_score: 0.08 }, geo: { lat: 40.7580, lon: -73.985 }, created: now - 85 * day },
    { id: 'p-003', type: 'person', label: 'James Okafor', properties: { age: 41, occupation: 'Financial Advisor', employer: 'org-003', phone: '+1-555-0303', email: 'jokafor@example.com', risk_score: 0.45 }, geo: { lat: 40.7488, lon: -73.968 }, created: now - 120 * day },
    { id: 'p-004', type: 'person', label: 'Sarah Kim', properties: { age: 37, occupation: 'Attorney', employer: 'org-004', phone: '+1-555-0404', email: 'skim@example.com', risk_score: 0.05 }, geo: { lat: 40.7282, lon: -73.794 }, created: now - 60 * day },
    { id: 'p-005', type: 'person', label: 'Dmitri Petrov', properties: { age: 52, occupation: 'Import/Export', employer: 'org-005', phone: '+1-555-0505', email: 'dpetrov@example.com', risk_score: 0.72 }, geo: { lat: 40.6892, lon: -74.044 }, created: now - 200 * day },
    { id: 'p-006', type: 'person', label: 'Aisha Patel', properties: { age: 31, occupation: 'Journalist', employer: 'org-006', phone: '+1-555-0606', email: 'apatel@example.com', risk_score: 0.15 }, geo: { lat: 40.7527, lon: -73.977 }, created: now - 45 * day },
    { id: 'p-007', type: 'person', label: 'Carlos Mendez', properties: { age: 44, occupation: 'Real Estate Developer', employer: 'org-007', phone: '+1-555-0707', email: 'cmendez@example.com', risk_score: 0.58 }, geo: { lat: 40.7614, lon: -73.977 }, created: now - 150 * day },
    { id: 'p-008', type: 'person', label: 'Li Wei', properties: { age: 38, occupation: 'Logistics Manager', employer: 'org-005', phone: '+1-555-0808', email: 'lwei@example.com', risk_score: 0.61 }, geo: { lat: 40.7081, lon: -74.008 }, created: now - 130 * day },

    // Organizations
    { id: 'org-001', type: 'organization', label: 'Nexus Technologies', properties: { industry: 'Technology', employees: 2500, founded: 2012, revenue: '$340M', hq: 'New York, NY' }, geo: { lat: 40.7484, lon: -73.985 }, created: now - 300 * day },
    { id: 'org-002', type: 'organization', label: 'Meridian Analytics', properties: { industry: 'Data Science', employees: 180, founded: 2018, revenue: '$28M', hq: 'Brooklyn, NY' }, geo: { lat: 40.6782, lon: -73.944 }, created: now - 200 * day },
    { id: 'org-003', type: 'organization', label: 'Apex Capital Group', properties: { industry: 'Finance', employees: 45, founded: 2015, revenue: '$95M AUM', hq: 'Manhattan, NY' }, geo: { lat: 40.7580, lon: -73.969 }, created: now - 250 * day },
    { id: 'org-004', type: 'organization', label: 'Sterling & Associates', properties: { industry: 'Legal', employees: 320, founded: 1998, revenue: '$210M', hq: 'Midtown, NY' }, geo: { lat: 40.7549, lon: -73.984 }, created: now - 350 * day },
    { id: 'org-005', type: 'organization', label: 'Global Transit LLC', properties: { industry: 'Logistics', employees: 90, founded: 2016, revenue: '$52M', hq: 'Red Hook, Brooklyn' }, geo: { lat: 40.6730, lon: -74.008 }, created: now - 180 * day },
    { id: 'org-006', type: 'organization', label: 'Metro Pulse Media', properties: { industry: 'Media', employees: 120, founded: 2020, revenue: '$15M', hq: 'SoHo, NY' }, geo: { lat: 40.7233, lon: -74.000 }, created: now - 100 * day },
    { id: 'org-007', type: 'organization', label: 'Ironclad Properties', properties: { industry: 'Real Estate', employees: 35, founded: 2014, revenue: '$120M', hq: 'Jersey City, NJ' }, geo: { lat: 40.7178, lon: -74.043 }, created: now - 220 * day },

    // Locations
    { id: 'loc-001', type: 'location', label: '432 Park Avenue', properties: { type: 'Office Building', floors: 42, city: 'New York' }, geo: { lat: 40.7614, lon: -73.972 }, created: now - 300 * day },
    { id: 'loc-002', type: 'location', label: 'Red Hook Warehouse 7', properties: { type: 'Warehouse', sqft: 45000, city: 'Brooklyn' }, geo: { lat: 40.6730, lon: -74.010 }, created: now - 180 * day },
    { id: 'loc-003', type: 'location', label: 'JFK Airport Terminal 4', properties: { type: 'Airport Terminal', city: 'Queens' }, geo: { lat: 40.6413, lon: -73.778 }, created: now - 250 * day },
    { id: 'loc-004', type: 'location', label: 'Pier 17, South Street Seaport', properties: { type: 'Commercial Pier', city: 'Manhattan' }, geo: { lat: 40.7063, lon: -74.002 }, created: now - 150 * day },

    // Financial accounts
    { id: 'acct-001', type: 'account', label: 'Acct ***4821', properties: { bank: 'Chase', type: 'Business Checking', balance: '$2.4M', opened: '2016-03-15' }, created: now - 200 * day },
    { id: 'acct-002', type: 'account', label: 'Acct ***7733', properties: { bank: 'Chase', type: 'Personal Savings', balance: '$890K', opened: '2018-07-22' }, created: now - 150 * day },
    { id: 'acct-003', type: 'account', label: 'Acct ***1199', properties: { bank: 'Citi', type: 'Business Checking', balance: '$5.1M', opened: '2017-11-08' }, created: now - 180 * day },
    { id: 'acct-004', type: 'account', label: 'Offshore Acct ***6600', properties: { bank: 'HSBC Cayman', type: 'Trust Account', balance: '$12.8M', opened: '2019-02-14' }, created: now - 120 * day },

    // Devices / comms
    { id: 'dev-g1', type: 'device', label: 'Phone +1-555-0505', properties: { type: 'mobile', carrier: 'T-Mobile', imei: '352099001761481' }, created: now - 200 * day },
    { id: 'dev-g2', type: 'device', label: 'Phone +1-555-0707', properties: { type: 'mobile', carrier: 'Verizon', imei: '356938035643809' }, created: now - 180 * day },
    { id: 'dev-g3', type: 'device', label: 'Burner Phone #1', properties: { type: 'prepaid', carrier: 'Unknown', imei: '000000000000000' }, created: now - 30 * day },
    { id: 'dev-g4', type: 'device', label: 'Laptop MAC:3C:D9:2B', properties: { type: 'laptop', os: 'Windows 11' }, created: now - 90 * day },

    // Vehicles
    { id: 'veh-001', type: 'vehicle', label: 'Black Mercedes S-Class', properties: { plate: 'NY-XKR-4821', vin: 'WDDNG8GB5BA375283', color: 'Black', year: 2023 }, created: now - 60 * day },
    { id: 'veh-002', type: 'vehicle', label: 'White Sprinter Van', properties: { plate: 'NJ-GTR-1199', vin: 'WD3PE7CD5BP529614', color: 'White', year: 2021 }, created: now - 45 * day },

    // Events
    { id: 'evt-001', type: 'event', label: 'Wire Transfer $2.1M', properties: { amount: '$2,100,000', from: 'acct-001', to: 'acct-004', date: new Date(now - 15 * day).toISOString() }, geo: { lat: 40.758, lon: -73.969 }, created: now - 15 * day },
    { id: 'evt-002', type: 'event', label: 'Meeting at Pier 17', properties: { date: new Date(now - 10 * day).toISOString(), duration: '45 min', attendees: 3 }, geo: { lat: 40.7063, lon: -74.002 }, created: now - 10 * day },
    { id: 'evt-003', type: 'event', label: 'Warehouse Shipment Received', properties: { date: new Date(now - 8 * day).toISOString(), manifest: 'GLTR-2026-0847', containers: 3, origin: 'Rotterdam, NL' }, geo: { lat: 40.6730, lon: -74.010 }, created: now - 8 * day },
    { id: 'evt-004', type: 'event', label: 'Cash Deposit $480K', properties: { amount: '$480,000', account: 'acct-003', date: new Date(now - 5 * day).toISOString(), branch: 'Citi Midtown' }, geo: { lat: 40.755, lon: -73.984 }, created: now - 5 * day },
    { id: 'evt-005', type: 'event', label: 'JFK Customs Flag', properties: { date: new Date(now - 3 * day).toISOString(), flight: 'KL641', origin: 'Amsterdam', alert: 'Watchlist Match' }, geo: { lat: 40.6413, lon: -73.778 }, created: now - 3 * day },
  ];

  // ── LINKS (Edges) ──
  const links = [
    // Employment
    { id: 'l-001', source: 'p-001', target: 'org-001', type: 'employed_by', label: 'Senior Engineer', properties: { since: '2019' }, weight: 0.6 },
    { id: 'l-002', source: 'p-002', target: 'org-002', type: 'employed_by', label: 'Lead Analyst', properties: { since: '2021' }, weight: 0.6 },
    { id: 'l-003', source: 'p-003', target: 'org-003', type: 'employed_by', label: 'Managing Director', properties: { since: '2015' }, weight: 0.8 },
    { id: 'l-004', source: 'p-004', target: 'org-004', type: 'employed_by', label: 'Partner', properties: { since: '2012' }, weight: 0.7 },
    { id: 'l-005', source: 'p-005', target: 'org-005', type: 'owns', label: 'Majority Owner (72%)', properties: { stake: 0.72, since: '2016' }, weight: 0.95 },
    { id: 'l-006', source: 'p-006', target: 'org-006', type: 'employed_by', label: 'Investigative Reporter', properties: { since: '2023' }, weight: 0.5 },
    { id: 'l-007', source: 'p-007', target: 'org-007', type: 'owns', label: 'CEO & Founder', properties: { stake: 0.85, since: '2014' }, weight: 0.95 },
    { id: 'l-008', source: 'p-008', target: 'org-005', type: 'employed_by', label: 'Operations Manager', properties: { since: '2018' }, weight: 0.7 },

    // Personal connections
    { id: 'l-009', source: 'p-001', target: 'p-002', type: 'knows', label: 'Dating', properties: { since: '2024' }, weight: 0.8 },
    { id: 'l-010', source: 'p-003', target: 'p-005', type: 'knows', label: 'Business Partners', properties: { since: '2017' }, weight: 0.9 },
    { id: 'l-011', source: 'p-005', target: 'p-007', type: 'knows', label: 'Associates', properties: { since: '2018', context: 'Real estate deals' }, weight: 0.85 },
    { id: 'l-012', source: 'p-005', target: 'p-008', type: 'knows', label: 'Boss/Employee', properties: { since: '2018' }, weight: 0.75 },
    { id: 'l-013', source: 'p-003', target: 'p-004', type: 'knows', label: 'Client/Attorney', properties: { since: '2020' }, weight: 0.6 },
    { id: 'l-014', source: 'p-006', target: 'p-001', type: 'knows', label: 'Source/Journalist', properties: { since: '2025' }, weight: 0.4 },

    // Financial links
    { id: 'l-015', source: 'p-005', target: 'acct-001', type: 'owns_account', label: 'Signatory', properties: {}, weight: 0.9 },
    { id: 'l-016', source: 'p-003', target: 'acct-002', type: 'owns_account', label: 'Account Holder', properties: {}, weight: 0.8 },
    { id: 'l-017', source: 'org-005', target: 'acct-003', type: 'owns_account', label: 'Business Account', properties: {}, weight: 0.85 },
    { id: 'l-018', source: 'p-007', target: 'acct-004', type: 'owns_account', label: 'Beneficial Owner', properties: {}, weight: 0.95 },
    { id: 'l-019', source: 'acct-001', target: 'acct-004', type: 'transferred_to', label: '$2.1M Wire', properties: { amount: 2100000, date: new Date(now - 15 * day).toISOString() }, weight: 1.0 },
    { id: 'l-020', source: 'acct-003', target: 'acct-001', type: 'transferred_to', label: '$350K Transfer', properties: { amount: 350000, date: new Date(now - 22 * day).toISOString() }, weight: 0.7 },

    // Location links
    { id: 'l-021', source: 'org-003', target: 'loc-001', type: 'located_at', label: 'Office Suite 3801', properties: {}, weight: 0.6 },
    { id: 'l-022', source: 'org-005', target: 'loc-002', type: 'leases', label: 'Primary Warehouse', properties: { since: '2019', rent: '$18K/mo' }, weight: 0.7 },
    { id: 'l-023', source: 'p-005', target: 'loc-003', type: 'visited', label: 'JFK arrival', properties: { date: new Date(now - 3 * day).toISOString(), flight: 'KL641' }, weight: 0.5 },
    { id: 'l-024', source: 'p-008', target: 'loc-002', type: 'visited', label: 'Warehouse visit', properties: { date: new Date(now - 8 * day).toISOString(), duration: '3 hrs' }, weight: 0.6 },

    // Device ownership
    { id: 'l-025', source: 'p-005', target: 'dev-g1', type: 'uses', label: 'Primary Phone', properties: {}, weight: 0.8 },
    { id: 'l-026', source: 'p-007', target: 'dev-g2', type: 'uses', label: 'Primary Phone', properties: {}, weight: 0.8 },
    { id: 'l-027', source: 'p-008', target: 'dev-g3', type: 'uses', label: 'Seen with device', properties: { first_seen: new Date(now - 25 * day).toISOString() }, weight: 0.5 },

    // Communication
    { id: 'l-028', source: 'dev-g1', target: 'dev-g2', type: 'communicated', label: '17 calls, 43 texts', properties: { calls: 17, texts: 43, period: '30 days' }, weight: 0.9 },
    { id: 'l-029', source: 'dev-g3', target: 'dev-g1', type: 'communicated', label: '6 calls', properties: { calls: 6, texts: 0, period: '10 days' }, weight: 0.7 },
    { id: 'l-030', source: 'dev-g3', target: 'dev-g2', type: 'communicated', label: '3 calls', properties: { calls: 3, texts: 2, period: '10 days' }, weight: 0.5 },

    // Vehicle links
    { id: 'l-031', source: 'p-005', target: 'veh-001', type: 'owns', label: 'Registered Owner', properties: {}, weight: 0.8 },
    { id: 'l-032', source: 'org-005', target: 'veh-002', type: 'owns', label: 'Fleet Vehicle', properties: {}, weight: 0.7 },
    { id: 'l-033', source: 'veh-002', target: 'loc-002', type: 'seen_at', label: 'ALPR hit', properties: { date: new Date(now - 8 * day).toISOString() }, weight: 0.6 },
    { id: 'l-034', source: 'veh-001', target: 'loc-004', type: 'seen_at', label: 'ALPR hit', properties: { date: new Date(now - 10 * day).toISOString() }, weight: 0.5 },

    // Event connections
    { id: 'l-035', source: 'p-005', target: 'evt-001', type: 'initiated', label: 'Authorized Transfer', properties: {}, weight: 0.9 },
    { id: 'l-036', source: 'p-005', target: 'evt-002', type: 'attended', label: 'Present', properties: {}, weight: 0.7 },
    { id: 'l-037', source: 'p-007', target: 'evt-002', type: 'attended', label: 'Present', properties: {}, weight: 0.7 },
    { id: 'l-038', source: 'p-008', target: 'evt-002', type: 'attended', label: 'Present', properties: {}, weight: 0.7 },
    { id: 'l-039', source: 'p-008', target: 'evt-003', type: 'received', label: 'Signed Manifest', properties: {}, weight: 0.8 },
    { id: 'l-040', source: 'p-003', target: 'evt-004', type: 'initiated', label: 'Cash Deposit', properties: {}, weight: 0.85 },
    { id: 'l-041', source: 'p-005', target: 'evt-005', type: 'flagged_at', label: 'Customs Alert', properties: {}, weight: 0.95 },

    // Org-to-org
    { id: 'l-042', source: 'org-005', target: 'org-007', type: 'contracted_by', label: 'Logistics Provider', properties: { contract_value: '$1.2M/yr' }, weight: 0.7 },
    { id: 'l-043', source: 'org-003', target: 'org-005', type: 'invested_in', label: 'Series A Investor', properties: { amount: '$4M', date: '2017' }, weight: 0.8 },
  ];

  return { objects, links };
}

function demoGothamTimeline() {
  const now = Date.now();
  const day = 86400000;
  return [
    { id: 'tl-1', date: new Date(now - 90 * day).toISOString(), label: 'Global Transit LLC incorporated', type: 'org_created', entity: 'org-005', severity: 'low' },
    { id: 'tl-2', date: new Date(now - 60 * day).toISOString(), label: 'Apex Capital invests $4M in Global Transit', type: 'financial', entity: 'org-003', severity: 'medium' },
    { id: 'tl-3', date: new Date(now - 30 * day).toISOString(), label: 'Burner phone activated near Red Hook', type: 'device', entity: 'dev-g3', severity: 'high' },
    { id: 'tl-4', date: new Date(now - 22 * day).toISOString(), label: '$350K transfer from Global Transit to Petrov account', type: 'financial', entity: 'acct-003', severity: 'high' },
    { id: 'tl-5', date: new Date(now - 15 * day).toISOString(), label: '$2.1M wire to offshore account (Cayman)', type: 'financial', entity: 'evt-001', severity: 'critical' },
    { id: 'tl-6', date: new Date(now - 10 * day).toISOString(), label: 'Three-person meeting at Pier 17', type: 'meeting', entity: 'evt-002', severity: 'medium' },
    { id: 'tl-7', date: new Date(now - 8 * day).toISOString(), label: 'Shipment from Rotterdam received at warehouse', type: 'logistics', entity: 'evt-003', severity: 'high' },
    { id: 'tl-8', date: new Date(now - 5 * day).toISOString(), label: '$480K cash deposit at Citi Midtown', type: 'financial', entity: 'evt-004', severity: 'critical' },
    { id: 'tl-9', date: new Date(now - 3 * day).toISOString(), label: 'Petrov flagged at JFK Customs (KL641 from Amsterdam)', type: 'alert', entity: 'evt-005', severity: 'critical' },
    { id: 'tl-10', date: new Date(now - 1 * day).toISOString(), label: 'ALPR: Mercedes S-Class near Pier 17', type: 'surveillance', entity: 'veh-001', severity: 'medium' },
  ];
}

export async function getOntology() {
  try {
    return await tryFetch(`${API_BASE}/gotham/ontology`);
  } catch {
    return demoOntology();
  }
}

export async function getGothamTimeline() {
  try {
    return await tryFetch(`${API_BASE}/gotham/timeline`);
  } catch {
    return demoGothamTimeline();
  }
}

export async function searchOntology(query) {
  try {
    return await tryFetch(`${API_BASE}/gotham/search?q=${encodeURIComponent(query)}`);
  } catch {
    const { objects, links } = demoOntology();
    const q = query.toLowerCase();
    const matched = objects.filter(o =>
      o.label.toLowerCase().includes(q) ||
      o.type.toLowerCase().includes(q) ||
      Object.values(o.properties || {}).some(v => String(v).toLowerCase().includes(q))
    );
    const matchedIds = new Set(matched.map(o => o.id));
    const relLinks = links.filter(l => matchedIds.has(l.source) || matchedIds.has(l.target));
    return { objects: matched, links: relLinks };
  }
}

export async function expandNode(nodeId, depth = 1) {
  try {
    return await tryFetch(`${API_BASE}/gotham/expand?node=${encodeURIComponent(nodeId)}&depth=${depth}`);
  } catch {
    const { objects, links } = demoOntology();
    const visited = new Set();
    const queue = [nodeId];
    const resultNodes = [];
    const resultLinks = [];

    for (let d = 0; d <= depth && queue.length > 0; d++) {
      const nextQueue = [];
      for (const nid of queue) {
        if (visited.has(nid)) continue;
        visited.add(nid);
        const node = objects.find(o => o.id === nid);
        if (node) resultNodes.push(node);
        for (const link of links) {
          if (link.source === nid && !visited.has(link.target)) {
            resultLinks.push(link);
            nextQueue.push(link.target);
          }
          if (link.target === nid && !visited.has(link.source)) {
            resultLinks.push(link);
            nextQueue.push(link.source);
          }
        }
      }
      queue.length = 0;
      queue.push(...nextQueue);
    }
    return { objects: resultNodes, links: resultLinks };
  }
}

export async function getShortestPath(fromId, toId) {
  try {
    return await tryFetch(`${API_BASE}/gotham/path?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`);
  } catch {
    const { objects, links } = demoOntology();
    // BFS shortest path
    const adj = {};
    for (const l of links) {
      if (!adj[l.source]) adj[l.source] = [];
      if (!adj[l.target]) adj[l.target] = [];
      adj[l.source].push({ node: l.target, link: l });
      adj[l.target].push({ node: l.source, link: l });
    }
    const visited = new Set([fromId]);
    const queue = [[fromId, []]];
    while (queue.length) {
      const [current, path] = queue.shift();
      if (current === toId) {
        const pathNodes = [fromId, ...path.map(p => p.node)];
        return {
          nodes: pathNodes.map(id => objects.find(o => o.id === id)).filter(Boolean),
          links: path.map(p => p.link),
          length: path.length,
        };
      }
      for (const neighbor of (adj[current] || [])) {
        if (!visited.has(neighbor.node)) {
          visited.add(neighbor.node);
          queue.push([neighbor.node, [...path, neighbor]]);
        }
      }
    }
    return { nodes: [], links: [], length: -1 };
  }
}

// ---------------------------------------------------------------------------
// MODULE 5 — GLOBE  (Google Maps 3D + flight / satellite / OSM overlays)
// ---------------------------------------------------------------------------

// Demo points of interest for the 3D globe
function demoGlobePOIs() {
  return [
    { id: 'poi-1', name: 'Pentagon', lat: 38.8719, lng: -77.0563, type: 'military', description: 'US Department of Defense HQ', icon: '🏛️' },
    { id: 'poi-2', name: 'Ramstein AB', lat: 49.4369, lng: 7.6003, type: 'military', description: 'USAF base in Germany', icon: '✈️' },
    { id: 'poi-3', name: 'Diego Garcia', lat: -7.3195, lng: 72.4229, type: 'military', description: 'Naval Support Facility', icon: '⚓' },
    { id: 'poi-4', name: 'Pine Gap', lat: -23.7991, lng: 133.7370, type: 'intelligence', description: 'Joint Defence Facility', icon: '📡' },
    { id: 'poi-5', name: 'Thule AB', lat: 76.5312, lng: -68.7031, type: 'military', description: 'Space Force base, Greenland', icon: '🛰️' },
    { id: 'poi-6', name: 'Yokosuka', lat: 35.2833, lng: 139.6500, type: 'military', description: 'US Fleet Activities, Japan', icon: '⚓' },
    { id: 'poi-7', name: 'Djibouti', lat: 11.5469, lng: 43.1457, type: 'military', description: 'Camp Lemonnier', icon: '🏕️' },
    { id: 'poi-8', name: 'Baikonur', lat: 45.9650, lng: 63.3050, type: 'space', description: 'Cosmodrome, Kazakhstan', icon: '🚀' },
    { id: 'poi-9', name: 'Cape Canaveral', lat: 28.3922, lng: -80.6077, type: 'space', description: 'Kennedy Space Center', icon: '🚀' },
    { id: 'poi-10', name: 'Guam', lat: 13.4443, lng: 144.7937, type: 'military', description: 'Andersen AFB', icon: '✈️' },
  ];
}

// Demo flight tracks (great-circle style waypoints)
function demoFlightTracks() {
  return [
    { id: 'flt-1', callsign: 'DUKE31', type: 'military', aircraft: 'KC-135R', origin: 'Ramstein AB', destination: 'Al Udeid AB',
      waypoints: [
        { lat: 49.44, lng: 7.60, alt: 10000, ts: Date.now() - 7200000 },
        { lat: 45.00, lng: 15.00, alt: 11000, ts: Date.now() - 5400000 },
        { lat: 38.00, lng: 28.00, alt: 11500, ts: Date.now() - 3600000 },
        { lat: 30.00, lng: 40.00, alt: 11000, ts: Date.now() - 1800000 },
        { lat: 25.22, lng: 51.57, alt: 5000, ts: Date.now() },
      ]},
    { id: 'flt-2', callsign: 'AAL247', type: 'commercial', aircraft: 'B777-300ER', origin: 'JFK', destination: 'LHR',
      waypoints: [
        { lat: 40.64, lng: -73.78, alt: 0, ts: Date.now() - 18000000 },
        { lat: 43.00, lng: -60.00, alt: 11500, ts: Date.now() - 12000000 },
        { lat: 50.00, lng: -40.00, alt: 11500, ts: Date.now() - 7200000 },
        { lat: 52.50, lng: -20.00, alt: 11500, ts: Date.now() - 3600000 },
        { lat: 51.47, lng: -0.46, alt: 2000, ts: Date.now() },
      ]},
    { id: 'flt-3', callsign: 'RCH871', type: 'military', aircraft: 'C-17A', origin: 'Dover AFB', destination: 'Ramstein AB',
      waypoints: [
        { lat: 39.13, lng: -75.47, alt: 0, ts: Date.now() - 14400000 },
        { lat: 42.00, lng: -55.00, alt: 9000, ts: Date.now() - 10800000 },
        { lat: 48.00, lng: -30.00, alt: 9500, ts: Date.now() - 7200000 },
        { lat: 50.00, lng: -10.00, alt: 9500, ts: Date.now() - 3600000 },
        { lat: 49.44, lng: 7.60, alt: 1500, ts: Date.now() },
      ]},
    { id: 'flt-4', callsign: 'UAE201', type: 'commercial', aircraft: 'A380-800', origin: 'DXB', destination: 'SYD',
      waypoints: [
        { lat: 25.25, lng: 55.36, alt: 0, ts: Date.now() - 36000000 },
        { lat: 15.00, lng: 70.00, alt: 12000, ts: Date.now() - 28800000 },
        { lat: 0.00, lng: 85.00, alt: 12000, ts: Date.now() - 21600000 },
        { lat: -15.00, lng: 105.00, alt: 12000, ts: Date.now() - 14400000 },
        { lat: -33.95, lng: 151.18, alt: 3000, ts: Date.now() },
      ]},
  ];
}

// Demo satellite constellation
function demoGlobeSatellites() {
  return [
    { id: 'sat-1', name: 'ISS (ZARYA)', noradId: 25544, type: 'station', lat: 22.5, lng: -45.3, alt: 420, velocity: 7.66 },
    { id: 'sat-2', name: 'GPS IIR-M 1', noradId: 28874, type: 'navigation', lat: 38.2, lng: 120.5, alt: 20180, velocity: 3.87 },
    { id: 'sat-3', name: 'STARLINK-5001', noradId: 56001, type: 'communication', lat: -12.4, lng: 85.2, alt: 550, velocity: 7.59 },
    { id: 'sat-4', name: 'USA-326 (KH-11)', noradId: 58001, type: 'reconnaissance', lat: 45.1, lng: -30.7, alt: 260, velocity: 7.72 },
    { id: 'sat-5', name: 'MUOS-5', noradId: 41622, type: 'military-comms', lat: 0.1, lng: -100.0, alt: 35786, velocity: 3.07 },
    { id: 'sat-6', name: 'SBIRS GEO-5', noradId: 49943, type: 'early-warning', lat: 0.0, lng: 60.0, alt: 35786, velocity: 3.07 },
    { id: 'sat-7', name: 'NROL-82', noradId: 48500, type: 'reconnaissance', lat: 62.3, lng: 15.8, alt: 300, velocity: 7.70 },
    { id: 'sat-8', name: 'Tianhe', noradId: 48274, type: 'station', lat: -18.9, lng: 140.2, alt: 390, velocity: 7.68 },
  ];
}

export async function getGlobePOIs() {
  try { return await tryFetch(`${API_BASE}/globe/pois`); }
  catch { return demoGlobePOIs(); }
}

export async function getGlobeFlights() {
  try { return await tryFetch(`${API_BASE}/globe/flights`); }
  catch { return demoFlightTracks(); }
}

export async function getGlobeSatellites() {
  try { return await tryFetch(`${API_BASE}/globe/satellites`); }
  catch { return demoGlobeSatellites(); }
}

export async function getGlobeConfig() {
  try { return await tryFetch(`${API_BASE}/globe/config`); }
  catch { return { apiKey: '', configured: false, requiredAPIs: [] }; }
}

export async function setGlobeApiKey(apiKey) {
  try {
    return await tryFetch(`${API_BASE}/globe/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey }),
    });
  } catch { return { ok: false }; }
}
