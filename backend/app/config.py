from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore")

    database_url: str = "postgresql+psycopg://neotix:neotix_dev_password@localhost:5433/neotix"
    app_env: str = "development"  # "production" disables seeding of the demo users
    session_ttl_hours: int = 8
    max_upload_bytes: int = 50 * 1024 * 1024
    seed_dir: Path = REPO_ROOT / "seed"
    seed_sample_episodes: bool = False
    # Cookie is only marked Secure outside development (dev runs on plain http).
    cookie_name: str = "neotix_session"

    # Simulated export jobs (stretch item): enabled by the API container, off for CLI and tests.
    run_worker: bool = False
    worker_concurrency: int = 4
    export_min_seconds: float = 2.0
    export_max_seconds: float = 5.0
    export_failure_rate: float = 0.2
    export_max_attempts: int = 5
    export_lease_seconds: int = 60
    export_backoff_seconds: float = 2.0  # doubles after every failed attempt

    @property
    def cookie_secure(self) -> bool:
        return self.app_env != "development"


settings = Settings()
