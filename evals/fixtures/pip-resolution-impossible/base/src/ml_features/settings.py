"""Runtime configuration, read from ML_FEATURES_* environment variables."""

from __future__ import annotations

from functools import lru_cache

from pydantic import BaseSettings, Field, HttpUrl


class Settings(BaseSettings):
    feature_store_url: HttpUrl
    feature_store_namespace: str = "scoring"
    batch_size: int = Field(5_000, gt=0)
    request_timeout_s: float = 10.0

    class Config:
        env_prefix = "ML_FEATURES_"
        env_file = ".env"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
