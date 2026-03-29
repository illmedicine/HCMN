import { useState, useEffect, useRef, useCallback } from 'react';
import { getGlobePOIs, getGlobeFlights, getGlobeSatellites, getGlobeConfig, setGlobeApiKey, sendChatMessage, getGlobeLiveFlights, getGlobeFAAFlights, getGlobeDOTFeed } from '../services/api';

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------

const LAYER_COLORS = {
  military: '#ff4444',
  commercial: '#44aaff',
  satellite: '#ffcc00',
  poi: '#00ff88',
  osm: '#ff8800',
  liveFlights: '#00e5ff',
  faaFlights: '#76ff03',
  dotFeed: '#ff6d00',
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
  { name: 'Maps JavaScript API', url: 'https://console.cloud.google.com/apis/library/maps-backend.googleapis.com', description: 'Core map rendering — required for all map views' },
];

// ---------------------------------------------------------------------------
// Load Google Maps via dynamic script tag — includes maps3d for 3D Globe
// ---------------------------------------------------------------------------
let _gmapPromise = null;
function loadGoogleMaps(apiKey) {
  if (_gmapPromise) return _gmapPromise;
  _gmapPromise = new Promise((resolve, reject) => {
    if (window.google?.maps?.maps3d) { resolve(window.google.maps); return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=maps3d,marker&v=alpha&callback=__gmapsReady`;
    script.async = true;
    script.defer = true;
    window.__gmapsReady = () => { resolve(window.google.maps); delete window.__gmapsReady; };
    script.onerror = () => reject(new Error('Failed to load Google Maps script'));
    document.head.appendChild(script);
  });
  return _gmapPromise;
}

// ---------------------------------------------------------------------------
// COMPONENT
// ---------------------------------------------------------------------------
export default function GlobePanel() {
  const mapRef = useRef(null);
  const map3dRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const is3dRef = useRef(false);

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
    liveFlights: false,
    faaFlights: false,
    dotFeed: false,
  });

  const [pois, setPois] = useState([]);
  const [flights, setFlights] = useState([]);
  const [satellites, setSatellites] = useState([]);
  const [liveAircraft, setLiveAircraft] = useState([]);
  const [faaAircraft, setFaaAircraft] = useState([]);
  const [dotEvents, setDotEvents] = useState([]);
  const [liveFlightsStatus, setLiveFlightsStatus] = useState('');
  const [faaFlightsStatus, setFaaFlightsStatus] = useState('');
  const [dotFeedStatus, setDotFeedStatus] = useState('');
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

  // ── Real-time polling: Live ADS-B Flights ─────────────────────────────
  useEffect(() => {
    if (!layers.liveFlights) { setLiveAircraft([]); setLiveFlightsStatus(''); return; }
    let cancelled = false;
    async function poll() {
      setLiveFlightsStatus('loading');
      const res = await getGlobeLiveFlights();
      if (cancelled) return;
      setLiveAircraft(res.aircraft || []);
      setLiveFlightsStatus(res.error ? `⚠ ${res.error}` : `${res.count || 0} aircraft · ${res.cached ? 'cached' : 'live'}`);
    }
    poll();
    const iv = setInterval(poll, 15000); // refresh every 15s
    return () => { cancelled = true; clearInterval(iv); };
  }, [layers.liveFlights]);

  // ── Real-time polling: FAA NAS Flights ────────────────────────────────
  useEffect(() => {
    if (!layers.faaFlights) { setFaaAircraft([]); setFaaFlightsStatus(''); return; }
    let cancelled = false;
    async function poll() {
      setFaaFlightsStatus('loading');
      const res = await getGlobeFAAFlights();
      if (cancelled) return;
      setFaaAircraft(res.aircraft || []);
      setFaaFlightsStatus(res.error ? `⚠ ${res.error}` : `${res.count || 0} aircraft · US NAS`);
    }
    poll();
    const iv = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [layers.faaFlights]);

  // ── Real-time polling: DOT Feed ───────────────────────────────────────
  useEffect(() => {
    if (!layers.dotFeed) { setDotEvents([]); setDotFeedStatus(''); return; }
    let cancelled = false;
    async function poll() {
      setDotFeedStatus('loading');
      const res = await getGlobeDOTFeed();
      if (cancelled) return;
      setDotEvents(res.events || []);
      setDotFeedStatus(res.error ? `⚠ ${res.error}` : `${res.count || 0} events · ${(res.sources || []).join(', ')}`);
    }
    poll();
    const iv = setInterval(poll, 120000); // refresh every 2 min
    return () => { cancelled = true; clearInterval(iv); };
  }, [layers.dotFeed]);

  // ── Init Google Maps ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeKey || !mapRef.current) return;

    setMapError('');
    setMapReady(false);

    // Listen for API auth errors
    window.gm_authFailure = () => {
      setMapError('Google Maps authentication failed. Check your API key and ensure Maps JavaScript API is enabled.');
    };

    // Clean up previous map
    clearOverlays();
    mapRef.current.innerHTML = '';

    (async () => {
      try {
        const gmaps = await loadGoogleMaps(activeKey);

        // Create a container div for the map
        const container = document.createElement('div');
        container.style.cssText = 'width:100%;height:100%;min-height:400px;';
        mapRef.current.appendChild(container);

        if (viewMode === '3d') {
          // ── True 3D Google Earth globe using Map3DElement ──────────
          const map3d = document.createElement('gmp-map-3d');
          map3d.setAttribute('center', '30,0');
          map3d.setAttribute('altitude', '0');
          map3d.setAttribute('heading', '0');
          map3d.setAttribute('tilt', '0');
          map3d.setAttribute('range', '25000000'); // zoom out to see full globe
          map3d.setAttribute('default-labels-disabled', '');
          map3d.style.cssText = 'width:100%;height:100%;display:block;';
          container.appendChild(map3d);

          // Wait for the custom element to initialise
          await customElements.whenDefined('gmp-map-3d');

          map3dRef.current = map3d;
          is3dRef.current = true;
          setMapReady(true);

          console.log('[GlobePanel] 3D Globe (Map3DElement) created');
        } else {
          // ── Flat 2D map ───────────────────────────────────────────
          const mapOptions = {
            center: { lat: 20, lng: 0 },
            zoom: 2,
            mapTypeId: 'hybrid',
            gestureHandling: 'greedy',
            renderingType: gmaps.RenderingType?.VECTOR,
            mapId: 'HCMN_GLOBE',
          };

          const m = new gmaps.Map(container, mapOptions);
          map3dRef.current = m;
          is3dRef.current = false;
          setMapReady(true);

          console.log('[GlobePanel] Flat map created');
        }
      } catch (err) {
        console.error('Google Maps load error:', err);
        setMapError(err.message || 'Failed to load Google Maps');
      }
    })();
  }, [activeKey, viewMode]);

  // ── Clear & redraw overlays ────────────────────────────────────────────
  const clearOverlays = useCallback(() => {
    markersRef.current.forEach(m => {
      if (m.remove) m.remove();            // 3D elements (DOM nodes)
      else if (m.map) m.map = null;        // AdvancedMarkerElement
      else if (m.setMap) m.setMap(null);   // legacy
    });
    polylinesRef.current.forEach(p => {
      if (p.remove) p.remove();
      else if (p.setMap) p.setMap(null);
    });
    markersRef.current = [];
    polylinesRef.current = [];
  }, []);

  useEffect(() => {
    if (!mapReady || !map3dRef.current) return;
    clearOverlays();
    const google = window.google;
    const mapEl = map3dRef.current;
    const use3d = is3dRef.current;

    // Helper: create marker (works for both 3D and 2D)
    function addMarker(lat, lng, title, color, icon, onClick) {
      try {
        if (use3d) {
          // ── 3D Marker (Map3DElement child) ──────────────────────
          const marker = new google.maps.maps3d.Marker3DElement({
            position: { lat, lng, altitude: 100 },
            label: title,
            altitudeMode: 'RELATIVE_TO_GROUND',
            extruded: true,
          });
          mapEl.append(marker);
          markersRef.current.push(marker);
          if (onClick) marker.addEventListener('gmp-click', onClick);
        } else {
          // ── 2D Advanced Marker ──────────────────────────────────
          const pin = new google.maps.marker.PinElement({
            background: color,
            borderColor: '#222',
            glyphColor: '#fff',
            scale: 1.1,
          });
          const m = new google.maps.marker.AdvancedMarkerElement({
            map: mapEl,
            position: { lat, lng },
            title,
            content: pin,
          });
          markersRef.current.push(m);
          if (onClick) m.addEventListener('gmp-click', onClick);
        }
      } catch (e) {
        console.warn('Marker creation failed:', e);
      }
    }

    // Helper: draw polyline
    function addPolyline(pathData, color, weight = 2) {
      try {
        if (use3d) {
          // ── 3D Polyline ─────────────────────────────────────────
          const coords = pathData.map(p => ({ lat: p.lat, lng: p.lng, altitude: (p.alt || 0) }));
          const poly = new google.maps.maps3d.Polyline3DElement({
            strokeColor: color,
            strokeWidth: weight * 2,
            altitudeMode: 'RELATIVE_TO_GROUND',
            drawsOccludedSegments: true,
          });
          // Use 'path' (newer API) with 'coordinates' fallback
          if ('path' in poly) {
            poly.path = coords;
          } else {
            poly.coordinates = coords;
          }
          mapEl.append(poly);
          polylinesRef.current.push(poly);
        } else {
          // ── 2D Polyline ─────────────────────────────────────────
          const poly = new google.maps.Polyline({
            path: pathData.map(p => ({ lat: p.lat, lng: p.lng })),
            strokeColor: color,
            strokeWeight: weight,
            strokeOpacity: 0.8,
            geodesic: true,
            map: mapEl,
          });
          polylinesRef.current.push(poly);
        }
      } catch (e) {
        console.warn('Polyline creation failed:', e);
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

    // -- OSM tile overlay (flat mode only — not supported on 3D globe)
    if (!use3d && layers.osm && mapEl.overlayMapTypes) {
      const OSM_MAX_ZOOM = 19;
      const osmLayer = new google.maps.ImageMapType({
        getTileUrl: (coord, zoom) => {
          const z = Math.min(zoom, OSM_MAX_ZOOM);
          return `https://tile.openstreetmap.org/${z}/${coord.x}/${coord.y}.png`;
        },
        tileSize: new google.maps.Size(256, 256),
        name: 'OSM',
        maxZoom: OSM_MAX_ZOOM,
        opacity: 0.6,
      });
      mapEl.overlayMapTypes.clear();
      mapEl.overlayMapTypes.push(osmLayer);
    }

    // -- Live ADS-B Flights (real-time)
    if (layers.liveFlights && liveAircraft.length) {
      liveAircraft.forEach(ac => {
        const label = ac.callsign || ac.icao24;
        addMarker(ac.latitude, ac.longitude, `${label} · ${Math.round(ac.altitude_m)}m`,
          LAYER_COLORS.liveFlights, '✈️',
          () => setSelectedEntity({ ...ac, entityType: 'liveAircraft', name: label }));
      });
    }

    // -- FAA NAS Flights (US airspace, real-time)
    if (layers.faaFlights && faaAircraft.length) {
      faaAircraft.forEach(ac => {
        const label = ac.callsign || ac.icao24;
        addMarker(ac.latitude, ac.longitude, `${label} · FAA`,
          LAYER_COLORS.faaFlights, '🛩️',
          () => setSelectedEntity({ ...ac, entityType: 'faaAircraft', name: label }));
      });
    }

    // -- DOT Feed Events (traffic incidents, safety data)
    if (layers.dotFeed && dotEvents.length) {
      dotEvents.forEach(evt => {
        if (evt.latitude == null || evt.longitude == null) return;
        const icon = evt.source === 'NHTSA' ? '⚠️' : evt.source === 'BTS' ? '📊' : '🚧';
        addMarker(evt.latitude, evt.longitude, evt.title || 'DOT Event',
          LAYER_COLORS.dotFeed, icon,
          () => setSelectedEntity({ ...evt, entityType: 'dotEvent', name: evt.title }));
      });
    }
  }, [mapReady, layers, pois, flights, satellites, liveAircraft, faaAircraft, dotEvents, viewMode, clearOverlays]);

  // ── Fly to location ────────────────────────────────────────────────────
  function flyTo(lat, lng, altitude = 1000) {
    if (!mapReady || !map3dRef.current) return;
    const mapEl = map3dRef.current;

    if (is3dRef.current && mapEl.flyCameraTo) {
      // ── 3D Globe: animated camera flight ─────────────────────
      mapEl.flyCameraTo({
        endCamera: {
          center: { lat, lng, altitude: 0 },
          tilt: 55,
          heading: 0,
          range: Math.max(1000, altitude * 2),
        },
        durationMillis: 2500,
      });
    } else if (mapEl.panTo) {
      // ── 2D Flat: standard pan + zoom ─────────────────────────
      mapEl.panTo({ lat, lng });
      mapEl.setZoom(Math.max(4, 18 - Math.log2(altitude / 100)));
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
            {Object.entries(layers).map(([key, val]) => {
              const labelMap = {
                pois: 'Points of Interest',
                osm: 'OpenStreetMap Overlay',
                liveFlights: '✈️ Live ADS-B Flights',
                faaFlights: '🛩️ FAA NAS Flights (US)',
                dotFeed: '🚧 DOT Traffic Feed',
              };
              const colorKey = key === 'pois' ? 'poi' : key;
              return (
                <label key={key} className="globe-layer-toggle">
                  <input type="checkbox" checked={val}
                    onChange={() => setLayers(prev => ({ ...prev, [key]: !prev[key] }))} />
                  <span className="layer-dot" style={{ background: LAYER_COLORS[colorKey] || '#888' }} />
                  {labelMap[key] || key.charAt(0).toUpperCase() + key.slice(1)}
                </label>
              );
            })}
            {/* Real-time status indicators */}
            {(liveFlightsStatus || faaFlightsStatus || dotFeedStatus) && (
              <div className="globe-realtime-status" style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#aaa' }}>
                {layers.liveFlights && liveFlightsStatus && <div>ADS-B: {liveFlightsStatus}</div>}
                {layers.faaFlights && faaFlightsStatus && <div>FAA: {faaFlightsStatus}</div>}
                {layers.dotFeed && dotFeedStatus && <div>DOT: {dotFeedStatus}</div>}
              </div>
            )}
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
              {layers.liveFlights && (
                <div className="globe-stat">
                  <span className="stat-val" style={{ color: LAYER_COLORS.liveFlights }}>{liveAircraft.length}</span>
                  <span className="stat-lbl">Live ADS-B</span>
                </div>
              )}
              {layers.faaFlights && (
                <div className="globe-stat">
                  <span className="stat-val" style={{ color: LAYER_COLORS.faaFlights }}>{faaAircraft.length}</span>
                  <span className="stat-lbl">FAA NAS</span>
                </div>
              )}
              {layers.dotFeed && (
                <div className="globe-stat">
                  <span className="stat-val" style={{ color: LAYER_COLORS.dotFeed }}>{dotEvents.length}</span>
                  <span className="stat-lbl">DOT Events</span>
                </div>
              )}
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
                    <li>✈️ Live ADS-B flights (OpenSky Network)</li>
                    <li>🛩️ FAA NAS flights — US airspace in real time</li>
                    <li>🚧 DOT traffic feed — USDOT, NHTSA, BTS data</li>
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

            {(selectedEntity.entityType === 'liveAircraft' || selectedEntity.entityType === 'faaAircraft') && (
              <div className="globe-detail-body">
                <div className="property-list">
                  <div className="property-row"><span className="prop-key">Callsign</span><span>{selectedEntity.callsign || '—'}</span></div>
                  <div className="property-row"><span className="prop-key">ICAO24</span><span>{selectedEntity.icao24}</span></div>
                  <div className="property-row"><span className="prop-key">Country</span><span>{selectedEntity.origin_country}</span></div>
                  <div className="property-row"><span className="prop-key">Altitude</span><span>{selectedEntity.altitude_m?.toLocaleString()} m</span></div>
                  <div className="property-row"><span className="prop-key">Speed</span><span>{selectedEntity.velocity_ms?.toFixed(0)} m/s</span></div>
                  <div className="property-row"><span className="prop-key">Heading</span><span>{selectedEntity.heading?.toFixed(0)}°</span></div>
                  <div className="property-row"><span className="prop-key">Vertical Rate</span><span>{selectedEntity.vertical_rate?.toFixed(1)} m/s</span></div>
                  <div className="property-row"><span className="prop-key">On Ground</span><span>{selectedEntity.on_ground ? 'Yes' : 'No'}</span></div>
                  <div className="property-row"><span className="prop-key">Position</span><span>{selectedEntity.latitude?.toFixed(4)}°, {selectedEntity.longitude?.toFixed(4)}°</span></div>
                  {selectedEntity.source && <div className="property-row"><span className="prop-key">Source</span><span>{selectedEntity.source}</span></div>}
                  {selectedEntity.airspace && <div className="property-row"><span className="prop-key">Airspace</span><span>{selectedEntity.airspace}</span></div>}
                </div>
              </div>
            )}

            {selectedEntity.entityType === 'dotEvent' && (
              <div className="globe-detail-body">
                <div className="property-list">
                  <div className="property-row"><span className="prop-key">Title</span><span>{selectedEntity.title}</span></div>
                  <div className="property-row"><span className="prop-key">Source</span><span>{selectedEntity.source}</span></div>
                  <div className="property-row"><span className="prop-key">Type</span><span>{selectedEntity.type}</span></div>
                  <div className="property-row"><span className="prop-key">State</span><span>{selectedEntity.state || '—'}</span></div>
                  <div className="property-row"><span className="prop-key">Severity</span><span>{selectedEntity.severity}</span></div>
                  {selectedEntity.latitude != null && (
                    <div className="property-row"><span className="prop-key">Position</span><span>{selectedEntity.latitude?.toFixed(4)}°, {selectedEntity.longitude?.toFixed(4)}°</span></div>
                  )}
                  {selectedEntity.timestamp && <div className="property-row"><span className="prop-key">Timestamp</span><span>{selectedEntity.timestamp}</span></div>}
                </div>
              </div>
            )}

            <div className="globe-detail-actions">
              <button onClick={() => {
                const lat = selectedEntity.lat || selectedEntity.latitude || selectedEntity.waypoints?.[selectedEntity.waypoints.length - 1]?.lat;
                const lng = selectedEntity.lng || selectedEntity.longitude || selectedEntity.waypoints?.[selectedEntity.waypoints.length - 1]?.lng;
                const alt = selectedEntity.alt || selectedEntity.altitude_m || selectedEntity.waypoints?.[selectedEntity.waypoints.length - 1]?.alt || 5000;
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
