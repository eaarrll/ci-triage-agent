#!/usr/bin/env bash
set -euo pipefail

name="${1:?usage: deploy-preview.sh <preview-name>}"
npm ci --omit=dev
npm run build
aws lambda update-function-code \
  --function-name "shop-api-${name}" \
  --zip-file "fileb://$(./scripts/package-lambda.sh)" \
  --publish >/dev/null
echo "Deployed preview ${name}"
