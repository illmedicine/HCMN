"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Central configuration for the HCMN application."""

    app_name: str = "HCMN - Human Centralized Mesh Network"
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    # Public camera feed API keys (optional, some APIs work without keys)
    dot_api_base_url: str = "https://511.org/api"
    dot_api_key: str = ""
    earthcam_api_base_url: str = "https://www.earthcam.com"
    openweather_api_key: str = ""
    windy_api_key: str = ""

    # Module 2 – Tracking / Satellite / GPS
    google_maps_api_key: str = ""
    opensky_base_url: str = "https://opensky-network.org/api"
    opensky_username: str = ""
    opensky_password: str = ""
    ais_api_key: str = ""  # MarineTraffic / VesselFinder
    ais_base_url: str = "https://services.marinetraffic.com/api"
    faa_swim_url: str = "https://nas-b.faa.gov"
    nasa_api_key: str = "DEMO_KEY"
    nasa_api_base_url: str = "https://api.nasa.gov"
    crime_api_base_url: str = "https://api.crimeometer.com/v1"
    crime_api_key: str = ""
    n2yo_api_key: str = ""  # Satellite tracking (Starlink, ISS)
    n2yo_base_url: str = "https://api.n2yo.com/rest/v1/satellite"

    # Cell tower geolocation APIs
    opencellid_api_key: str = ""  # OpenCelliD / Unwired Labs
    opencellid_base_url: str = "https://us1.unwiredlabs.com/v2"
    beacondb_base_url: str = "https://beacondb.net/v1"
    wigle_api_key: str = ""  # WiGLE (encoded as user:pass or API token)
    wigle_base_url: str = "https://api.wigle.net/api/v2"

    # AI Chat (OpenAI-compatible)
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = "https://api.openai.com/v1"

    # SDR configuration
    sdr_enabled: bool = False
    sdr_device_index: int = 0
    sdr_sample_rate: float = 2.4e6
    sdr_center_freq: float = 100e6
    sdr_freq_min: float = 1e6
    sdr_freq_max: float = 6e9
    sdr_sweep_step: float = 1e6

    # Wi-Fi CSI configuration
    csi_enabled: bool = False
    csi_device_type: str = "esp32"  # esp32, nexmon, intel5300
    csi_collection_interval: float = 0.1
    csi_subcarrier_count: int = 64
    csi_pca_components: int = 10
    csi_fft_window_size: int = 256
    csi_model_path: str = "models/csi_classifier.h5"
    router_ip: str = "192.168.1.1"
    router_admin_user: str = "admin"
    router_admin_password: str = ""

    # ADS-B Telemetry (adsb.fi)
    adsb_api_base_url: str = "https://opendata.adsb.fi/api/v3"
    adsb_poll_interval_ms: int = 5000
    adsb_search_radius_nm: int = 25

    # Historical Replay Backend (ArangoDB)
    arango_url: str = "http://localhost:8529"
    arango_db_name: str = "hcmn_ontology"
    arango_user: str = "root"
    arango_pass: str = ""

    # Object Storage for Camera Frames (S3-compatible)
    s3_bucket: str = "hcmn-historical-frames"
    s3_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""

    # Time-Series Configuration
    data_retention_days: int = 30

    # CORS
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://illmedicine.github.io",
    ]

    model_config = {"env_file": ".env", "env_prefix": "HCMN_"}
