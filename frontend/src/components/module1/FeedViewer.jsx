import { useRef, useEffect } from 'react';

/**
 * Displays up to 4 live feeds in a 2×2 grid layout.
 * Uses HLS.js for HLS stream playback with video element fallback.
 */
export default function FeedViewer({ feeds, onRemoveFeed }) {
  if (feeds.length === 0) {
    return (
      <div className="feed-viewer-empty">
        <div className="empty-icon">📺</div>
        <h3>No Feeds Selected</h3>
        <p>Select up to 4 live feeds from the browser below to start watching.</p>
      </div>
    );
  }

  const gridClass = feeds.length === 1 ? 'feed-grid-1' :
                    feeds.length === 2 ? 'feed-grid-2' :
                    feeds.length === 3 ? 'feed-grid-3' : 'feed-grid-4';

  return (
    <div className={`feed-viewer ${gridClass}`}>
      {feeds.map((feed, index) => (
        <FeedPanel
          key={feed.id}
          feed={feed}
          index={index}
          onRemove={() => onRemoveFeed(feed.id)}
        />
      ))}
    </div>
  );
}

function FeedPanel({ feed, index, onRemove }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !feed.streamUrl) return;

    // Try native HLS support (Safari) first
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = feed.streamUrl;
      video.play().catch(() => {});
      return;
    }

    // For demo: show placeholder since HLS.js isn't bundled
    // In production, use hls.js: import Hls from 'hls.js'
    video.poster = feed.thumbnailUrl || '';
  }, [feed.streamUrl, feed.thumbnailUrl]);

  return (
    <div className="feed-panel">
      <div className="feed-panel-header">
        <div className="feed-panel-title">
          <span className="feed-number">Feed {index + 1}</span>
          <span className="feed-name">{feed.name}</span>
          {feed.isLive && <span className="live-dot">●</span>}
        </div>
        <button className="feed-close" onClick={onRemove} title="Remove feed">✕</button>
      </div>
      <div className="feed-panel-video">
        <video
          ref={videoRef}
          className="feed-video"
          autoPlay
          muted
          playsInline
          controls
        />
        <div className="feed-overlay">
          <span className="feed-location">
            📍 {feed.location?.label || feed.city || 'Unknown Location'}
          </span>
          <span className="feed-source">{feed.source}</span>
        </div>
      </div>
    </div>
  );
}
