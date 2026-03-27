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

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    model_config = {"env_file": ".env", "env_prefix": "HCMN_"}
