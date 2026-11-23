"""Feature computation over the raw transactions frame."""

from __future__ import annotations

from datetime import UTC, datetime

import pandas as pd

from .schemas import EntityType, FeatureValue, FeatureVector

WINDOWS = {"1h": "1h", "24h": "24h"}


def device_velocity(txns: pd.DataFrame, now: datetime | None = None) -> list[FeatureVector]:
    """Transaction counts per device over the trailing windows."""
    now = now or datetime.now(UTC)
    txns = txns.sort_values("created_at").set_index("created_at")
    vectors: list[FeatureVector] = []
    for device_id, frame in txns.groupby("device_id"):
        features = [
            FeatureValue(
                name=f"txn_count_{label}",
                value=int(frame.loc[now - pd.Timedelta(window) : now].shape[0]),
                computed_at=now,
            )
            for label, window in WINDOWS.items()
        ]
        vectors.append(
            FeatureVector(entity_type=EntityType.DEVICE, entity_id=str(device_id), features=features)
        )
    return vectors
