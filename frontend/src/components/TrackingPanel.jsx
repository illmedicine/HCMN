import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { fetchLiveAircraft, fetchTLEs } from '../services/api';

/* ---------- CesiumJS + resium ---------- */
import * as Cesium from 'cesium';
import { Viewer, Entity, PolylineGraphics, LabelGraphics, PointGraphics } from 'resium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

/* ---------- satellite.js for TLE propagation ---------- */
import * as satellite from 'satellite.js';

// Use Cesium Ion default token (free tier, provides base imagery & terrain)
Cesium.Ion.defaultAccessToken =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJlYWE1OWUxNy1mMWZiLTQzYjYtYTQ0OS1kMWFjYmFkNjc5YzciLCJpZCI6NTc3MzMsImlhdCI6MTYyNzg0NTE4Mn0.XcKpgANiY19MC4bdFUXMVEBToBmqS8kuYpUlxJHYZxk';

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
  if (m == null) return '—';
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.round(m)} m`;
}

function formatSpeed(ms) {
  if (ms == null) return '—';
  return `${Math.round(ms * 3.6)} km/h`;
}

/* ---------- propagate a single TLE to lat/lon/alt ---------- */
function propagateTLE(tle1, tle2) {
  try {
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const now = new Date();
    const pv = satellite.propagate(satrec, now);
    if (!pv.position) return null;
    const gmst = satellite.gstime(now);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    return {
      latitude: satellite.degreesLat(geo.latitude),
      longitude: satellite.degreesLong(geo.longitude),
      altitude_km: geo.height,
    };
  } catch {
    return null;
  }
}

/* ---------- compute sample orbit path (~90 min ahead) ---------- */
function computeOrbitPath(tle1, tle2, steps = 120) {
  try {
    const satrec = satellite.twoline2satrec(tle1, tle2);
    const now = Date.now();
    const positions = [];
    for (let i = 0; i <= steps; i++) {
      const t = new Date(now + i * 45000); // 45-sec steps ≈ 90 min total
      const pv = satellite.propagate(satrec, t);
      if (!pv.position) continue;
      const gmst = satellite.gstime(t);
      const geo = satellite.eciToGeodetic(pv.position, gmst);
      positions.push(
        Cesium.Cartesian3.fromDegrees(
          satellite.degreesLong(geo.longitude),
          satellite.degreesLat(geo.latitude),
          geo.height * 1000,
        ),
      );
    }
    return positions;
  } catch {
    return [];
  }
}

export default function TrackingPanel() {
  const [lat, setLat] = useState('40.7128');
  const [lon, setLon] = useState('-74.0060');
  const [radius, setRadius] = useState('200');
  const [label, setLabel] = useState('New York City');
  const [loading, setLoading] = useState(false);

  const [aircraft, setAircraft] = useState([]);
  const [satellites, setSatellites] = useState([]);
  const [activeLayer, setActiveLayer] = useState('all');
  const [tleGroup, setTleGroup] = useState('stations');
  const [autoRefresh, setAutoRefresh] = useState(true);

  const viewerRef = useRef(null);

  /* ---------- Fly camera to location ---------- */
  const flyTo = useCallback((latitude, longitude, alt = 800000) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(longitude, latitude, alt),
      duration: 1.5,
    });
  }, []);

  /* ---------- Fetch live aircraft from OpenSky ---------- */
  const loadAircraft = useCallback(async () => {
    const cLat = parseFloat(lat);
    const cLon = parseFloat(lon);
    const r = parseFloat(radius);
    if (isNaN(cLat) || isNaN(cLon)) return;
    const result = await fetchLiveAircraft(cLat, cLon, r);
    if (result) setAircraft(result);
  }, [lat, lon, radius]);

  /* ---------- Fetch satellite TLEs and propagate ---------- */
  const loadSatellites = useCallback(async () => {
    const tles = await fetchTLEs(tleGroup);
    if (!tles) return;
    // Limit to 50 for UI perf
    const propagated = tles
      .slice(0, 50)
      .map((t) => {
        const pos = propagateTLE(t.tle1, t.tle2);
        if (!pos) return null;
        return { ...t, ...pos };
      })
      .filter(Boolean);
    setSatellites(propagated);
  }, [tleGroup]);

  /* ---------- Scan button handler ---------- */
  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    await Promise.all([loadAircraft(), loadSatellites()]);
    flyTo(parseFloat(lat), parseFloat(lon));
    setLoading(false);
  }

  /* ---------- Auto-refresh aircraft every 15s ---------- */
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(loadAircraft, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, loadAircraft]);

  /* ---------- Re-propagate satellites every 30s ---------- */
  useEffect(() => {
    if (satellites.length === 0) return;
    const id = setInterval(() => {
      setSatellites((prev) =>
        prev.map((s) => {
          const pos = propagateTLE(s.tle1, s.tle2);
          return pos ? { ...s, ...pos } : s;
        }),
      );
    }, 30000);
    return () => clearInterval(id);
  }, [satellites.length]);

  function selectPreset(preset) {
    setLat(String(preset.lat));
    setLon(String(preset.lon));
    setLabel(preset.label);
    flyTo(preset.lat, preset.lon);
  }

  function popOutModule() {
    const w = window.open('', '_blank', 'width=1400,height=900,menubar=no,toolbar=no');
    if (!w) return;
    w.document.title = 'HCMN – Satellite & Flight Tracking';
    w.document.body.innerHTML =
      '<div style="background:#0a0e17;color:#e2e8f0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif"><h2>Module 2 – Pop-out</h2></div>';
  }

  /* ---------- Satellite orbit lines (memoized) ---------- */
  const satOrbits = useMemo(() => {
    if (activeLayer !== 'all' && activeLayer !== 'satellites') return [];
    return satellites
      .slice(0, 10)
      .map((s) => ({
        id: s.norad_id,
        name: s.name,
        positions: computeOrbitPath(s.tle1, s.tle2),
      }))
      .filter((o) => o.positions.length > 1);
  }, [satellites, activeLayer]);

  const layers = [
    { id: 'all', label: '🌐 All', color: '#3b82f6' },
    { id: 'aircraft', label: '✈️ Aircraft', color: '#f59e0b' },
    { id: 'satellites', label: '🛰️ Satellites', color: '#a78bfa' },
  ];

  const tleGroups = [
    { id: 'stations', label: 'Space Stations' },
    { id: 'visual', label: 'Bright Sats' },
    { id: 'weather', label: 'Weather' },
    { id: 'gps', label: 'GPS' },
    { id: 'starlink', label: 'Starlink' },
  ];

  const showAircraft = activeLayer === 'all' || activeLayer === 'aircraft';
  const showSatellites = activeLayer === 'all' || activeLayer === 'satellites';

  return (
    <div className="module-panel tracking-module">
      <div className="module-header">
        <div className="module-title">
          <span className="module-icon">🌍</span>
          <h2>Module 2 – Satellite &amp; Flight Tracking</h2>
          <span className="feed-count">
            {aircraft.length} flights · {satellites.length} sats
          </span>
        </div>
        <div className="module-actions">
          <label className="auto-refresh-toggle">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button className="btn-popout" onClick={popOutModule} title="Open in new window">
            ⧉ Pop Out
          </button>
        </div>
      </div>

      <div className="tracking-layout">
        {/* SIDEBAR */}
        <div className="tracking-sidebar">
          <div className="tracking-card">
            <h3>📍 Pin Location</h3>
            <form onSubmit={handleSearch}>
              <div className="input-group">
                <label>Latitude</label>
                <input type="number" step="any" value={lat} onChange={(e) => setLat(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Longitude</label>
                <input type="number" step="any" value={lon} onChange={(e) => setLon(e.target.value)} />
              </div>
              <div className="input-group">
                <label>Radius (km)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="500"
                  value={radius}
                  onChange={(e) => setRadius(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label>Label</label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Location name"
                />
              </div>
              <button type="submit" className="btn-search" disabled={loading}>
                {loading ? 'Scanning…' : '🔍 Scan Area'}
              </button>
            </form>
          </div>

          <div className="tracking-card">
            <h3>⚡ Quick Locations</h3>
            <div className="preset-grid">
              {PRESET_LOCATIONS.map((p) => (
                <button key={p.label} className="preset-btn" onClick={() => selectPreset(p)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="tracking-card">
            <h3>🗂️ Data Layers</h3>
            <div className="layer-toggles">
              {layers.map((l) => (
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

          <div className="tracking-card">
            <h3>🛰️ Satellite Group</h3>
            <div className="layer-toggles">
              {tleGroups.map((g) => (
                <button
                  key={g.id}
                  className={`layer-btn ${tleGroup === g.id ? 'active' : ''}`}
                  style={tleGroup === g.id ? { borderColor: '#a78bfa', color: '#a78bfa' } : {}}
                  onClick={() => setTleGroup(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>

          {(aircraft.length > 0 || satellites.length > 0) && (
            <div className="tracking-card summary-card">
              <h3>📊 Area Summary</h3>
              <div className="summary-stats">
                <div className="stat">
                  <span className="stat-num">{aircraft.length}</span>
                  <span className="stat-label">Aircraft</span>
                </div>
                <div className="stat">
                  <span className="stat-num">{satellites.length}</span>
                  <span className="stat-label">Satellites</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* GLOBE + TABLES */}
        <div className="tracking-main">
          <div className="tracking-map cesium-wrapper">
            <Viewer
              ref={viewerRef}
              full={false}
              timeline={false}
              animation={false}
              homeButton={false}
              geocoder={false}
              navigationHelpButton={false}
              sceneModePicker={true}
              baseLayerPicker={false}
              fullscreenButton={false}
              infoBox={true}
              selectionIndicator={true}
              style={{ width: '100%', height: '100%' }}
            >
              {/* Aircraft */}
              {showAircraft &&
                aircraft.map((ac) => (
                  <Entity
                    key={ac.icao24}
                    name={ac.callsign || ac.icao24}
                    description={`<table style="width:100%">
                      <tr><td>Callsign</td><td><b>${ac.callsign || '—'}</b></td></tr>
                      <tr><td>ICAO24</td><td>${ac.icao24}</td></tr>
                      <tr><td>Country</td><td>${ac.origin_country}</td></tr>
                      <tr><td>Altitude</td><td>${formatAlt(ac.altitude_m)}</td></tr>
                      <tr><td>Speed</td><td>${formatSpeed(ac.velocity_ms)}</td></tr>
                      <tr><td>Heading</td><td>${Math.round(ac.heading)}°</td></tr>
                      <tr><td>Status</td><td>${ac.on_ground ? 'On Ground' : 'Airborne'}</td></tr>
                    </table>`}
                    position={Cesium.Cartesian3.fromDegrees(ac.longitude, ac.latitude, ac.altitude_m || 0)}
                  >
                    <PointGraphics
                      pixelSize={ac.on_ground ? 6 : 8}
                      color={
                        ac.on_ground
                          ? Cesium.Color.GRAY
                          : Cesium.Color.fromCssColorString('#f59e0b')
                      }
                      outlineColor={Cesium.Color.WHITE}
                      outlineWidth={1}
                    />
                    <LabelGraphics
                      text={ac.callsign || ac.icao24}
                      font="11px monospace"
                      fillColor={Cesium.Color.fromCssColorString('#f59e0b')}
                      style={Cesium.LabelStyle.FILL_AND_OUTLINE}
                      outlineColor={Cesium.Color.BLACK}
                      outlineWidth={2}
                      pixelOffset={new Cesium.Cartesian2(12, -4)}
                      scale={0.9}
                      distanceDisplayCondition={new Cesium.DistanceDisplayCondition(0, 2000000)}
                    />
                  </Entity>
                ))}

              {/* Satellites */}
              {showSatellites &&
                satellites.map((sat) => (
                  <Entity
                    key={sat.norad_id}
                    name={sat.name}
                    description={`<table style="width:100%">
                      <tr><td>Name</td><td><b>${sat.name}</b></td></tr>
                      <tr><td>NORAD ID</td><td>${sat.norad_id}</td></tr>
                      <tr><td>Altitude</td><td>${sat.altitude_km?.toFixed(0) || '—'} km</td></tr>
                      <tr><td>Inclination</td><td>${sat.inclination?.toFixed(1) || '—'}°</td></tr>
                      <tr><td>Period</td><td>${sat.period_min?.toFixed(1) || '—'} min</td></tr>
                      <tr><td>Lat / Lon</td><td>${sat.latitude?.toFixed(3)}° / ${sat.longitude?.toFixed(3)}°</td></tr>
                    </table>`}
                    position={Cesium.Cartesian3.fromDegrees(
                      sat.longitude,
                      sat.latitude,
                      (sat.altitude_km || 400) * 1000,
                    )}
                  >
                    <PointGraphics
                      pixelSize={6}
                      color={Cesium.Color.fromCssColorString('#a78bfa')}
                      outlineColor={Cesium.Color.WHITE}
                      outlineWidth={1}
                    />
                    <LabelGraphics
                      text={sat.name}
                      font="10px monospace"
                      fillColor={Cesium.Color.fromCssColorString('#c4b5fd')}
                      style={Cesium.LabelStyle.FILL_AND_OUTLINE}
                      outlineColor={Cesium.Color.BLACK}
                      outlineWidth={2}
                      pixelOffset={new Cesium.Cartesian2(10, -4)}
                      scale={0.8}
                      distanceDisplayCondition={new Cesium.DistanceDisplayCondition(0, 15000000)}
                    />
                  </Entity>
                ))}

              {/* Orbit paths */}
              {showSatellites &&
                satOrbits.map((orbit) => (
                  <Entity key={`orbit-${orbit.id}`} name={`${orbit.name} orbit`}>
                    <PolylineGraphics
                      positions={orbit.positions}
                      width={1.5}
                      material={Cesium.Color.fromCssColorString('#a78bfa').withAlpha(0.4)}
                    />
                  </Entity>
                ))}

              {/* Pinned search location */}
              <Entity
                name={label}
                position={Cesium.Cartesian3.fromDegrees(parseFloat(lon) || 0, parseFloat(lat) || 0)}
              >
                <PointGraphics
                  pixelSize={10}
                  color={Cesium.Color.fromCssColorString('#3b82f6')}
                  outlineColor={Cesium.Color.WHITE}
                  outlineWidth={2}
                />
                <LabelGraphics
                  text={label}
                  font="13px sans-serif"
                  fillColor={Cesium.Color.WHITE}
                  style={Cesium.LabelStyle.FILL_AND_OUTLINE}
                  outlineColor={Cesium.Color.BLACK}
                  outlineWidth={3}
                  pixelOffset={new Cesium.Cartesian2(0, -20)}
                />
              </Entity>
            </Viewer>
          </div>

          {/* Data Tables */}
          <div className="tracking-data-panels">
            {showAircraft && aircraft.length > 0 && (
              <div className="data-table-card">
                <h4>✈️ Live Aircraft ({aircraft.length})</h4>
                <div className="data-table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Callsign</th>
                        <th>Country</th>
                        <th>Alt</th>
                        <th>Speed</th>
                        <th>Heading</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {aircraft.slice(0, 50).map((ac, i) => (
                        <tr key={i}>
                          <td className="mono">{ac.callsign || ac.icao24}</td>
                          <td>{ac.origin_country}</td>
                          <td className="mono">{formatAlt(ac.altitude_m)}</td>
                          <td className="mono">{formatSpeed(ac.velocity_ms)}</td>
                          <td className="mono">{Math.round(ac.heading)}°</td>
                          <td>
                            <span className={`status-badge ${ac.on_ground ? 'ground' : 'airborne'}`}>
                              {ac.on_ground ? 'Ground' : 'Airborne'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {showSatellites && satellites.length > 0 && (
              <div className="data-table-card">
                <h4>🛰️ Satellites ({satellites.length})</h4>
                <div className="data-table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>NORAD ID</th>
                        <th>Alt (km)</th>
                        <th>Lat</th>
                        <th>Lon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {satellites.map((s, i) => (
                        <tr key={i}>
                          <td className="mono">{s.name}</td>
                          <td className="mono">{s.norad_id}</td>
                          <td className="mono">{s.altitude_km?.toFixed(0) || '—'}</td>
                          <td className="mono">{s.latitude?.toFixed(2)}°</td>
                          <td className="mono">{s.longitude?.toFixed(2)}°</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
