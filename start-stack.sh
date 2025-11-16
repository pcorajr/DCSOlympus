#!/bin/bash
# Start BFIS stack script
#
# Usage: ./start-stack.sh [dev|prod]
# Defaults to dev if no argument provided
#
# Per spec: Starts docker-compose with appropriate service
# - Dev: mounts volumes for hot reload (src/, shared-schemas/)
# - Prod: uses Dockerfile build
#
# TODO: Implement script logic

