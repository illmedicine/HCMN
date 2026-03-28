# HCMN — Human Centralized Mesh Network

A centralized observational and intelligence platform with three integrated modules: live camera feed monitoring with AI chat, global satellite/tracking intelligence, and Wi-Fi signal-based presence detection.

## Architecture

- **Backend**: Node.js + TypeScript + Fastify
- **Frontend**: React 19 + Vite
- **Communication**: REST API + WebSocket (real-time chat & sensing)

## Modules

### Module 1: Live Feed Viewer + AI Chat
Browse and monitor up to 4 simultaneous live IP/CCTV/city traffic camera feeds with an AI chatbox for real-time contextual information.

- Feed browser with search, filtering by source (DOT Traffic, Weather, EarthCam, Public CCTV)
- 2×2 grid viewer for simultaneous monitoring
- AI chat powered by OpenAI/Anthropic (with local fallback)
- WebSocket real-time chat + REST fallback

### Module 2: Global Surveillance & Tracking Intelligence
Interactive map allowing users to pin any location on Earth and receive aggregated intelligence from multiple data sources.

**Data Sources:**
- **FAA/OpenSky Network**: Real-time aircraft tracking
- **AIS/MarineTraffic**: Vessel positions and maritime data
- **NASA/ISS**: International Space Station tracking, satellite passes
- **Starlink/CelesTrak/N2YO**: Satellite pass predictions
- **Crime APIs**: Real-time police crime report tracking with heatmaps
- **Camera Cross-Reference**: Nearby live feeds from Module 1

### Module 3: Wi-Fi Signal Presence Detection
Maps home environment and creates enhanced presence detection by analyzing Wi-Fi signal reflections from your Arris Spectrum router.

- CSI (Channel State Information) collection and processing
- Signal processing pipeline: Low-pass Filter → PCA → FFT → Classification
- AI presence classifier (empty, person sitting, person walking, multiple people)
- Room spatial reconstruction from signal patterns
- Training wizard for calibrating zones
- Router admin interface adapter

## Quick Start

### Backend
```bash
cd backend
cp .env.example .env  # Configure API keys
npm install
npm run dev           # Starts on http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
npm run dev           # Starts on http://localhost:5173
```

### Docker
```bash
docker compose up --build
# Frontend: http://localhost:3000
# Backend: http://localhost:8000
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Backend server port | `8000` |
| `OPENAI_API_KEY` | OpenAI API key for AI chat | — |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI chat | — |
| `DOT_API_KEY` | Department of Transportation API | — |
| `GOOGLE_MAPS_API_KEY` | Google Maps Platform | — |
| `OPENSKY_USERNAME` | OpenSky Network credentials | — |
| `OPENSKY_PASSWORD` | OpenSky Network credentials | — |
| `MARINETRAFFIC_API_KEY` | MarineTraffic AIS data | — |
| `N2YO_API_KEY` | Satellite tracking API | — |
| `NASA_API_KEY` | NASA APIs | `DEMO_KEY` |
| `SPOTCRIME_API_KEY` | Crime report data | — |
| `ROUTER_ADMIN_URL` | Wi-Fi router admin URL | `http://192.168.1.1` |
| `ROUTER_ADMIN_USER` | Router admin username | `admin` |
| `ROUTER_ADMIN_PASSWORD` | Router admin password | — |
| `CSI_DEVICE_TYPE` | CSI device (simulated/esp32) | `simulated` |

> All features work with simulated data when API keys are not configured.

## API Endpoints

### Module 1: Feeds
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/feeds/` | List all feeds (filter: `?source=`, `?q=`) |
| GET | `/api/feeds/:id` | Get single feed |
| POST | `/api/feeds/` | Register new feed |
| DELETE | `/api/feeds/:id` | Remove feed |
| GET | `/api/feeds/nearby` | Find feeds near location |
| WS | `/api/chat/ws` | AI chat WebSocket |
| POST | `/api/chat/message` | AI chat REST fallback |

### Module 2: Globe Intelligence
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/globe/pin` | Pin location, get aggregated data |
| GET | `/api/globe/iss` | Current ISS position |
| GET | `/api/globe/aircraft` | Aircraft near coordinates |
| GET | `/api/globe/vessels` | Vessels near coordinates |
| GET | `/api/globe/crimes` | Crime reports near coordinates |

### Module 3: Wi-Fi Sensing
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/sensing/collect` | Collect CSI frames |
| GET | `/api/sensing/predict` | Run pipeline + predict |
| GET | `/api/sensing/presence` | Detect presence |
| GET | `/api/sensing/layout` | Reconstruct room layout |
| GET | `/api/sensing/router` | Router status |
| POST | `/api/sensing/router/test` | Test router connection |
| POST | `/api/sensing/training/start` | Start training session |

## CSI Pipeline

```
Collect → Filter → PCA → FFT → Classify
  ↓         ↓        ↓       ↓        ↓
Raw CSI  Low-pass  Reduce  Extract  Predict
Frames   Filter    Dims    Features Presence

H = |H| · e^(j∠H)
```
