const API_BASE = '/api';

// ─── Module 1: Feeds ─────────────────────────────────────────

export async function fetchFeeds(source) {
  const params = new URLSearchParams();
  if (source) params.set('source', source);
  const res = await fetch(`${API_BASE}/feeds/?${params}`);
  return res.json();
}

export async function searchFeeds(query) {
  const res = await fetch(`${API_BASE}/feeds/?q=${encodeURIComponent(query)}`);
  return res.json();
}

export async function getFeedById(id) {
  const res = await fetch(`${API_BASE}/feeds/${id}`);
  return res.json();
}

export async function getNearbyFeeds(lat, lon, radius = 50) {
  const res = await fetch(`${API_BASE}/feeds/nearby?lat=${lat}&lon=${lon}&radius=${radius}`);
  return res.json();
}

// ─── Module 1: Chat ──────────────────────────────────────────

export async function sendChatMessage(sessionId, message, feedIds = []) {
  const res = await fetch(`${API_BASE}/chat/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message, feedIds }),
  });
  return res.json();
}

// ─── Module 2: Globe ─────────────────────────────────────────

export async function pinLocation(latitude, longitude, radiusKm = 50) {
  const res = await fetch(`${API_BASE}/globe/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ latitude, longitude, radiusKm }),
  });
  return res.json();
}

export async function getISSPosition() {
  const res = await fetch(`${API_BASE}/globe/iss`);
  return res.json();
}

export async function getAircraft(lat, lon, radius = 100) {
  const res = await fetch(`${API_BASE}/globe/aircraft?lat=${lat}&lon=${lon}&radius=${radius}`);
  return res.json();
}

// ─── Module 3: Wi-Fi Sensing ─────────────────────────────────

export async function collectCSIFrames(count = 10) {
  const res = await fetch(`${API_BASE}/sensing/collect?count=${count}`, { method: 'POST' });
  return res.json();
}

export async function getPresence() {
  const res = await fetch(`${API_BASE}/sensing/presence`);
  return res.json();
}

export async function getCSIPrediction() {
  const res = await fetch(`${API_BASE}/sensing/predict`);
  return res.json();
}

export async function getRoomLayout() {
  const res = await fetch(`${API_BASE}/sensing/layout`);
  return res.json();
}

export async function getBufferSize() {
  const res = await fetch(`${API_BASE}/sensing/buffer/size`);
  return res.json();
}

export async function getRouterInfo() {
  const res = await fetch(`${API_BASE}/sensing/router`);
  return res.json();
}

export async function testRouterConnection(url, username, password) {
  const res = await fetch(`${API_BASE}/sensing/router/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, username, password }),
  });
  return res.json();
}

export async function startTraining(zones) {
  const res = await fetch(`${API_BASE}/sensing/training/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zones }),
  });
  return res.json();
}

export async function collectTrainingData(sessionId, zone, count = 50) {
  const res = await fetch(`${API_BASE}/sensing/training/${sessionId}/collect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zone, count }),
  });
  return res.json();
}

export async function finishTraining(sessionId) {
  const res = await fetch(`${API_BASE}/sensing/training/${sessionId}/finish`, {
    method: 'POST',
  });
  return res.json();
}
