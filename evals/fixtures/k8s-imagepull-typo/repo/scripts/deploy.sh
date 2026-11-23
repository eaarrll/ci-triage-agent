#!/usr/bin/env bash
# Applies k8s/ to the cluster in the current kube context.
set -euo pipefail

NAMESPACE="${NAMESPACE:-web}"
MANIFESTS="${MANIFESTS:-k8s}"

info() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mwarning:\033[0m %s\n' "$*" >&2; }

apply() {
  info "Context: $(kubectl config current-context)"
  info "Server-side dry run"
  kubectl apply -f "$MANIFESTS/" --dry-run=server -o name
  info "Applying $MANIFESTS/ to namespace $NAMESPACE"
  kubectl apply -f "$MANIFESTS/"
  local image
  image="$(kubectl get deployment/web -n "$NAMESPACE" -o jsonpath='{.spec.template.spec.containers[0].image}')"
  info "deployment/web now targets $image"
}

case "${1:-}" in
  apply) apply ;;
  *)
    warn "usage: $0 apply"
    exit 64
    ;;
esac
