/**
 * HCMN Time Playback Engine — historical telemetry replay in CesiumJS.
 *
 * Fetches telemetry data from the /api/history/telemetry endpoint and
 * constructs Cesium SampledPositionProperty tracks for smooth interpolated
 * playback using the Cesium timeline/clock system.
 *
 * Uses Cesium.LinearApproximation so aircraft move smoothly between the
 * 5-second data points when the user scrubs the timeline widget.
 */
import * as Cesium from 'cesium';

const API_BASE = import.meta.env.VITE_API_URL || '/api';
const AIRCRAFT_MODEL_URI = '/assets/models/generic_aircraft.glb';

let _historyDataSource = null;
let _clockRestore = null; // original clock settings to restore after playback

// ---------------------------------------------------------------------------
// Fetch historical telemetry from the backend
// ---------------------------------------------------------------------------

/**
 * Fetch telemetry points for a single entity within a time window.
 * @param {string} entityId - ICAO hex or entity key.
 * @param {number} startTime - Unix epoch seconds.
 * @param {number} endTime - Unix epoch seconds.
 * @returns {Promise<Array<{entity_id, ts, lat, lon, alt, heading}>>}
 */
async function fetchTelemetry(entityId, startTime, endTime) {
  const params = new URLSearchParams({
    entity_id: entityId,
    start_time: String(startTime),
    end_time: String(endTime),
  });
  try {
    const res = await fetch(`${API_BASE}/history/telemetry?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.points || [];
  } catch (e) {
    console.warn('[TimePlayback] Fetch failed:', e.message);
    return [];
  }
}

/**
 * Fetch the list of known entities to populate a selector.
 * @param {string} entityType
 * @returns {Promise<Array>}
 */
export async function fetchKnownEntities(entityType = 'aircraft') {
  try {
    const res = await fetch(`${API_BASE}/history/entities?entity_type=${encodeURIComponent(entityType)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.entities || [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Build a SampledPositionProperty from telemetry points
// ---------------------------------------------------------------------------

/**
 * Convert an array of telemetry records into a Cesium SampledPositionProperty.
 *
 * Each sample maps:
 *   - ts → JulianDate
 *   - (lon, lat, alt) → Cartesian3
 *
 * The property uses LinearApproximation for smooth movement between samples.
 *
 * @param {Array} points - Array of { ts, lat, lon, alt } objects.
 * @returns {{ property: Cesium.SampledPositionProperty, start: Cesium.JulianDate, stop: Cesium.JulianDate }}
 */
function buildSampledProperty(points) {
  const property = new Cesium.SampledPositionProperty();
  property.setInterpolationOptions({
    interpolationDegree: 1,
    interpolationAlgorithm: Cesium.LinearApproximation,
  });

  let startDate = null;
  let stopDate = null;

  for (const pt of points) {
    const julianDate = Cesium.JulianDate.fromDate(new Date(pt.ts * 1000));
    const position = Cesium.Cartesian3.fromDegrees(pt.lon, pt.lat, pt.alt);
    property.addSample(julianDate, position);

    if (!startDate || Cesium.JulianDate.lessThan(julianDate, startDate)) {
      startDate = julianDate;
    }
    if (!stopDate || Cesium.JulianDate.greaterThan(julianDate, stopDate)) {
      stopDate = julianDate;
    }
  }

  return { property, start: startDate, stop: stopDate };
}

/**
 * Build a SampledProperty for heading (orientation) from telemetry points.
 * @param {Array} points
 * @returns {Cesium.SampledProperty}
 */
function buildHeadingProperty(points) {
  const property = new Cesium.SampledProperty(Number);
  property.setInterpolationOptions({
    interpolationDegree: 1,
    interpolationAlgorithm: Cesium.LinearApproximation,
  });

  for (const pt of points) {
    const julianDate = Cesium.JulianDate.fromDate(new Date(pt.ts * 1000));
    property.addSample(julianDate, pt.heading ?? 0);
  }

  return property;
}

// ---------------------------------------------------------------------------
// Load historical playback onto the Cesium viewer
// ---------------------------------------------------------------------------

/**
 * Load historical telemetry for one or more entities and enable timeline playback.
 *
 * @param {Cesium.Viewer} viewer
 * @param {object} opts
 * @param {string|string[]} opts.entityIds - Single ID or array of IDs to replay.
 * @param {number} opts.startTime - Unix epoch seconds.
 * @param {number} opts.endTime - Unix epoch seconds.
 * @param {function} [opts.onProgress] - Called with { loaded, total } during fetch.
 * @param {function} [opts.onComplete] - Called when all tracks are loaded.
 * @returns {Promise<Cesium.DataSource>}
 */
export async function loadHistoricalPlayback(viewer, opts = {}) {
  const { entityIds, startTime, endTime, onProgress, onComplete } = opts;

  removeHistoricalPlayback(viewer);

  const ids = Array.isArray(entityIds) ? entityIds : [entityIds];
  _historyDataSource = new Cesium.CustomDataSource('hcmn-history');
  viewer.dataSources.add(_historyDataSource);

  let loaded = 0;
  let globalStart = null;
  let globalStop = null;

  for (const entityId of ids) {
    const points = await fetchTelemetry(entityId, startTime, endTime);
    loaded++;
    if (onProgress) onProgress({ loaded, total: ids.length });

    if (!points.length) continue;

    const { property, start, stop } = buildSampledProperty(points);
    const headingProp = buildHeadingProperty(points);

    if (!globalStart || Cesium.JulianDate.lessThan(start, globalStart)) {
      globalStart = start;
    }
    if (!globalStop || Cesium.JulianDate.greaterThan(stop, globalStop)) {
      globalStop = stop;
    }

    // Create entity with sampled position and velocity-oriented model
    const entity = _historyDataSource.entities.add({
      id: `history-${entityId}`,
      name: entityId,
      availability: new Cesium.TimeIntervalCollection([
        new Cesium.TimeInterval({ start, stop }),
      ]),
      position: property,
      orientation: new Cesium.VelocityOrientationProperty(property),
      model: {
        uri: AIRCRAFT_MODEL_URI,
        minimumPixelSize: 32,
        maximumScale: 300,
        color: Cesium.Color.LIME.withAlpha(0.9),
        colorBlendMode: Cesium.ColorBlendMode.MIX,
        colorBlendAmount: 0.3,
        silhouetteColor: Cesium.Color.LIME,
        silhouetteSize: 1.5,
      },
      label: {
        text: entityId,
        font: 'bold 12px monospace',
        fillColor: Cesium.Color.LIME,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(12, -6),
        scaleByDistance: new Cesium.NearFarScalar(5e3, 1.0, 5e6, 0.0),
      },
      path: {
        width: 2,
        leadTime: 0,
        trailTime: 600, // show 10 min trail
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.2,
          color: Cesium.Color.LIME.withAlpha(0.6),
        }),
      },
    });
  }

  // Configure the viewer clock for playback
  if (globalStart && globalStop) {
    _clockRestore = {
      startTime: viewer.clock.startTime.clone(),
      stopTime: viewer.clock.stopTime.clone(),
      currentTime: viewer.clock.currentTime.clone(),
      clockRange: viewer.clock.clockRange,
      multiplier: viewer.clock.multiplier,
      shouldAnimate: viewer.clock.shouldAnimate,
    };

    viewer.clock.startTime = globalStart;
    viewer.clock.stopTime = globalStop;
    viewer.clock.currentTime = globalStart.clone();
    viewer.clock.clockRange = Cesium.ClockRange.LOOP_STOP;
    viewer.clock.multiplier = 10; // 10× real-time by default
    viewer.clock.shouldAnimate = true;

    // Show timeline if hidden
    if (viewer.timeline) {
      viewer.timeline.zoomTo(globalStart, globalStop);
    }
    if (viewer.animation) {
      viewer.animation.container.style.display = '';
    }
  }

  if (onComplete) onComplete({ count: ids.length, loaded });

  return _historyDataSource;
}

/**
 * Remove historical playback entities and restore the clock.
 * @param {Cesium.Viewer} viewer
 */
export function removeHistoricalPlayback(viewer) {
  if (_historyDataSource) {
    viewer.dataSources.remove(_historyDataSource, true);
    _historyDataSource = null;
  }

  // Restore original clock settings
  if (_clockRestore && viewer.clock) {
    viewer.clock.startTime = _clockRestore.startTime;
    viewer.clock.stopTime = _clockRestore.stopTime;
    viewer.clock.currentTime = _clockRestore.currentTime;
    viewer.clock.clockRange = _clockRestore.clockRange;
    viewer.clock.multiplier = _clockRestore.multiplier;
    viewer.clock.shouldAnimate = _clockRestore.shouldAnimate;
    _clockRestore = null;
  }
}

/**
 * Set the playback speed multiplier.
 * @param {Cesium.Viewer} viewer
 * @param {number} multiplier - e.g. 1 = real-time, 10 = 10× speed.
 */
export function setPlaybackSpeed(viewer, multiplier) {
  viewer.clock.multiplier = multiplier;
}

/**
 * Jump to a specific time in the playback.
 * @param {Cesium.Viewer} viewer
 * @param {number} unixEpoch - Unix epoch in seconds.
 */
export function seekTo(viewer, unixEpoch) {
  viewer.clock.currentTime = Cesium.JulianDate.fromDate(new Date(unixEpoch * 1000));
}

/** Check if historical playback is currently active. */
export function isPlaybackActive() {
  return _historyDataSource !== null;
}
