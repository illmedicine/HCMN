/**
 * HCMN Flight Layer — real-time ADS-B flight tracking.
 *
 * Supports two data sources:
 *   1. OpenSky Network (global, no auth required)
 *   2. adsb.fi (community-driven, geospatial queries, no auth required)
 *
 * Renders aircraft as oriented 3D model entities (glTF) with smooth
 * position/orientation updates.  Stale entities are cleaned up after
 * 15 seconds of inactivity.
 */
import * as Cesium from 'cesium';

// ---------------------------------------------------------------------------
// Data source URLs
// ---------------------------------------------------------------------------
const OPENSKY_ALL = 'https://opensky-network.org/api/states/all';
const OPENSKY_US  = 'https://opensky-network.org/api/states/all?lamin=24&lamax=50&lomin=-125&lomax=-66';
const ADSB_FI_BASE = 'https://opendata.adsb.fi/api/v3';

// Default location: Buffalo, NY (Module 2 camera target)
const DEFAULT_LAT = 42.8864;
const DEFAULT_LON = -78.8784;
const DEFAULT_RADIUS_NM = 25;

// Stale-entity timeout (ms)
const STALE_TIMEOUT_MS = 15_000;

// Optional glTF model URL — falls back to point rendering if unavailable
const AIRCRAFT_MODEL_URI = '/assets/models/generic_aircraft.glb';

let _dataSource = null;
let _pollTimer  = null;
let _aircraft   = [];  // raw parsed aircraft
let _lastSeen   = {};  // hex → timestamp of last API appearance
let _filter     = { military: true, commercial: true, minAlt: 0 };

// Countries/callsign prefixes commonly associated with military operations
const MIL_PREFIXES = [
  'RCH', 'DUKE', 'JAKE', 'EVAC', 'GOLD', 'BLUE', 'TOPCAT', 'IRON',
  'GORDO', 'KNIFE', 'SPAR', 'SAM', 'VENUS', 'NCHO', 'DOOM', 'WING',
  'REACH', 'TEAL', 'ORDER', 'THUD', 'VIPER', 'COBRA',
];
const MIL_ICAO_RANGES = [
  { lo: 'ae0000', hi: 'afffff' }, // US military
  { lo: '3a0000', hi: '3affff' }, // French military
  { lo: '43c000', hi: '43cfff' }, // UK military
];

function isMilitary(ac) {
  const cs = (ac.callsign || '').toUpperCase();
  if (MIL_PREFIXES.some(p => cs.startsWith(p))) return true;
  const icao = (ac.icao24 || ac.hex || '').toLowerCase();
  return MIL_ICAO_RANGES.some(r => icao >= r.lo && icao <= r.hi);
}

// ---------------------------------------------------------------------------
// OpenSky parser (legacy)
// ---------------------------------------------------------------------------
function parseOpenSkyStates(states) {
  if (!states) return [];
  return states
    .filter(s => s[5] != null && s[6] != null)
    .map(s => ({
      hex: s[0],
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
}

// ---------------------------------------------------------------------------
// adsb.fi parser
// ---------------------------------------------------------------------------
function parseAdsbFi(acArray) {
  if (!acArray) return [];
  return acArray
    .filter(ac => ac.lat != null && ac.lon != null)
    .map(ac => {
      const altFt = ac.alt_geom ?? ac.alt_baro ?? 0;
      const altM = typeof altFt === 'number' ? altFt * 0.3048 : 0;
      return {
        hex: (ac.hex || '').trim(),
        icao24: (ac.hex || '').trim(),
        callsign: (ac.flight || '').trim(),
        registration: (ac.r || '').trim(),
        icaoType: (ac.t || '').trim(),
        origin_country: '',
        longitude: ac.lon,
        latitude: ac.lat,
        altitude_m: altM,
        on_ground: ac.alt_baro === 'ground',
        velocity_ms: (ac.gs ?? 0) * 0.514444, // knots → m/s
        heading: ac.track ?? 0,
        vertical_rate: (ac.baro_rate ?? 0) * 0.00508, // ft/min → m/s
      };
    });
}

// ---------------------------------------------------------------------------
// Helpers: 3D orientation from heading
// ---------------------------------------------------------------------------
function orientationFromHeading(position, headingDeg) {
  const hpr = new Cesium.HeadingPitchRoll(
    Cesium.Math.toRadians(headingDeg),
    0,
    0,
  );
  return Cesium.Transforms.headingPitchRollQuaternion(position, hpr);
}

// ---------------------------------------------------------------------------
// Check if a glTF model is available (probe once)
// ---------------------------------------------------------------------------
let _modelAvailable = null;
async function isModelAvailable() {
  if (_modelAvailable !== null) return _modelAvailable;
  try {
    const res = await fetch(AIRCRAFT_MODEL_URI, { method: 'HEAD' });
    _modelAvailable = res.ok;
  } catch {
    _modelAvailable = false;
  }
  return _modelAvailable;
}

// ---------------------------------------------------------------------------
// Core: load flights
// ---------------------------------------------------------------------------

/**
 * Load flights onto the viewer.
 * @param {Cesium.Viewer} viewer
 * @param {object} opts
 * @param {string}   [opts.source='adsbfi']   - 'adsbfi' | 'opensky' | 'opensky-us'
 * @param {number}   [opts.lat]               - Center latitude for adsb.fi geospatial query.
 * @param {number}   [opts.lon]               - Center longitude for adsb.fi geospatial query.
 * @param {number}   [opts.radiusNm=25]       - Search radius in nautical miles (adsb.fi only).
 * @param {number}   [opts.pollInterval=5000] - Poll interval in ms.
 * @param {function} [opts.onStats]           - Callback with { total, military, commercial, source }.
 */
export async function loadFlights(viewer, opts = {}) {
  const {
    source = 'adsbfi',
    lat = DEFAULT_LAT,
    lon = DEFAULT_LON,
    radiusNm = DEFAULT_RADIUS_NM,
    pollInterval = source === 'adsbfi' ? 5000 : 15000,
    onStats,
  } = opts;

  removeFlights(viewer);

  const useModel = await isModelAvailable();

  _dataSource = new Cesium.CustomDataSource('hcmn-flights');
  viewer.dataSources.add(_dataSource);

  async function poll() {
    try {
      let parsed;
      let sourceName;

      if (source === 'adsbfi') {
        const url = `${ADSB_FI_BASE}/lat/${lat}/lon/${lon}/dist/${radiusNm}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`adsb.fi ${res.status}`);
        const data = await res.json();
        parsed = parseAdsbFi(data.ac || data.aircraft || []);
        sourceName = 'adsb.fi';
      } else {
        const url = source === 'opensky-us' ? OPENSKY_US : OPENSKY_ALL;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`OpenSky ${res.status}`);
        const data = await res.json();
        parsed = parseOpenSkyStates(data.states);
        sourceName = 'OpenSky ADS-B';
      }

      _aircraft = parsed;

      // Track last-seen timestamps
      const now = Date.now();
      const seenHexes = new Set();
      for (const ac of _aircraft) {
        if (!ac.hex) continue;
        _lastSeen[ac.hex] = now;
        seenHexes.add(ac.hex);
      }

      // Update / create entities
      _updateEntities(viewer, useModel);

      // Remove stale entities not seen for STALE_TIMEOUT_MS
      _removeStaleEntities(now);

      if (onStats) {
        const milCount = _aircraft.filter(isMilitary).length;
        onStats({
          total: _aircraft.length,
          military: milCount,
          commercial: _aircraft.length - milCount,
          source: sourceName,
        });
      }
    } catch (e) {
      console.warn('[Flights] Poll failed:', e.message);
      if (onStats) onStats({ total: _aircraft.length, error: e.message, source: 'error' });
    }
  }

  await poll();
  _pollTimer = setInterval(poll, pollInterval);
}

// ---------------------------------------------------------------------------
// Entity update — smooth position/orientation transitions
// ---------------------------------------------------------------------------
function _updateEntities(viewer, useModel) {
  if (!_dataSource) return;

  for (const ac of _aircraft) {
    if (!ac.hex) continue;
    if (ac.on_ground) continue;
    if (ac.altitude_m < _filter.minAlt) continue;

    const mil = isMilitary(ac);
    if (mil && !_filter.military) continue;
    if (!mil && !_filter.commercial) continue;

    const position = Cesium.Cartesian3.fromDegrees(ac.longitude, ac.latitude, ac.altitude_m);
    const orientation = orientationFromHeading(position, ac.heading);
    const color = mil ? Cesium.Color.ORANGE : Cesium.Color.fromCssColorString('#00ccff');
    const label = ac.callsign || ac.hex;

    // Try to update an existing entity
    const existing = _dataSource.entities.getById(ac.hex);
    if (existing) {
      existing.position = position;
      existing.orientation = orientation;
      // Update label text in case callsign changed
      if (existing.label) {
        existing.label.text = label;
      }
      continue;
    }

    // Create new entity
    const entityDef = {
      id: ac.hex,
      name: label,
      position,
      orientation,
      label: {
        text: label,
        font: mil ? 'bold 11px monospace' : '10px monospace',
        fillColor: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(8, -4),
        scaleByDistance: new Cesium.NearFarScalar(5e4, 1.0, 1e7, 0.0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5e6),
      },
      properties: {
        icao24: ac.hex,
        callsign: ac.callsign,
        registration: ac.registration || '',
        origin_country: ac.origin_country,
        altitude_m: ac.altitude_m,
        velocity_ms: ac.velocity_ms,
        heading: ac.heading,
        vertical_rate: ac.vertical_rate,
        isMilitary: mil,
        entityType: 'aircraft',
      },
    };

    if (useModel) {
      entityDef.model = {
        uri: AIRCRAFT_MODEL_URI,
        minimumPixelSize: 24,
        maximumScale: 200,
        color: color.withAlpha(0.9),
        colorBlendMode: Cesium.ColorBlendMode.MIX,
        colorBlendAmount: 0.4,
        silhouetteColor: color,
        silhouetteSize: 1.0,
      };
    } else {
      entityDef.point = {
        pixelSize: mil ? 6 : 4,
        color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        scaleByDistance: new Cesium.NearFarScalar(5e4, 1.5, 5e7, 0.3),
      };
    }

    _dataSource.entities.add(entityDef);
  }
}

// ---------------------------------------------------------------------------
// Stale entity cleanup
// ---------------------------------------------------------------------------
function _removeStaleEntities(now) {
  if (!_dataSource) return;
  const toRemove = [];
  for (const [hex, ts] of Object.entries(_lastSeen)) {
    if (now - ts > STALE_TIMEOUT_MS) {
      const entity = _dataSource.entities.getById(hex);
      if (entity) toRemove.push(entity);
      delete _lastSeen[hex];
    }
  }
  for (const entity of toRemove) {
    _dataSource.entities.remove(entity);
  }
}

/**
 * Update flight filter and re-render.
 * @param {object} filter - { military: bool, commercial: bool, minAlt: number }
 */
export function setFlightFilter(filter) {
  Object.assign(_filter, filter);
}

/** Remove all flight entities and stop polling. */
export function removeFlights(viewer) {
  if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
  if (_dataSource) { viewer.dataSources.remove(_dataSource, true); _dataSource = null; }
  _aircraft = [];
  _lastSeen = {};
}

/** Get current raw aircraft list. */
export function getAircraftList() {
  return _aircraft;
}

/** Get counts. */
export function getFlightCounts() {
  const mil = _aircraft.filter(isMilitary).length;
  return { total: _aircraft.length, military: mil, commercial: _aircraft.length - mil };
}
