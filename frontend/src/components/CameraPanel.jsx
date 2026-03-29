import { useState, useEffect, useRef } from 'react';
import { fetchFeeds, sendChatMessage } from '../services/api';

export default function CameraPanel() {
  const [feeds, setFeeds] = useState([]);
  const [filter, setFilter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedFeeds, setSelectedFeeds] = useState([]);
  const [showList, setShowList] = useState(true);

  // AI Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { loadFeeds(); }, [filter]);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  async function loadFeeds() {
    setLoading(true);
    try { setFeeds(await fetchFeeds(filter)); }
    catch { setFeeds([]); }
    setLoading(false);
  }

  function toggleFeed(feed) {
    setSelectedFeeds(prev => {
      const exists = prev.find(f => f.id === feed.id);
      if (exists) return prev.filter(f => f.id !== feed.id);
      if (prev.length >= 4) return prev; // max 4
      return [...prev, feed];
    });
  }

  function removeFeed(feedId) {
    setSelectedFeeds(prev => prev.filter(f => f.id !== feedId));
  }

  function popOutModule() {
    const w = window.open('', '_blank', 'width=1200,height=800,menubar=no,toolbar=no');
    if (!w) return;
    w.document.title = 'HCMN – Video Observational Deck';
    w.document.body.innerHTML = '<div style="background:#0a0e17;color:#e2e8f0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif"><h2>Module 1 – Video Observational Deck</h2><p>Pop-out window active. Control from main dashboard.</p></div>';
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
        active_feeds: selectedFeeds.map(f => f.name).join(', ') || 'none',
        feed_count: selectedFeeds.length,
        feed_locations: selectedFeeds
          .filter(f => f.location)
          .map(f => f.location.label || `${f.location.latitude},${f.location.longitude}`)
          .join('; '),
      };
      const allMsgs = [...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const resp = await sendChatMessage(allMsgs, context);
      setChatMessages(prev => [...prev, { role: 'assistant', content: resp.reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setChatLoading(false);
  }

  const sources = [
    { value: null, label: 'All Sources' },
    { value: 'youtube_live', label: 'YouTube Live' },
    { value: 'skyline', label: 'SkylineWebcams' },
    { value: 'earthcam', label: 'EarthCam' },
    { value: 'dot_traffic', label: 'Traffic Cams' },
    { value: 'weather', label: 'Weather' },
  ];

  const quadCount = selectedFeeds.length;

  return (
    <div className="module-panel camera-module">
      {/* Header */}
      <div className="module-header">
        <div className="module-title">
          <span className="module-icon">📹</span>
          <h2>Module 1 – Video Observational Deck</h2>
          <span className="feed-count">{selectedFeeds.length}/4 feeds active</span>
        </div>
        <div className="module-actions">
          <button className="btn-toggle" onClick={() => setShowList(!showList)}>
            {showList ? '⬅ Hide List' : '➡ Show List'}
          </button>
          <button className="btn-popout" onClick={popOutModule} title="Open in new window">
            ⧉ Pop Out
          </button>
        </div>
      </div>

      <div className="camera-layout">
        {/* Feed List Sidebar */}
        {showList && (
          <div className="feed-sidebar">
            <div className="feed-filters">
              {sources.map(s => (
                <button key={s.label} className={filter === s.value ? 'active' : ''} onClick={() => setFilter(s.value)}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="feed-list">
              {loading ? (
                <p className="text-muted">Loading feeds…</p>
              ) : (
                feeds.map(feed => (
                  <div
                    key={feed.id}
                    className={`feed-item ${selectedFeeds.find(f => f.id === feed.id) ? 'selected' : ''} ${selectedFeeds.length >= 4 && !selectedFeeds.find(f => f.id === feed.id) ? 'disabled' : ''}`}
                    onClick={() => toggleFeed(feed)}
                  >
                    <div className="feed-item-header">
                      <span className="feed-item-name">{feed.name}</span>
                      {feed.is_live && <span className="live-dot">●</span>}
                    </div>
                    <div className="feed-item-meta">
                      <span className="source-tag">{feed.source}</span>
                      {feed.location && (
                        <span className="location-tag">
                          📍 {feed.location.label || `${feed.location.latitude.toFixed(2)}, ${feed.location.longitude.toFixed(2)}`}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Quad View */}
        <div className="quad-view-container">
          <div className={`quad-grid quad-${Math.max(quadCount, 1)}`}>
            {selectedFeeds.length === 0 ? (
              <div className="empty-quad">
                <div className="empty-icon">📹</div>
                <h3>No Feeds Selected</h3>
                <p>Select up to 4 camera feeds from the list to begin monitoring</p>
              </div>
            ) : (
              selectedFeeds.map((feed, idx) => (
                <div key={feed.id} className="quad-cell">
                  <div className="quad-header">
                    <span className="quad-label">CAM {idx + 1}</span>
                    <span className="quad-name">{feed.name}</span>
                    <div className="quad-controls">
                      {feed.is_live && <span className="live-badge">● LIVE</span>}
                      <button className="btn-close" onClick={() => removeFeed(feed.id)}>✕</button>
                    </div>
                  </div>
                  <div className="quad-video">
                    {feed.embed_url ? (
                      <iframe
                        src={feed.embed_url}
                        title={feed.name}
                        className="video-iframe"
                        allow="autoplay; encrypted-media; picture-in-picture"
                        sandbox="allow-scripts allow-same-origin allow-popups"
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="video-placeholder">
                        <div className="video-overlay">
                          <span className="camera-icon">🎥</span>
                          <span>{feed.name}</span>
                          {feed.location && (
                            <span className="video-location">
                              📍 {feed.location.label || `${feed.location.latitude.toFixed(4)}, ${feed.location.longitude.toFixed(4)}`}
                            </span>
                          )}
                          <a href={feed.stream_url} target="_blank" rel="noopener noreferrer" className="stream-link">
                            Open Stream ↗
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="quad-footer">
                    <span className="source-tag">{feed.source}</span>
                    <span className="stream-info" title={feed.stream_url}>Stream Active</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* AI Chat Box */}
          <div className="ai-chat-panel">
            <div className="chat-header">
              <span className="chat-icon">🤖</span>
              <h3>HCMN AI Assistant</h3>
              <span className="chat-context">
                {selectedFeeds.length > 0
                  ? `Monitoring ${selectedFeeds.length} feed${selectedFeeds.length > 1 ? 's' : ''}`
                  : 'No feeds active'}
              </span>
            </div>
            <div className="chat-messages">
              {chatMessages.length === 0 && (
                <div className="chat-welcome">
                  <p>Ask me about your active camera feeds, traffic conditions, or anything you're observing.</p>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-msg chat-${msg.role}`}>
                  <span className="msg-role">{msg.role === 'user' ? 'You' : 'AI'}</span>
                  <p>{msg.content}</p>
                </div>
              ))}
              {chatLoading && (
                <div className="chat-msg chat-assistant">
                  <span className="msg-role">AI</span>
                  <p className="typing">Analyzing…</p>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input" onSubmit={handleChatSend}>
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about active feeds…"
                disabled={chatLoading}
              />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>Send</button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
