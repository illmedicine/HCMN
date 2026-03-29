import { useState } from 'react';
import CameraPanel from './components/CameraPanel';
import TrackingPanel from './components/TrackingPanel';
import SpectrumPanel from './components/SpectrumPanel';
import CSIPanel from './components/CSIPanel';
import GothamPanel from './components/GothamPanel';
import GlobePanel from './components/GlobePanel';
import './styles/dashboard.css';

const MODULES = [
  { id: 'cameras', label: '📹 Module 1 – Video Deck', shortLabel: 'Video' },
  { id: 'tracking', label: '🌍 Module 2 – Tracking', shortLabel: 'Tracking' },
  { id: 'csi', label: '📶 Module 3 – Wi-Fi CSI', shortLabel: 'CSI' },
  { id: 'gotham', label: '🔮 Module 4 – Gotham', shortLabel: 'Gotham' },
  { id: 'globe', label: '🌐 Module 5 – 3D Globe', shortLabel: 'Globe' },
  { id: 'spectrum', label: '📡 RF Spectrum', shortLabel: 'Spectrum' },
];

export default function App() {
  const [activeModule, setActiveModule] = useState('cameras');
  const [openWindows, setOpenWindows] = useState([]);

  function openModuleInWindow(moduleId) {
    const mod = MODULES.find(m => m.id === moduleId);
    if (!mod) return;

    const w = window.open(
      `${window.location.origin}?module=${moduleId}`,
      `hcmn-${moduleId}`,
      'width=1400,height=900,menubar=no,toolbar=no,location=no'
    );
    if (w) {
      setOpenWindows(prev => [...prev.filter(id => id !== moduleId), moduleId]);
    }
  }

  // Check if launched as a standalone module window
  const urlParams = new URLSearchParams(window.location.search);
  const standaloneModule = urlParams.get('module');

  if (standaloneModule) {
    return (
      <div className="app standalone">
        <header className="header compact">
          <h1>
            HCMN <span>Human Centralized Mesh Network</span>
          </h1>
          <span className="standalone-badge">
            {MODULES.find(m => m.id === standaloneModule)?.label || standaloneModule}
          </span>
        </header>
        <main className="main">
          {standaloneModule === 'cameras' && <CameraPanel />}
          {standaloneModule === 'tracking' && <TrackingPanel />}
          {standaloneModule === 'csi' && <CSIPanel />}
          {standaloneModule === 'gotham' && <GothamPanel />}
          {standaloneModule === 'globe' && <GlobePanel />}
          {standaloneModule === 'spectrum' && <SpectrumPanel />}
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>
            HCMN <span>Human Centralized Mesh Network</span>
          </h1>
        </div>
        <nav className="nav module-nav">
          {MODULES.map((m) => (
            <div key={m.id} className="nav-item">
              <button
                className={activeModule === m.id ? 'active' : ''}
                onClick={() => setActiveModule(m.id)}
              >
                {m.label}
              </button>
              <button
                className="btn-window"
                onClick={() => openModuleInWindow(m.id)}
                title={`Open ${m.shortLabel} in new window (for multi-monitor)`}
              >
                ⧉
              </button>
            </div>
          ))}
        </nav>
        <div className="header-right">
          <span className="multi-monitor-hint" title="Click ⧉ on any module to open in a separate window for multi-monitor use">
            🖥️ Multi-Monitor
          </span>
        </div>
      </header>

      <main className="main">
        {activeModule === 'cameras' && <CameraPanel />}
        {activeModule === 'tracking' && <TrackingPanel />}
        {activeModule === 'csi' && <CSIPanel />}
        {activeModule === 'gotham' && <GothamPanel />}
        {activeModule === 'globe' && <GlobePanel />}
        {activeModule === 'spectrum' && <SpectrumPanel />}
      </main>
    </div>
  );
}
