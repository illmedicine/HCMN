import { useState, useRef, useCallback, useEffect } from 'react';
import { pinLocation, getISSPosition } from '../../services/api';
import PinPanel from './PinPanel';

/**
 * Interactive globe/map view for Module 2.
 * Uses a canvas-based globe visualization with click-to-pin interaction.
 * In production, integrate CesiumJS for full 3D globe.
 */
export default function GlobeView() {
  const canvasRef = useRef(null);
  const [pinData, setPinData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [issPos, setIssPos] = useState(null);
  const [viewCenter, setViewCenter] = useState({ lat: 20, lon: 0 });
  const [zoom, setZoom] = useState(1);
  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [pinnedLocation, setPinnedLocation] = useState(null);

  // Load ISS position periodically
  useEffect(() => {
    loadISS();
    const interval = setInterval(loadISS, 30000);
    return () => clearInterval(interval);
  }, []);

  async function loadISS() {
    try {
      const pos = await getISSPosition();
      if (pos && !pos.error) setIssPos(pos);
    } catch { /* ignore */ }
  }

  // Draw the globe/map on canvas
  const drawGlobe = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, w, h);

    // Draw equirectangular map projection
    const mapW = w * zoom;
    const mapH = h * zoom;
    const offsetX = w / 2 - (viewCenter.lon / 360) * mapW;
    const offsetY = h / 2 + (viewCenter.lat / 180) * mapH;

    // Grid lines
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let lat = -90; lat <= 90; lat += 30) {
      const y = offsetY - (lat / 180) * mapH;
      if (y >= 0 && y <= h) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.fillText(`${lat}°`, 4, y - 2);
      }
    }
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = offsetX + (lon / 360) * mapW;
      if (x >= 0 && x <= w) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillStyle = '#64748b';
        ctx.font = '10px monospace';
        ctx.fillText(`${lon}°`, x + 2, h - 4);
      }
    }

    // Draw continents (simplified outline dots for key cities)
    const landmarks = [
      { lat: 40.7, lon: -74.0, name: 'NYC' },
      { lat: 51.5, lon: -0.1, name: 'London' },
      { lat: 35.7, lon: 139.7, name: 'Tokyo' },
      { lat: -33.9, lon: 151.2, name: 'Sydney' },
      { lat: 25.2, lon: 55.3, name: 'Dubai' },
      { lat: 37.8, lon: -122.4, name: 'SF' },
      { lat: 48.9, lon: 2.3, name: 'Paris' },
      { lat: 1.3, lon: 103.8, name: 'Singapore' },
      { lat: -23.5, lon: -46.6, name: 'São Paulo' },
      { lat: 55.8, lon: 37.6, name: 'Moscow' },
      { lat: 28.6, lon: 77.2, name: 'Delhi' },
      { lat: 39.9, lon: 116.4, name: 'Beijing' },
      { lat: 30.0, lon: 31.2, name: 'Cairo' },
      { lat: 41.9, lon: -87.6, name: 'Chicago' },
      { lat: 25.8, lon: -80.2, name: 'Miami' },
      { lat: 34.1, lon: -118.3, name: 'LA' },
    ];

    for (const lm of landmarks) {
      const x = offsetX + (lm.lon / 360) * mapW;
      const y = offsetY - (lm.lat / 180) * mapH;
      if (x >= 0 && x <= w && y >= 0 && y <= h) {
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#94a3b8';
        ctx.font = '9px sans-serif';
        ctx.fillText(lm.name, x + 5, y + 3);
      }
    }

    // Draw ISS position
    if (issPos) {
      const ix = offsetX + (issPos.longitude / 360) * mapW;
      const iy = offsetY - (issPos.latitude / 180) * mapH;
      if (ix >= 0 && ix <= w && iy >= 0 && iy <= h) {
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(ix, iy, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f59e0b';
        ctx.font = 'bold 10px sans-serif';
        ctx.fillText('🛸 ISS', ix + 8, iy + 4);
      }
    }

    // Draw pinned location
    if (pinnedLocation) {
      const px = offsetX + (pinnedLocation.lon / 360) * mapW;
      const py = offsetY - (pinnedLocation.lat / 180) * mapH;
      if (px >= 0 && px <= w && py >= 0 && py <= h) {
        // Pin marker
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Radius circle
        const radiusPixels = (50 / 111) / (360 / mapW);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(px, py, radiusPixels, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`📍 ${pinnedLocation.lat.toFixed(2)}°, ${pinnedLocation.lon.toFixed(2)}°`, px + 10, py - 5);
      }
    }

    // Draw pinned location's aircraft/vessels if available
    if (pinData) {
      // Aircraft
      for (const ac of (pinData.aircraft || []).slice(0, 20)) {
        const ax = offsetX + (ac.longitude / 360) * mapW;
        const ay = offsetY - (ac.latitude / 180) * mapH;
        if (ax >= 0 && ax <= w && ay >= 0 && ay <= h) {
          ctx.fillStyle = '#10b981';
          ctx.font = '12px sans-serif';
          ctx.fillText('✈', ax - 6, ay + 4);
        }
      }

      // Vessels
      for (const v of (pinData.vessels || []).slice(0, 10)) {
        const vx = offsetX + (v.longitude / 360) * mapW;
        const vy = offsetY - (v.latitude / 180) * mapH;
        if (vx >= 0 && vx <= w && vy >= 0 && vy <= h) {
          ctx.fillStyle = '#6366f1';
          ctx.font = '12px sans-serif';
          ctx.fillText('🚢', vx - 6, vy + 4);
        }
      }

      // Crime heatmap dots
      for (const hm of (pinData.heatmaps || [])) {
        for (const pt of (hm.points || []).slice(0, 30)) {
          const cx = offsetX + (pt.longitude / 360) * mapW;
          const cy = offsetY - (pt.latitude / 180) * mapH;
          if (cx >= 0 && cx <= w && cy >= 0 && cy <= h) {
            const alpha = Math.min(pt.weight, 1);
            ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.4})`;
            ctx.beginPath();
            ctx.arc(cx, cy, 8 * pt.weight, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Title overlay
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('HCMN Global Intelligence Map', 10, 20);
    ctx.fillStyle = '#64748b';
    ctx.font = '11px sans-serif';
    ctx.fillText('Click on map or enter coordinates to pin location', 10, 36);
    ctx.fillText(`Zoom: ${zoom.toFixed(1)}x`, w - 80, 20);
  }, [viewCenter, zoom, issPos, pinnedLocation, pinData]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.getContext('2d').scale(dpr, dpr);
    // Store logical size for hit testing
    canvas._logicalWidth = rect.width;
    canvas._logicalHeight = rect.height;

    drawGlobe();
  }, [drawGlobe]);

  // Handle click on canvas to pin
  function handleCanvasClick(e) {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const w = rect.width;
    const h = rect.height;

    const mapW = w * zoom;
    const mapH = h * zoom;
    const offsetX = w / 2 - (viewCenter.lon / 360) * mapW;
    const offsetY = h / 2 + (viewCenter.lat / 180) * mapH;

    const lon = ((x - offsetX) / mapW) * 360;
    const lat = ((offsetY - y) / mapH) * 180;

    if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
      pinLocationOnMap(lat, lon);
    }
  }

  async function pinLocationOnMap(lat, lon) {
    setPinnedLocation({ lat, lon });
    setLoading(true);
    try {
      const data = await pinLocation(lat, lon, 50);
      setPinData(data);
    } catch {
      setPinData(null);
    }
    setLoading(false);
  }

  async function handleManualPin(e) {
    e.preventDefault();
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return;
    }
    setViewCenter({ lat, lon });
    await pinLocationOnMap(lat, lon);
  }

  // Quick pin presets
  const presets = [
    { name: 'NYC', lat: 40.7128, lon: -74.006 },
    { name: 'London', lat: 51.5074, lon: -0.1278 },
    { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
    { name: 'Dubai', lat: 25.2048, lon: 55.2708 },
    { name: 'SF', lat: 37.7749, lon: -122.4194 },
    { name: 'Sydney', lat: -33.8688, lon: 151.2093 },
  ];

  return (
    <div className="globe-module">
      <div className="section-title">
        <span className="icon">🌍</span>
        Global Surveillance & Tracking Intelligence
      </div>

      {/* Controls */}
      <div className="globe-controls">
        <form onSubmit={handleManualPin} className="coord-input">
          <label>
            Latitude
            <input
              type="number"
              step="0.0001"
              min="-90"
              max="90"
              placeholder="40.7128"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="0.0001"
              min="-180"
              max="180"
              placeholder="-74.006"
              value={manualLon}
              onChange={(e) => setManualLon(e.target.value)}
            />
          </label>
          <button type="submit" disabled={loading}>📌 Pin Location</button>
        </form>

        <div className="preset-pins">
          {presets.map((p) => (
            <button
              key={p.name}
              className="preset-btn"
              onClick={() => {
                setManualLat(String(p.lat));
                setManualLon(String(p.lon));
                setViewCenter({ lat: p.lat, lon: p.lon });
                pinLocationOnMap(p.lat, p.lon);
              }}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="zoom-controls">
          <button onClick={() => setZoom((z) => Math.min(z * 1.5, 10))}>🔍+</button>
          <button onClick={() => setZoom((z) => Math.max(z / 1.5, 0.5))}>🔍−</button>
          <button onClick={() => { setZoom(1); setViewCenter({ lat: 20, lon: 0 }); }}>🌐 Reset</button>
        </div>
      </div>

      {/* Map/Globe canvas */}
      <div className="globe-container">
        <canvas
          ref={canvasRef}
          className="globe-canvas"
          onClick={handleCanvasClick}
        />
        {loading && (
          <div className="globe-loading">
            <span>Aggregating intelligence data...</span>
          </div>
        )}
      </div>

      {/* Pin data panel */}
      {pinData && <PinPanel data={pinData} />}
    </div>
  );
}
