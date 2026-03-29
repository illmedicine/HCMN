import { useState, useRef, useEffect, useCallback } from 'react';
import {
  collectCSIFrames,
  getCSIPrediction,
  getPresence,
  getRoomLayout,
  getNetworkDevices,
  sendChatMessage,
} from '../services/api';

// Device type icons
const DEVICE_ICONS = {
  phone: '📱', laptop: '💻', tablet: '📱', smart_tv: '📺',
  smart_speaker: '🔊', iot: '🔌', camera: '📷', console: '🎮',
  wearable: '⌚', printer: '🖨️', router: '📡', default: '📶',
};

const ACTIVITY_LABELS = {
  empty: '🟢 Empty',
  idle: '🟢 Idle',
  sleeping: '😴 Sleeping',
  light_movement: '🟡 Light Movement',
  person_walking: '🟡 Walking',
  person_sitting: '🟠 Sitting',
  person_standing: '🟡 Standing',
  active: '🔴 Active',
  multiple_people: '🔴 Multiple People',
  none: '⚪ No Activity',
  unknown: '⚪ Unknown',
};

export default function CSIPanel() {
  const [presence, setPresence] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [layout, setLayout] = useState(null);
  const [bufferSize, setBufferSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [autoCollect, setAutoCollect] = useState(false);
  const [signalHistory, setSignalHistory] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDevices, setShowDevices] = useState(true);
  const [showPresence, setShowPresence] = useState(true);
  const [showSignalStrength, setShowSignalStrength] = useState(true);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const canvasRef = useRef(null);
  const canvasSizeRef = useRef({ w: 0, h: 0 });
  const signalCanvasRef = useRef(null);
  const autoRef = useRef(null);
  const chatEndRef = useRef(null);

  // Stable canvas sizing — only update dimensions on actual resize, not every draw
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          canvasSizeRef.current = { w: width, h: height };
          canvas.width = width * window.devicePixelRatio;
          canvas.height = height * window.devicePixelRatio;
        }
      }
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ───────────────────────── FLOOR PLAN RENDERER ─────────────────────────
  const drawLayout = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;

    const ctx = canvas.getContext('2d');
    const { w, h } = canvasSizeRef.current;
    if (w === 0 || h === 0) return;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);

    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, w, h);

    const padding = 45;
    const scaleX = (w - 2 * padding) / (layout.width_m || 1);
    const scaleY = (h - 2 * padding) / (layout.height_m || 1);
    const scale = Math.min(scaleX, scaleY);

    const oX = (w - layout.width_m * scale) / 2;
    const oY = (h - layout.height_m * scale) / 2;
    function tx(x) { return oX + x * scale; }
    function ty(y) { return oY + y * scale; }

    // ── Grid ──
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= layout.width_m; x += 1) {
      ctx.beginPath(); ctx.moveTo(tx(x), ty(0)); ctx.lineTo(tx(x), ty(layout.height_m)); ctx.stroke();
    }
    for (let y = 0; y <= layout.height_m; y += 1) {
      ctx.beginPath(); ctx.moveTo(tx(0), ty(y)); ctx.lineTo(tx(layout.width_m), ty(y)); ctx.stroke();
    }

    // ── Room fills ──
    if (layout.rooms) {
      layout.rooms.forEach(room => {
        const isSelected = selectedRoom === room.id;
        ctx.fillStyle = isSelected ? room.color.replace(')', ', 0.6)').replace('rgb', 'rgba').replace('#', '') : room.color;
        // Simple hex -> fill
        ctx.fillStyle = room.color;
        if (isSelected) ctx.globalAlpha = 0.8;
        else ctx.globalAlpha = 0.4;
        ctx.fillRect(tx(room.x), ty(room.y), room.w * scale, room.h * scale);
        ctx.globalAlpha = 1;

        // Room label
        ctx.fillStyle = '#64748b';
        ctx.font = `${Math.max(10, scale * 0.8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(room.label, tx(room.x + room.w / 2), ty(room.y + room.h / 2) + 4);

        // Room highlight border if selected
        if (isSelected) {
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 3]);
          ctx.strokeRect(tx(room.x) + 1, ty(room.y) + 1, room.w * scale - 2, room.h * scale - 2);
          ctx.setLineDash([]);
        }
      });
    }

    // ── WiFi signal strength heatmap ──
    if (showSignalStrength && layout.access_points) {
      const gridRes = 40;
      const cellW = (layout.width_m / gridRes) * scale;
      const cellH = (layout.height_m / gridRes) * scale;
      for (let gx = 0; gx < gridRes; gx++) {
        for (let gy = 0; gy < gridRes; gy++) {
          const rx = (gx + 0.5) / gridRes * layout.width_m;
          const ry = (gy + 0.5) / gridRes * layout.height_m;
          // Compute signal from nearest AP
          let bestSignal = -100;
          layout.access_points.forEach(ap => {
            const dist = Math.sqrt((rx - ap.x) ** 2 + (ry - ap.y) ** 2);
            // Simple path-loss model: -30 - 25*log10(dist+0.5) + wall attenuation
            let sig = -30 - 25 * Math.log10(dist + 0.5);
            // Wall penalty: check if between AP and point there's a wall crossing
            if (layout.walls) {
              layout.walls.forEach(wall => {
                if (lineIntersects(ap.x, ap.y, rx, ry, wall.x1, wall.y1, wall.x2, wall.y2)) {
                  sig -= 6; // ~6dB per wall
                }
              });
            }
            if (sig > bestSignal) bestSignal = sig;
          });
          // Map signal to color
          const norm = Math.max(0, Math.min(1, (bestSignal + 80) / 50)); // -80 to -30 range
          const r = Math.round(255 * (1 - norm) * 0.7);
          const g = Math.round(255 * norm * 0.7);
          const b = Math.round(60 * norm);
          ctx.fillStyle = `rgba(${r},${g},${b},0.12)`;
          ctx.fillRect(tx(gx / gridRes * layout.width_m), ty(gy / gridRes * layout.height_m), cellW, cellH);
        }
      }
    }

    // ── Furniture ──
    if (layout.furniture) {
      layout.furniture.forEach(f => {
        ctx.fillStyle = 'rgba(71, 85, 105, 0.3)';
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.fillRect(tx(f.x), ty(f.y), f.w * scale, f.h * scale);
        ctx.strokeRect(tx(f.x), ty(f.y), f.w * scale, f.h * scale);
        if (f.icon) {
          ctx.font = `${Math.max(12, scale * 0.7)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText(f.icon, tx(f.x + f.w / 2), ty(f.y + f.h / 2) + 5);
        }
        if (f.label && scale > 25) {
          ctx.fillStyle = '#475569';
          ctx.font = '8px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(f.label, tx(f.x + f.w / 2), ty(f.y + f.h) + 10);
        }
      });
    }

    // ── Doors ──
    if (layout.doors) {
      layout.doors.forEach(d => {
        ctx.fillStyle = '#1e293b';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        if (d.dir === 'h') {
          ctx.fillRect(tx(d.x - 0.4), ty(d.y) - 3, 0.8 * scale, 6);
        } else {
          ctx.fillRect(tx(d.x) - 3, ty(d.y - 0.4), 6, 0.8 * scale);
        }
      });
    }

    // ── Walls ──
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#3b82f6';
    ctx.shadowBlur = 6;
    if (layout.walls) {
      layout.walls.forEach(wall => {
        ctx.beginPath();
        ctx.moveTo(tx(wall.x1), ty(wall.y1));
        ctx.lineTo(tx(wall.x2), ty(wall.y2));
        ctx.stroke();
      });
    }
    ctx.shadowBlur = 0;

    // ── Access Points ──
    if (layout.access_points) {
      layout.access_points.forEach(ap => {
        const ax = tx(ap.x), ay = ty(ap.y);
        // Signal rings
        for (let ring = 1; ring <= 4; ring++) {
          ctx.beginPath();
          ctx.arc(ax, ay, ring * 20, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(16, 185, 129, ${0.2 / ring})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📡', ax, ay + 6);
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(ap.label, ax, ay + 20);
        ctx.fillStyle = '#6b7280';
        ctx.font = '8px monospace';
        ctx.fillText(ap.ssid, ax, ay + 30);
      });
    }

    // ── Connected Devices ──
    if (showDevices && layout.devices) {
      layout.devices.forEach(dev => {
        const dx = tx(dev.x), dy = ty(dev.y);
        const isSelected = selectedDevice === dev.id;

        // Glow for online devices
        if (dev.online) {
          const glow = ctx.createRadialGradient(dx, dy, 0, dx, dy, 14);
          glow.addColorStop(0, isSelected ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.25)');
          glow.addColorStop(1, 'transparent');
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(dx, dy, 14, 0, Math.PI * 2);
          ctx.fill();
        }

        // Icon
        const icon = DEVICE_ICONS[dev.type] || DEVICE_ICONS.default;
        ctx.font = isSelected ? '16px sans-serif' : '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(icon, dx, dy + 4);

        // Label
        if (isSelected || scale > 25) {
          ctx.fillStyle = dev.online ? '#e2e8f0' : '#64748b';
          ctx.font = 'bold 8px monospace';
          ctx.fillText(dev.name.length > 14 ? dev.name.slice(0, 12) + '…' : dev.name, dx, dy + 18);
          if (isSelected) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '7px monospace';
            ctx.fillText(dev.ip, dx, dy + 27);
            ctx.fillText(`${dev.signal_dbm} dBm · ${dev.band}`, dx, dy + 36);
          }
        }

        // Offline indicator
        if (!dev.online) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(dx - 8, dy - 8); ctx.lineTo(dx + 8, dy + 8);
          ctx.stroke();
        }
      });
    }

    // ── Per-person presence (individual icons at actual positions) ──
    if (showPresence && presence?.persons && presence.persons.length > 0) {
      const PERSON_ICONS = {
        person_walking: '🚶',
        person_sitting: '🪑',
        person_standing: '🧍',
        sleeping: '😴',
      };
      const ACTIVITY_COLORS = {
        person_walking: '#f59e0b',
        person_sitting: '#3b82f6',
        person_standing: '#10b981',
        sleeping: '#8b5cf6',
      };
      presence.persons.forEach(p => {
        const px = tx(p.x);
        const py = ty(p.y);
        const color = ACTIVITY_COLORS[p.activity] || '#f59e0b';

        // Glow ring
        const glow = ctx.createRadialGradient(px, py, 0, px, py, 22);
        glow.addColorStop(0, color.replace(')', ', 0.35)').replace('#', 'rgba(') || `rgba(245,158,11,0.3)`);
        // Parse hex to rgba
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        const glow2 = ctx.createRadialGradient(px, py, 0, px, py, 22);
        glow2.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
        glow2.addColorStop(1, 'transparent');
        ctx.fillStyle = glow2;
        ctx.beginPath();
        ctx.arc(px, py, 22, 0, Math.PI * 2);
        ctx.fill();

        // Outer ring pulse
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 600 + p.x);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.3 * pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, 18 + pulse * 6, 0, Math.PI * 2);
        ctx.stroke();

        // Icon
        const icon = PERSON_ICONS[p.activity] || '👤';
        ctx.font = '18px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(icon, px, py + 6);

        // Label
        ctx.fillStyle = `rgba(${r},${g},${b},1)`;
        ctx.font = 'bold 8px monospace';
        const actLabel = ACTIVITY_LABELS[p.activity]?.split(' ').pop() || p.activity;
        ctx.fillText(actLabel, px, py + 22);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '7px monospace';
        ctx.fillText(p.label, px, py + 31);
      });
    }

    // ── Dimension labels ──
    ctx.fillStyle = '#475569';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${layout.width_m.toFixed(0)}m`, w / 2, h - 6);
    ctx.save();
    ctx.translate(10, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${layout.height_m.toFixed(0)}m`, 0, 0);
    ctx.restore();
  }, [layout, presence, selectedRoom, selectedDevice, showDevices, showPresence, showSignalStrength]);

  // Simple line-line intersection test for wall attenuation
  function lineIntersects(x1, y1, x2, y2, x3, y3, x4, y4) {
    const d = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(d) < 1e-10) return false;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / d;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / d;
    return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99;
  }

  // ───────────────────────── SIGNAL HISTORY CHART ─────────────────────────
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

    ctx.strokeStyle = '#1a2234';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = (i / 4) * h;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const maxVal = Math.max(...signalHistory.map(s => s.variance), 0.01);
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    signalHistory.forEach((s, i) => {
      const x = (i / (signalHistory.length - 1)) * w;
      const y = h - (s.variance / maxVal) * h * 0.9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    signalHistory.forEach((s, i) => {
      const x = (i / (signalHistory.length - 1)) * w;
      const y = h - s.confidence * h * 0.9;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

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

  // ───────────────────────── EFFECTS ─────────────────────────
  useEffect(() => { drawLayout(); }, [drawLayout]);
  // Repaint at ~20fps for smooth person icon animation
  useEffect(() => {
    let raf;
    function tick() { drawLayout(); raf = requestAnimationFrame(tick); }
    if (presence?.persons?.length) { raf = requestAnimationFrame(tick); }
    return () => cancelAnimationFrame(raf);
  }, [drawLayout, presence]);
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

  // ───────────────────────── DATA PIPELINE ─────────────────────────
  async function runPipeline() {
    setLoading(true);
    try {
      const frames = await collectCSIFrames(30);
      setBufferSize(prev => prev + frames.length);

      const [pred, pres, lay] = await Promise.all([
        getCSIPrediction(),
        getPresence(),
        getRoomLayout(),
      ]);
      setPrediction(pred);
      setPresence(pres);
      setLayout(lay);

      const variance = pred.confidence > 0 ? (1 - pred.confidence) * 0.1 : 0;
      setSignalHistory(prev => {
        const next = [...prev, { variance, confidence: pred.confidence, label: pred.prediction, ts: Date.now() }];
        return next.slice(-60);
      });
    } catch { /* no-op */ }
    setLoading(false);
  }

  // ───────────────────────── CANVAS CLICK HANDLER ─────────────────────────
  function handleCanvasClick(e) {
    if (!layout || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const padding = 45;
    const scaleX = (rect.width - 2 * padding) / (layout.width_m || 1);
    const scaleY = (rect.height - 2 * padding) / (layout.height_m || 1);
    const scale = Math.min(scaleX, scaleY);
    const oX = (rect.width - layout.width_m * scale) / 2;
    const oY = (rect.height - layout.height_m * scale) / 2;
    const worldX = (mx - oX) / scale;
    const worldY = (my - oY) / scale;

    // Check device click
    if (layout.devices) {
      for (const dev of layout.devices) {
        const dx = Math.abs(worldX - dev.x);
        const dy = Math.abs(worldY - dev.y);
        if (dx < 0.8 && dy < 0.8) {
          setSelectedDevice(prev => prev === dev.id ? null : dev.id);
          setSelectedRoom(null);
          return;
        }
      }
    }

    // Check room click
    if (layout.rooms) {
      for (const room of layout.rooms) {
        if (worldX >= room.x && worldX <= room.x + room.w && worldY >= room.y && worldY <= room.y + room.h) {
          setSelectedRoom(prev => prev === room.id ? null : room.id);
          setSelectedDevice(null);
          return;
        }
      }
    }

    setSelectedRoom(null);
    setSelectedDevice(null);
  }

  // ───────────────────────── AI CHAT ─────────────────────────
  async function handleChatSend(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const devCount = layout?.devices?.filter(d => d.online).length || 0;
      const roomCount = layout?.rooms?.length || 0;
      const context = {
        module: 'WiFi CSI Home Environment Mapping',
        prediction: prediction?.prediction || 'unknown',
        confidence: prediction?.confidence?.toFixed(2) || '0',
        occupancy: presence?.occupancy_count ?? 'unknown',
        activity: presence?.activity || 'unknown',
        buffer_size: bufferSize,
        connected_devices: devCount,
        rooms_mapped: roomCount,
        per_room_presence: JSON.stringify(presence?.per_room || []),
        selected_room: selectedRoom || 'none',
        home_dimensions: `${layout?.width_m || 0}m x ${layout?.height_m || 0}m`,
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
    const base = window.location.origin + (window.location.pathname.replace(/\/[^/]*$/, '') || '');
    const url = `${base}/?module=csi`;
    window.open(url, 'hcmn-csi', 'width=1400,height=900,menubar=no,toolbar=no,location=no');
  }

  // ───────────────────────── DERIVED DATA ─────────────────────────
  const onlineDevices = layout?.devices?.filter(d => d.online) || [];
  const offlineDevices = layout?.devices?.filter(d => !d.online) || [];
  const selectedRoomData = layout?.rooms?.find(r => r.id === selectedRoom);
  const selectedDeviceData = layout?.devices?.find(d => d.id === selectedDevice);
  const roomDevices = selectedRoom ? (layout?.devices || []).filter(d => d.room === selectedRoom) : [];
  const roomPresence = selectedRoom ? presence?.per_room?.find(r => r.room === selectedRoom) : null;

  const densityInfo = prediction ? {
    empty: { desc: 'No human-density signal reflections detected. Static objects returning stable CSI patterns across all subcarriers.', icon: '🏠' },
    person_walking: { desc: 'Dynamic signal variance across subcarrier groups — consistent with human movement through rooms. AI triangulating position using multi-AP CSI correlation.', icon: '🚶' },
    person_sitting: { desc: 'Moderate CSI perturbation detected. Density profile indicates stationary human — breathing micro-movements visible in signal phase data.', icon: '🪑' },
    person_standing: { desc: 'Upright human body-mass reflection pattern detected. Minimal lateral movement but consistent bioelectric signature across WiFi subcarriers.', icon: '🧍' },
    multiple_people: { desc: 'Multiple overlapping density signatures across rooms. Signal variance high in multiple subcarrier groups — AI detecting 2+ distinct reflective bodies with room-level localization.', icon: '👥' },
  }[prediction.prediction] || { desc: 'Insufficient data for density analysis. Run pipeline to collect CSI frames.', icon: '❓' } : { desc: 'Run the CSI pipeline to begin AI-powered signal analysis and home environment mapping.', icon: '📡' };

  // ───────────────────────── RENDER ─────────────────────────
  return (
    <div className="module-panel csi-module">
      <div className="module-header">
        <div className="module-title">
          <span className="module-icon">📶</span>
          <h2>Module 3 – Wi-Fi CSI Home Environment Mapping</h2>
          <span className="feed-count">
            {onlineDevices.length}/{layout?.devices?.length || 0} devices online
          </span>
        </div>
        <div className="module-actions">
          <button className={`btn-auto ${autoCollect ? 'active' : ''}`} onClick={() => setAutoCollect(!autoCollect)}>
            {autoCollect ? '⏸ Stop Auto' : '▶ Auto Collect'}
          </button>
          <button className="btn-refresh" onClick={runPipeline} disabled={loading}>
            {loading ? 'Scanning…' : '▶ Run Pipeline'}
          </button>
          <button className="btn-popout" onClick={popOutModule}>⧉ Pop Out</button>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="pipeline-bar">
        <div className="pipeline-step"><span className="step-num">1</span> Collect CSI</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">2</span> Multi-AP Correlate</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">3</span> Device Fingerprint</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">4</span> AI Room Mapping</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">5</span> Presence Classify</div>
      </div>

      <div className="csi-layout">
        {/* ── LEFT: Floor Plan & Signal ── */}
        <div className="csi-map-column">
          <div className="csi-card room-card">
            <div className="room-card-header">
              <h3>🏠 Home Floor Plan</h3>
              <div className="floor-plan-toggles">
                <label className="toggle-label">
                  <input type="checkbox" checked={showDevices} onChange={e => setShowDevices(e.target.checked)} />
                  Devices
                </label>
                <label className="toggle-label">
                  <input type="checkbox" checked={showPresence} onChange={e => setShowPresence(e.target.checked)} />
                  Presence
                </label>
                <label className="toggle-label">
                  <input type="checkbox" checked={showSignalStrength} onChange={e => setShowSignalStrength(e.target.checked)} />
                  Signal Map
                </label>
              </div>
            </div>
            <canvas ref={canvasRef} className="room-layout-canvas" onClick={handleCanvasClick} />
            <div className="floor-plan-legend">
              <span className="legend-chip"><span className="legend-dot" style={{ background: '#3b82f6' }} />Walls</span>
              <span className="legend-chip"><span className="legend-dot" style={{ background: '#10b981' }} />AP/Router</span>
              <span className="legend-chip"><span className="legend-dot" style={{ background: '#f59e0b' }} />Presence</span>
              <span className="legend-chip"><span className="legend-dot" style={{ background: '#a78bfa' }} />Devices</span>
              <span className="legend-chip"><span className="legend-dot" style={{ background: '#334155' }} />Furniture</span>
            </div>
          </div>

          <div className="csi-card signal-card">
            <h3>📊 Signal Variance Timeline</h3>
            <canvas ref={signalCanvasRef} className="signal-canvas" />
          </div>
        </div>

        {/* ── RIGHT: Info Panels ── */}
        <div className="csi-info-column">
          {/* Selected Room Detail */}
          {selectedRoomData && (
            <div className="csi-card room-detail-card">
              <h3>🔍 {selectedRoomData.label}</h3>
              <div className="room-detail-grid">
                <div className="room-detail-item">
                  <span className="detail-label">Dimensions</span>
                  <span className="detail-val">{selectedRoomData.w}m × {selectedRoomData.h}m</span>
                </div>
                <div className="room-detail-item">
                  <span className="detail-label">Devices</span>
                  <span className="detail-val">{roomDevices.length}</span>
                </div>
                <div className="room-detail-item">
                  <span className="detail-label">Presence</span>
                  <span className="detail-val">{roomPresence ? ACTIVITY_LABELS[roomPresence.activity] || roomPresence.activity : '—'}</span>
                </div>
                <div className="room-detail-item">
                  <span className="detail-label">Occupancy</span>
                  <span className="detail-val">{roomPresence?.occupancy ?? 0} people</span>
                </div>
              </div>
              {roomDevices.length > 0 && (
                <div className="room-device-list">
                  {roomDevices.map(d => (
                    <div key={d.id} className={`room-device-row ${d.online ? '' : 'offline'}`} onClick={() => setSelectedDevice(d.id)}>
                      <span>{DEVICE_ICONS[d.type] || '📶'} {d.name}</span>
                      <span className="mono">{d.ip}</span>
                      <span className={`signal-badge ${d.signal_dbm > -50 ? 'strong' : d.signal_dbm > -65 ? 'medium' : 'weak'}`}>
                        {d.signal_dbm} dBm
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Selected Device Detail */}
          {selectedDeviceData && (
            <div className="csi-card device-detail-card">
              <h3>{DEVICE_ICONS[selectedDeviceData.type] || '📶'} {selectedDeviceData.name}</h3>
              <div className="device-detail-grid">
                <div className="detail-row"><span>IP Address</span><span className="mono">{selectedDeviceData.ip}</span></div>
                <div className="detail-row"><span>MAC Address</span><span className="mono">{selectedDeviceData.mac}</span></div>
                <div className="detail-row"><span>Room</span><span>{layout?.rooms?.find(r => r.id === selectedDeviceData.room)?.label || selectedDeviceData.room}</span></div>
                <div className="detail-row"><span>Band</span><span>{selectedDeviceData.band}</span></div>
                <div className="detail-row"><span>Signal</span><span className={`signal-badge ${selectedDeviceData.signal_dbm > -50 ? 'strong' : selectedDeviceData.signal_dbm > -65 ? 'medium' : 'weak'}`}>{selectedDeviceData.signal_dbm} dBm</span></div>
                <div className="detail-row"><span>Connected AP</span><span>{selectedDeviceData.connected_ap}</span></div>
                <div className="detail-row"><span>Status</span><span className={selectedDeviceData.online ? 'text-green' : 'text-red'}>{selectedDeviceData.online ? '● Online' : '● Offline'}</span></div>
              </div>
            </div>
          )}

          {/* Network Devices Table */}
          <div className="csi-card devices-card">
            <h3>🌐 Connected Devices ({onlineDevices.length} online / {offlineDevices.length} offline)</h3>
            <div className="device-table-scroll">
              <table className="device-table">
                <thead>
                  <tr><th>Device</th><th>IP</th><th>Room</th><th>Signal</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {(layout?.devices || []).map(d => (
                    <tr key={d.id} className={`${selectedDevice === d.id ? 'selected' : ''} ${d.online ? '' : 'offline-row'}`} onClick={() => { setSelectedDevice(d.id); setSelectedRoom(null); }}>
                      <td>{DEVICE_ICONS[d.type] || '📶'} {d.name}</td>
                      <td className="mono">{d.ip}</td>
                      <td>{layout?.rooms?.find(r => r.id === d.room)?.label || d.room}</td>
                      <td><span className={`signal-badge ${d.signal_dbm > -50 ? 'strong' : d.signal_dbm > -65 ? 'medium' : 'weak'}`}>{d.signal_dbm}</span></td>
                      <td className={d.online ? 'text-green' : 'text-red'}>{d.online ? '●' : '○'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Real-Time Detection Stats */}
          {presence && (
            <div className="csi-card detection-stats-card">
              <h3>📊 Real-Time Detection Status</h3>
              <div className="detection-stats-grid">
                <div className="detection-stat">
                  <span className="detection-icon">👥</span>
                  <span className="detection-val">{presence.occupancy_count}</span>
                  <span className="detection-lbl">Total Persons</span>
                </div>
                <div className="detection-stat">
                  <span className="detection-icon">🚶</span>
                  <span className="detection-val">{presence.activity_counts?.walking || 0}</span>
                  <span className="detection-lbl">Walking</span>
                </div>
                <div className="detection-stat">
                  <span className="detection-icon">🪑</span>
                  <span className="detection-val">{presence.activity_counts?.sitting || 0}</span>
                  <span className="detection-lbl">Sitting</span>
                </div>
                <div className="detection-stat">
                  <span className="detection-icon">🧍</span>
                  <span className="detection-val">{presence.activity_counts?.standing || 0}</span>
                  <span className="detection-lbl">Standing</span>
                </div>
                <div className="detection-stat">
                  <span className="detection-icon">😴</span>
                  <span className="detection-val">{presence.activity_counts?.sleeping || 0}</span>
                  <span className="detection-lbl">Sleeping</span>
                </div>
                <div className="detection-stat">
                  <span className="detection-icon">🛋️</span>
                  <span className="detection-val">{presence.furniture_detected?.length || 0}</span>
                  <span className="detection-lbl">Objects Detected</span>
                </div>
              </div>
              {presence.persons?.length > 0 && (
                <div className="person-tracking-list">
                  <h4>Tracked Individuals</h4>
                  {presence.persons.map(p => (
                    <div key={p.id} className="person-track-row">
                      <span className="person-track-icon">
                        {p.activity === 'person_walking' ? '🚶' : p.activity === 'person_sitting' ? '🪑' : p.activity === 'person_standing' ? '🧍' : p.activity === 'sleeping' ? '😴' : '👤'}
                      </span>
                      <span className="person-track-label">{p.label}</span>
                      <span className="person-track-room">{layout?.rooms?.find(r => r.id === p.room)?.label || p.room}</span>
                      <span className="person-track-activity">{ACTIVITY_LABELS[p.activity]?.split(' ').pop() || p.activity}</span>
                      <span className="person-track-conf">{(p.confidence * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
              {presence.furniture_detected?.length > 0 && (
                <div className="furniture-detection-list">
                  <h4>Furniture & Object Detection</h4>
                  <div className="furniture-chips">
                    {presence.furniture_detected.map((f, i) => (
                      <span key={i} className="furniture-chip">
                        {f.label} <span className="furniture-conf">{(f.confidence * 100).toFixed(0)}%</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Presence Detection */}
          <div className="csi-card presence-card">
            <h3>👁️ AI Presence Detection</h3>
            <div className="presence-indicator">
              <div className={`presence-dot ${!presence ? '' : presence.occupancy_count === 0 ? 'empty' : presence.occupancy_count > 1 ? 'multiple' : 'occupied'}`} />
              <div className="presence-info">
                <h4>{prediction ? (ACTIVITY_LABELS[prediction.prediction] || prediction.prediction) : 'No data'}</h4>
                <p>{presence ? `Total occupancy: ${presence.occupancy_count} · Zone: ${presence.zone || 'N/A'}` : 'Run pipeline to begin detection'}</p>
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
                <span className="confidence-text">AI Confidence: {(prediction.confidence * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>

          {/* Signal Density */}
          <div className="csi-card density-card">
            <h3>{densityInfo.icon} AI Signal Density Analysis</h3>
            <p className="density-desc">{densityInfo.desc}</p>
            <div className="density-legend">
              <div className="legend-item"><span className="legend-color" style={{ background: '#10b981' }} />Strong WiFi coverage</div>
              <div className="legend-item"><span className="legend-color" style={{ background: '#f59e0b' }} />Human presence detected</div>
              <div className="legend-item"><span className="legend-color" style={{ background: '#ef4444' }} />Active movement / multi-person</div>
            </div>
          </div>

          {/* System Status */}
          <div className="csi-card stats-card">
            <h3>📡 System Status</h3>
            <div className="stats-grid">
              <div className="stat-item"><span className="stat-val">{bufferSize}</span><span className="stat-lbl">CSI Frames</span></div>
              <div className="stat-item"><span className="stat-val">{layout?.rooms?.length || 0}</span><span className="stat-lbl">Rooms Mapped</span></div>
              <div className="stat-item"><span className="stat-val">{onlineDevices.length}</span><span className="stat-lbl">Online Devices</span></div>
              <div className="stat-item"><span className="stat-val">{layout?.access_points?.length || 0}</span><span className="stat-lbl">Access Points</span></div>
            </div>
          </div>

          {/* AI Chat */}
          <div className="csi-card chat-card">
            <h3>🤖 Claude AI Home Analysis</h3>
            <div className="chat-messages compact">
              {chatMessages.length === 0 && (
                <p className="chat-hint">Ask about room presence, device locations, signal coverage, furniture detection, or home security analysis…</p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-msg chat-${msg.role}`}>
                  <span className="msg-role">{msg.role === 'user' ? 'You' : 'Claude'}</span>
                  <p>{msg.content}</p>
                </div>
              ))}
              {chatLoading && <div className="chat-msg chat-assistant"><span className="msg-role">Claude</span><p className="typing">Analyzing home environment…</p></div>}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input" onSubmit={handleChatSend}>
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask Claude about your home environment…" disabled={chatLoading} />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
