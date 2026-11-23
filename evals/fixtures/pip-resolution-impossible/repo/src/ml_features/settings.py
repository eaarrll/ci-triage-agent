"""Runtime configuration, read from ML_FEATURES_* environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, HttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ML_FEATURES_", env_file=".env")

    feature_store_url: HttpUrl
    feature_store_namespace: str = "scoring"
    batch_size: int = Field(5_000, gt=0)
    request_timeout_s: float = 10.0


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
