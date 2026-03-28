import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '8000', 10),
  host: process.env.HOST || '0.0.0.0',

  // AI Chat
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',

  // Camera feeds
  dotApiKey: process.env.DOT_API_KEY || '',
  earthcamApiKey: process.env.EARTHCAM_API_KEY || '',

  // Globe / Module 2
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
  openskyUsername: process.env.OPENSKY_USERNAME || '',
  openskyPassword: process.env.OPENSKY_PASSWORD || '',
  marineTrafficApiKey: process.env.MARINETRAFFIC_API_KEY || '',
  n2yoApiKey: process.env.N2YO_API_KEY || '',
  nasaApiKey: process.env.NASA_API_KEY || 'DEMO_KEY',
  spotcrimeApiKey: process.env.SPOTCRIME_API_KEY || '',

  // Wi-Fi Sensing
  routerAdminUrl: process.env.ROUTER_ADMIN_URL || 'http://192.168.1.1',
  routerAdminUser: process.env.ROUTER_ADMIN_USER || 'admin',
  routerAdminPassword: process.env.ROUTER_ADMIN_PASSWORD || '',
  csiDeviceType: process.env.CSI_DEVICE_TYPE || 'simulated',

  // Cesium
  cesiumIonToken: process.env.CESIUM_ION_TOKEN || '',

  cors: {
    origins: ['http://localhost:3000', 'http://localhost:5173'] as string[],
  },
};
