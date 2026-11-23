from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from ml_features.schemas import EntityType, FeatureValue, FeatureVector


def _vector(**overrides: object) -> FeatureVector:
    data = {
        "entity_type": "customer",
        "entity_id": "  c-42 ",
        "features": [{"name": "txn_count_1h", "value": 3, "computed_at": datetime.now(UTC)}],
    }
    data.update(overrides)
    return FeatureVector.parse_obj(data)


def test_entity_id_is_stripped() -> None:
    assert _vector().entity_id == "c-42"


def test_blank_entity_id_is_rejected() -> None:
    with pytest.raises(ValidationError):
        _vector(entity_id="   ")


def test_as_row_flattens_features() -> None:
    row = _vector().as_row()
    assert row["txn_count_1h"] == 3
    assert row["entity_type"] == EntityType.CUSTOMER
    assert row["version"] == 1


def test_feature_value_is_immutable() -> None:
    value = FeatureValue(name="x", value=1, computed_at=datetime.now(UTC))
    with pytest.raises(TypeError):
        value.value = 2  # type: ignore[misc]
