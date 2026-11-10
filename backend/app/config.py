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
    irsa_collections: str = "spherex_qr3,spherex_qr3_deep,spherex_qr2,spherex_qr2_deep"
    irsa_timeout_seconds: float = 30.0
    irsa_maxrec: int = 500
    download_limit_mb: int = 512
    sia_cache_ttl_seconds: int = 3600

    simbad_timeout_seconds: float = 20.0

    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_jwt_secret: str = ""

    rate_limit_per_minute: int = 120
    max_concurrent_jobs: int = 4

    @property
    def collection_list(self) -> list[str]:
        return [c.strip() for c in self.irsa_collections.split(",") if c.strip()]

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
