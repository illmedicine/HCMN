import { useState, useEffect, useRef, useCallback } from 'react';
import {
  collectCSIFrames,
  getPresence,
  getCSIPrediction,
  getRoomLayout,
  getBufferSize,
  getRouterInfo,
} from '../../services/api';
import TrainingWizard from './TrainingWizard';
import RouterConfig from './RouterConfig';

export default function PresenceDashboard() {
  const [presence, setPresence] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [layout, setLayout] = useState(null);
  const [bufferInfo, setBufferInfo] = useState({ size: 0 });
  const [routerInfo, setRouterInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showTraining, setShowTraining] = useState(false);
  const [showRouterConfig, setShowRouterConfig] = useState(false);
  const roomCanvasRef = useRef(null);

  // Load initial data
  useEffect(() => {
    loadAll();
  }, []);

  // Draw room layout when data changes
  useEffect(() => {
    drawRoomLayout();
  }, [layout, presence]);

  async function loadAll() {
    setLoading(true);
    try {
      const [p, pred, l, b, r] = await Promise.all([
        getPresence().catch(() => null),
        getCSIPrediction().catch(() => null),
        getRoomLayout().catch(() => null),
        getBufferSize().catch(() => ({ size: 0 })),
        getRouterInfo().catch(() => null),
      ]);
      setPresence(p);
      setPrediction(pred);
      setLayout(l);
      setBufferInfo(b);
      setRouterInfo(r);
    } catch { /* ignore */ }
    setLoading(false);
  }

  async function handleCollect() {
    setLoading(true);
    try {
      await collectCSIFrames(20);
      await loadAll();
    } catch { /* ignore */ }
    setLoading(false);
  }

  const drawRoomLayout = useCallback(() => {
    const canvas = roomCanvasRef.current;
    if (!canvas || !layout) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const margin = 40;

    // Clear
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, w, h);

    // Scale to room dimensions
    const scaleX = (w - 2 * margin) / (layout.widthM || 8);
    const scaleY = (h - 2 * margin) / (layout.heightM || 6);
    const scale = Math.min(scaleX, scaleY);

    const toX = (m) => margin + m * scale;
    const toY = (m) => margin + m * scale;

    // Draw grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    for (let m = 0; m <= layout.widthM; m++) {
      ctx.beginPath();
      ctx.moveTo(toX(m), toY(0));
      ctx.lineTo(toX(m), toY(layout.heightM));
      ctx.stroke();
    }
    for (let m = 0; m <= layout.heightM; m++) {
      ctx.beginPath();
      ctx.moveTo(toX(0), toY(m));
      ctx.lineTo(toX(layout.widthM), toY(m));
      ctx.stroke();
    }

    // Draw walls
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    for (const wall of (layout.walls || [])) {
      ctx.globalAlpha = wall.confidence;
      ctx.beginPath();
      ctx.moveTo(toX(wall.x1), toY(wall.y1));
      ctx.lineTo(toX(wall.x2), toY(wall.y2));
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Draw zones
    for (const zone of (layout.zones || [])) {
      const cx = toX(zone.centerX);
      const cy = toY(zone.centerY);
      const r = zone.radiusM * scale;

      ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone.label, cx, cy + r + 14);
    }

    // Draw presence indicator
    if (presence && presence.occupancyCount > 0) {
      const zone = layout.zones?.[0];
      if (zone) {
        const cx = toX(zone.centerX);
        const cy = toY(zone.centerY);

        ctx.fillStyle = presence.occupancyCount > 1 ? '#ef4444' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(presence.occupancyCount), cx, cy + 4);
      }
    }

    // Title
    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Room Layout (${layout.widthM.toFixed(1)}m × ${layout.heightM.toFixed(1)}m)`, 10, 16);

    // Wi-Fi router icon
    ctx.font = '16px sans-serif';
    ctx.fillText('📡', toX(0) + 5, toY(0) + 20);
  }, [layout, presence]);

  const getPresenceColor = () => {
    if (!prediction) return 'var(--text-secondary)';
    switch (prediction.prediction) {
      case 'empty': return 'var(--accent-green)';
      case 'person_sitting':
      case 'person_walking': return 'var(--accent-amber)';
      case 'multiple_people': return 'var(--accent-red)';
      default: return 'var(--text-secondary)';
    }
  };

  const getPresenceLabel = () => {
    if (!prediction) return 'Unknown';
    return prediction.prediction.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <div>
      <div className="section-title">
        <span className="icon">📶</span>
        Wi-Fi Signal Presence Detection
        <button className="btn-refresh" onClick={loadAll}>↻ Refresh</button>
      </div>

      {/* Router status */}
      <div className="router-status-bar">
        <span>
          📡 Router: {routerInfo ? `${routerInfo.model} (${routerInfo.status})` : 'Not configured'}
        </span>
        <span>Signal: {routerInfo?.signalStrength || 'N/A'} dBm</span>
        <span>Devices: {routerInfo?.connectedDevices || 'N/A'}</span>
        <button className="btn-small" onClick={() => setShowRouterConfig(true)}>⚙️ Configure</button>
      </div>

      <div className="csi-dashboard">
        {/* Presence Detection Card */}
        <div className="csi-card">
          <h3>Presence Detection</h3>
          <div className="presence-indicator">
            <div
              className={`presence-dot ${prediction?.prediction === 'empty' ? 'empty' : prediction?.prediction === 'multiple_people' ? 'multiple' : 'occupied'}`}
            />
            <div className="presence-info">
              <h4 style={{ color: getPresenceColor() }}>{getPresenceLabel()}</h4>
              <p>
                {presence
                  ? `${presence.occupancyCount} person(s) • ${presence.activity} • Zone: ${presence.zone}`
                  : 'Collecting data...'}
              </p>
            </div>
          </div>
          {prediction && (
            <div className="confidence-bar">
              <div
                className="fill"
                style={{
                  width: `${prediction.confidence * 100}%`,
                  background: getPresenceColor(),
                }}
              />
            </div>
          )}
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Confidence: {prediction ? `${(prediction.confidence * 100).toFixed(0)}%` : 'N/A'}
          </p>
          <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
            <button className="btn-action" onClick={handleCollect} disabled={loading}>
              {loading ? 'Collecting...' : '📊 Collect Frames'}
            </button>
            <button className="btn-action secondary" onClick={() => setShowTraining(true)}>
              🎓 Train Model
            </button>
          </div>
        </div>

        {/* Room Layout Canvas */}
        <div className="csi-card">
          <h3>Spatial Reconstruction</h3>
          <canvas ref={roomCanvasRef} className="room-layout-canvas" />
        </div>

        {/* Buffer / Pipeline Info */}
        <div className="csi-card">
          <h3>CSI Pipeline Status</h3>
          <div className="stat-value">{bufferInfo.size}</div>
          <div className="stat-label">Frames in Buffer</div>

          <div className="pipeline-steps" style={{ marginTop: '1rem' }}>
            {['Collect', 'Filter', 'PCA', 'FFT', 'Classify'].map((step, i) => (
              <span key={step}>
                {i > 0 && <span className="pipeline-arrow">→</span>}
                <span className="pipeline-step">
                  <span className="step-num">{i + 1}</span>
                  {step}
                </span>
              </span>
            ))}
          </div>

          <div className="formula">
            H = |H| · e<sup>j∠H</sup>
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            <p>Device: {routerInfo?.model || 'Simulated'}</p>
            <p>Subcarriers: 64 • PCA: 10 components • FFT: 256 window</p>
          </div>
        </div>

        {/* Signal Strength Visualization */}
        <div className="csi-card">
          <h3>Signal Analysis</h3>
          <div className="signal-bars">
            {[...Array(8)].map((_, i) => {
              const strength = routerInfo
                ? Math.max(0, 100 + (routerInfo.signalStrength + i * 3))
                : 50 + Math.random() * 30;
              return (
                <div key={i} className="signal-bar-container">
                  <div
                    className="signal-bar"
                    style={{
                      height: `${Math.min(strength, 100)}%`,
                      background: strength > 70 ? 'var(--accent-green)' : strength > 40 ? 'var(--accent-amber)' : 'var(--accent-red)',
                    }}
                  />
                  <span className="bar-label">CH{i + 1}</span>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Wi-Fi channel signal quality per subcarrier group
          </p>
        </div>
      </div>

      {/* Training Wizard Modal */}
      {showTraining && (
        <TrainingWizard onClose={() => setShowTraining(false)} />
      )}

      {/* Router Config Modal */}
      {showRouterConfig && (
        <RouterConfig onClose={() => setShowRouterConfig(false)} onSave={loadAll} />
      )}
    </div>
  );
}
