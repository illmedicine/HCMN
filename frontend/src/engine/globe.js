/**
 * HCMN Globe Engine — CesiumJS 3D tiled globe with terrain, buildings, and camera control.
 *
 * Provides the core Viewer instance that all layers and post-processing stages attach to.
 * Supports both Cesium Ion tiles and Google Photorealistic 3D Tiles.
 */
import * as Cesium from 'cesium';

// Default Cesium Ion token — user can override via settings
const DEFAULT_ION_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJkZWZhdWx0IiwiaWQiOjEsImlhdCI6MTcxMTY1NjAwMH0.placeholder';

let _viewer = null;

/**
 * Initialise the CesiumJS Viewer in the given container element.
 * @param {HTMLElement} container - DOM element to host the globe.
 * @param {object} opts
 * @param {string} [opts.ionToken]   - Cesium Ion access token.
 * @param {string} [opts.googleKey]  - Google Maps API key (for photorealistic 3D tiles).
 * @returns {Cesium.Viewer}
 */
export function createGlobe(container, opts = {}) {
  if (_viewer && !_viewer.isDestroyed()) {
    _viewer.destroy();
  }

  // Configure Ion token
  const token = opts.ionToken || localStorage.getItem('hcmn_cesium_ion_token') || DEFAULT_ION_TOKEN;
  Cesium.Ion.defaultAccessToken = token;

  const viewer = new Cesium.Viewer(container, {
    // Minimal chrome — we build our own UI
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    creditContainer: document.createElement('div'), // hide credits bar

    // Rendering
    shouldAnimate: true,
    useBrowserRecommendedResolution: true,
    requestRenderMode: false,
    maximumRenderTimeChange: Infinity,

    // Terrain
    terrain: Cesium.Terrain.fromWorldTerrain({
      requestWaterMask: true,
      requestVertexNormals: true,
    }),
  });

  // Dark base-layer imagery (Blue Marble / dark style)
  viewer.scene.globe.enableLighting = true;
  viewer.scene.globe.atmosphereLightIntensity = 8.0;
  viewer.scene.fog.enabled = true;
  viewer.scene.fog.density = 2.0e-4;
  viewer.scene.skyAtmosphere.show = true;

  // Higher quality rendering
  viewer.scene.globe.maximumScreenSpaceError = 1.5;
  viewer.scene.highDynamicRange = false;
  viewer.scene.postProcessStages.fxaa.enabled = true;

  // Default camera — whole globe
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(0, 20, 25_000_000),
    orientation: { heading: 0, pitch: -Math.PI / 2, roll: 0 },
  });

  // Load 3D tiles (OSM buildings or Google Photorealistic)
  _loadTileset(viewer, opts);

  _viewer = viewer;
  return viewer;
}

/**
 * Load 3D tileset — tries Google Photorealistic first, falls back to OSM Buildings.
 */
async function _loadTileset(viewer, opts) {
  // Try Google Photorealistic 3D Tiles
  if (opts.googleKey) {
    try {
      const tileset = await Cesium.Cesium3DTileset.fromUrl(
        `https://tile.googleapis.com/v1/3dtiles/root.json?key=${opts.googleKey}`
      );
      viewer.scene.primitives.add(tileset);
      console.log('[Globe] Loaded Google Photorealistic 3D Tiles');
      return;
    } catch (e) {
      console.warn('[Globe] Google 3D Tiles failed, falling back to OSM:', e.message);
    }
  }

  // Fallback: Cesium OSM Buildings
  try {
    const tileset = await Cesium.createOsmBuildingsAsync();
    viewer.scene.primitives.add(tileset);
    console.log('[Globe] Loaded Cesium OSM Buildings');
  } catch (e) {
    console.warn('[Globe] OSM Buildings failed:', e.message);
  }
}

/** Get the current Viewer instance. */
export function getViewer() {
  return _viewer;
}

/** Destroy the viewer and free resources. */
export function destroyGlobe() {
  if (_viewer && !_viewer.isDestroyed()) {
    _viewer.destroy();
    _viewer = null;
  }
}

/**
 * Fly the camera to a location.
 * @param {number} lon - Longitude (degrees).
 * @param {number} lat - Latitude (degrees).
 * @param {number} [alt=15000] - Camera altitude in metres.
 * @param {object} [orient] - Optional heading/pitch/roll.
 */
export function flyTo(lon, lat, alt = 15_000, orient = {}) {
  if (!_viewer) return;
  _viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
    orientation: {
      heading: Cesium.Math.toRadians(orient.heading ?? 0),
      pitch: Cesium.Math.toRadians(orient.pitch ?? -45),
      roll: 0,
    },
    duration: 2.5,
  });
}

/**
 * Lock camera to track a specific entity.
 * @param {Cesium.Entity} entity
 */
export function trackEntity(entity) {
  if (!_viewer) return;
  _viewer.trackedEntity = entity;
}

/** Stop tracking any entity. */
export function stopTracking() {
  if (!_viewer) return;
  _viewer.trackedEntity = undefined;
}
