#!/bin/bash
# Commander Battle Review Script
#
# Runs the BFIS commander battle state review script in Docker.
# Provides comprehensive end-to-end data capture and analysis.
#
# Usage:
#   ./bfis-service/scripts/commander-battle-review.sh
#
# Requirements:
#   - Docker must be running
#   - bfis-service Docker image must be built
#   - Olympus must be running with a mission loaded

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$REPO_ROOT"

# Run the script in Docker with timeout and log filtering
timeout 30 docker run --rm --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  -v /home/dcs/DCSOlympus/bfis-service/logs:/app/bfis-service/logs \
  bfis-service \
  node build/bfis-service/src/scripts/commander-battle-review.js \
  2>&1 | grep -v '"ts":' | grep -v '"level":' | grep -v '"event":' | grep -v 'bfis-unit-decode' | grep -v 'bfis-binary-fetch' | grep -v 'bfis-context-snapshot-ok'

