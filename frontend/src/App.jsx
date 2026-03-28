import { useState, useCallback } from 'react';
import FeedBrowser from './components/module1/FeedBrowser';
import FeedViewer from './components/module1/FeedViewer';
import AIChatBox from './components/module1/AIChatBox';
import GlobeView from './components/module2/GlobeView';
import PresenceDashboard from './components/module3/PresenceDashboard';
import './styles/dashboard.css';

const MODULES = [
  { id: 'feeds', label: '📹 Live Feeds', desc: 'View & Monitor' },
  { id: 'globe', label: '🌍 Global Intel', desc: 'Satellite & Tracking' },
  { id: 'sensing', label: '📶 Wi-Fi Sensing', desc: 'Presence Detection' },
];

export default function App() {
  const [activeModule, setActiveModule] = useState('feeds');
  const [selectedFeeds, setSelectedFeeds] = useState([]);

  const handleToggleFeed = useCallback((feed) => {
    setSelectedFeeds((prev) => {
      const exists = prev.some((f) => f.id === feed.id);
      if (exists) {
        return prev.filter((f) => f.id !== feed.id);
      }
      if (prev.length >= 4) {
        return prev; // Max 4 feeds
      }
      return [...prev, feed];
    });
  }, []);

  const handleRemoveFeed = useCallback((feedId) => {
    setSelectedFeeds((prev) => prev.filter((f) => f.id !== feedId));
  }, []);

  return (
    <div className="app">
      <header className="header">
        <h1>
          HCMN <span>Human Centralized Mesh Network</span>
        </h1>
        <nav className="nav">
          {MODULES.map((m) => (
            <button
              key={m.id}
              className={activeModule === m.id ? 'active' : ''}
              onClick={() => setActiveModule(m.id)}
            >
              {m.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="main">
        {activeModule === 'feeds' && (
          <div className="feeds-module">
            <FeedViewer feeds={selectedFeeds} onRemoveFeed={handleRemoveFeed} />
            <FeedBrowser selectedFeeds={selectedFeeds} onToggleFeed={handleToggleFeed} />
            <AIChatBox activeFeeds={selectedFeeds} />
          </div>
        )}
        {activeModule === 'globe' && <GlobeView />}
        {activeModule === 'sensing' && <PresenceDashboard />}
      </main>
    </div>
  );
}
