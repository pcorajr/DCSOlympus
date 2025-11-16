#!/bin/bash
# Start BFIS stack script
#
# Usage: ./start-stack.sh [dev|prod]
# Defaults to dev if no argument provided

set -euo pipefail

MODE="${1:-dev}"

if [[ "$MODE" != "dev" && "$MODE" != "prod" ]]; then
  echo "Usage: $0 [dev|prod]"
  echo "  dev  - start bfis-service-dev profile (hot reload, volume mounts)"
  echo "  prod - start bfis-service profile (built image, no code mounts)"
  exit 1
fi

PROFILE="$MODE"
COMPOSE_FILE="bfis-service/docker-compose.yml"

echo "Starting BFIS stack in '$PROFILE' mode using $COMPOSE_FILE..."
# Always rebuild the BFIS image from scratch (no cache) to avoid
# stale Docker layers when iterating on BFIS code or config.
docker compose -f "$COMPOSE_FILE" --profile "$PROFILE" build --no-cache
docker compose -f "$COMPOSE_FILE" --profile "$PROFILE" up -d
echo "BFIS stack started with a fresh image."
