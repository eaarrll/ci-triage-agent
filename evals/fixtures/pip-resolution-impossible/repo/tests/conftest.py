from datetime import UTC, datetime

import pandas as pd
import pytest


@pytest.fixture
def now() -> datetime:
    return datetime(2026, 11, 18, 12, 0, tzinfo=UTC)


@pytest.fixture
def txns(now: datetime) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "device_id": ["d-1", "d-1", "d-1", "d-2"],
            "created_at": [
                now - pd.Timedelta("30min"),
                now - pd.Timedelta("2h"),
                now - pd.Timedelta("20h"),
                now - pd.Timedelta("10min"),
            ],
        }
    )
