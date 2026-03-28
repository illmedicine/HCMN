import { useState, useRef, useEffect, useCallback } from 'react';
import { collectCSIFrames, getCSIPrediction, getPresence, getRoomLayout, sendChatMessage } from '../services/api';

export default function CSIPanel() {
  const [presence, setPresence] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [layout, setLayout] = useState(null);
  const [bufferSize, setBufferSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [autoCollect, setAutoCollect] = useState(false);
  const [signalHistory, setSignalHistory] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const canvasRef = useRef(null);
  const signalCanvasRef = useRef(null);
  const autoRef = useRef(null);
  const chatEndRef = useRef(null);

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

    // Grid
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= layout.width_m; x += 1) {
      ctx.beginPath(); ctx.moveTo(tx(x), ty(0)); ctx.lineTo(tx(x), ty(layout.height_m)); ctx.stroke();
    }
    for (let y = 0; y <= layout.height_m; y += 1) {
      ctx.beginPath(); ctx.moveTo(tx(0), ty(y)); ctx.lineTo(tx(layout.width_m), ty(y)); ctx.stroke();
    }

    // Signal strength heatmap overlay
    const gridRes = 20;
    for (let gx = 0; gx < gridRes; gx++) {
      for (let gy = 0; gy < gridRes; gy++) {
        const rx = (gx / gridRes) * layout.width_m;
        const ry = (gy / gridRes) * layout.height_m;
        // Simulate signal strength based on distance from router (center)
        const cx = layout.width_m / 2;
        const cy = layout.height_m / 2;
        const dist = Math.sqrt((rx - cx) ** 2 + (ry - cy) ** 2);
        const maxDist = Math.sqrt(cx ** 2 + cy ** 2);
        const strength = 1 - (dist / maxDist) * 0.7 + (Math.sin(rx * 2 + ry) * 0.1);
        const cellW = (layout.width_m / gridRes) * scale;
        const cellH = (layout.height_m / gridRes) * scale;
        const r = Math.round(255 * (1 - strength) * 0.8);
        const g = Math.round(255 * strength * 0.6);
        const b = Math.round(100 * strength);
        ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
        ctx.fillRect(tx(rx), ty(ry), cellW, cellH);
      }
    }

    // Draw walls
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 8;
    layout.walls.forEach((wall) => {
      ctx.beginPath();
      ctx.moveTo(tx(wall.x1), ty(wall.y1));
      ctx.lineTo(tx(wall.x2), ty(wall.y2));
      ctx.stroke();
    });
    ctx.shadowBlur = 0;

    // Router icon at center
    const rcx = tx(layout.width_m / 2);
    const rcy = ty(layout.height_m / 2);
    ctx.fillStyle = '#10b981';
    ctx.font = '20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📡', rcx, rcy - 10);
    ctx.fillStyle = '#10b981';
    ctx.font = '9px monospace';
    ctx.fillText('Router', rcx, rcy + 8);

    // Signal wave rings from router
    for (let ring = 1; ring <= 3; ring++) {
      ctx.beginPath();
      ctx.arc(rcx, rcy, ring * 30, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(16, 185, 129, ${0.15 / ring})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Draw zones
    layout.zones.forEach((zone) => {
      ctx.beginPath();
      ctx.arc(tx(zone.center_x), ty(zone.center_y), zone.radius_m * scale, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
      ctx.fill();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(zone.label, tx(zone.center_x), ty(zone.center_y) + 4);
    });

    // Draw presence indicator
    if (presence && presence.occupancy_count > 0) {
      const zone = layout.zones[0];
      if (zone) {
        const px = tx(zone.center_x) + Math.sin(Date.now() / 1000) * 15;
        const py = ty(zone.center_y) - 20;

        // Person silhouette glow
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 16);
        glow.addColorStop(0, presence.occupancy_count > 1 ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)');
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        const icon = presence.occupancy_count > 1 ? '👥' : '👤';
        ctx.fillText(icon, px, py + 5);

        ctx.fillStyle = presence.occupancy_count > 1 ? '#ef4444' : '#f59e0b';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(presence.activity, px, py + 22);
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

  const drawSignalHistory = useCallback(() => {
    const canvas = signalCanvasRef.current;
    if (!canvas || signalHistory.length < 2) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#1a2234';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw variance line
    const maxVal = Math.max(...signalHistory.map(s => s.variance), 0.01);
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    signalHistory.forEach((s, i) => {
      const x = (i / (signalHistory.length - 1)) * w;
      const y = h - (s.variance / maxVal) * h * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw confidence line
    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    signalHistory.forEach((s, i) => {
      const x = (i / (signalHistory.length - 1)) * w;
      const y = h - s.confidence * h * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Legend
    ctx.fillStyle = '#3b82f6';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('— Variance (motion)', 8, 14);
    ctx.fillStyle = '#10b981';
    ctx.fillText('- - Confidence', 8, 26);
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'right';
    ctx.fillText(`${signalHistory.length} samples`, w - 8, 14);
  }, [signalHistory]);

  useEffect(() => { drawLayout(); }, [drawLayout]);
  useEffect(() => { drawSignalHistory(); }, [drawSignalHistory]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  useEffect(() => {
    if (autoCollect) {
      autoRef.current = setInterval(() => runPipeline(), 3000);
    } else {
      clearInterval(autoRef.current);
    }
    return () => clearInterval(autoRef.current);
  }, [autoCollect]);

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

      // Track history
      const variance = pred.confidence > 0 ? (1 - pred.confidence) * 0.1 : 0;
      setSignalHistory(prev => {
        const next = [...prev, { variance, confidence: pred.confidence, label: pred.prediction, ts: Date.now() }];
        return next.slice(-60); // keep last 60 samples
      });
    } catch {
      /* no-op */
    }
    setLoading(false);
  }

  async function handleChatSend(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const context = {
        module: 'WiFi CSI Presence Detection',
        prediction: prediction?.prediction || 'unknown',
        confidence: prediction?.confidence?.toFixed(2) || '0',
        occupancy: presence?.occupancy_count ?? 'unknown',
        activity: presence?.activity || 'unknown',
        buffer_size: bufferSize,
        room_width: layout?.width_m?.toFixed(1) || 'unknown',
        room_height: layout?.height_m?.toFixed(1) || 'unknown',
      };
      const allMsgs = [...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const resp = await sendChatMessage(allMsgs, context);
      setChatMessages(prev => [...prev, { role: 'assistant', content: resp.reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Connection error.' }]);
    }
    setChatLoading(false);
  }

  function popOutModule() {
    const w = window.open('', '_blank', 'width=1200,height=800,menubar=no,toolbar=no');
    if (!w) return;
    w.document.title = 'HCMN – Wi-Fi CSI Module';
    w.document.body.innerHTML = '<div style="background:#0a0e17;color:#e2e8f0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif"><h2>Module 3 – Wi-Fi CSI Sensing</h2><p>Pop-out window active.</p></div>';
  }

  function presenceDotClass() {
    if (!presence) return '';
    if (presence.occupancy_count === 0) return 'empty';
    if (presence.occupancy_count > 1) return 'multiple';
    return 'occupied';
  }

  const activityLabels = {
    empty: '🟢 Room Empty',
    person_walking: '🟡 Person Walking',
    person_sitting: '🟠 Person Sitting',
    person_standing: '🟡 Person Standing',
    multiple_people: '🔴 Multiple People',
    unknown: '⚪ Unknown',
  };

  const densityInfo = prediction ? {
    empty: { desc: 'No human-density signal reflections detected. Only static objects (furniture, walls) returning stable signals.', icon: '🏠' },
    person_walking: { desc: 'Dynamic signal variance detected – consistent with human movement. Signal density shifting across subcarriers indicates motion through room.', icon: '🚶' },
    person_sitting: { desc: 'Moderate signal perturbation detected. Density profile consistent with stationary human presence – breathing micro-movements visible in CSI.', icon: '🪑' },
    person_standing: { desc: 'Signal reflection density indicates upright human form. Minimal lateral movement but consistent body-mass reflection pattern.', icon: '🧍' },
    multiple_people: { desc: 'Multiple overlapping density signatures detected. Signal variance high across multiple subcarrier groups, indicating 2+ distinct reflective bodies.', icon: '👥' },
  }[prediction.prediction] || { desc: 'Insufficient data for density analysis.', icon: '❓' } : { desc: 'Run pipeline to begin signal analysis.', icon: '📡' };

  return (
    <div className="module-panel csi-module">
      <div className="module-header">
        <div className="module-title">
          <span className="module-icon">📶</span>
          <h2>Module 3 – Wi-Fi CSI Environment Mapping</h2>
        </div>
        <div className="module-actions">
          <button className={`btn-auto ${autoCollect ? 'active' : ''}`} onClick={() => setAutoCollect(!autoCollect)}>
            {autoCollect ? '⏸ Stop Auto' : '▶ Auto Collect'}
          </button>
          <button className="btn-refresh" onClick={runPipeline} disabled={loading}>
            {loading ? 'Processing…' : '▶ Run Pipeline'}
          </button>
          <button className="btn-popout" onClick={popOutModule}>⧉ Pop Out</button>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="pipeline-bar">
        <div className="pipeline-step"><span className="step-num">1</span> Collect CSI</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">2</span> Low-pass Filter</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">3</span> PCA Reduction</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">4</span> FFT Features</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">5</span> AI Classifier</div>
      </div>

      <div className="csi-layout">
        {/* Left Panel - Room Map & Signal */}
        <div className="csi-map-column">
          <div className="csi-card room-card">
            <h3>🏠 Room Environment Map</h3>
            <canvas ref={canvasRef} className="room-layout-canvas" />
          </div>
          <div className="csi-card signal-card">
            <h3>📊 Signal Variance Timeline</h3>
            <canvas ref={signalCanvasRef} className="signal-canvas" />
          </div>
        </div>

        {/* Right Panel - Detection & Analysis */}
        <div className="csi-info-column">
          <div className="csi-card presence-card">
            <h3>👁️ Presence Detection</h3>
            <div className="presence-indicator">
              <div className={`presence-dot ${presenceDotClass()}`} />
              <div className="presence-info">
                <h4>{prediction ? (activityLabels[prediction.prediction] || prediction.prediction) : 'No data'}</h4>
                <p>
                  {presence
                    ? `Occupancy: ${presence.occupancy_count} · Zone: ${presence.zone || 'N/A'}`
                    : 'Run pipeline to begin detection'}
                </p>
              </div>
            </div>
            {prediction && (
              <div className="confidence-section">
                <div className="confidence-bar">
                  <div className="fill" style={{
                    width: `${(prediction.confidence * 100).toFixed(0)}%`,
                    background: prediction.confidence > 0.7 ? 'var(--accent-green)' : 'var(--accent-amber)',
                  }} />
                </div>
                <span className="confidence-text">Confidence: {(prediction.confidence * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>

          <div className="csi-card density-card">
            <h3>{densityInfo.icon} Signal Density Analysis</h3>
            <p className="density-desc">{densityInfo.desc}</p>
            <div className="density-legend">
              <div className="legend-item"><span className="legend-color" style={{ background: '#10b981' }} />Static objects (furniture/walls)</div>
              <div className="legend-item"><span className="legend-color" style={{ background: '#f59e0b' }} />Human presence (low motion)</div>
              <div className="legend-item"><span className="legend-color" style={{ background: '#ef4444' }} />Active movement detected</div>
            </div>
          </div>

          <div className="csi-card stats-card">
            <h3>📡 System Status</h3>
            <div className="stats-grid">
              <div className="stat-item"><span className="stat-val">{bufferSize}</span><span className="stat-lbl">Frames Collected</span></div>
              <div className="stat-item"><span className="stat-val">64</span><span className="stat-lbl">Subcarriers</span></div>
              <div className="stat-item"><span className="stat-val">ESP32</span><span className="stat-lbl">Device</span></div>
              <div className="stat-item"><span className="stat-val">{autoCollect ? 'Active' : 'Manual'}</span><span className="stat-lbl">Mode</span></div>
            </div>
          </div>

          {/* CSI AI Chat */}
          <div className="csi-card chat-card">
            <h3>🤖 CSI AI Analysis</h3>
            <div className="chat-messages compact">
              {chatMessages.length === 0 && (
                <p className="chat-hint">Ask about signal patterns, room density, or presence detection…</p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-msg chat-${msg.role}`}>
                  <span className="msg-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
                  <p>{msg.content}</p>
                </div>
              ))}
              {chatLoading && <div className="chat-msg chat-assistant"><span className="msg-role">AI</span><p className="typing">Analyzing signals…</p></div>}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input" onSubmit={handleChatSend}>
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask about CSI signals…" disabled={chatLoading} />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
