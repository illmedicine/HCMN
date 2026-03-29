/**
 * HCMN Traffic Layer — street-level traffic emulation using OSM road networks.
 *
 * Fetches road geometry from the Overpass API, then spawns particle systems
 * that animate along road segments to create believable traffic density.
 */
import * as Cesium from 'cesium';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

let _primitives = null;
let _animTimer  = null;
let _particles  = [];
let _roads      = [];    // array of road polylines (arrays of [lon, lat])

/**
 * Load traffic emulation for a city / bounding box.
 * @param {Cesium.Viewer} viewer
 * @param {object} opts
 * @param {number} opts.lat - Center latitude.
 * @param {number} opts.lon - Center longitude.
 * @param {number} [opts.radius=0.02] - Bounding box half-size in degrees (~2 km).
 * @param {number} [opts.particleDensity=3] - Particles per road segment.
 * @param {function} [opts.onStats] - Callback with { roads, particles }.
 */
export async function loadTraffic(viewer, opts = {}) {
  const { lat = 40.758, lon = -73.9855, radius = 0.02, particleDensity = 3, onStats } = opts;

  removeTraffic(viewer);

  // Fetch road network from Overpass
  const bbox = `${lat - radius},${lon - radius},${lat + radius},${lon + radius}`;
  const query = `[out:json][timeout:15];way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential)$"](${bbox});out geom;`;

  try {
    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = await res.json();

    _roads = [];
    for (const el of (data.elements || [])) {
      if (el.type === 'way' && el.geometry?.length >= 2) {
        _roads.push({
          id: el.id,
          highway: el.tags?.highway || 'road',
          coords: el.geometry.map(g => [g.lon, g.lat]),
        });
      }
    }
  } catch (e) {
    console.warn('[Traffic] Overpass fetch failed:', e.message);
    if (onStats) onStats({ roads: 0, particles: 0, error: e.message });
    return;
  }

  // Create primitives for roads + particles
  _primitives = new Cesium.PrimitiveCollection();
  viewer.scene.primitives.add(_primitives);

  // Draw road outlines (subtle)
  for (const road of _roads) {
    const positions = road.coords.map(c => Cesium.Cartesian3.fromDegrees(c[0], c[1], 2));
    const color = road.highway === 'motorway' || road.highway === 'trunk'
      ? Cesium.Color.fromCssColorString('#334455').withAlpha(0.4)
      : Cesium.Color.fromCssColorString('#223344').withAlpha(0.25);
    try {
      _primitives.add(new Cesium.Primitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: new Cesium.PolylineGeometry({
            positions,
            width: road.highway === 'motorway' ? 3 : 1.5,
          }),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(color),
          },
        }),
        appearance: new Cesium.PolylineColorAppearance(),
      }));
    } catch { /* skip */ }
  }

  // Spawn particles along roads
  _particles = [];
  for (const road of _roads) {
    const count = Math.max(1, Math.floor(road.coords.length * particleDensity / 5));
    for (let i = 0; i < count; i++) {
      _particles.push({
        road,
        progress: Math.random(), // 0..1 along road
        speed: (0.0003 + Math.random() * 0.0008) * (road.highway === 'motorway' ? 2 : 1),
        entity: null,
      });
    }
  }

  // Create a point collection for particles
  const billboardCollection = new Cesium.BillboardCollection({ scene: viewer.scene });
  const canvas = _makeParticleIcon();
  for (const p of _particles) {
    const pos = _interpolateRoad(p.road.coords, p.progress);
    p.billboard = billboardCollection.add({
      position: Cesium.Cartesian3.fromDegrees(pos[0], pos[1], 3),
      image: canvas,
      width: 6,
      height: 6,
      color: Cesium.Color.fromCssColorString('#ffcc00').withAlpha(0.8),
      scaleByDistance: new Cesium.NearFarScalar(100, 2.0, 50000, 0.3),
    });
  }
  _primitives.add(billboardCollection);

  if (onStats) onStats({ roads: _roads.length, particles: _particles.length });

  // Animate particles
  _animTimer = setInterval(() => _animateParticles(), 50);
}

function _animateParticles() {
  for (const p of _particles) {
    p.progress += p.speed;
    if (p.progress >= 1) p.progress -= 1;
    const pos = _interpolateRoad(p.road.coords, p.progress);
    if (p.billboard) {
      p.billboard.position = Cesium.Cartesian3.fromDegrees(pos[0], pos[1], 3);
    }
  }
}

/**
 * Interpolate a position along a road polyline.
 * @param {number[][]} coords - Array of [lon, lat].
 * @param {number} t - Progress 0..1.
 * @returns {number[]} [lon, lat]
 */
function _interpolateRoad(coords, t) {
  const totalSegments = coords.length - 1;
  const rawIdx = t * totalSegments;
  const idx = Math.min(Math.floor(rawIdx), totalSegments - 1);
  const frac = rawIdx - idx;
  const a = coords[idx];
  const b = coords[idx + 1] || coords[idx];
  return [
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
  ];
}

/** Create a tiny circle canvas for particle billboards. */
function _makeParticleIcon() {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  return canvas;
}

/** Remove traffic layer. */
export function removeTraffic(viewer) {
  if (_animTimer) { clearInterval(_animTimer); _animTimer = null; }
  if (_primitives) { viewer.scene.primitives.remove(_primitives); _primitives = null; }
  _particles = [];
  _roads = [];
}

/** Get road count. */
export function getTrafficStats() {
  return { roads: _roads.length, particles: _particles.length };
}
