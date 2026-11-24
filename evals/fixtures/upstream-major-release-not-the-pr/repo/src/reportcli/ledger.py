from __future__ import annotations

import os
from collections.abc import Iterator

from .sources import Row


def fetch_rows(report: str) -> Iterator[Row]:
    """Streams rows for a report from the ledger API (LEDGER_URL)."""
    raise NotImplementedError(f"ledger client for {report} at {os.environ.get('LEDGER_URL')}")
