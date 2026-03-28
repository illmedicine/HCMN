import { useState, useEffect, useRef, useCallback } from 'react';
import { getAreaData, getAircraft, getSatellites, getCrimeData } from '../services/api';

const PRESET_LOCATIONS = [
  { label: 'New York City', lat: 40.7128, lon: -74.006 },
  { label: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
  { label: 'Chicago', lat: 41.8781, lon: -87.6298 },
  { label: 'Miami', lat: 25.7617, lon: -80.1918 },
  { label: 'London', lat: 51.5074, lon: -0.1278 },
  { label: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  { label: 'Houston', lat: 29.7604, lon: -95.3698 },
  { label: 'San Francisco', lat: 37.7749, lon: -122.4194 },
];

function formatAlt(m) {
  if (m >= 1000) return `${(m / 1000).toFixed(1)}km`;
  return `${Math.round(m)}m`;
}

function formatSpeed(ms) {
  return `${Math.round(ms * 3.6)} km/h`;
}

function severityColor(severity) {
  switch (severity) {
    case 'person': return 'var(--accent-red)';
    case 'property': return 'var(--accent-amber)';
    default: return 'var(--text-secondary)';
  }
}

export default function TrackingPanel() {
  const [lat, setLat] = useState('40.7128');
  const [lon, setLon] = useState('-74.0060');
  const [radius, setRadius] = useState('50');
  const [label, setLabel] = useState('New York City');
  const [areaData, setAreaData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeLayer, setActiveLayer] = useState('all');
  const mapCanvasRef = useRef(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAreaData(parseFloat(lat), parseFloat(lon), parseFloat(radius), label);
      setAreaData(data);
    } catch {
      setAreaData(null);
    }
    setLoading(false);
  }, [lat, lon, radius, label]);

  useEffect(() => { drawMap(); }, [areaData, activeLayer]);

  function selectPreset(preset) {
    setLat(String(preset.lat));
    setLon(String(preset.lon));
    setLabel(preset.label);
  }

  function handleSearch(e) {
    e.preventDefault();
    fetchData();
  }

  function popOutModule() {
    const w = window.open('', '_blank', 'width=1400,height=900,menubar=no,toolbar=no');
    if (!w) return;
    w.document.title = 'HCMN – Satellite & GPS Tracking';
    w.document.body.innerHTML = '<div style="background:#0a0e17;color:#e2e8f0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif"><h2>Module 2 – Satellite & GPS Tracking</h2><p>Pop-out window active.</p></div>';
  }

  function drawMap() {
    const canvas = mapCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = rect.width;
    const h = rect.height;

    // Dark map background
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    // Draw simplified world outline (equirectangular projection)
    const cLat = parseFloat(lat) || 0;
    const cLon = parseFloat(lon) || 0;
    const radiusKm = parseFloat(radius) || 50;

    // Projection helpers
    const zoom = Math.min(w, h) / (radiusKm * 0.06);
    function projX(longitude) { return w / 2 + (longitude - cLon) * zoom * Math.cos(cLat * Math.PI / 180); }
    function projY(latitude) { return h / 2 - (latitude - cLat) * zoom; }

    // Grid
    ctx.strokeStyle = '#1a2234';
    ctx.lineWidth = 0.5;
    for (let gLat = -90; gLat <= 90; gLat += 10) {
      const y = projY(gLat);
      if (y >= 0 && y <= h) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }
    for (let gLon = -180; gLon <= 180; gLon += 10) {
      const x = projX(gLon);
      if (x >= 0 && x <= w) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
    }

    // Pinned location circle
    const px = projX(cLon);
    const py = projY(cLat);
    ctx.beginPath();
    ctx.arc(px, py, radiusKm * zoom * 0.01, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.fill();

    // Center pin
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = '#3b82f6';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (!areaData) {
      ctx.fillStyle = '#475569';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pin a location and search to see tracking data', w / 2, h / 2 + 40);
      return;
    }

    // Draw aircraft
    if (activeLayer === 'all' || activeLayer === 'aircraft') {
      areaData.aircraft.forEach(ac => {
        const ax = projX(ac.longitude);
        const ay = projY(ac.latitude);
        if (ax < 0 || ax > w || ay < 0 || ay > h) return;

        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate((ac.heading || 0) * Math.PI / 180);
        ctx.fillStyle = ac.on_ground ? '#94a3b8' : '#f59e0b';
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(-5, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = '#f59e0b';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(ac.callsign || ac.icao24, ax + 10, ay - 2);
      });
    }

    // Draw vessels
    if (activeLayer === 'all' || activeLayer === 'vessels') {
      areaData.vessels.forEach(v => {
        const vx = projX(v.longitude);
        const vy = projY(v.latitude);
        if (vx < 0 || vx > w || vy < 0 || vy > h) return;

        ctx.beginPath();
        ctx.arc(vx, vy, 5, 0, Math.PI * 2);
        ctx.fillStyle = '#06b6d4';
        ctx.fill();
        ctx.strokeStyle = '#0e7490';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#06b6d4';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(v.name || v.mmsi, vx + 8, vy + 3);
      });
    }

    // Draw satellites
    if (activeLayer === 'all' || activeLayer === 'satellites') {
      areaData.satellites.forEach(sat => {
        const sx = projX(sat.longitude);
        const sy = projY(sat.latitude);

        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fillStyle = sat.is_visible ? '#a78bfa' : '#6b7280';
        ctx.fill();

        // Orbit ring
        ctx.beginPath();
        ctx.arc(sx, sy, 12, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#a78bfa';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(sat.name, sx, sy - 16);
      });
    }

    // Draw crime reports as heat dots
    if (activeLayer === 'all' || activeLayer === 'crime') {
      areaData.crime_reports.forEach(cr => {
        const cx = projX(cr.longitude);
        const cy = projY(cr.latitude);
        if (cx < 0 || cx > w || cy < 0 || cy > h) return;

        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 20);
        grad.addColorStop(0, cr.severity === 'person' ? 'rgba(239,68,68,0.6)' : 'rgba(245,158,11,0.5)');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.fillRect(cx - 20, cy - 20, 40, 40);

        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fillStyle = cr.severity === 'person' ? '#ef4444' : '#f59e0b';
        ctx.fill();
      });
    }

    // Draw nearby camera indicators
    if (activeLayer === 'all' || activeLayer === 'cameras') {
      areaData.nearby_cameras.forEach(cam => {
        if (!cam.location) return;
        const camx = projX(cam.location.longitude);
        const camy = projY(cam.location.latitude);
        if (camx < 0 || camx > w || camy < 0 || camy > h) return;

        ctx.fillStyle = '#10b981';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📹', camx, camy);

        ctx.fillStyle = '#10b981';
        ctx.font = '8px monospace';
        ctx.fillText(cam.name, camx, camy + 14);
      });
    }

    // Coord labels
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${cLat.toFixed(4)}°N, ${cLon.toFixed(4)}°E`, 8, h - 8);
    ctx.textAlign = 'right';
    ctx.fillText(`R: ${radiusKm}km`, w - 8, h - 8);
  }

  const layers = [
    { id: 'all', label: '🌐 All', color: '#3b82f6' },
    { id: 'aircraft', label: '✈️ Aircraft', color: '#f59e0b' },
    { id: 'vessels', label: '🚢 Vessels', color: '#06b6d4' },
    { id: 'satellites', label: '🛰️ Satellites', color: '#a78bfa' },
    { id: 'crime', label: '🔴 Crime', color: '#ef4444' },
    { id: 'cameras', label: '📹 Cameras', color: '#10b981' },
  ];

  return (
    <div className="module-panel tracking-module">
      <div className="module-header">
        <div className="module-title">
          <span className="module-icon">🌍</span>
          <h2>Module 2 – Satellite & GPS Tracking</h2>
        </div>
        <div className="module-actions">
          <button className="btn-popout" onClick={popOutModule} title="Open in new window">⧉ Pop Out</button>
        </div>
      </div>

      <div className="tracking-layout">
        {/* Control Sidebar */}
        <div className="tracking-sidebar">
          {/* Location Search */}
          <div className="tracking-card">
            <h3>📍 Pin Location</h3>
            <form onSubmit={handleSearch}>
              <div className="input-group">
                <label>Latitude</label>
                <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Longitude</label>
                <input type="number" step="any" value={lon} onChange={e => setLon(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Radius (km)</label>
                <input type="number" step="1" min="1" max="500" value={radius} onChange={e => setRadius(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Label</label>
                <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Location name" />
              </div>
              <button type="submit" className="btn-search" disabled={loading}>
                {loading ? 'Scanning…' : '🔍 Scan Area'}
              </button>
            </form>
          </div>

          {/* Quick Presets */}
          <div className="tracking-card">
            <h3>⚡ Quick Locations</h3>
            <div className="preset-grid">
              {PRESET_LOCATIONS.map(p => (
                <button key={p.label} className="preset-btn" onClick={() => selectPreset(p)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Layer Toggles */}
          <div className="tracking-card">
            <h3>🗂️ Data Layers</h3>
            <div className="layer-toggles">
              {layers.map(l => (
                <button
                  key={l.id}
                  className={`layer-btn ${activeLayer === l.id ? 'active' : ''}`}
                  style={activeLayer === l.id ? { borderColor: l.color, color: l.color } : {}}
                  onClick={() => setActiveLayer(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Data Summary */}
          {areaData && (
            <div className="tracking-card summary-card">
              <h3>📊 Area Summary</h3>
              <p className="summary-text">{areaData.summary}</p>
              <div className="summary-stats">
                <div className="stat">
                  <span className="stat-num">{areaData.aircraft.length}</span>
                  <span className="stat-label">Aircraft</span>
                </div>
                <div className="stat">
                  <span className="stat-num">{areaData.vessels.length}</span>
                  <span className="stat-label">Vessels</span>
                </div>
                <div className="stat">
                  <span className="stat-num">{areaData.satellites.length}</span>
                  <span className="stat-label">Satellites</span>
                </div>
                <div className="stat">
                  <span className="stat-num">{areaData.crime_reports.length}</span>
                  <span className="stat-label">Crime Reports</span>
                </div>
                <div className="stat">
                  <span className="stat-num">{areaData.nearby_cameras.length}</span>
                  <span className="stat-label">Cameras</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Map + Data Panels */}
        <div className="tracking-main">
          {/* Map */}
          <div className="tracking-map">
            <canvas ref={mapCanvasRef} />
          </div>

          {/* Data Tables */}
          {areaData && (
            <div className="tracking-data-panels">
              {/* Aircraft Table */}
              {(activeLayer === 'all' || activeLayer === 'aircraft') && areaData.aircraft.length > 0 && (
                <div className="data-table-card">
                  <h4>✈️ Aircraft ({areaData.aircraft.length})</h4>
                  <div className="data-table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr><th>Callsign</th><th>Country</th><th>Alt</th><th>Speed</th><th>Heading</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {areaData.aircraft.map((ac, i) => (
                          <tr key={i}>
                            <td className="mono">{ac.callsign || ac.icao24}</td>
                            <td>{ac.origin_country}</td>
                            <td className="mono">{formatAlt(ac.altitude_m)}</td>
                            <td className="mono">{formatSpeed(ac.velocity_ms)}</td>
                            <td className="mono">{Math.round(ac.heading)}°</td>
                            <td><span className={`status-badge ${ac.on_ground ? 'ground' : 'airborne'}`}>{ac.on_ground ? 'Ground' : 'Airborne'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Vessels Table */}
              {(activeLayer === 'all' || activeLayer === 'vessels') && areaData.vessels.length > 0 && (
                <div className="data-table-card">
                  <h4>🚢 Vessels ({areaData.vessels.length})</h4>
                  <div className="data-table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr><th>Name</th><th>Type</th><th>Speed</th><th>Heading</th><th>Destination</th></tr>
                      </thead>
                      <tbody>
                        {areaData.vessels.map((v, i) => (
                          <tr key={i}>
                            <td className="mono">{v.name || v.mmsi}</td>
                            <td>{v.vessel_type}</td>
                            <td className="mono">{v.speed_knots.toFixed(1)} kts</td>
                            <td className="mono">{Math.round(v.heading)}°</td>
                            <td>{v.destination}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Satellites Table */}
              {(activeLayer === 'all' || activeLayer === 'satellites') && areaData.satellites.length > 0 && (
                <div className="data-table-card">
                  <h4>🛰️ Satellites ({areaData.satellites.length})</h4>
                  <div className="data-table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr><th>Name</th><th>NORAD ID</th><th>Altitude</th><th>Azimuth</th><th>Elevation</th><th>Visible</th></tr>
                      </thead>
                      <tbody>
                        {areaData.satellites.map((s, i) => (
                          <tr key={i}>
                            <td className="mono">{s.name}</td>
                            <td className="mono">{s.norad_id}</td>
                            <td className="mono">{s.altitude_km.toFixed(0)} km</td>
                            <td className="mono">{s.azimuth.toFixed(1)}°</td>
                            <td className="mono">{s.elevation.toFixed(1)}°</td>
                            <td><span className={`status-badge ${s.is_visible ? 'visible' : 'hidden'}`}>{s.is_visible ? 'Yes' : 'No'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Crime Reports Table */}
              {(activeLayer === 'all' || activeLayer === 'crime') && areaData.crime_reports.length > 0 && (
                <div className="data-table-card">
                  <h4>🔴 Crime Reports ({areaData.crime_reports.length})</h4>
                  <div className="data-table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr><th>Type</th><th>Description</th><th>Severity</th><th>Location</th></tr>
                      </thead>
                      <tbody>
                        {areaData.crime_reports.map((cr, i) => (
                          <tr key={i}>
                            <td><strong>{cr.incident_type}</strong></td>
                            <td>{cr.description}</td>
                            <td><span className="severity-badge" style={{ color: severityColor(cr.severity) }}>{cr.severity}</span></td>
                            <td className="mono">{cr.latitude.toFixed(4)}, {cr.longitude.toFixed(4)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Nearby Cameras */}
              {(activeLayer === 'all' || activeLayer === 'cameras') && areaData.nearby_cameras.length > 0 && (
                <div className="data-table-card">
                  <h4>📹 Nearby Camera Feeds ({areaData.nearby_cameras.length})</h4>
                  <div className="nearby-cam-grid">
                    {areaData.nearby_cameras.map(cam => (
                      <div key={cam.id} className="nearby-cam-card">
                        <span className="cam-name">{cam.name}</span>
                        <span className="cam-source">{cam.source}</span>
                        {cam.is_live && <span className="live-badge-sm">● LIVE</span>}
                        <span className="cam-hint">Open in Module 1 →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
