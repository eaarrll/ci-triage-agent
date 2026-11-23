from datetime import datetime

import pandas as pd

from ml_features.pipeline import device_velocity


def test_device_velocity_counts_windows(txns: pd.DataFrame, now: datetime) -> None:
    vectors = {v.entity_id: v for v in device_velocity(txns, now=now)}
    d1 = {f.name: f.value for f in vectors["d-1"].features}
    assert d1 == {"txn_count_1h": 1, "txn_count_24h": 3}


def test_device_velocity_one_vector_per_device(txns: pd.DataFrame, now: datetime) -> None:
    assert sorted(v.entity_id for v in device_velocity(txns, now=now)) == ["d-1", "d-2"]
