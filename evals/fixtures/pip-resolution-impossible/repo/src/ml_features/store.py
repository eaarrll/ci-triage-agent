"""Writes feature vectors through the internal feature store client."""

from __future__ import annotations

from collections.abc import Iterable

from acme_feature_store import FeatureStoreClient, WriteMode

from .schemas import FeatureVector
from .settings import Settings


class FeatureWriter:
    def __init__(self, settings: Settings, client: FeatureStoreClient | None = None) -> None:
        self._settings = settings
        self._client = client or FeatureStoreClient(
            base_url=str(settings.feature_store_url),
            namespace=settings.feature_store_namespace,
            timeout=settings.request_timeout_s,
        )

    def write(self, vectors: Iterable[FeatureVector]) -> int:
        batch: list[dict[str, object]] = []
        written = 0
        for vector in vectors:
            batch.append(vector.as_row())
            if len(batch) >= self._settings.batch_size:
                written += self._client.upsert_rows(batch, mode=WriteMode.MERGE)
                batch.clear()
        if batch:
            written += self._client.upsert_rows(batch, mode=WriteMode.MERGE)
        return written
