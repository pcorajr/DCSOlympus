#
# BFIS service Dockerfile (multi-stage, Node 20 on Debian bookworm-slim)
#
# Build stage: install dependencies and compile TypeScript.
# Runtime stage: run compiled BFIS service with Node in a minimal image.
#

############################
# 1. Build stage
############################
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Copy BFIS service metadata and config
COPY bfis-service/package*.json bfis-service/tsconfig.json ./bfis-service/

# Copy shared schemas so TypeScript can compile imports from ../../../shared-schemas
# In Docker build, shared-schemas is at /app/shared-schemas, and bfis-service is at /app/bfis-service
# So from bfis-service/src, the path is ../../shared-schemas, but we use ../../../shared-schemas
# to match repo structure. We'll create a symlink or adjust the path.
COPY shared-schemas ./shared-schemas

WORKDIR /app/bfis-service

# Install all dependencies (including dev) for build.
# Using `npm install` here because this project does not ship a package-lock.json yet.
RUN npm install

# Copy source code
COPY bfis-service/src ./src

# Copy test script (for manual testing in Docker)
COPY bfis-service/test-snapshot-reader.ts ./test-snapshot-reader.ts

# Compile TypeScript
RUN npm run build

############################
# 2. Runtime stage
############################
FROM node:20-bookworm-slim AS runtime

WORKDIR /app/bfis-service

ENV NODE_ENV=production

# Install curl for optional healthchecks against Olympus frontend
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

# Copy shared schemas (for runtime type imports if any)
COPY --from=builder /app/shared-schemas /app/shared-schemas

# Copy BFIS service build artifacts and node_modules
COPY --from=builder /app/bfis-service/package*.json ./
COPY --from=builder /app/bfis-service/node_modules ./node_modules
COPY --from=builder /app/bfis-service/build ./build

# Default environment variables (override via docker-compose or env)
ENV BFIS_OLYMPUS_BASE_URL=http://192.168.1.4:3000/olympus \
    BFIS_LOG_LEVEL=info

# Optional healthcheck: ping Olympus frontend mission endpoint if BFIS_HEALTHCHECK_URL is set
# Example: BFIS_HEALTHCHECK_URL=http://192.168.1.4:3000/olympus/mission
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s \
  CMD if [ -n "$BFIS_HEALTHCHECK_URL" ]; then curl -fsS "$BFIS_HEALTHCHECK_URL" >/dev/null || exit 1; else exit 0; fi

# Entrypoint: run compiled BFIS service.
# The 'tsc' output preserves directory structure if multiple roots are included (e.g. shared-schemas + src)
# So 'build' contains 'bfis-service/src/index.js' instead of 'src/index.js' or just 'index.js'
CMD ["sh", "-c", "if [ -f build/bfis-service/src/index.js ]; then node build/bfis-service/src/index.js; elif [ -f build/src/index.js ]; then node build/src/index.js; elif [ -f build/index.js ]; then node build/index.js; else echo 'No BFIS entrypoint found in build/'; exit 1; fi"]
