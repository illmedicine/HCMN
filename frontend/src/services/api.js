const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Module 1 – Camera / Observational Deck
// ---------------------------------------------------------------------------

export async function fetchFeeds(source = null) {
  const url = source ? `${API_BASE}/cameras/?source=${source}` : `${API_BASE}/cameras/`;
  const res = await fetch(url);
  return res.json();
}

export async function getFeed(feedId) {
  const res = await fetch(`${API_BASE}/cameras/${encodeURIComponent(feedId)}`);
  return res.json();
}

export async function searchCamerasByLocation(lat, lon, radiusKm = 50) {
  const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
  const res = await fetch(`${API_BASE}/cameras/search?${params}`);
  return res.json();
}

export async function addFeed(feed) {
  const res = await fetch(`${API_BASE}/cameras/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feed),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Module 2 – Tracking / Satellite / GPS
// ---------------------------------------------------------------------------

export async function getAreaData(lat, lon, radiusKm = 50, label = '') {
  const params = new URLSearchParams({ lat, lon, radius_km: radiusKm, label });
  const res = await fetch(`${API_BASE}/tracking/area?${params}`);
  return res.json();
}

export async function getAircraft(lat, lon, radiusKm = 50) {
  const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
  const res = await fetch(`${API_BASE}/tracking/aircraft?${params}`);
  return res.json();
}

export async function getVessels(lat, lon, radiusKm = 50) {
  const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
  const res = await fetch(`${API_BASE}/tracking/vessels?${params}`);
  return res.json();
}

export async function getSatellites(lat, lon) {
  const params = new URLSearchParams({ lat, lon });
  const res = await fetch(`${API_BASE}/tracking/satellites?${params}`);
  return res.json();
}

export async function getCrimeData(lat, lon, radiusKm = 10) {
  const params = new URLSearchParams({ lat, lon, radius_km: radiusKm });
  const res = await fetch(`${API_BASE}/tracking/crime?${params}`);
  return res.json();
}

export async function pinLocation(pin) {
  const res = await fetch(`${API_BASE}/tracking/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pin),
  });
  return res.json();
}

export async function listPins() {
  const res = await fetch(`${API_BASE}/tracking/pins`);
  return res.json();
}

// ---------------------------------------------------------------------------
// AI Chat
// ---------------------------------------------------------------------------

export async function sendChatMessage(messages, context = {}) {
  const res = await fetch(`${API_BASE}/chat/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// SDR / RF Spectrum
// ---------------------------------------------------------------------------

export async function performSweep(startFreq, endFreq, step) {
  const params = new URLSearchParams();
  if (startFreq) params.set('start_freq', startFreq);
  if (endFreq) params.set('end_freq', endFreq);
  if (step) params.set('step', step);
  const res = await fetch(`${API_BASE}/sdr/sweep?${params}`, { method: 'POST' });
  return res.json();
}

export async function detectSignals(threshold = -60) {
  const res = await fetch(`${API_BASE}/sdr/signals?threshold_dbm=${threshold}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Module 3 – Wi-Fi CSI
// ---------------------------------------------------------------------------

export async function collectCSIFrames(count = 10) {
  const res = await fetch(`${API_BASE}/csi/collect?count=${count}`, { method: 'POST' });
  return res.json();
}

export async function getCSIPrediction() {
  const res = await fetch(`${API_BASE}/csi/predict`);
  return res.json();
}

export async function getPresence() {
  const res = await fetch(`${API_BASE}/csi/presence`);
  return res.json();
}

export async function getRoomLayout() {
  const res = await fetch(`${API_BASE}/csi/layout`);
  return res.json();
}
