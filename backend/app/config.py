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

    @property
    def cookie_secure(self) -> bool:
        return self.app_env != "development"


settings = Settings()
