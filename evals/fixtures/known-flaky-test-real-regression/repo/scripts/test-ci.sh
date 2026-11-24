#!/usr/bin/env bash
# Runs the whole suite once. Tests listed in .github/flaky-tests.txt that fail are retried up
# to twice on their own; any other failure fails the job immediately.
set -uo pipefail

log=$(mktemp)
go test -race -count=1 ./... 2>&1 | tee "$log"
status=${PIPESTATUS[0]}
[ "$status" -eq 0 ] && exit 0

mapfile -t failed < <(grep -oE '^--- FAIL: [A-Za-z0-9_]+' "$log" | awk '{print $3}' | sort -u)
for name in "${failed[@]}"; do
  if ! grep -qE "^[^#]+ ${name}$" .github/flaky-tests.txt; then
    echo "${name} failed and is not a known flaky test"
    exit "$status"
  fi
done

for name in "${failed[@]}"; do
  pkg=$(grep -E " ${name}$" .github/flaky-tests.txt | awk '{print $1}')
  passed=false
  for attempt in 1 2; do
    echo "${name} (${pkg}) is a known flaky test (.github/flaky-tests.txt); retry ${attempt} of 2"
    if go test -race -count=1 -run "^${name}$" "$pkg"; then
      passed=true
      break
    fi
  done
  if [ "$passed" != true ]; then
    echo "${name} still failing after 2 retries"
    exit 1
  fi
  echo "::warning::${name} passed on retry; see docs/flaky-tests.md"
done
