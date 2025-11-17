# Testing BFIS Snapshot Reader Against Real DCS Mission

**⚠️ CRITICAL: ALL testing MUST be performed in Docker container per AGENTS.md and constitution.**
**DO NOT run tests directly on host system - use Docker only.**

This guide shows how to test Phase 3 (User Story 1) implementation against your running DCS mission at `192.168.1.4`.

## Prerequisites

- DCS mission running on `192.168.1.4`
- Olympus frontend accessible at `http://192.168.1.4:3000`
- Credentials configured in `/home/dcs/.creds/olympus_env.txt`
- Docker installed and running

## Test in Docker Container (REQUIRED)

**Build the image (from repo root):**
```bash
docker build -f bfis-service/Dockerfile -t bfis-service .
```

**Run the test script in container:**
```bash
docker run --rm \
  --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  bfis-service \
  node build/bfis-service/test-snapshot-reader.js
```

## Run Node.js Test Suite (Integration Tests)

**In Docker (REQUIRED - do not run on host):**
```bash
docker run --rm \
  --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  bfis-service \
  node --test build/src/snapshot/__tests__/snapshot-reader.test.js
```

## Manual Testing (Node.js REPL in Docker)

**In Docker container (REQUIRED):**
```bash
docker run -it --rm \
  --network host \
  -v /home/dcs/.creds:/home/dcs/.creds:ro \
  bfis-service \
  node --input-type=module
```

Then in the REPL:
```javascript
import { loadConfig } from './build/src/config/config.js';
import { createStructuredLogger } from './build/src/logger/structured-logger.js';
import { SnapshotReader } from './build/src/snapshot/snapshot-reader.js';

const config = loadConfig();
console.log('Connecting to:', config.olympusBaseUrl);

const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
const reader = new SnapshotReader(config, logger);

// Test probe
await reader.probeMissionOnce();
console.log('✓ Probe successful');

// Test snapshot
const snapshot = await reader.readOnce();
console.log('\nSnapshot:', JSON.stringify(snapshot, null, 2));
```

## Expected Output

On success, you should see:
- ✓ Probe successful - BFIS can connect to Olympus
- Snapshot with real data from your mission:
  - `snapshotId`: UUID v4
  - `missionId`: Theatre name from your mission
  - `serverId`: Hostname (192.168.1.4)
  - `sessionHash`: Current mission session hash
  - `time`: ISO 8601 timestamp
  - `units`: Empty array (User Story 1 - units will be added in User Story 2)

## Troubleshooting

**Connection errors:**
- Verify Olympus is running: `curl http://192.168.1.4:3000/olympus/mission`
- Check credentials in `/home/dcs/.creds/olympus_env.txt`
- Verify network connectivity to `192.168.1.4`

**Authentication errors:**
- Check `OLYMPUS_GAME_MASTER_USERNAME` and `OLYMPUS_GAME_MASTER_PASSWORD` in creds file
- Verify credentials match your Olympus setup

**TypeScript errors:**
- Run `npm install` in `bfis-service/` directory
- Ensure `uuid` package is installed: `npm list uuid`

