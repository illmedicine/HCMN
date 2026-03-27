import { useState } from 'react';
import CameraPanel from './components/CameraPanel';
import SpectrumPanel from './components/SpectrumPanel';
import CSIPanel from './components/CSIPanel';
import './styles/dashboard.css';

const TABS = [
  { id: 'cameras', label: '📹 Observational Deck' },
  { id: 'spectrum', label: '📡 RF Spectrum' },
  { id: 'csi', label: '📶 Wi-Fi CSI' },
];

export default function App() {
  const [tab, setTab] = useState('cameras');

  return (
    <div className="app">
      <header className="header">
        <h1>
          HCMN <span>Human Centralized Mesh Network</span>
        </h1>
        <nav className="nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {tab === 'cameras' && <CameraPanel />}
        {tab === 'spectrum' && <SpectrumPanel />}
        {tab === 'csi' && <CSIPanel />}
      </main>
    </div>
  );
}
