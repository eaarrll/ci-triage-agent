#!/usr/bin/env bash
# Starts the freshly built image and waits for /healthz before anything is pushed.
set -euo pipefail
image="$1"

docker run -d --name smoke -p 8080:8080 \
  -e NODE_ENV=production -e PORT=8080 -e SKIP_DB_CHECK=1 \
  -e DATABASE_URL=postgres://smoke@127.0.0.1:1/none \
  "$image"

echo "Waiting for http://localhost:8080/healthz ..."
for _ in $(seq 1 20); do
  if curl -fsS http://localhost:8080/healthz; then
    echo
    echo "Smoke test passed"
    exit 0
  fi
  sleep 1
done

echo "Service did not become healthy after 20 attempts; container logs:"
docker logs smoke || true
exit 1
