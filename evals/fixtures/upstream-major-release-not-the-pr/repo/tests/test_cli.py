from datetime import date
from decimal import Decimal

from click.testing import CliRunner

from reportcli import cli
from reportcli.sources import Row

ROWS = [Row(date(2026, 11, 2), "ops", "cloud", Decimal("1840.22"), "EUR")]


def test_help_lists_export():
    result = CliRunner().invoke(cli.main, ["--help"])
    assert "export" in result.output


def test_export_command_writes_csv(monkeypatch, tmp_path):
    monkeypatch.setattr(cli, "fetch_rows", lambda report: iter(ROWS))
    target = tmp_path / "out.csv"
    result = CliRunner().invoke(cli.main, ["export", "monthly-spend", "-o", str(target)], catch_exceptions=False)
    assert result.exit_code == 0
    assert target.read_text().startswith("date,account")
