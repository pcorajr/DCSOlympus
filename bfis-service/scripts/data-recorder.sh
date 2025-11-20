#!/bin/bash
# BFIS Data Recorder Script
#
# Records complete battlefield snapshots to JSON files for analysis.
# Captures EVERYTHING: units (with human/controlled), weapons (full details),
# logs, airbases, bullseyes, spots, drawings.
#
# Usage: ./bfis-service/scripts/data-recorder.sh [interval-seconds]
#
# Interval range: 1-5 seconds (default: 2 seconds)
# Output: bfis-service/logs/snapshot_*.json
#
# Requirements:
# - Docker must be running
# - bfis-service Docker image must be built
# - Olympus must be running with a mission loaded
# - Credentials must be in /home/dcs/.creds/olympus_env.txt

set -euo pipefail

INTERVAL="${1:-2}"

# Validate interval range (1-5 seconds)
if ! [[ "$INTERVAL" =~ ^[1-5]$ ]]; then
  echo "Error: Interval must be between 1 and 5 seconds"
  echo "Received: ${INTERVAL}"
  echo "Usage: $0 [interval-seconds]"
  echo "  interval-seconds: 1-5 (default: 2)"
  exit 1
fi

# Get absolute path to script directory and repo root
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Ensure logs directory exists
mkdir -p "$REPO_ROOT/bfis-service/logs"

echo "Starting BFIS Data Recorder..."
echo "Interval: ${INTERVAL} seconds"
echo "Output: $REPO_ROOT/bfis-service/logs/snapshot_*.json"
echo "Press Ctrl+C to stop"
echo ""

# Run the recorder in Docker
docker run --rm --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  -v "$REPO_ROOT/bfis-service/logs:/app/bfis-service/logs" \
  bfis-service \
  node build/bfis-service/src/scripts/data-recorder.js "${INTERVAL}"

