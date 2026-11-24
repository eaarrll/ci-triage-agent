"""Writes report rows as CSV or JSON."""

from __future__ import annotations

import json
from collections.abc import Iterable, Iterator
from datetime import date
from typing import IO

import csvforge

from .sources import Row

COLUMNS = ["date", "account", "category", "amount", "currency"]


def filter_since(rows: Iterable[Row], since: date | None) -> Iterator[Row]:
    """Rows dated on or after `since`; every row when it is None."""
    for row in rows:
        if since is None or row.date >= since:
            yield row


def write_report(rows: Iterable[Row], out: IO[str], fmt: str = "csv", since: date | None = None) -> int:
    """Writes rows to out and returns how many were written."""
    rows = list(filter_since(rows, since))
    if fmt == "json":
        json.dump([row.as_dict() for row in rows], out, indent=2, default=str)
    elif fmt == "csv":
        csvforge.write_rows(out, [row.as_tuple() for row in rows], header=COLUMNS, dialect="excel")
    else:
        raise ValueError(f"unknown format: {fmt}")
    return len(rows)
