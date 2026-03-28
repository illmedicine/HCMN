import { useState } from 'react';
import {
  startTraining,
  collectTrainingData,
  finishTraining,
} from '../../services/api';

const STEPS = [
  { id: 'zones', label: 'Define Zones', icon: '🗺️' },
  { id: 'collect', label: 'Walk-Through', icon: '🚶' },
  { id: 'train', label: 'Train Model', icon: '🧠' },
  { id: 'verify', label: 'Verify', icon: '✅' },
];

export default function TrainingWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [zones, setZones] = useState(['living_room', 'kitchen', 'hallway']);
  const [newZone, setNewZone] = useState('');
  const [session, setSession] = useState(null);
  const [currentZone, setCurrentZone] = useState(0);
  const [collecting, setCollecting] = useState(false);
  const [training, setTraining] = useState(false);
  const [complete, setComplete] = useState(false);

  async function handleStartSession() {
    const s = await startTraining(zones);
    setSession(s);
    setStep(1);
  }

  async function handleCollectZone() {
    if (!session) return;
    setCollecting(true);
    await collectTrainingData(session.id, zones[currentZone], 50);
    setCollecting(false);

    if (currentZone < zones.length - 1) {
      setCurrentZone(currentZone + 1);
    } else {
      setStep(2);
    }
  }

  async function handleTrain() {
    if (!session) return;
    setTraining(true);
    const result = await finishTraining(session.id);
    setSession(result);
    setTraining(false);

    // Wait for training to complete
    setTimeout(async () => {
      setComplete(true);
      setStep(3);
    }, 3000);
  }

  function addZone() {
    if (newZone.trim() && !zones.includes(newZone.trim())) {
      setZones([...zones, newZone.trim()]);
      setNewZone('');
    }
  }

  function removeZone(z) {
    setZones(zones.filter((zone) => zone !== z));
  }

  return (
    <div className="modal-overlay">
      <div className="modal">
        <div className="modal-header">
          <h2>🎓 Presence Detection Training</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Step indicators */}
        <div className="wizard-steps">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`wizard-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            >
              <span className="wizard-step-icon">{i < step ? '✓' : s.icon}</span>
              <span className="wizard-step-label">{s.label}</span>
            </div>
          ))}
        </div>

        <div className="modal-body">
          {/* Step 0: Define Zones */}
          {step === 0 && (
            <div>
              <h3>Define rooms/zones in your home</h3>
              <p>List the areas you want the system to detect presence in.</p>

              <div className="zone-list">
                {zones.map((z) => (
                  <div key={z} className="zone-chip">
                    <span>{z.replace(/_/g, ' ')}</span>
                    <button onClick={() => removeZone(z)}>✕</button>
                  </div>
                ))}
              </div>

              <div className="zone-add">
                <input
                  type="text"
                  placeholder="Add zone name..."
                  value={newZone}
                  onChange={(e) => setNewZone(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addZone()}
                />
                <button onClick={addZone}>+ Add</button>
              </div>

              <button
                className="btn-action"
                onClick={handleStartSession}
                disabled={zones.length === 0}
                style={{ marginTop: '1rem' }}
              >
                Start Training →
              </button>
            </div>
          )}

          {/* Step 1: Walk-Through Collection */}
          {step === 1 && (
            <div>
              <h3>Walk-Through Calibration</h3>
              <p>
                Go to <strong>{zones[currentZone]?.replace(/_/g, ' ')}</strong> and stand still.
                Then click "Collect Data" to record Wi-Fi signal patterns.
              </p>

              <div className="zone-progress">
                {zones.map((z, i) => (
                  <div
                    key={z}
                    className={`zone-progress-item ${i < currentZone ? 'done' : ''} ${i === currentZone ? 'active' : ''}`}
                  >
                    {i < currentZone ? '✅' : i === currentZone ? '📍' : '⬜'} {z.replace(/_/g, ' ')}
                  </div>
                ))}
              </div>

              <button
                className="btn-action"
                onClick={handleCollectZone}
                disabled={collecting}
                style={{ marginTop: '1rem' }}
              >
                {collecting ? 'Collecting...' : `📊 Collect Data for ${zones[currentZone]?.replace(/_/g, ' ')}`}
              </button>

              {session && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
                  Frames collected: {session.framesCollected || 0}
                </p>
              )}
            </div>
          )}

          {/* Step 2: Train Model */}
          {step === 2 && (
            <div>
              <h3>Train Presence Model</h3>
              <p>All zones have been calibrated. Click below to train the AI model.</p>

              <div className="training-status">
                <p>Zones: {zones.length}</p>
                <p>Total frames: {session?.framesCollected || 0}</p>
              </div>

              <button
                className="btn-action"
                onClick={handleTrain}
                disabled={training}
                style={{ marginTop: '1rem' }}
              >
                {training ? '🧠 Training in progress...' : '🧠 Start Training'}
              </button>
            </div>
          )}

          {/* Step 3: Verify */}
          {step === 3 && (
            <div>
              <h3>✅ Training Complete!</h3>
              <p>The presence detection model has been trained.</p>

              {session?.accuracy && (
                <div className="training-result">
                  <div className="stat-value" style={{ color: 'var(--accent-green)' }}>
                    {(session.accuracy * 100).toFixed(1)}%
                  </div>
                  <div className="stat-label">Model Accuracy</div>
                </div>
              )}

              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '1rem' }}>
                The system will now use this trained model for presence detection.
                You can retrain at any time to improve accuracy.
              </p>

              <button className="btn-action" onClick={onClose} style={{ marginTop: '1rem' }}>
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
