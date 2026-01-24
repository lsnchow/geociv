"""Application configuration using Pydantic settings."""

from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings


# Allowed LLM models for agent simulation
ALLOWED_MODELS: List[str] = [
    "amazon/nova-micro-v1",        # Default - speed/cost balanced
    "anthropic/claude-3-haiku",    # Deep reasoning fallback
    "gemini-2.0-flash-lite-001",   # Flash tasks (explicit only)
]

DEFAULT_MODEL = "amazon/nova-micro-v1"

# Provider mappings for display/telemetry
MODEL_PROVIDERS = {
    "amazon/nova-micro-v1": "amazon",
    "anthropic/claude-3-haiku": "anthropic",
    "gemini-2.0-flash-lite-001": "google",
}


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
    
    # Model settings
    gemini_enabled: bool = True  # Soft toggle to disable Gemini project-wide
    
    # Cache settings
    cache_ttl_days: int = 7  # TTL for promotion cache entries
    cache_max_per_scenario: int = 1000  # Max cache entries per scenario

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()


def validate_model(model: str) -> bool:
    """Check if a model is in the allowed set."""
    return model in ALLOWED_MODELS


def get_provider(model: str) -> str:
    """Get provider name for a model."""
    return MODEL_PROVIDERS.get(model, "unknown")

