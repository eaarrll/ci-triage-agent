"""Fetch the FX reference table the test-suite pins conversions to, and write it as JSON."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://fx-feed.example.org/v1/reference.json"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--url", default=os.environ.get("FX_FEED_URL", DEFAULT_URL))
    args = parser.parse_args()

    with urllib.request.urlopen(args.url, timeout=20) as resp:
        body = resp.read()
        print(f"GET {args.url} -> {resp.status} ({len(body) / 1024:.1f} kB)")
    table = json.loads(body)
    if table.get("base") != "EUR" or not table.get("rates"):
        print("unexpected feed payload", file=sys.stderr)
        return 1

    print(f"{len(table['rates'])} rates, base {table['base']}, published {table['published']}")
    for notice in table.get("notices", []):
        print(f"notice: {notice}")

    table["source"] = args.url
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(table, indent=2, sort_keys=True))
    print(f"wrote {args.out} ({len(table['rates'])} rates)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
