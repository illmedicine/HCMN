import { useState, useEffect } from 'react';
import { fetchFeeds } from '../services/api';

export default function CameraPanel() {
  const [feeds, setFeeds] = useState([]);
  const [filter, setFilter] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeeds();
  }, [filter]);

  async function loadFeeds() {
    setLoading(true);
    try {
      const data = await fetchFeeds(filter);
      setFeeds(data);
    } catch {
      setFeeds([]);
    }
    setLoading(false);
  }

  const sources = [
    { value: null, label: 'All Sources' },
    { value: 'dot_traffic', label: 'Traffic' },
    { value: 'weather', label: 'Weather' },
    { value: 'earthcam', label: 'EarthCam' },
  ];

  return (
    <div>
      <div className="section-title">
        <span className="icon">📹</span>
        Public Observational Deck
        <button className="btn-refresh" onClick={loadFeeds}>↻ Refresh</button>
      </div>

      <div className="nav" style={{ marginBottom: '1rem' }}>
        {sources.map((s) => (
          <button
            key={s.label}
            className={filter === s.value ? 'active' : ''}
            onClick={() => setFilter(s.value)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-secondary)' }}>Loading feeds…</p>
      ) : (
        <div className="camera-grid">
          {feeds.map((feed) => (
            <div key={feed.id} className="camera-card">
              <div className="preview">
                <span>🎥 {feed.name}</span>
                {feed.is_live && <span className="live-badge">● Live</span>}
              </div>
              <div className="info">
                <h3>{feed.name}</h3>
                <p>{feed.description}</p>
                {feed.location && (
                  <p>{feed.location.label || `${feed.location.latitude.toFixed(3)}, ${feed.location.longitude.toFixed(3)}`}</p>
                )}
                <span className="source-tag">{feed.source}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
