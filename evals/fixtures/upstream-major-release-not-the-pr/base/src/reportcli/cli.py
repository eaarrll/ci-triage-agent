from __future__ import annotations

import sys

import click

from .export import write_report
from .ledger import fetch_rows


@click.group()
def main() -> None:
    """Finance report exports."""


@main.command()
@click.argument("report")
@click.option("--format", "fmt", type=click.Choice(["csv", "json"]), default="csv", show_default=True)
@click.option("--output", "-o", type=click.File("w"), default="-")
def export(report: str, fmt: str, output) -> None:
    """Export REPORT (e.g. monthly-spend) to a file or stdout."""
    count = write_report(fetch_rows(report), output, fmt)
    click.echo(f"wrote {count} rows", err=True)


if __name__ == "__main__":
    sys.exit(main())
