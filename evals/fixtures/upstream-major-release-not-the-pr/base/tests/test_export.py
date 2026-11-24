import io
import json
from datetime import date
from decimal import Decimal

import pytest

from reportcli.export import write_report
from reportcli.sources import Row


@pytest.fixture
def sample_rows():
    return [
        Row(date(2026, 11, 2), "ops", "cloud", Decimal("1840.22"), "EUR"),
        Row(date(2026, 11, 9), "ops", "saas, tools", Decimal("312.00"), "EUR"),
        Row(date(2026, 11, 16), "eng", "cloud", Decimal("2210.75"), "EUR"),
    ]


def test_json_round_trips(sample_rows):
    out = io.StringIO()
    assert write_report(sample_rows, out, fmt="json") == 3
    assert json.loads(out.getvalue())[0]["account"] == "ops"


def test_csv_has_header(sample_rows):
    out = io.StringIO()
    write_report(sample_rows, out, fmt="csv")
    assert out.getvalue().splitlines()[0] == "date,account,category,amount,currency"


def test_csv_quotes_commas(sample_rows):
    out = io.StringIO()
    write_report(sample_rows, out, fmt="csv")
    assert '"saas, tools"' in out.getvalue()


def test_unknown_format(sample_rows):
    with pytest.raises(ValueError):
        write_report(sample_rows, io.StringIO(), fmt="xml")
