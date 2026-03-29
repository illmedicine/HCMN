/**
 * HCMN POI Layer — strategic points of interest.
 *
 * Real-world locations of military installations, intelligence facilities,
 * space launch sites, and other strategically significant locations.
 */
import * as Cesium from 'cesium';

let _dataSource = null;

const POIS = [
  { id: 'pentagon', name: 'Pentagon', lat: 38.8719, lon: -77.0563, type: 'military', desc: 'US Department of Defense HQ', icon: '🏛️' },
  { id: 'ramstein', name: 'Ramstein AB', lat: 49.4369, lon: 7.6003, type: 'military', desc: 'USAF base in Germany', icon: '✈️' },
  { id: 'diego', name: 'Diego Garcia', lat: -7.3195, lon: 72.4229, type: 'military', desc: 'Naval Support Facility', icon: '⚓' },
  { id: 'pine-gap', name: 'Pine Gap', lat: -23.7991, lon: 133.7370, type: 'intelligence', desc: 'Joint Defence Facility', icon: '📡' },
  { id: 'thule', name: 'Thule AB', lat: 76.5312, lon: -68.7031, type: 'military', desc: 'Space Force base, Greenland', icon: '🛰️' },
  { id: 'yokosuka', name: 'Yokosuka', lat: 35.2833, lon: 139.6500, type: 'military', desc: 'US Fleet Activities, Japan', icon: '⚓' },
  { id: 'djibouti', name: 'Camp Lemonnier', lat: 11.5469, lon: 43.1457, type: 'military', desc: 'Djibouti', icon: '🏕️' },
  { id: 'baikonur', name: 'Baikonur', lat: 45.9650, lon: 63.3050, type: 'space', desc: 'Cosmodrome, Kazakhstan', icon: '🚀' },
  { id: 'canaveral', name: 'Cape Canaveral', lat: 28.3922, lon: -80.6077, type: 'space', desc: 'Kennedy Space Center', icon: '🚀' },
  { id: 'guam', name: 'Andersen AFB', lat: 13.4443, lon: 144.7937, type: 'military', desc: 'Guam', icon: '✈️' },
  { id: 'nsa', name: 'Fort Meade (NSA)', lat: 39.1086, lon: -76.7711, type: 'intelligence', desc: 'National Security Agency HQ', icon: '🔒' },
  { id: 'gchq', name: 'GCHQ', lat: 51.8994, lon: -2.1245, type: 'intelligence', desc: 'UK Signals Intelligence', icon: '📡' },
  { id: 'vandenberg', name: 'Vandenberg SFB', lat: 34.7420, lon: -120.5724, type: 'space', desc: 'Space Force Base, CA', icon: '🚀' },
  { id: 'incirlik', name: 'Incirlik AB', lat: 37.0012, lon: 35.4258, type: 'military', desc: 'NATO air base, Turkey', icon: '✈️' },
  { id: 'bahrain', name: 'NSA Bahrain', lat: 26.2361, lon: 50.6064, type: 'military', desc: 'US 5th Fleet HQ', icon: '⚓' },
];

const TYPE_COLORS = {
  military: '#ff4444',
  intelligence: '#cc44ff',
  space: '#ffcc00',
};

/**
 * Load POIs onto the viewer.
 * @param {Cesium.Viewer} viewer
 * @param {object} opts
 * @param {function} [opts.onStats] - Callback with { count }.
 */
export function loadPOIs(viewer, opts = {}) {
  removePOIs(viewer);

  _dataSource = new Cesium.CustomDataSource('hcmn-pois');
  viewer.dataSources.add(_dataSource);

  for (const poi of POIS) {
    const color = Cesium.Color.fromCssColorString(TYPE_COLORS[poi.type] || '#00ff88');
    _dataSource.entities.add({
      name: poi.name,
      position: Cesium.Cartesian3.fromDegrees(poi.lon, poi.lat, 100),
      point: {
        pixelSize: 8,
        color,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
        heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
        scaleByDistance: new Cesium.NearFarScalar(1e4, 1.5, 5e7, 0.5),
      },
      label: {
        text: `${poi.icon} ${poi.name}`,
        font: '12px monospace',
        fillColor: color,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(12, -4),
        scaleByDistance: new Cesium.NearFarScalar(1e4, 1.0, 1e7, 0.0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5e6),
      },
      properties: {
        type: poi.type,
        description: poi.desc,
        entityType: 'poi',
      },
    });
  }

  if (opts.onStats) opts.onStats({ count: POIS.length });
}

/** Remove POI layer. */
export function removePOIs(viewer) {
  if (_dataSource) { viewer.dataSources.remove(_dataSource, true); _dataSource = null; }
}

/** Get POI list for Fly-To UI. */
export function getPOIList() {
  return POIS;
}
