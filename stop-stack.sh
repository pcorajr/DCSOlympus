#!/bin/bash
# Stop BFIS stack script
#
# Stops and removes containers
# Optional: pass a profile (dev|prod) to limit scope, defaults to all

set -euo pipefail

PROFILE="${1:-all}"
COMPOSE_FILE="bfis-service/docker-compose.yml"

echo "Stopping BFIS stack (profile: $PROFILE)..."

if [[ "$PROFILE" == "all" ]]; then
  docker compose -f "$COMPOSE_FILE" down
else
  # There is no native profile-specific down; we rely on service names.
  if [[ "$PROFILE" == "dev" ]]; then
    docker compose -f "$COMPOSE_FILE" stop bfis-service-dev || true
    docker compose -f "$COMPOSE_FILE" rm -f bfis-service-dev || true
  elif [[ "$PROFILE" == "prod" ]]; then
    docker compose -f "$COMPOSE_FILE" stop bfis-service || true
    docker compose -f "$COMPOSE_FILE" rm -f bfis-service || true
  else
    echo "Usage: $0 [dev|prod|all]"
    exit 1
  fi
fi

echo "BFIS stack stopped."
