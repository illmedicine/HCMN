import { useState, useRef, useEffect, useCallback } from 'react';
import cytoscape from 'cytoscape';
import {
  getOntology,
  getGothamTimeline,
  searchOntology,
  expandNode,
  getShortestPath,
  sendChatMessage,
} from '../services/api';

// ── Node styling by type ──
const TYPE_COLORS = {
  person: '#3b82f6',
  organization: '#8b5cf6',
  location: '#10b981',
  account: '#f59e0b',
  device: '#06b6d4',
  vehicle: '#ec4899',
  event: '#ef4444',
};

const TYPE_ICONS = {
  person: '👤',
  organization: '🏢',
  location: '📍',
  account: '💳',
  device: '📱',
  vehicle: '🚗',
  event: '⚡',
};

const EDGE_COLORS = {
  employed_by: '#6366f1',
  owns: '#f59e0b',
  owns_account: '#f59e0b',
  knows: '#3b82f6',
  transferred_to: '#ef4444',
  located_at: '#10b981',
  leases: '#10b981',
  visited: '#10b981',
  uses: '#06b6d4',
  communicated: '#06b6d4',
  seen_at: '#ec4899',
  attended: '#8b5cf6',
  initiated: '#ef4444',
  received: '#f59e0b',
  flagged_at: '#ef4444',
  contracted_by: '#6366f1',
  invested_in: '#f59e0b',
};

const SEVERITY_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444',
  critical: '#dc2626',
};

export default function GothamPanel() {
  const [ontology, setOntology] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [pathFrom, setPathFrom] = useState('');
  const [pathTo, setPathTo] = useState('');
  const [pathResult, setPathResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState('graph'); // graph | timeline | map | table
  const [filterTypes, setFilterTypes] = useState(new Set(Object.keys(TYPE_COLORS)));
  const [expandDepth, setExpandDepth] = useState(1);
  const [cyInstance, setCyInstance] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [graphStats, setGraphStats] = useState({ nodes: 0, edges: 0 });

  const cyRef = useRef(null);
  const mapCanvasRef = useRef(null);
  const chatEndRef = useRef(null);

  // ───────────────────── LOAD DATA ─────────────────────
  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [ont, tl] = await Promise.all([getOntology(), getGothamTimeline()]);
      setOntology(ont);
      setTimeline(tl);
    } catch { /* demo fallback handled in api.js */ }
    setLoading(false);
  }

  // ───────────────────── CYTOSCAPE GRAPH RENDERING ─────────────────────
  const initGraph = useCallback(() => {
    if (!cyRef.current || !ontology) return;

    // Destroy existing instance
    if (cyInstance) {
      cyInstance.destroy();
    }

    const elements = [];

    // Add filtered nodes
    for (const obj of ontology.objects) {
      if (!filterTypes.has(obj.type)) continue;
      elements.push({
        data: {
          id: obj.id,
          label: obj.label,
          type: obj.type,
          color: TYPE_COLORS[obj.type] || '#64748b',
          properties: obj.properties,
          geo: obj.geo,
          risk: obj.properties?.risk_score || 0,
        },
      });
    }

    const nodeIds = new Set(elements.map(e => e.data.id));

    // Add edges where both endpoints are visible
    for (const link of ontology.links) {
      if (nodeIds.has(link.source) && nodeIds.has(link.target)) {
        elements.push({
          data: {
            id: link.id,
            source: link.source,
            target: link.target,
            label: link.label || link.type,
            type: link.type,
            color: EDGE_COLORS[link.type] || '#475569',
            weight: link.weight || 0.5,
          },
        });
      }
    }

    const cy = cytoscape({
      container: cyRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': 'data(color)',
            label: 'data(label)',
            color: '#e2e8f0',
            'font-size': '10px',
            'text-valign': 'bottom',
            'text-margin-y': 6,
            width: 36,
            height: 36,
            'border-width': 2,
            'border-color': '#1e293b',
            'text-outline-width': 2,
            'text-outline-color': '#0a0e17',
          },
        },
        {
          selector: 'node[?risk]',
          style: {
            'border-color': el => {
              const r = el.data('risk');
              if (r > 0.6) return '#ef4444';
              if (r > 0.3) return '#f59e0b';
              return '#1e293b';
            },
            'border-width': el => el.data('risk') > 0.3 ? 3 : 2,
          },
        },
        {
          selector: 'node:selected',
          style: {
            'border-width': 4,
            'border-color': '#3b82f6',
            'background-opacity': 1,
            width: 44,
            height: 44,
          },
        },
        {
          selector: 'edge',
          style: {
            'line-color': 'data(color)',
            'target-arrow-color': 'data(color)',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            width: el => Math.max(1, (el.data('weight') || 0.5) * 3),
            label: 'data(label)',
            'font-size': '8px',
            color: '#64748b',
            'text-rotation': 'autorotate',
            'text-outline-width': 1.5,
            'text-outline-color': '#0a0e17',
            opacity: 0.7,
          },
        },
        {
          selector: 'edge:selected',
          style: {
            opacity: 1,
            width: 4,
            'line-color': '#3b82f6',
            'target-arrow-color': '#3b82f6',
          },
        },
        {
          selector: '.highlighted',
          style: {
            'border-color': '#f59e0b',
            'border-width': 4,
            'background-opacity': 1,
          },
        },
        {
          selector: '.path-node',
          style: {
            'border-color': '#ef4444',
            'border-width': 5,
            width: 48,
            height: 48,
          },
        },
        {
          selector: '.path-edge',
          style: {
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            width: 5,
            opacity: 1,
          },
        },
        {
          selector: '.dimmed',
          style: {
            opacity: 0.15,
          },
        },
      ],
      layout: {
        name: 'cose',
        idealEdgeLength: 120,
        nodeOverlap: 20,
        refresh: 20,
        fit: true,
        padding: 40,
        randomize: false,
        componentSpacing: 80,
        nodeRepulsion: 8000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 80,
        numIter: 1000,
        animate: false,
      },
      minZoom: 0.15,
      maxZoom: 4,
      wheelSensitivity: 0.3,
    });

    // Click handling
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const obj = ontology.objects.find(o => o.id === node.id());
      setSelectedNode(obj || null);

      // Highlight neighbors
      cy.elements().removeClass('dimmed highlighted');
      const neighborhood = node.neighborhood().add(node);
      cy.elements().not(neighborhood).addClass('dimmed');
      neighborhood.addClass('highlighted');
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        cy.elements().removeClass('dimmed highlighted path-node path-edge');
      }
    });

    setGraphStats({ nodes: cy.nodes().length, edges: cy.edges().length });
    setCyInstance(cy);
  }, [ontology, filterTypes]);

  useEffect(() => {
    if (activeView === 'graph') {
      // Small delay to ensure container is mounted
      const t = setTimeout(initGraph, 50);
      return () => clearTimeout(t);
    }
  }, [activeView, initGraph]);

  // Clean up cytoscape on unmount
  useEffect(() => {
    return () => {
      if (cyInstance) cyInstance.destroy();
    };
  }, []);

  // ───────────────────── GEO MAP RENDERER ─────────────────────
  const drawMap = useCallback(() => {
    const canvas = mapCanvasRef.current;
    if (!canvas || !ontology) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, w, h);

    // Gather geo-enabled objects
    const geoObjs = ontology.objects.filter(o => o.geo && filterTypes.has(o.type));
    if (geoObjs.length === 0) {
      ctx.fillStyle = '#475569';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No geo-located entities with current filters', w / 2, h / 2);
      return;
    }

    // Calculate bounds
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const o of geoObjs) {
      minLat = Math.min(minLat, o.geo.lat);
      maxLat = Math.max(maxLat, o.geo.lat);
      minLon = Math.min(minLon, o.geo.lon);
      maxLon = Math.max(maxLon, o.geo.lon);
    }
    // Add padding
    const latPad = Math.max((maxLat - minLat) * 0.15, 0.01);
    const lonPad = Math.max((maxLon - minLon) * 0.15, 0.01);
    minLat -= latPad; maxLat += latPad;
    minLon -= lonPad; maxLon += lonPad;

    const pad = 50;
    function tx(lon) { return pad + ((lon - minLon) / (maxLon - minLon)) * (w - 2 * pad); }
    function ty(lat) { return pad + ((maxLat - lat) / (maxLat - minLat)) * (h - 2 * pad); }

    // Grid
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 8; i++) {
      const x = pad + (i / 8) * (w - 2 * pad);
      const y = pad + (i / 8) * (h - 2 * pad);
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    }

    // Draw links between geo-objects
    const geoIds = new Set(geoObjs.map(o => o.id));
    const objMap = Object.fromEntries(geoObjs.map(o => [o.id, o]));
    for (const link of ontology.links) {
      if (geoIds.has(link.source) && geoIds.has(link.target)) {
        const s = objMap[link.source], t = objMap[link.target];
        ctx.strokeStyle = EDGE_COLORS[link.type] || '#334155';
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = (link.weight || 0.5) * 2;
        ctx.beginPath();
        ctx.moveTo(tx(s.geo.lon), ty(s.geo.lat));
        ctx.lineTo(tx(t.geo.lon), ty(t.geo.lat));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Draw nodes
    for (const obj of geoObjs) {
      const x = tx(obj.geo.lon);
      const y = ty(obj.geo.lat);
      const color = TYPE_COLORS[obj.type] || '#64748b';
      const isSelected = selectedNode?.id === obj.id;

      // Glow
      const glow = ctx.createRadialGradient(x, y, 0, x, y, isSelected ? 24 : 16);
      glow.addColorStop(0, color + '60');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 24 : 16, 0, Math.PI * 2);
      ctx.fill();

      // Dot
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 8 : 6, 0, Math.PI * 2);
      ctx.fill();

      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Icon
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(TYPE_ICONS[obj.type] || '●', x, y - 12);

      // Label
      ctx.fillStyle = '#e2e8f0';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(obj.label.length > 20 ? obj.label.slice(0, 18) + '…' : obj.label, x, y + 20);
    }

    // Coordinate labels
    ctx.fillStyle = '#475569';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${minLon.toFixed(3)}°`, pad, h - 10);
    ctx.fillText(`${maxLon.toFixed(3)}°`, w - pad, h - 10);
    ctx.textAlign = 'right';
    ctx.fillText(`${maxLat.toFixed(3)}°`, pad - 5, pad + 4);
    ctx.fillText(`${minLat.toFixed(3)}°`, pad - 5, h - pad + 4);
  }, [ontology, filterTypes, selectedNode]);

  useEffect(() => {
    if (activeView === 'map') drawMap();
  }, [activeView, drawMap]);

  // ───────────────────── SEARCH ─────────────────────
  async function handleSearch(e) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLoading(true);
    try {
      const results = await searchOntology(searchQuery);
      setSearchResults(results);

      // Highlight in graph
      if (cyInstance && results.objects.length > 0) {
        cyInstance.elements().removeClass('dimmed highlighted');
        const ids = results.objects.map(o => o.id);
        const matched = cyInstance.nodes().filter(n => ids.includes(n.id()));
        if (matched.length > 0) {
          cyInstance.elements().not(matched.neighborhood().add(matched)).addClass('dimmed');
          matched.addClass('highlighted');
          cyInstance.fit(matched, 80);
        }
      }
    } catch { /* no-op */ }
    setLoading(false);
  }

  // ───────────────────── EXPAND NODE ─────────────────────
  async function handleExpand(nodeId) {
    setLoading(true);
    try {
      const result = await expandNode(nodeId, expandDepth);
      if (cyInstance && result.objects.length > 0) {
        const ids = result.objects.map(o => o.id);
        cyInstance.elements().removeClass('dimmed highlighted');
        const matched = cyInstance.nodes().filter(n => ids.includes(n.id()));
        matched.addClass('highlighted');
        cyInstance.elements().not(matched.neighborhood().add(matched)).addClass('dimmed');
        cyInstance.fit(matched, 60);
      }
    } catch { /* no-op */ }
    setLoading(false);
  }

  // ───────────────────── SHORTEST PATH ─────────────────────
  async function handleFindPath(e) {
    e.preventDefault();
    if (!pathFrom.trim() || !pathTo.trim()) return;
    setLoading(true);
    try {
      const result = await getShortestPath(pathFrom, pathTo);
      setPathResult(result);

      if (cyInstance && result.nodes?.length > 0) {
        cyInstance.elements().removeClass('dimmed highlighted path-node path-edge');
        const nodeIds = result.nodes.map(n => n.id);
        const linkIds = result.links.map(l => l.id);
        cyInstance.nodes().filter(n => nodeIds.includes(n.id())).addClass('path-node');
        cyInstance.edges().filter(e => linkIds.includes(e.id())).addClass('path-edge');
        cyInstance.elements().not('.path-node, .path-edge').addClass('dimmed');
        const pathElements = cyInstance.elements('.path-node, .path-edge');
        if (pathElements.length) cyInstance.fit(pathElements, 60);
      }
    } catch { /* no-op */ }
    setLoading(false);
  }

  // ───────────────────── FILTER ─────────────────────
  function toggleFilter(type) {
    setFilterTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  // ───────────────────── AI CHAT ─────────────────────
  async function handleChatSend(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user', content: chatInput };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);
    try {
      const context = {
        module: 'Gotham Knowledge Graph',
        graph_nodes: graphStats.nodes,
        graph_edges: graphStats.edges,
        selected_entity: selectedNode ? `${selectedNode.label} (${selectedNode.type})` : 'none',
        timeline_events: timeline.length,
        search_query: searchQuery || 'none',
      };
      const allMsgs = [...chatMessages, userMsg].map(m => ({ role: m.role, content: m.content }));
      const resp = await sendChatMessage(allMsgs, context);
      setChatMessages(prev => [...prev, { role: 'assistant', content: resp.reply }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Connection error.' }]);
    }
    setChatLoading(false);
  }

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  // ───────────────────── MAP CLICK ─────────────────────
  function handleMapClick(e) {
    if (!mapCanvasRef.current || !ontology) return;
    const rect = mapCanvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const geoObjs = ontology.objects.filter(o => o.geo && filterTypes.has(o.type));
    if (geoObjs.length === 0) return;

    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    for (const o of geoObjs) {
      minLat = Math.min(minLat, o.geo.lat);
      maxLat = Math.max(maxLat, o.geo.lat);
      minLon = Math.min(minLon, o.geo.lon);
      maxLon = Math.max(maxLon, o.geo.lon);
    }
    const latPad = Math.max((maxLat - minLat) * 0.15, 0.01);
    const lonPad = Math.max((maxLon - minLon) * 0.15, 0.01);
    minLat -= latPad; maxLat += latPad;
    minLon -= lonPad; maxLon += lonPad;

    const pad = 50, w = rect.width, h = rect.height;
    for (const obj of geoObjs) {
      const ox = pad + ((obj.geo.lon - minLon) / (maxLon - minLon)) * (w - 2 * pad);
      const oy = pad + ((maxLat - obj.geo.lat) / (maxLat - minLat)) * (h - 2 * pad);
      if (Math.abs(mx - ox) < 16 && Math.abs(my - oy) < 16) {
        setSelectedNode(obj);
        return;
      }
    }
    setSelectedNode(null);
  }

  function popOutModule() {
    const pw = window.open('', '_blank', 'width=1400,height=900,menubar=no,toolbar=no');
    if (!pw) return;
    pw.document.title = 'HCMN – Gotham Intelligence';
    pw.document.body.innerHTML = '<div style="background:#0a0e17;color:#e2e8f0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:sans-serif"><h2>Module 4 – Gotham Knowledge Graph</h2><p>Pop-out window active.</p></div>';
  }

  // ───────────────────── COMPUTED ─────────────────────
  const allTypes = Object.keys(TYPE_COLORS);
  const objectsByType = {};
  if (ontology) {
    for (const obj of ontology.objects) {
      if (!objectsByType[obj.type]) objectsByType[obj.type] = [];
      objectsByType[obj.type].push(obj);
    }
  }

  // ───────────────────── RENDER ─────────────────────
  return (
    <div className="module-panel gotham-module">
      <div className="module-header">
        <div className="module-title">
          <span className="module-icon">🔮</span>
          <h2>Module 4 – Gotham Intelligence Platform</h2>
          <span className="feed-count">
            {graphStats.nodes} nodes · {graphStats.edges} edges
          </span>
        </div>
        <div className="module-actions">
          <button className="btn-refresh" onClick={loadData} disabled={loading}>
            {loading ? 'Loading…' : '⟳ Reload Graph'}
          </button>
          <button className="btn-popout" onClick={popOutModule}>⧉ Pop Out</button>
        </div>
      </div>

      {/* Pipeline */}
      <div className="pipeline-bar">
        <div className="pipeline-step"><span className="step-num">1</span> Ingest Data</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">2</span> Ontology Map</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">3</span> Link Analysis</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">4</span> Pattern Detect</div>
        <span className="pipeline-arrow">→</span>
        <div className="pipeline-step"><span className="step-num">5</span> AI Scoring</div>
      </div>

      {/* View tabs */}
      <div className="gotham-view-tabs">
        {[
          { id: 'graph', label: '🕸️ Graph View' },
          { id: 'timeline', label: '📅 Timeline' },
          { id: 'map', label: '🗺️ Geo Map' },
          { id: 'table', label: '📋 Table' },
        ].map(v => (
          <button
            key={v.id}
            className={`view-tab ${activeView === v.id ? 'active' : ''}`}
            onClick={() => setActiveView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="gotham-layout">
        {/* ── LEFT: Search + Filters + Tools ── */}
        <div className="gotham-sidebar">
          {/* Search */}
          <div className="gotham-card">
            <h3>🔍 Search Ontology</h3>
            <form onSubmit={handleSearch} className="gotham-search-form">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search people, orgs, accounts…"
              />
              <button type="submit" disabled={loading}>Search</button>
            </form>
            {searchResults && (
              <div className="search-results-count">
                Found {searchResults.objects.length} entities, {searchResults.links.length} links
              </div>
            )}
          </div>

          {/* Type Filters */}
          <div className="gotham-card">
            <h3>🏷️ Entity Filters</h3>
            <div className="gotham-filters">
              {allTypes.map(type => (
                <label key={type} className="filter-chip" style={{ borderColor: TYPE_COLORS[type] }}>
                  <input
                    type="checkbox"
                    checked={filterTypes.has(type)}
                    onChange={() => toggleFilter(type)}
                  />
                  <span className="filter-dot" style={{ background: TYPE_COLORS[type] }} />
                  {TYPE_ICONS[type]} {type} ({objectsByType[type]?.length || 0})
                </label>
              ))}
            </div>
          </div>

          {/* Path Finder */}
          <div className="gotham-card">
            <h3>🔗 Shortest Path</h3>
            <form onSubmit={handleFindPath} className="gotham-path-form">
              <select value={pathFrom} onChange={e => setPathFrom(e.target.value)}>
                <option value="">From entity…</option>
                {ontology?.objects.map(o => (
                  <option key={o.id} value={o.id}>{TYPE_ICONS[o.type]} {o.label}</option>
                ))}
              </select>
              <select value={pathTo} onChange={e => setPathTo(e.target.value)}>
                <option value="">To entity…</option>
                {ontology?.objects.map(o => (
                  <option key={o.id} value={o.id}>{TYPE_ICONS[o.type]} {o.label}</option>
                ))}
              </select>
              <button type="submit" disabled={!pathFrom || !pathTo || loading}>Find Path</button>
            </form>
            {pathResult && (
              <div className="path-result">
                {pathResult.length >= 0 ? (
                  <p className="path-found">Path found: {pathResult.length} hops through {pathResult.nodes?.length || 0} entities</p>
                ) : (
                  <p className="path-none">No path found between these entities.</p>
                )}
              </div>
            )}
          </div>

          {/* Expand Depth */}
          <div className="gotham-card">
            <h3>🌐 Expansion Depth</h3>
            <div className="expand-controls">
              <input
                type="range"
                min="1"
                max="4"
                value={expandDepth}
                onChange={e => setExpandDepth(Number(e.target.value))}
              />
              <span>{expandDepth} degree{expandDepth > 1 ? 's' : ''} of separation</span>
            </div>
          </div>

          {/* Graph Stats */}
          <div className="gotham-card">
            <h3>📊 Graph Statistics</h3>
            <div className="gotham-stats">
              <div className="stat-row"><span>Total Objects</span><span className="mono">{ontology?.objects.length || 0}</span></div>
              <div className="stat-row"><span>Total Links</span><span className="mono">{ontology?.links.length || 0}</span></div>
              <div className="stat-row"><span>Visible Nodes</span><span className="mono">{graphStats.nodes}</span></div>
              <div className="stat-row"><span>Visible Edges</span><span className="mono">{graphStats.edges}</span></div>
              <div className="stat-row"><span>Entity Types</span><span className="mono">{filterTypes.size}/{allTypes.length}</span></div>
              <div className="stat-row"><span>Timeline Events</span><span className="mono">{timeline.length}</span></div>
            </div>
          </div>

          {/* AI Chat */}
          <div className="gotham-card gotham-chat-card">
            <h3>🤖 Claude AI Analyst</h3>
            <div className="chat-messages compact">
              {chatMessages.length === 0 && (
                <p className="chat-hint">Ask about entities, connections, suspicious patterns, or financial flows…</p>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`chat-msg chat-${msg.role}`}>
                  <span className="msg-role">{msg.role === 'user' ? 'You' : 'Claude'}</span>
                  <p>{msg.content}</p>
                </div>
              ))}
              {chatLoading && <div className="chat-msg chat-assistant"><span className="msg-role">Claude</span><p className="typing">Analyzing graph…</p></div>}
              <div ref={chatEndRef} />
            </div>
            <form className="chat-input" onSubmit={handleChatSend}>
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Ask Claude about entities…" disabled={chatLoading} />
              <button type="submit" disabled={chatLoading || !chatInput.trim()}>Send</button>
            </form>
          </div>
        </div>

        {/* ── CENTER: Main View ── */}
        <div className="gotham-main">
          {/* Graph View */}
          {activeView === 'graph' && (
            <div className="gotham-graph-container">
              <div ref={cyRef} className="cytoscape-canvas" />
              <div className="graph-controls">
                <button onClick={() => cyInstance?.fit()} title="Fit to view">⊞ Fit</button>
                <button onClick={() => cyInstance?.zoom(cyInstance.zoom() * 1.3)} title="Zoom in">+ Zoom</button>
                <button onClick={() => cyInstance?.zoom(cyInstance.zoom() * 0.7)} title="Zoom out">− Zoom</button>
                <button onClick={() => {
                  cyInstance?.elements().removeClass('dimmed highlighted path-node path-edge');
                  setSelectedNode(null);
                  setPathResult(null);
                }} title="Reset highlights">⟳ Reset</button>
                <button onClick={() => {
                  cyInstance?.layout({ name: 'cose', animate: true, animationDuration: 500, nodeRepulsion: 8000 }).run();
                }} title="Re-layout">◎ Layout</button>
              </div>
            </div>
          )}

          {/* Timeline View */}
          {activeView === 'timeline' && (
            <div className="gotham-timeline-container">
              <h3>📅 Event Timeline</h3>
              <div className="timeline-list">
                {timeline.map((evt, i) => (
                  <div
                    key={evt.id || i}
                    className={`timeline-event ${selectedNode?.id === evt.entity ? 'selected' : ''}`}
                    onClick={() => {
                      const obj = ontology?.objects.find(o => o.id === evt.entity);
                      if (obj) setSelectedNode(obj);
                    }}
                  >
                    <div className="timeline-marker" style={{ borderColor: SEVERITY_COLORS[evt.severity] || '#475569' }}>
                      <div className="timeline-dot" style={{ background: SEVERITY_COLORS[evt.severity] || '#475569' }} />
                    </div>
                    <div className="timeline-line" />
                    <div className="timeline-content">
                      <div className="timeline-date">
                        {new Date(evt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        <span className={`severity-badge severity-${evt.severity}`}>{evt.severity}</span>
                      </div>
                      <p className="timeline-label">{evt.label}</p>
                      <span className="timeline-type">{evt.type}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Map View */}
          {activeView === 'map' && (
            <div className="gotham-map-container">
              <canvas ref={mapCanvasRef} className="gotham-map-canvas" onClick={handleMapClick} />
              <div className="map-legend">
                {allTypes.filter(t => filterTypes.has(t)).map(t => (
                  <span key={t} className="legend-chip">
                    <span className="legend-dot" style={{ background: TYPE_COLORS[t] }} />
                    {TYPE_ICONS[t]} {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Table View */}
          {activeView === 'table' && (
            <div className="gotham-table-container">
              <table className="gotham-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Label</th>
                    <th>Properties</th>
                    <th>Links</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {(ontology?.objects || []).filter(o => filterTypes.has(o.type)).map(obj => {
                    const linkCount = ontology?.links.filter(l => l.source === obj.id || l.target === obj.id).length || 0;
                    const risk = obj.properties?.risk_score;
                    return (
                      <tr
                        key={obj.id}
                        className={selectedNode?.id === obj.id ? 'selected' : ''}
                        onClick={() => setSelectedNode(obj)}
                      >
                        <td>
                          <span className="type-badge" style={{ background: TYPE_COLORS[obj.type] + '30', color: TYPE_COLORS[obj.type] }}>
                            {TYPE_ICONS[obj.type]} {obj.type}
                          </span>
                        </td>
                        <td className="entity-label">{obj.label}</td>
                        <td className="entity-props mono">
                          {Object.entries(obj.properties || {}).slice(0, 3).map(([k, v]) =>
                            `${k}: ${v}`
                          ).join(' · ')}
                        </td>
                        <td className="mono">{linkCount}</td>
                        <td>
                          {risk != null && (
                            <span className={`risk-badge ${risk > 0.6 ? 'high' : risk > 0.3 ? 'med' : 'low'}`}>
                              {(risk * 100).toFixed(0)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── RIGHT: Entity Detail ── */}
        <div className="gotham-detail-panel">
          {selectedNode ? (
            <>
              <div className="gotham-card entity-header-card" style={{ borderLeft: `4px solid ${TYPE_COLORS[selectedNode.type]}` }}>
                <div className="entity-icon-large">{TYPE_ICONS[selectedNode.type]}</div>
                <h3>{selectedNode.label}</h3>
                <span className="type-badge" style={{ background: TYPE_COLORS[selectedNode.type] + '30', color: TYPE_COLORS[selectedNode.type] }}>
                  {selectedNode.type}
                </span>
                {selectedNode.properties?.risk_score != null && (
                  <div className="risk-meter">
                    <div className="risk-meter-fill" style={{
                      width: `${selectedNode.properties.risk_score * 100}%`,
                      background: selectedNode.properties.risk_score > 0.6 ? '#ef4444' : selectedNode.properties.risk_score > 0.3 ? '#f59e0b' : '#10b981',
                    }} />
                    <span>Risk: {(selectedNode.properties.risk_score * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>

              <div className="gotham-card">
                <h3>📋 Properties</h3>
                <div className="property-list">
                  {Object.entries(selectedNode.properties || {}).map(([k, v]) => (
                    <div key={k} className="property-row">
                      <span className="prop-key">{k.replace(/_/g, ' ')}</span>
                      <span className="prop-val">{String(v)}</span>
                    </div>
                  ))}
                  {selectedNode.geo && (
                    <div className="property-row">
                      <span className="prop-key">coordinates</span>
                      <span className="prop-val mono">{selectedNode.geo.lat.toFixed(4)}, {selectedNode.geo.lon.toFixed(4)}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="gotham-card">
                <h3>🔗 Connections ({ontology?.links.filter(l => l.source === selectedNode.id || l.target === selectedNode.id).length || 0})</h3>
                <div className="connections-list">
                  {ontology?.links
                    .filter(l => l.source === selectedNode.id || l.target === selectedNode.id)
                    .map(link => {
                      const otherId = link.source === selectedNode.id ? link.target : link.source;
                      const other = ontology.objects.find(o => o.id === otherId);
                      return (
                        <div
                          key={link.id}
                          className="connection-row"
                          onClick={() => {
                            if (other) setSelectedNode(other);
                          }}
                        >
                          <span className="conn-type" style={{ color: EDGE_COLORS[link.type] || '#64748b' }}>
                            {link.type.replace(/_/g, ' ')}
                          </span>
                          <span className="conn-target">
                            {TYPE_ICONS[other?.type] || '●'} {other?.label || otherId}
                          </span>
                          <span className="conn-label">{link.label}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="gotham-card">
                <h3>⚡ Actions</h3>
                <div className="action-buttons">
                  <button onClick={() => handleExpand(selectedNode.id)}>
                    🌐 Expand ({expandDepth}°)
                  </button>
                  <button onClick={() => {
                    setPathFrom(selectedNode.id);
                    setActiveView('graph');
                  }}>
                    🔗 Set as Path Start
                  </button>
                  <button onClick={() => {
                    setPathTo(selectedNode.id);
                    setActiveView('graph');
                  }}>
                    🎯 Set as Path End
                  </button>
                  <button onClick={() => {
                    if (cyInstance) {
                      const n = cyInstance.getElementById(selectedNode.id);
                      if (n.length) cyInstance.fit(n.neighborhood().add(n), 60);
                    }
                    setActiveView('graph');
                  }}>
                    🔍 Focus in Graph
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="gotham-card gotham-empty-detail">
              <div className="empty-icon">🔮</div>
              <h3>Select an Entity</h3>
              <p>Click on a node in the graph, timeline event, map marker, or table row to view details and explore connections.</p>
              <div className="gotham-quick-stats">
                <div className="quick-stat">
                  <span className="stat-val">{ontology?.objects.filter(o => o.type === 'person').length || 0}</span>
                  <span className="stat-lbl">People</span>
                </div>
                <div className="quick-stat">
                  <span className="stat-val">{ontology?.objects.filter(o => o.type === 'organization').length || 0}</span>
                  <span className="stat-lbl">Orgs</span>
                </div>
                <div className="quick-stat">
                  <span className="stat-val">{ontology?.objects.filter(o => o.type === 'event').length || 0}</span>
                  <span className="stat-lbl">Events</span>
                </div>
                <div className="quick-stat">
                  <span className="stat-val">{ontology?.links.length || 0}</span>
                  <span className="stat-lbl">Links</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
