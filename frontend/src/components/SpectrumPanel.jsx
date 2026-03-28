import { useState, useRef, useEffect, useCallback } from 'react';
import { performSweep, detectSignals } from '../services/api';

function formatFreq(hz) {
  if (hz >= 1e9) return (hz / 1e9).toFixed(3) + ' GHz';
  if (hz >= 1e6) return (hz / 1e6).toFixed(3) + ' MHz';
  if (hz >= 1e3) return (hz / 1e3).toFixed(1) + ' kHz';
  return hz + ' Hz';
}

export default function SpectrumPanel() {
  const [sweepData, setSweepData] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [startFreq, setStartFreq] = useState('88000000');
  const [endFreq, setEndFreq] = useState('108000000');
  const [step, setStep] = useState('500000');
  const canvasRef = useRef(null);

  const drawSpectrum = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sweepData || !sweepData.samples.length) return;

    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    const samples = sweepData.samples;
    const powers = samples.map((s) => s.power_dbm);
    const minP = Math.min(...powers) - 5;
    const maxP = Math.max(...powers) + 5;

    // Grid
    ctx.strokeStyle = '#1a2234';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 10; i++) {
      const y = (i / 10) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Spectrum line
    ctx.beginPath();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    samples.forEach((s, i) => {
      const x = (i / (samples.length - 1)) * w;
      const y = h - ((s.power_dbm - minP) / (maxP - minP)) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under curve
    const lastX = w;
    ctx.lineTo(lastX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(59,130,246,0.3)');
    grad.addColorStop(1, 'rgba(59,130,246,0.0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Axis labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(formatFreq(samples[0].frequency_hz), 4, h - 4);
    ctx.textAlign = 'right';
    ctx.fillText(formatFreq(samples[samples.length - 1].frequency_hz), w - 4, h - 4);
    ctx.textAlign = 'left';
    ctx.fillText(`${maxP.toFixed(0)} dBm`, 4, 12);
    ctx.fillText(`${minP.toFixed(0)} dBm`, 4, h - 16);
  }, [sweepData]);

  useEffect(() => {
    drawSpectrum();
  }, [drawSpectrum]);

  async function doSweep() {
    setLoading(true);
    try {
      const data = await performSweep(startFreq, endFreq, step);
      setSweepData(data);
      const sigs = await detectSignals(-80);
      setSignals(sigs);
    } catch {
      /* no-op on error */
    }
    setLoading(false);
  }

  return (
    <div>
      <div className="section-title">
        <span className="icon">📡</span>
        SDR RF Spectrum Visualisation
      </div>

      <div className="spectrum-panel">
        <div className="spectrum-controls">
          <label>
            Start Freq (Hz)
            <input type="number" value={startFreq} onChange={(e) => setStartFreq(e.target.value)} />
          </label>
          <label>
            End Freq (Hz)
            <input type="number" value={endFreq} onChange={(e) => setEndFreq(e.target.value)} />
          </label>
          <label>
            Step (Hz)
            <input type="number" value={step} onChange={(e) => setStep(e.target.value)} />
          </label>
          <button onClick={doSweep} disabled={loading}>
            {loading ? 'Sweeping…' : '▶ Sweep'}
          </button>
        </div>

        <div className="spectrum-chart">
          <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
        </div>

        {signals.length > 0 && (
          <div className="signal-list">
            <h3>Detected Signals ({signals.length})</h3>
            {signals.map((sig, i) => (
              <div key={i} className="signal-item">
                <span className="freq">{formatFreq(sig.frequency_hz)}</span>
                <span className="power">{sig.power_dbm.toFixed(1)} dBm</span>
                <span className="label">{sig.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
