import { useState } from 'react';
import { testRouterConnection } from '../../services/api';

export default function RouterConfig({ onClose, onSave }) {
  const [url, setUrl] = useState('http://192.168.1.1');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const res = await testRouterConnection(url, username, password);
      setResult(res);
    } catch {
      setResult({ success: false, message: 'Connection test failed' });
    }
    setTesting(false);
  }

  function handleSave() {
    // In production, would save to backend config
    onSave?.();
    onClose();
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>⚙️ Router Configuration</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <p>Configure your Arris Spectrum Wi-Fi router for CSI data collection.</p>

          <div className="form-group">
            <label>Router Admin URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://192.168.1.1"
            />
          </div>

          <div className="form-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
            />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Router admin password"
            />
          </div>

          <div className="form-note">
            <p>💡 This connects to your router's admin interface to extract Wi-Fi signal metrics for presence detection.</p>
            <p>Your credentials are used only for local router access and are not stored externally.</p>
          </div>

          {result && (
            <div className={`test-result ${result.success ? 'success' : 'error'}`}>
              <span>{result.success ? '✅' : '❌'}</span>
              <span>{result.message}</span>
            </div>
          )}

          <div className="modal-actions">
            <button className="btn-action secondary" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing...' : '🔌 Test Connection'}
            </button>
            <button className="btn-action" onClick={handleSave}>
              💾 Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
