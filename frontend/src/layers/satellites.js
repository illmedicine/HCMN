/**
 * HCMN Satellite Layer — live satellite tracking with SGP4 orbital propagation.
 *
 * Fetches TLEs from CelesTrak, propagates positions via satellite.js,
 * draws orbital paths as polylines, and updates entity positions in real-time.
 */
import * as Cesium from 'cesium';
import * as sat from 'satellite.js';

const CELESTRAK_GROUPS = {
  stations: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
  visual:   'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json',
  weather:  'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json',
  gps:      'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json',
  starlink: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=json',
  active:   'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
};

let _dataSource = null;
let _satRecords = [];   // { satrec, gp, entity }
let _updateTimer = null;
let _orbitPrimitives = null;

// Orbit class colors
const ORBIT_COLORS = {
  LEO: Cesium.Color.CYAN.withAlpha(0.6),
  MEO: Cesium.Color.YELLOW.withAlpha(0.6),
  GEO: Cesium.Color.ORANGE.withAlpha(0.6),
  HEO: Cesium.Color.RED.withAlpha(0.6),
};

function classifyOrbit(periodMin) {
  if (!periodMin) return 'LEO';
  if (periodMin < 150) return 'LEO';
  if (periodMin < 720) return 'MEO';
  if (periodMin > 1400) return 'GEO';
  return 'HEO';
}

function categorizeSat(name) {
  const n = (name || '').toUpperCase();
  if (n.includes('ISS') || n.includes('TIANGONG') || n.includes('TIANHE')) return 'Space Station';
  if (n.includes('GPS') || n.includes('NAVSTAR') || n.includes('GLONASS') || n.includes('GALILEO') || n.includes('BEIDOU')) return 'Navigation';
  if (n.includes('STARLINK') || n.includes('ONEWEB') || n.includes('IRIDIUM')) return 'Communication';
  if (n.includes('NOAA') || n.includes('METEO') || n.includes('GOES') || n.includes('METOP')) return 'Weather';
  if (n.includes('USA-') || n.includes('NROL') || n.includes('MUOS') || n.includes('SBIRS') || n.includes('WGS')) return 'Military';
  return 'Other';
}

/**
 * Propagate a single satellite to a given time.
 * @returns {{ lat, lon, alt, vel } | null}
 */
function propagate(satrec, date) {
  const pv = sat.propagate(satrec, date);
  if (!pv.position || typeof pv.position === 'boolean') return null;
  const gmst = sat.gstime(date);
  const geo = sat.eciToGeodetic(pv.position, gmst);
  const vel = pv.velocity
    ? Math.sqrt(pv.velocity.x ** 2 + pv.velocity.y ** 2 + pv.velocity.z ** 2)
    : 0;
  return {
    lat: sat.degreesLat(geo.latitude),
    lon: sat.degreesLong(geo.longitude),
    alt: geo.height * 1000, // km → m
    vel: vel.toFixed(2),
  };
}

/**
 * Compute an orbital path (one full period) for a satellite.
 * @returns {Cesium.Cartesian3[]}
 */
function computeOrbitPath(satrec, periodMin, steps = 120) {
  const period = (periodMin || 90) * 60 * 1000; // ms
  const now = Date.now();
  const positions = [];
  for (let i = 0; i <= steps; i++) {
    const t = new Date(now + (i / steps) * period);
    const pos = propagate(satrec, t);
    if (pos) {
      positions.push(Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt));
    }
  }
  return positions;
}

/**
 * Load satellite data and add to viewer.
 * @param {Cesium.Viewer} viewer
 * @param {string[]} groups - CelesTrak group names to fetch.
 * @param {object} opts
 * @param {boolean} [opts.showOrbits=true] - Draw orbital paths.
 * @param {number} [opts.maxSatellites=500] - Cap for performance.
 * @param {function} [opts.onStats] - Callback with { count, source }.
 */
export async function loadSatellites(viewer, groups = ['stations', 'visual'], opts = {}) {
  const { showOrbits = true, maxSatellites = 500, onStats } = opts;

  // Clean up previous
  removeSatellites(viewer);

  _dataSource = new Cesium.CustomDataSource('hcmn-satellites');
  viewer.dataSources.add(_dataSource);

  // Fetch TLEs
  let allGPs = [];
  for (const group of groups) {
    const url = CELESTRAK_GROUPS[group] || CELESTRAK_GROUPS.stations;
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data)) allGPs.push(...data);
      if (allGPs.length >= maxSatellites) break;
    } catch { continue; }
  }
  allGPs = allGPs.slice(0, maxSatellites);

  if (onStats) onStats({ count: allGPs.length, source: 'CelesTrak SGP4' });

  // Create entities
  const now = new Date();
  _satRecords = [];

  // Orbit paths as a primitive collection
  if (showOrbits) {
    _orbitPrimitives = new Cesium.PrimitiveCollection();
    viewer.scene.primitives.add(_orbitPrimitives);
  }

  for (const gp of allGPs) {
    if (!gp.TLE_LINE1 || !gp.TLE_LINE2) continue;
    try {
      const satrec = sat.twoline2satrec(gp.TLE_LINE1, gp.TLE_LINE2);
      const pos = propagate(satrec, now);
      if (!pos) continue;

      const orbitClass = classifyOrbit(gp.PERIOD);
      const category = categorizeSat(gp.OBJECT_NAME);
      const color = ORBIT_COLORS[orbitClass] || ORBIT_COLORS.LEO;

      const entity = _dataSource.entities.add({
        name: gp.OBJECT_NAME,
        position: Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt),
        point: {
          pixelSize: orbitClass === 'GEO' ? 5 : 4,
          color: color.withAlpha(1.0),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 1,
          scaleByDistance: new Cesium.NearFarScalar(1e5, 2.0, 1e8, 0.5),
        },
        label: {
          text: gp.OBJECT_NAME,
          font: '11px monospace',
          fillColor: color.withAlpha(1.0),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(8, -8),
          scaleByDistance: new Cesium.NearFarScalar(1e5, 1.0, 5e7, 0.0),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2e7),
        },
        properties: {
          noradId: gp.NORAD_CAT_ID,
          orbitClass,
          category,
          inclination: gp.INCLINATION,
          period: gp.PERIOD,
          velocity: pos.vel,
          altitude_km: (pos.alt / 1000).toFixed(0),
          entityType: 'satellite',
        },
      });

      _satRecords.push({ satrec, gp, entity });

      // Draw orbit path
      if (showOrbits && gp.PERIOD) {
        const orbitPositions = computeOrbitPath(satrec, gp.PERIOD);
        if (orbitPositions.length > 2) {
          _orbitPrimitives.add(new Cesium.Primitive({
            geometryInstances: new Cesium.GeometryInstance({
              geometry: new Cesium.PolylineGeometry({
                positions: orbitPositions,
                width: 1.0,
              }),
              attributes: {
                color: Cesium.ColorGeometryInstanceAttribute.fromColor(color.withAlpha(0.3)),
              },
            }),
            appearance: new Cesium.PolylineColorAppearance(),
          }));
        }
      }
    } catch { /* skip bad TLE */ }
  }

  // Start real-time position updates
  _updateTimer = setInterval(() => _updatePositions(), 3000);
}

function _updatePositions() {
  const now = new Date();
  for (const rec of _satRecords) {
    const pos = propagate(rec.satrec, now);
    if (pos) {
      rec.entity.position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt);
      if (rec.entity.properties) {
        rec.entity.properties.velocity = pos.vel;
        rec.entity.properties.altitude_km = (pos.alt / 1000).toFixed(0);
      }
    }
  }
}

/**
 * Remove all satellite entities and stop updates.
 * @param {Cesium.Viewer} viewer
 */
export function removeSatellites(viewer) {
  if (_updateTimer) { clearInterval(_updateTimer); _updateTimer = null; }
  if (_dataSource) { viewer.dataSources.remove(_dataSource, true); _dataSource = null; }
  if (_orbitPrimitives) { viewer.scene.primitives.remove(_orbitPrimitives); _orbitPrimitives = null; }
  _satRecords = [];
}

/** Get current satellite count. */
export function getSatelliteCount() {
  return _satRecords.length;
}
