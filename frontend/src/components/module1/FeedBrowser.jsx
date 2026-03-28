import { useState, useEffect } from 'react';
import { fetchFeeds, searchFeeds } from '../../services/api';

export default function FeedBrowser({ selectedFeeds, onToggleFeed }) {
  const [feeds, setFeeds] = useState([]);
  const [filter, setFilter] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
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

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) {
      loadFeeds();
      return;
    }
    setLoading(true);
    try {
      const data = await searchFeeds(searchQuery);
      setFeeds(data);
    } catch {
      setFeeds([]);
    }
    setLoading(false);
  }

  const sources = [
    { value: null, label: 'All Sources' },
    { value: 'dot_traffic', label: '🚦 Traffic' },
    { value: 'weather', label: '🌤️ Weather' },
    { value: 'earthcam', label: '🌐 EarthCam' },
    { value: 'public_cctv', label: '📷 Public CCTV' },
  ];

  const isSelected = (id) => selectedFeeds.some((f) => f.id === id);
  const selectionCount = selectedFeeds.length;

  return (
    <div className="feed-browser">
      <div className="section-title">
        <span className="icon">📹</span>
        Live Feed Browser
        <span className="selection-count">{selectionCount}/4 selected</span>
        <button className="btn-refresh" onClick={loadFeeds}>↻ Refresh</button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="search-bar">
        <input
          type="text"
          placeholder="Search feeds by name, city, or tag..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button type="submit">🔍</button>
      </form>

      {/* Source filters */}
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
            <div
              key={feed.id}
              className={`camera-card ${isSelected(feed.id) ? 'selected' : ''}`}
              onClick={() => onToggleFeed(feed)}
            >
              <div className="preview">
                <span>🎥 {feed.name}</span>
                {feed.isLive && <span className="live-badge">● Live</span>}
                {isSelected(feed.id) && <span className="selected-badge">✓ Selected</span>}
              </div>
              <div className="info">
                <h3>{feed.name}</h3>
                <p>{feed.description}</p>
                {feed.location && (
                  <p className="location-text">
                    📍 {feed.location.label || `${feed.location.latitude.toFixed(3)}, ${feed.location.longitude.toFixed(3)}`}
                  </p>
                )}
                <div className="card-footer">
                  <span className="source-tag">{feed.source}</span>
                  {feed.city && <span className="city-tag">{feed.city}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && feeds.length === 0 && (
        <div className="empty-state">
          <p>No feeds found. Try adjusting your filters or search.</p>
        </div>
      )}
    </div>
  );
}
