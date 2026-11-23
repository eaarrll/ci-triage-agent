#!/usr/bin/env bash
set -euo pipefail
base="${1:?usage: smoke.sh <base-url>}"
for path in /healthz /readyz / /api/version; do
  code="$(curl -s -o /dev/null -w '%{http_code}' "$base$path")"
  echo "$path -> $code"
  [[ "$code" == 200 ]] || exit 1
done
