import { useState, useEffect, useRef, useCallback } from 'react';
import { setOptions as gmpSetOptions, importLibrary } from '@googlemaps/js-api-loader';
import { getGlobePOIs, getGlobeFlights, getGlobeSatellites, getGlobeConfig, setGlobeApiKey, sendChatMessage } from '../services/api';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const LAYER_COLORS = {
  military: '#ff4444',
  commercial: '#44aaff',
  satellite: '#ffcc00',
  poi: '#00ff88',
  osm: '#ff8800',
};

const POI_TYPE_COLORS = {
  military: '#ff4444',
  intelligence: '#cc44ff',
  space: '#ffcc00',
};

const SAT_TYPE_COLORS = {
  station: '#00ffcc',
  navigation: '#44aaff',
  communication: '#aaaaff',
  reconnaissance: '#ff4444',
  'military-comms': '#ff8800',
  'early-warning': '#ffcc00',
};

const STORAGE_KEY = 'hcmn_google_maps_api_key';
const REQUIRED_APIS_FALLBACK = [
  { name: 'Maps JavaScript API', url: 'https://console.cloud.google.com/apis/library/maps-backend.googleapis.com', description: 'Core map rendering, markers, polylines, and controls' },
  { name: 'Map Tiles API', url: 'https://console.cloud.google.com/apis/library/tile.googleapis.com', description: 'Photorealistic 3D Tiles for the 3D globe view' },
  { name: 'Places API (New)', url: 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com', description: 'Place cards, search, and autocomplete' },
];

// Track whether setOptions has already been called (can only be called once)
let gmpConfigured = false;

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function GlobePanel() {
  const mapRef = useRef(null);
  const map3dRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const googleRef = useRef(null);

  const [apiKeyInput, setApiKeyInput] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [keyLoading, setKeyLoading] = useState(true);
  const [requiredAPIs, setRequiredAPIs] = useState([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');

  // ── Auto-load API key from backend (falls back to localStorage) ──────
  useEffect(() => {
    getGlobeConfig().then(cfg => {
      const key = cfg.apiKey || localStorage.getItem(STORAGE_KEY) || '';
      if (key) {
        setActiveKey(key);
        setApiKeyInput(key);
      }
      setRequiredAPIs(cfg.requiredAPIs?.length ? cfg.requiredAPIs : REQUIRED_APIS_FALLBACK);
      setKeyLoading(false);
    });
  }, []);

  const [layers, setLayers] = useState({
    flights: true,
    satellites: true,
    pois: true,
    osm: false,
  });

  const [pois, setPois] = useState([]);
  const [flights, setFlights] = useState([]);
  const [satellites, setSatellites] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [viewMode, setViewMode] = useState('3d'); // 3d | flat
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [flyTarget, setFlyTarget] = useState('');
  const [isPopped, setIsPopped] = useState(false);

  // ── Load data ──────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([getGlobePOIs(), getGlobeFlights(), getGlobeSatellites()])
      .then(([p, f, s]) => { setPois(p); setFlights(f); setSatellites(s); });
  }, []);

  // ── Init Google Maps (functional API v2) ────────────────────────────
  useEffect(() => {
    if (!activeKey || !mapRef.current) return;

    setMapError('');

    // setOptions can only be called once per page load
    if (!gmpConfigured) {
      gmpSetOptions({ key: activeKey, v: 'beta' });
      gmpConfigured = true;
    }

    (async () => {
      try {
        const [mapsLib, maps3dLib] = await Promise.all([
          importLibrary('maps'),
          importLibrary('maps3d').catch(() => null),
        ]);
        await importLibrary('marker');
        const google = window.google;
        googleRef.current = google;

        if (viewMode === '3d' && maps3dLib?.Map3DElement) {
          const el = new maps3dLib.Map3DElement({
            center: { lat: 20, lng: 0, altitude: 15000000 },
            range: 25000000,
            tilt: 0,
            heading: 0,
          });
          mapRef.current.innerHTML = '';
          mapRef.current.appendChild(el);
          map3dRef.current = el;
          setMapReady(true);
        } else {
          const m = new mapsLib.Map(mapRef.current, {
            center: { lat: 20, lng: 0 },
            zoom: 2,
            mapTypeId: 'hybrid',
            mapId: 'hcmn_globe',
            gestureHandling: 'greedy',
          });
          map3dRef.current = m;
          setMapReady(true);
        }
      } catch (err) {
        console.error('Google Maps load error:', err);
        setMapError(err.message || 'Failed to load Google Maps');
      }
    })();
  }, [activeKey, viewMode]);

  // ── Clear & redraw overlays ────────────────────────────────────────────
  const clearOverlays = useCallback(() => {
    markersRef.current.forEach(m => { if (m.setMap) m.setMap(null); else if (m.remove) m.remove(); });
    polylinesRef.current.forEach(p => { if (p.setMap) p.setMap(null); else if (p.remove) p.remove(); });
    markersRef.current = [];
    polylinesRef.current = [];
  }, []);

  useEffect(() => {
    if (!mapReady || !googleRef.current) return;
    clearOverlays();
    const google = googleRef.current;
    const map = map3dRef.current;
    const is3d = viewMode === '3d' && map instanceof google.maps.maps3d?.Map3DElement;

    // Helper: create marker
    function addMarker(lat, lng, title, color, icon, onClick) {
      if (is3d) {
        // For 3D map, we use Marker3DElement if available
        if (google.maps.maps3d?.Marker3DElement) {
          const m = new google.maps.maps3d.Marker3DElement({
            position: { lat, lng, altitude: 0 },
            label: icon || title.charAt(0),
          });
          map.appendChild(m);
          markersRef.current.push(m);
          if (onClick) m.addEventListener('gmp-click', onClick);
        }
      } else {
        // Standard Advanced Marker
        const pin = new google.maps.marker.PinElement({
          background: color,
          borderColor: '#222',
          glyphColor: '#fff',
          glyph: icon || title.charAt(0),
          scale: 1.1,
        });
        const m = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat, lng },
          title,
          content: pin.element,
        });
        markersRef.current.push(m);
        if (onClick) m.addEventListener('click', onClick);
      }
    }

    // Helper: draw polyline
    function addPolyline(path, color, weight = 2) {
      if (is3d) {
        if (google.maps.maps3d?.Polyline3DElement) {
          const coords = path.map(p => ({ lat: p.lat, lng: p.lng, altitude: (p.alt || 0) }));
          const poly = new google.maps.maps3d.Polyline3DElement({
            coordinates: coords,
            strokeColor: color,
            strokeWidth: weight,
            altitudeMode: 'ABSOLUTE',
          });
          map.appendChild(poly);
          polylinesRef.current.push(poly);
        }
      } else {
        const poly = new google.maps.Polyline({
          path: path.map(p => ({ lat: p.lat, lng: p.lng })),
          strokeColor: color,
          strokeWeight: weight,
          strokeOpacity: 0.8,
          geodesic: true,
          map,
        });
        polylinesRef.current.push(poly);
      }
    }

    // -- POIs
    if (layers.pois) {
      pois.forEach(poi => {
        addMarker(poi.lat, poi.lng, poi.name,
          POI_TYPE_COLORS[poi.type] || LAYER_COLORS.poi, poi.icon,
          () => setSelectedEntity({ ...poi, entityType: 'poi' }));
      });
    }

    // -- Flights
    if (layers.flights) {
      flights.forEach(flt => {
        const color = flt.type === 'military' ? LAYER_COLORS.military : LAYER_COLORS.commercial;
        if (flt.waypoints?.length) {
          addPolyline(flt.waypoints, color, 3);
          const last = flt.waypoints[flt.waypoints.length - 1];
          addMarker(last.lat, last.lng, flt.callsign, color,
            flt.type === 'military' ? '✈️' : '🛫',
            () => setSelectedEntity({ ...flt, entityType: 'flight' }));
        }
      });
    }

    // -- Satellites
    if (layers.satellites) {
      satellites.forEach(sat => {
        const color = SAT_TYPE_COLORS[sat.type] || LAYER_COLORS.satellite;
        addMarker(sat.lat, sat.lng, sat.name, color, '🛰️',
          () => setSelectedEntity({ ...sat, entityType: 'satellite' }));
      });
    }

    // -- OSM tile overlay (flat map only)
    if (layers.osm && !is3d && map.overlayMapTypes) {
      const osmLayer = new google.maps.ImageMapType({
        getTileUrl: (coord, zoom) =>
          `https://tile.openstreetmap.org/${zoom}/${coord.x}/${coord.y}.png`,
        tileSize: new google.maps.Size(256, 256),
        name: 'OSM',
        maxZoom: 19,
        opacity: 0.6,
      });
      map.overlayMapTypes.clear();
      map.overlayMapTypes.push(osmLayer);
    }
  }, [mapReady, layers, pois, flights, satellites, viewMode, clearOverlays]);

  // ── Fly to location ────────────────────────────────────────────────────
  function flyTo(lat, lng, altitude = 1000) {
    if (!mapReady || !map3dRef.current) return;
    const google = googleRef.current;
    const map = map3dRef.current;
    if (map instanceof google.maps.maps3d?.Map3DElement) {
      map.flyCameraTo({
        endCamera: { center: { lat, lng, altitude: 0 }, range: altitude * 5, tilt: 55, heading: 0 },
        durationMillis: 2500,
      });
    } else if (map.panTo) {
      map.panTo({ lat, lng });
      map.setZoom(Math.max(6, 18 - Math.log2(altitude / 100)));
    }
  }

  function handleFlyTo() {
    const target = flyTarget.trim().toLowerCase();
    if (!target) return;
    // Check POIs
    const poi = pois.find(p => p.name.toLowerCase().includes(target));
    if (poi) { flyTo(poi.lat, poi.lng, 5000); return; }
    // Check flights
    const flt = flights.find(f => f.callsign.toLowerCase().includes(target));
    if (flt?.waypoints?.length) {
      const last = flt.waypoints[flt.waypoints.length - 1];
      flyTo(last.lat, last.lng, last.alt || 10000);
      return;
    }
    // Check satellites
    const sat = satellites.find(s => s.name.toLowerCase().includes(target));
    if (sat) { flyTo(sat.lat, sat.lng, sat.alt * 1000); return; }
    // Try geocoding as coordinates "lat, lng"
    const coords = target.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coords) { flyTo(parseFloat(coords[1]), parseFloat(coords[2]), 5000); }
  }

  // ── Chat ───────────────────────────────────────────────────────────────
  async function handleChat(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    try {
      const resp = await sendChatMessage(userMsg, 'globe');
      setChatMessages(prev => [...prev, { role: 'assistant', text: resp.reply || resp.text || JSON.stringify(resp) }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', text: 'AI unavailable – running in demo mode.' }]);
    }
  }

  // ── Pop-out ────────────────────────────────────────────────────────────
  function handlePopOut() {
    const w = window.open(
      `${window.location.origin}${window.location.pathname}?module=globe`,
      'hcmn-globe', 'width=1600,height=1000,menubar=no,toolbar=no'
    );
    if (w) setIsPopped(true);
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="globe-panel">
      {/* Toolbar */}
      <div className="globe-toolbar">
        <div className="globe-toolbar-left">
          <h2>🌐 3D Globe</h2>
          <div className="globe-view-toggle">
            <button className={viewMode === '3d' ? 'active' : ''} onClick={() => setViewMode('3d')}>3D Globe</button>
            <button className={viewMode === 'flat' ? 'active' : ''} onClick={() => setViewMode('flat')}>Flat Map</button>
          </div>
        </div>
        <div className="globe-toolbar-center">
          <div className="globe-fly-form">
            <input
              type="text"
              placeholder="Fly to location or entity…"
              value={flyTarget}
              onChange={e => setFlyTarget(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFlyTo()}
            />
            <button onClick={handleFlyTo}>Go</button>
          </div>
        </div>
        <div className="globe-toolbar-right">
          <button className="btn-popout" onClick={handlePopOut} title="Pop out">⧉</button>
        </div>
      </div>

      <div className="globe-layout">
        {/* Sidebar */}
        <aside className="globe-sidebar">
          {/* API Key — only shows when not configured */}
          {!activeKey && !keyLoading && (
            <div className="globe-card">
              <h3>Google Maps API Key</h3>
              <p className="globe-hint">
                Enter your API key once — it will be saved to the backend permanently.
              </p>
              {requiredAPIs.length > 0 && (
                <div className="globe-required-apis">
                  <p className="globe-hint" style={{ marginBottom: '0.3rem', fontWeight: 600 }}>Required APIs (enable in Google Cloud Console):</p>
                  {requiredAPIs.map((api, i) => (
                    <a key={i} href={api.url} target="_blank" rel="noopener noreferrer" className="globe-api-link">
                      ✅ {api.name}
                      <span className="globe-api-desc">{api.description}</span>
                    </a>
                  ))}
                </div>
              )}
              <div className="globe-key-form">
                <input
                  type="password"
                  placeholder="AIza…"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                />
                <button onClick={async () => {
                  const key = apiKeyInput.trim();
                  if (!key) return;
                  localStorage.setItem(STORAGE_KEY, key);
                  await setGlobeApiKey(key);
                  setActiveKey(key);
                }}>
                  Save &amp; Load
                </button>
              </div>
            </div>
          )}

          {/* Layers */}
          <div className="globe-card">
            <h3>Layers</h3>
            {Object.entries(layers).map(([key, val]) => (
              <label key={key} className="globe-layer-toggle">
                <input type="checkbox" checked={val}
                  onChange={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))} />
                <span className="layer-dot" style={{ background: LAYER_COLORS[key === 'pois' ? 'poi' : key] || '#888' }} />
                {key === 'pois' ? 'Points of Interest' : key === 'osm' ? 'OpenStreetMap Overlay' : key.charAt(0).toUpperCase() + key.slice(1)}
              </label>
            ))}
          </div>

          {/* Quick Fly */}
          <div className="globe-card">
            <h3>Quick Fly</h3>
            <div className="globe-quick-fly">
              {pois.slice(0, 6).map(poi => (
                <button key={poi.id} onClick={() => { flyTo(poi.lat, poi.lng, 5000); setSelectedEntity({ ...poi, entityType: 'poi' }); }}>
                  {poi.icon} {poi.name}
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          <div className="globe-card">
            <h3>Data Summary</h3>
            <div className="globe-stats">
              <div className="globe-stat">
                <span className="stat-val">{pois.length}</span>
                <span className="stat-lbl">POIs</span>
              </div>
              <div className="globe-stat">
                <span className="stat-val">{flights.length}</span>
                <span className="stat-lbl">Flights</span>
              </div>
              <div className="globe-stat">
                <span className="stat-val">{satellites.length}</span>
                <span className="stat-lbl">Satellites</span>
              </div>
            </div>
          </div>

          {/* AI Chat */}
          <div className="globe-card globe-chat-card">
            <h3>AI Assistant</h3>
            <div className="chat-messages">
              {chatMessages.length === 0 && <p className="chat-empty">Ask about any location, flight, or satellite…</p>}
              {chatMessages.map((m, i) => (
                <div key={i} className={`chat-msg ${m.role}`}>{m.text}</div>
              ))}
            </div>
            <form onSubmit={handleChat} className="chat-form">
              <input value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask AI…" />
              <button type="submit">↵</button>
            </form>
          </div>
        </aside>

        {/* Map Area */}
        <div className="globe-main">
          {mapError && (
            <div className="globe-error">
              <p>⚠️ {mapError}</p>
              <button onClick={() => { setActiveKey(''); setMapError(''); localStorage.removeItem(STORAGE_KEY); setGlobeApiKey(''); }}>Change API Key</button>
            </div>
          )}
          {!activeKey && !keyLoading && (
            <div className="globe-placeholder">
              <div className="globe-placeholder-content">
                <div className="globe-placeholder-icon">🌍</div>
                <h3>Google Maps 3D Globe</h3>
                <p>Enter your Google Maps API key in the sidebar to load the interactive 3D globe. The key is saved to the backend so you only need to set it once.</p>
                <div className="globe-features-preview">
                  <h4>Required APIs</h4>
                  <ul>
                    <li>🗺️ <a href="https://console.cloud.google.com/apis/library/maps-backend.googleapis.com" target="_blank" rel="noopener noreferrer">Maps JavaScript API</a></li>
                    <li>🏙️ <a href="https://console.cloud.google.com/apis/library/tile.googleapis.com" target="_blank" rel="noopener noreferrer">Map Tiles API</a> (3D photorealistic tiles)</li>
                    <li>📍 <a href="https://console.cloud.google.com/apis/library/places-backend.googleapis.com" target="_blank" rel="noopener noreferrer">Places API (New)</a> (place cards &amp; search)</li>
                  </ul>
                  <h4>Features</h4>
                  <ul>
                    <li>✈️ Real-time military &amp; commercial flight tracking</li>
                    <li>🛰️ Satellite constellation visualization</li>
                    <li>🗺️ OpenStreetMap data overlay</li>
                    <li>📍 Strategic points of interest</li>
                    <li>🏙️ Google 3D photorealistic buildings</li>
                    <li>🃏 Google Place cards &amp; info windows</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
          {keyLoading && (
            <div className="globe-placeholder">
              <div className="globe-placeholder-content">
                <div className="globe-placeholder-icon">⏳</div>
                <h3>Loading configuration…</h3>
              </div>
            </div>
          )}
          <div ref={mapRef} className="globe-map-container"
            style={{ display: activeKey ? 'block' : 'none' }} />
        </div>

        {/* Detail Panel */}
        {selectedEntity && (
          <aside className="globe-detail-panel">
            <div className="globe-detail-header">
              <h3>{selectedEntity.name || selectedEntity.callsign || selectedEntity.id}</h3>
              <button className="btn-close" onClick={() => setSelectedEntity(null)}>×</button>
            </div>

            <div className="globe-detail-type">
              <span className={`type-badge type-${selectedEntity.type || selectedEntity.entityType}`}>
                {selectedEntity.type || selectedEntity.entityType}
              </span>
            </div>

            {selectedEntity.entityType === 'poi' && (
              <div className="globe-detail-body">
                <div className="property-list">
                  <div className="property-row"><span className="prop-key">Type</span><span>{selectedEntity.type}</span></div>
                  <div className="property-row"><span className="prop-key">Lat</span><span>{selectedEntity.lat?.toFixed(4)}</span></div>
                  <div className="property-row"><span className="prop-key">Lng</span><span>{selectedEntity.lng?.toFixed(4)}</span></div>
                  <div className="property-row"><span className="prop-key">Description</span><span>{selectedEntity.description}</span></div>
                </div>
              </div>
            )}

            {selectedEntity.entityType === 'flight' && (
              <div className="globe-detail-body">
                <div className="property-list">
                  <div className="property-row"><span className="prop-key">Callsign</span><span>{selectedEntity.callsign}</span></div>
                  <div className="property-row"><span className="prop-key">Aircraft</span><span>{selectedEntity.aircraft}</span></div>
                  <div className="property-row"><span className="prop-key">Type</span><span>{selectedEntity.type}</span></div>
                  <div className="property-row"><span className="prop-key">Origin</span><span>{selectedEntity.origin}</span></div>
                  <div className="property-row"><span className="prop-key">Destination</span><span>{selectedEntity.destination}</span></div>
                  {selectedEntity.waypoints?.length > 0 && (() => {
                    const last = selectedEntity.waypoints[selectedEntity.waypoints.length - 1];
                    return (
                      <>
                        <div className="property-row"><span className="prop-key">Current Alt</span><span>{last.alt?.toLocaleString()} m</span></div>
                        <div className="property-row"><span className="prop-key">Position</span><span>{last.lat?.toFixed(2)}°, {last.lng?.toFixed(2)}°</span></div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}

            {selectedEntity.entityType === 'satellite' && (
              <div className="globe-detail-body">
                <div className="property-list">
                  <div className="property-row"><span className="prop-key">Name</span><span>{selectedEntity.name}</span></div>
                  <div className="property-row"><span className="prop-key">NORAD ID</span><span>{selectedEntity.noradId}</span></div>
                  <div className="property-row"><span className="prop-key">Type</span><span>{selectedEntity.type}</span></div>
                  <div className="property-row"><span className="prop-key">Altitude</span><span>{selectedEntity.alt?.toLocaleString()} km</span></div>
                  <div className="property-row"><span className="prop-key">Velocity</span><span>{selectedEntity.velocity} km/s</span></div>
                  <div className="property-row"><span className="prop-key">Position</span><span>{selectedEntity.lat?.toFixed(2)}°, {selectedEntity.lng?.toFixed(2)}°</span></div>
                </div>
              </div>
            )}

            <div className="globe-detail-actions">
              <button onClick={() => {
                const lat = selectedEntity.lat || selectedEntity.waypoints?.[selectedEntity.waypoints.length - 1]?.lat;
                const lng = selectedEntity.lng || selectedEntity.waypoints?.[selectedEntity.waypoints.length - 1]?.lng;
                const alt = selectedEntity.alt || selectedEntity.waypoints?.[selectedEntity.waypoints.length - 1]?.alt || 5000;
                if (lat != null && lng != null) flyTo(lat, lng, alt);
              }}>📍 Fly To</button>
              <button onClick={() => {
                const name = selectedEntity.name || selectedEntity.callsign;
                setChatInput(`Tell me about ${name}`);
              }}>💬 Ask AI</button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
