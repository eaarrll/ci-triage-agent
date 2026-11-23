"""Record schemas shared by the feature jobs."""

from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class EntityType(str, Enum):
    CUSTOMER = "customer"
    MERCHANT = "merchant"
    DEVICE = "device"


class FeatureValue(BaseModel):
    model_config = ConfigDict(from_attributes=True, frozen=True)

    name: str = Field(..., min_length=1, max_length=128)
    value: float | int | str | None
    computed_at: datetime


class FeatureVector(BaseModel):
    entity_type: EntityType
    entity_id: str
    features: list[FeatureValue]
    version: int = 1

    @field_validator("entity_id")
    @classmethod
    def _strip_entity_id(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("entity_id must not be blank")
        return v

    def as_row(self) -> dict[str, object]:
        row: dict[str, object] = {f.name: f.value for f in self.features}
        row.update(self.model_dump(include={"entity_type", "entity_id", "version"}))
        return row
