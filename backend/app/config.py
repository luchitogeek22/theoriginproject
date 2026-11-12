"""Central application configuration (environment-driven)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    environment: str = "development"
    log_level: str = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    database_url: str = "sqlite:///./data/origin.db"
    redis_url: str = ""

    storage_backend: str = "local"
    local_storage_dir: str = "./data/storage"
    s3_endpoint_url: str = "http://localhost:9000"
    s3_bucket: str = "origin-project"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_region: str = "us-east-1"

    irsa_sia2_url: str = "https://irsa.ipac.caltech.edu/SIA"
    irsa_tap_url: str = "https://irsa.ipac.caltech.edu/TAP/sync"
    discover_collections: bool = True
    collection_discovery_ttl_seconds: int = 86400
    collection_discovery_timeout_seconds: float = 180.0
    collection_discovery_retry_seconds: int = 300
    irsa_collections: str = "spherex_qr3,spherex_qr3_deep,spherex_qr2,spherex_qr2_deep"
    irsa_timeout_seconds: float = 30.0
    irsa_connect_timeout_seconds: float = 5.0
    irsa_search_deadline_seconds: float = 60.0
    irsa_maxrec: int = 500
    download_limit_mb: int = 64
    download_concurrency: int = 2
    download_pause_seconds: float = 0.5
    download_max_attempts: int = 4
    download_backoff_seconds: float = 2.0
    download_backoff_cap_seconds: float = 20.0
    processing_version: str = "1"
    download_allowed_host_suffixes: str = ".ipac.caltech.edu"
    sia_cache_ttl_seconds: int = 3600
    sia_partial_ttl_seconds: int = 60
    sia_negative_ttl_seconds: int = 45

    simbad_timeout_seconds: float = 20.0

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""
    supabase_jwt_audience: str = "authenticated"

    rate_limit_per_minute: int = 120
    trusted_proxy_hops: int = 1
    max_body_bytes: int = 1024 * 1024
    max_concurrent_jobs: int = 4
    max_queued_jobs: int = 20
    detection_min_pixels: int = 2
    catalog_timeout_seconds: float = 25.0
    wise_ibe_url: str = "https://irsa.ipac.caltech.edu/ibe"
    catalog_cache_ttl_seconds: int = 86400
    alignment_error_pix: float = 0.1

    @property
    def collection_list(self) -> list[str]:
        return [c.strip() for c in self.irsa_collections.split(",") if c.strip()]

    @property
    def download_host_suffix_list(self) -> list[str]:
        return [
            s.strip().lower().lstrip(".")
            for s in self.download_allowed_host_suffixes.split(",")
            if s.strip()
        ]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
