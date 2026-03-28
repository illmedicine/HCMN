import { useState, useRef, useEffect, useCallback } from 'react';
import { collectCSIFrames, getCSIPrediction, getPresence, getRoomLayout } from '../services/api';

export default function CSIPanel() {
  const [presence, setPresence] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [layout, setLayout] = useState(null);
  const [bufferSize, setBufferSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);

  const drawLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !layout.walls.length) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const padding = 40;
    const scaleX = (w - 2 * padding) / (layout.width_m || 1);
    const scaleY = (h - 2 * padding) / (layout.height_m || 1);
    const scale = Math.min(scaleX, scaleY);

    function tx(x) { return padding + x * scale; }
    function ty(y) { return padding + y * scale; }

    // Draw walls
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    layout.walls.forEach((wall) => {
      ctx.beginPath();
      ctx.moveTo(tx(wall.x1), ty(wall.y1));
      ctx.lineTo(tx(wall.x2), ty(wall.y2));
      ctx.stroke();
    });

    // Draw zones
    layout.zones.forEach((zone) => {
      ctx.beginPath();
      ctx.arc(tx(zone.center_x), ty(zone.center_y), zone.radius_m * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone.label, tx(zone.center_x), ty(zone.center_y) + 4);
    });

    // Draw presence indicator if occupied
    if (presence && presence.occupancy_count > 0) {
      const zone = layout.zones[0];
      if (zone) {
        ctx.beginPath();
        ctx.arc(tx(zone.center_x), ty(zone.center_y) - 20, 6, 0, Math.PI * 2);
        ctx.fillStyle = presence.occupancy_count > 1 ? '#ef4444' : '#f59e0b';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('👤', tx(zone.center_x), ty(zone.center_y) - 30);
      }
    }

    // Dimensions
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${layout.width_m.toFixed(1)}m`, w / 2, h - 8);
    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${layout.height_m.toFixed(1)}m`, 0, 0);
    ctx.restore();
  }, [layout, presence]);

  useEffect(() => {
    drawLayout();
  }, [drawLayout]);

  async function runPipeline() {
    setLoading(true);
    try {
      const frames = await collectCSIFrames(30);
      setBufferSize((prev) => prev + frames.length);

      const [pred, pres, lay] = await Promise.all([
        getCSIPrediction(),
        getPresence(),
        getRoomLayout(),
      ]);
      setPrediction(pred);
      setPresence(pres);
      setLayout(lay);
    } catch {
      /* no-op */
    }
    setLoading(false);
  }

  function presenceDotClass() {
    if (!presence) return '';
    if (presence.occupancy_count === 0) return 'empty';
    if (presence.occupancy_count > 1) return 'multiple';
    return 'occupied';
  }

  function activityLabel() {
    if (!prediction) return 'No data';
    const labels = {
      empty: '🟢 Room Empty',
      person_walking: '🟡 Person Walking',
      person_sitting: '🟠 Person Sitting',
      person_standing: '🟡 Person Standing',
      multiple_people: '🔴 Multiple People',
      unknown: '⚪ Unknown',
    };
    return labels[prediction.prediction] || prediction.prediction;
  }

  return (
    <div>
      <div className="section-title">
        <span className="icon">📶</span>
        Wi-Fi CSI Sensing &amp; Spatial Reconstruction
        <button className="btn-refresh" onClick={runPipeline} disabled={loading}>
          {loading ? 'Processing…' : '▶ Run Pipeline'}
        </button>
      </div>

      <div className="formula">
        H = |H| · e<sup>j∠H</sup>
      </div>

      <div className="pipeline-steps">
        <div className="pipeline-step"><span className="step-num">1</span> Collect CSI</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">2</span> Low-pass Filter</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">3</span> PCA Reduction</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">4</span> FFT Features</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">5</span> CNN Classifier</div>
      </div>

      <div className="csi-dashboard">
        <div className="csi-card">
          <h3>Presence Detection</h3>
          <div className="presence-indicator">
            <div className={`presence-dot ${presenceDotClass()}`} />
            <div className="presence-info">
              <h4>{activityLabel()}</h4>
              <p>
                {presence
                  ? `Occupancy: ${presence.occupancy_count} · Zone: ${presence.zone || 'N/A'}`
                  : 'Click "Run Pipeline" to collect data'}
              </p>
            </div>
          </div>
          {prediction && (
            <>
              <div className="confidence-bar" style={{ marginTop: '1rem' }}>
                <div
                  className="fill"
                  style={{
                    width: `${(prediction.confidence * 100).toFixed(0)}%`,
                    background: prediction.confidence > 0.7 ? 'var(--accent-green)' : 'var(--accent-amber)',
                  }}
                />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                Confidence: {(prediction.confidence * 100).toFixed(1)}%
              </p>
            </>
          )}
        </div>

        <div className="csi-card">
          <h3>Room Layout Reconstruction</h3>
          <canvas ref={canvasRef} className="room-layout-canvas" />
        </div>

        <div className="csi-card">
          <h3>Buffer Status</h3>
          <div className="stat-value">{bufferSize}</div>
          <div className="stat-label">CSI Frames Collected</div>
        </div>

        <div className="csi-card">
          <h3>Pipeline Configuration</h3>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
            <div>Device: <strong>ESP32 (CSI)</strong></div>
            <div>Subcarriers: <strong>64</strong></div>
            <div>PCA Components: <strong>10</strong></div>
            <div>FFT Window: <strong>256</strong></div>
            <div>Classifier: <strong>CNN (heuristic demo)</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
