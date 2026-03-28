import { useState } from 'react';

/**
 * Panel displaying aggregated data for a pinned location.
 */
export default function PinPanel({ data }) {
  const [activeTab, setActiveTab] = useState('overview');

  const tabs = [
    { id: 'overview', label: '📊 Overview', count: null },
    { id: 'aircraft', label: '✈️ Aircraft', count: data.aircraft?.length || 0 },
    { id: 'vessels', label: '🚢 Vessels', count: data.vessels?.length || 0 },
    { id: 'satellites', label: '🛰️ Satellites', count: data.satellites?.length || 0 },
    { id: 'crime', label: '🚨 Crime', count: data.crimes?.length || 0 },
    { id: 'feeds', label: '📹 Feeds', count: data.nearbyFeeds?.length || 0 },
  ];

  return (
    <div className="pin-panel">
      <div className="pin-panel-header">
        <h3>📍 {data.pin?.label || 'Pinned Location'}</h3>
        <span className="pin-timestamp">
          Updated: {new Date(data.timestamp).toLocaleTimeString()}
        </span>
      </div>

      <div className="pin-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count !== null && <span className="tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>

      <div className="pin-content">
        {activeTab === 'overview' && <OverviewTab data={data} />}
        {activeTab === 'aircraft' && <AircraftTab aircraft={data.aircraft || []} />}
        {activeTab === 'vessels' && <VesselTab vessels={data.vessels || []} />}
        {activeTab === 'satellites' && <SatelliteTab satellites={data.satellites || []} iss={data.issPosition} />}
        {activeTab === 'crime' && <CrimeTab crimes={data.crimes || []} />}
        {activeTab === 'feeds' && <FeedsTab feeds={data.nearbyFeeds || []} />}
      </div>
    </div>
  );
}

function OverviewTab({ data }) {
  const stats = [
    { icon: '✈️', label: 'Aircraft Nearby', value: data.aircraft?.length || 0, color: 'var(--accent-green)' },
    { icon: '🚢', label: 'Vessels Nearby', value: data.vessels?.length || 0, color: 'var(--accent)' },
    { icon: '🛰️', label: 'Satellite Passes', value: data.satellites?.length || 0, color: 'var(--accent-amber)' },
    { icon: '🚨', label: 'Crime Reports', value: data.crimes?.length || 0, color: 'var(--accent-red)' },
    { icon: '📹', label: 'Live Feeds', value: data.nearbyFeeds?.length || 0, color: 'var(--accent)' },
  ];

  return (
    <div className="overview-grid">
      {stats.map((s) => (
        <div key={s.label} className="stat-card">
          <span className="stat-icon">{s.icon}</span>
          <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
      {data.issPosition && (
        <div className="stat-card iss-card">
          <span className="stat-icon">🛸</span>
          <div className="stat-label">ISS Position</div>
          <div className="stat-detail">
            {data.issPosition.latitude.toFixed(2)}°, {data.issPosition.longitude.toFixed(2)}°
          </div>
          <div className="stat-detail">Alt: {data.issPosition.altitude} km</div>
        </div>
      )}
    </div>
  );
}

function AircraftTab({ aircraft }) {
  if (aircraft.length === 0) {
    return <div className="empty-tab">No aircraft detected in vicinity.</div>;
  }

  return (
    <div className="data-list">
      {aircraft.map((ac, i) => (
        <div key={i} className="data-item">
          <div className="data-item-header">
            <strong>✈️ {ac.callsign || 'Unknown'}</strong>
            <span className={`status-badge ${ac.onGround ? 'grounded' : 'airborne'}`}>
              {ac.onGround ? 'On Ground' : 'Airborne'}
            </span>
          </div>
          <div className="data-item-details">
            <span>Country: {ac.originCountry}</span>
            <span>Alt: {Math.round(ac.altitude)}m</span>
            <span>Speed: {Math.round(ac.velocity)} m/s</span>
            <span>Heading: {Math.round(ac.heading)}°</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function VesselTab({ vessels }) {
  if (vessels.length === 0) {
    return <div className="empty-tab">No vessels detected nearby. This area may be inland.</div>;
  }

  return (
    <div className="data-list">
      {vessels.map((v, i) => (
        <div key={i} className="data-item">
          <div className="data-item-header">
            <strong>🚢 {v.name}</strong>
            <span className="type-badge">{v.shipType}</span>
          </div>
          <div className="data-item-details">
            <span>MMSI: {v.mmsi}</span>
            <span>Speed: {v.speed} kn</span>
            <span>Heading: {v.heading}°</span>
            {v.destination && <span>Dest: {v.destination}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function SatelliteTab({ satellites, iss }) {
  return (
    <div>
      {iss && (
        <div className="iss-status">
          <h4>🛸 International Space Station</h4>
          <div className="data-item-details">
            <span>Lat: {iss.latitude.toFixed(4)}°</span>
            <span>Lon: {iss.longitude.toFixed(4)}°</span>
            <span>Alt: {iss.altitude} km</span>
            <span>Speed: {iss.velocity.toLocaleString()} km/h</span>
          </div>
        </div>
      )}
      {satellites.length === 0 ? (
        <div className="empty-tab">No upcoming satellite passes found.</div>
      ) : (
        <div className="data-list">
          {satellites.map((sat, i) => (
            <div key={i} className="data-item">
              <div className="data-item-header">
                <strong>🛰️ {sat.satName}</strong>
                <span className="type-badge">ID: {sat.satId}</span>
              </div>
              <div className="data-item-details">
                <span>Start: {new Date(sat.startTime).toLocaleString()}</span>
                <span>End: {new Date(sat.endTime).toLocaleString()}</span>
                <span>Max El: {sat.maxElevation}°</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CrimeTab({ crimes }) {
  if (crimes.length === 0) {
    return <div className="empty-tab">No recent crime reports in this area.</div>;
  }

  const typeColors = {
    Assault: '#ef4444',
    Robbery: '#f97316',
    Burglary: '#f59e0b',
    Theft: '#eab308',
    Vandalism: '#a855f7',
    DUI: '#ec4899',
  };

  return (
    <div className="data-list">
      {crimes.map((c, i) => (
        <div key={i} className="data-item crime-item">
          <div className="data-item-header">
            <strong style={{ color: typeColors[c.type] || 'var(--accent-red)' }}>
              🚨 {c.type}
            </strong>
            <span className="crime-date">
              {new Date(c.date).toLocaleDateString()}
            </span>
          </div>
          <div className="data-item-details">
            <span>{c.description}</span>
            {c.address && <span>📍 {c.address}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeedsTab({ feeds }) {
  if (feeds.length === 0) {
    return (
      <div className="empty-tab">
        No live camera feeds found near this location.
        <br />
        <small>Try pinning a major city like NYC, London, or Tokyo.</small>
      </div>
    );
  }

  return (
    <div className="data-list">
      {feeds.map((f) => (
        <div key={f.id} className="data-item feed-item">
          <div className="data-item-header">
            <strong>📹 {f.name}</strong>
            {f.isLive && <span className="live-badge-sm">● Live</span>}
          </div>
          <div className="data-item-details">
            <span>{f.description}</span>
            <span>Source: {f.source}</span>
            <span>📍 {f.location?.label || f.city}</span>
          </div>
          <p className="feed-hint">Switch to Module 1 to view this feed</p>
        </div>
      ))}
    </div>
  );
}
