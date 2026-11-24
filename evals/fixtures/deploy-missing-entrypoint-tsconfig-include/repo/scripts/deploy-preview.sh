#!/usr/bin/env bash
set -euo pipefail
pr="$1"
flyctl deploy --app "orders-api-pr-${pr}" --image "ghcr.io/example-org/orders-api:pr-${pr}" --ha=false
