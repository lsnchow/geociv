"""Application configuration using Pydantic settings."""

from functools import lru_cache
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/civicsim"

    # Backboard API
    backboard_api_key: str = ""
    backboard_base_url: str = "https://app.backboard.io/api"

    # App Settings
    app_env: str = "development"
    debug: bool = True

    # Redis (for simulation job store)
    redis_url: str = "redis://localhost:6379"

    # Simulation defaults
    default_lambda_decay: float = 1.0
    default_seed: int = 42

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

