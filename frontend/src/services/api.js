const API_BASE = '/api';

export async function fetchFeeds(source = null) {
  const url = source ? `${API_BASE}/cameras/?source=${source}` : `${API_BASE}/cameras/`;
  const res = await fetch(url);
  return res.json();
}

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
