#!/bin/bash
# Stop BFIS stack script
#
# Stops and removes containers
# Optional: pass a profile (dev|prod) to limit scope, defaults to all
# After stopping compose services, kills all remaining running Docker containers

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

# Kill all remaining running Docker containers
echo "Stopping all remaining running Docker containers..."
RUNNING_CONTAINERS=$(docker ps -q)
if [[ -n "$RUNNING_CONTAINERS" ]]; then
  echo "Found running containers, stopping them..."
  docker stop $RUNNING_CONTAINERS || true
  docker rm $RUNNING_CONTAINERS || true
  echo "All running containers stopped and removed."
else
  echo "No running containers found."
fi

echo "BFIS stack stopped."
