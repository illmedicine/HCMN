# HCMN
Human Centralized Mesh Network

A centralized observational platform featuring public camera feed aggregation, local SDR RF spectrum visualization, and Wi-Fi CSI-based presence detection & spatial reconstruction.

## Architecture

```
backend/          Python FastAPI backend
  app/
    config.py     Environment-based configuration
    main.py       Application entry-point (FastAPI)
    models/       Pydantic data models
    routers/      API route handlers
    services/     Business logic
      camera_service.py   Public camera feed aggregation (DOT, weather, EarthCam)
      sdr_service.py      SDR spectrum sweep & signal detection
      csi_service.py      Wi-Fi CSI pipeline (filter → PCA → FFT → classify)
  tests/          pytest test suite

frontend/         React + Vite dashboard
  src/
    components/
      CameraPanel.jsx     Public Observational Deck
      SpectrumPanel.jsx   RF Spectrum Visualisation (canvas-based)
      CSIPanel.jsx        Wi-Fi CSI Sensing & Spatial Reconstruction
    services/api.js       Backend API client
    styles/dashboard.css  Dashboard styles
```

## Modules

### 1. Public Observational Deck
Aggregates live camera feeds from public APIs:
- **DOT Traffic Cameras** – state Department of Transportation feeds
- **Weather Cameras** – OpenWeather / Windy meteorological webcams
- **EarthCam** – public webcam network

### 2. SDR RF Spectrum Visualisation
Local Software Defined Radio spectrum analysis:
- Frequency sweep across configurable ranges (1 MHz – 6 GHz)
- Real-time power spectrum display with canvas rendering
- Automatic signal detection and band classification (FM, Wi-Fi, ISM, cellular, etc.)
- Pluggable collector interface – works with RTL-SDR, HackRF, or simulated data

### 3. Wi-Fi CSI Sensing & Spatial Reconstruction
Channel State Information (CSI) processing pipeline:

```
H = |H| · e^(j∠H)
```

1. **Collect** raw CSI frames from ESP32 / Nexmon / Intel 5300 hardware
2. **Low-pass filter** to remove environmental noise
3. **PCA** dimensionality reduction
4. **FFT** feature extraction
5. **CNN classifier** for presence detection (heuristic demo included)

Features:
- Presence detection (empty / person walking / sitting / multiple people)
- AI-reconstructed room layout from multipath signal analysis
- Configurable subcarrier count, PCA components, and FFT window size

## Quick Start

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Run Tests
```bash
cd /path/to/repo
python -m pytest backend/tests/ -v
```

## Configuration

All settings are configurable via environment variables (prefix `HCMN_`) or a `.env` file:

| Variable | Default | Description |
|---|---|---|
| `HCMN_DOT_API_KEY` | `""` | 511.org DOT API key |
| `HCMN_OPENWEATHER_API_KEY` | `""` | OpenWeather API key |
| `HCMN_SDR_ENABLED` | `false` | Enable real SDR hardware |
| `HCMN_SDR_DEVICE_INDEX` | `0` | SDR device index |
| `HCMN_CSI_ENABLED` | `false` | Enable real CSI hardware |
| `HCMN_CSI_DEVICE_TYPE` | `esp32` | CSI device (`esp32`, `nexmon`, `intel5300`) |

