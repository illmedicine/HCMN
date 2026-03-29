/**
 * HCMN CCTV Layer — live camera feeds projected onto the 3D globe.
 *
 * Places camera feed locations on the globe and, when zoomed in,
 * shows live video thumbnail overlays anchored to the camera position.
 * Full projection onto building geometry requires per-camera calibration.
 */
import * as Cesium from 'cesium';

let _dataSource = null;

// Curated live camera feeds (embeddable YouTube/webcam streams)
const LIVE_FEEDS = [
  { id: 'nyc-ts', name: 'NYC Times Square', lat: 40.758, lon: -73.9855, embed: 'https://www.youtube.com/embed/eJ7ZkQ5TC08?autoplay=1&mute=1', city: 'New York' },
  { id: 'jackson', name: 'Jackson Hole Town Sq', lat: 43.4799, lon: -110.7624, embed: 'https://www.youtube.com/embed/DoLMfjRDmSM?autoplay=1&mute=1', city: 'Jackson Hole' },
  { id: 'shibuya', name: 'Shibuya Crossing', lat: 35.6595, lon: 139.7004, embed: 'https://www.youtube.com/embed/DjdUEyjx8GM?autoplay=1&mute=1', city: 'Tokyo' },
  { id: 'miami', name: 'Miami Beach', lat: 25.7907, lon: -80.1300, embed: 'https://www.youtube.com/embed/IFzwnhJMFm8?autoplay=1&mute=1', city: 'Miami' },
  { id: 'lax', name: 'LAX Airport', lat: 33.9425, lon: -118.4081, embed: 'https://www.youtube.com/embed/lc4kn8ZnFhk?autoplay=1&mute=1', city: 'Los Angeles' },
  { id: 'iss', name: 'ISS Earth Feed (NASA)', lat: 0, lon: 0, embed: 'https://www.youtube.com/embed/P9C25Un7xaM?autoplay=1&mute=1', city: 'LEO' },
  { id: 'naples', name: 'Naples – Vesuvius', lat: 40.8518, lon: 14.2681, embed: 'https://www.youtube.com/embed/RtU_mdL2vBM?autoplay=1&mute=1', city: 'Naples' },
  { id: 'stmaarten', name: 'St. Maarten Airport', lat: 18.0425, lon: -63.1089, embed: 'https://www.youtube.com/embed/wUZ-EU2B8kU?autoplay=1&mute=1', city: 'St. Maarten' },
  { id: 'dublin', name: 'Dublin City', lat: 53.3498, lon: -6.2603, embed: 'https://www.youtube.com/embed/S60pTMhHXx8?autoplay=1&mute=1', city: 'Dublin' },
  { id: 'rio', name: 'Rio Copacabana', lat: -22.9714, lon: -43.1823, embed: 'https://www.youtube.com/embed/oL2pnFSMdBE?autoplay=1&mute=1', city: 'Rio de Janeiro' },
];

/**
 * Load CCTV camera markers onto the viewer.
 * @param {Cesium.Viewer} viewer
 * @param {object} opts
 * @param {function} [opts.onSelect] - Callback when a camera is clicked with feed details.
 * @param {function} [opts.onStats] - Callback with { count }.
 */
export function loadCCTV(viewer, opts = {}) {
  const { onSelect, onStats } = opts;

  removeCCTV(viewer);

  _dataSource = new Cesium.CustomDataSource('hcmn-cctv');
  viewer.dataSources.add(_dataSource);

  for (const feed of LIVE_FEEDS) {
    _dataSource.entities.add({
      name: feed.name,
      position: Cesium.Cartesian3.fromDegrees(feed.lon, feed.lat, 50),
      billboard: {
        image: _makeCameraIcon(),
        width: 24,
        height: 24,
        color: Cesium.Color.fromCssColorString('#ff4444'),
        scaleByDistance: new Cesium.NearFarScalar(500, 1.5, 5e6, 0.4),
      },
      label: {
        text: feed.name,
        font: '11px monospace',
        fillColor: Cesium.Color.fromCssColorString('#ff6666'),
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 2,
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        pixelOffset: new Cesium.Cartesian2(16, -4),
        scaleByDistance: new Cesium.NearFarScalar(500, 1.0, 1e6, 0.0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5e5),
      },
      properties: {
        feedId: feed.id,
        embedUrl: feed.embed,
        city: feed.city,
        entityType: 'cctv',
      },
    });
  }

  if (onStats) onStats({ count: LIVE_FEEDS.length });

  // Handle click selection
  if (onSelect) {
    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    handler.setInputAction((click) => {
      const picked = viewer.scene.pick(click.position);
      if (Cesium.defined(picked) && picked.id?.properties?.entityType?.getValue() === 'cctv') {
        const props = picked.id.properties;
        onSelect({
          name: picked.id.name,
          feedId: props.feedId?.getValue(),
          embedUrl: props.embedUrl?.getValue(),
          city: props.city?.getValue(),
        });
      }
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    // Store handler for cleanup
    _dataSource._clickHandler = handler;
  }
}

/** Generate camera icon canvas. */
function _makeCameraIcon() {
  const s = 32;
  const canvas = document.createElement('canvas');
  canvas.width = s; canvas.height = s;
  const ctx = canvas.getContext('2d');
  // Camera body
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(6, 10, 14, 12);
  // Lens
  ctx.beginPath();
  ctx.moveTo(20, 12);
  ctx.lineTo(26, 8);
  ctx.lineTo(26, 24);
  ctx.lineTo(20, 20);
  ctx.fill();
  // Recording dot
  ctx.fillStyle = '#ff0000';
  ctx.beginPath();
  ctx.arc(10, 14, 2, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** Remove CCTV layer. */
export function removeCCTV(viewer) {
  if (_dataSource) {
    if (_dataSource._clickHandler) _dataSource._clickHandler.destroy();
    viewer.dataSources.remove(_dataSource, true);
    _dataSource = null;
  }
}

/** Get feed list for UI. */
export function getCCTVFeeds() {
  return LIVE_FEEDS;
}
