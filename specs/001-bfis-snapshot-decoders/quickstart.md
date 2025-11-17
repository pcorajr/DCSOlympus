# Quick Start: BFIS Snapshot Ingestion Implementation

**Date**: 2025-11-16  
**Feature**: 001-bfis-snapshot-decoders

## Overview

This guide helps developers quickly understand and implement the BFIS snapshot ingestion feature. It provides step-by-step instructions, code examples, and references to detailed documentation.

## Prerequisites

- Node.js 20+ installed
- Docker installed (for testing)
- Access to DCSOlympus repository
- Understanding of TypeScript and async/await patterns
- Familiarity with Olympus HTTP API endpoints

## Architecture Overview

```
SnapshotReader (main class)
  ├── Fetches endpoints (HTTP)
  ├── Decodes binary data (DataExtractor)
  ├── Tracks session state
  └── Constructs OlympusSnapshot

DataExtractor (already implemented)
  └── Low-level binary reading primitives

Unit/Weapon Decoders (to be implemented)
  └── High-level decoders using DataExtractor
```

## Implementation Steps

### Step 1: Understand Existing Code

**Review these files**:
1. `bfis-service/src/snapshot/snapshot-reader.ts` - Current bootstrap implementation
2. `bfis-service/src/snapshot/binary-decoder.ts` - DataExtractor (already implemented)
3. `bfis-service/src/types/internal.ts` - Internal BFIS types
4. `shared-schemas/index.ts` - Shared schema definitions (to be extended)

**Key patterns to understand**:
- How `probeMissionOnce()` works (authentication, headers, error handling)
- How `DataExtractor` reads binary data (little-endian, seek position)
- How Olympus frontend decodes units (see `frontend/react/src/unit/unitsmanager.ts:234`)

### Step 2: Extend Shared Schemas

**File**: `shared-schemas/index.ts`

Add the following interfaces (per spec-001.md and data-model.md):

```typescript
export interface OlympusUnitPosition {
  lat: number;
  lon: number;
  altMeters: number;
}

export type OlympusCoalition = "BLUE" | "RED" | "NEUTRAL" | "UNKNOWN";

export interface OlympusUnit {
  unitId: string;
  groupId?: string;
  name?: string;
  coalition: OlympusCoalition;
  category: string;
  unitType: string;
  position: OlympusUnitPosition;
  status?: string;
}

export interface OlympusEvent {
  eventId: string;
  time: string;
  type: string;
  unitId?: string;
  details?: Record<string, unknown>;
}

export interface OlympusSnapshot {
  snapshotId: string;
  missionId: string;
  serverId: string;
  sessionHash: string;
  time: string;
  units: OlympusUnit[];
  events?: OlympusEvent[];
}
```

### Step 3: Implement Unit Decoder

**File**: `bfis-service/src/snapshot/unit-decoder.ts`

Create a high-level decoder that uses `DataExtractor` to decode units from binary buffer:

```typescript
import { DataExtractor } from "./binary-decoder.js";
import type { OlympusUnit, OlympusCoalition } from "../../../shared-schemas/index.js";

/**
 * Decodes units from binary buffer.
 * 
 * Format: First 8 bytes = updateTime (uint64), remainder = unit data
 * Unit data: [unitId (uint32), datumIndex (uint8), value, ...] repeated
 * 
 * @param buffer - Binary buffer from GET /olympus/units
 * @returns Object with updateTime and decoded units array
 */
export function decodeUnits(buffer: ArrayBuffer): {
  updateTime: number;
  units: OlympusUnit[];
} {
  const extractor = new DataExtractor(buffer);
  
  // Extract updateTime (first 8 bytes)
  const updateTime = Number(extractor.extractUInt64());
  const units: OlympusUnit[] = [];
  
  // Loop through buffer extracting units
  while (extractor.getSeekPosition() < buffer.byteLength) {
    const unitId = extractor.extractUInt32().toString();
    
    // For new units, category must come first
    // For existing units, decode data fields
    // ... (implement DataIndexes switch pattern from frontend)
  }
  
  return { updateTime, units };
}
```

**Reference**: See `frontend/react/src/unit/unitsmanager.ts:234-266` and `frontend/react/src/unit/unit.ts:590-831` for complete decoding pattern.

### Step 4: Implement Weapon Decoder

**File**: `bfis-service/src/snapshot/weapon-decoder.ts`

Similar to unit decoder, but for weapons. Reference: `frontend/react/src/weapon/weaponsmanager.ts:58-89`

**Note**: Weapons may be deferred to post-MVP if not needed for initial decision-making.

### Step 5: Implement readOnce() Method

**File**: `bfis-service/src/snapshot/snapshot-reader.ts`

Extend `SnapshotReader` class with `readOnce()` method:

```typescript
import { randomUUID } from "uuid";
import type { OlympusSnapshot } from "../../../shared-schemas/index.js";
import { decodeUnits } from "./unit-decoder.js";

async readOnce(): Promise<OlympusSnapshot> {
  // 1. Fetch mission (JSON)
  const mission = await this.fetchMission();
  this.checkSessionHash(mission.sessionHash);
  
  // 2. Fetch units (binary)
  const unitsBuffer = await this.fetchUnits();
  this.checkSessionHash(/* from latest JSON response */);
  const { updateTime: unitsUpdateTime, units } = decodeUnits(unitsBuffer);
  
  // 3. Fetch weapons (binary) - similar pattern
  // 4. Fetch logs (JSON) - similar pattern
  // 5. Fetch other endpoints (JSON)
  
  // 6. Construct snapshot
  const snapshot: OlympusSnapshot = {
    snapshotId: randomUUID(),
    missionId: mission.missionId,
    serverId: mission.serverId,
    sessionHash: mission.sessionHash,
    time: mission.time,
    units: units,
  };
  
  // 7. Update state
  this.lastSessionHash = snapshot.sessionHash;
  this.lastTimes.units = unitsUpdateTime;
  // ... update other lastTimes
  
  // 8. Log success
  this.logger?.info("bfis-snapshot-read-ok", {
    snapshotId: snapshot.snapshotId,
    sessionHash: snapshot.sessionHash,
    unitCount: units.length,
    unitsBufferSize: unitsBuffer.byteLength,
  });
  
  return snapshot;
}
```

### Step 6: Implement Helper Methods

**File**: `bfis-service/src/snapshot/snapshot-reader.ts`

Add private helper methods:

```typescript
private async fetchMission(): Promise<MissionResponse> {
  // Similar to probeMissionOnce() but parse JSON response
}

private async fetchUnits(): Promise<ArrayBuffer> {
  const url = `${this.config.olympusBaseUrl}/units?time=${this.lastTimes.units}`;
  // Fetch with auth headers, return ArrayBuffer
}

private checkSessionHash(newHash: string): void {
  if (this.lastSessionHash !== null && this.lastSessionHash !== newHash) {
    // Session reset detected
    this.logger?.info("bfis-session-reset", {
      oldHash: this.lastSessionHash,
      newHash: newHash,
    });
    this.lastTimes = { units: 0, weapons: 0, logs: 0 };
    throw new Error("Session hash changed during poll cycle");
  }
}
```

### Step 7: Add Tests

**File**: `bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts`

Create tests using Node.js built-in test runner:

```typescript
import { test } from "node:test";
import assert from "node:assert";
import { SnapshotReader } from "../snapshot-reader.js";

test("readOnce constructs snapshot with units", async () => {
  // Mock fetch responses
  // Create SnapshotReader
  // Call readOnce()
  // Assert snapshot structure
  // Assert logging events
});
```

**Test Requirements** (per spec-001.md:321-338):
- Assert `bfis-olympus-probe-ok` on successful probe
- Assert `bfis-snapshot-read-ok` includes `snapshotId`, `sessionHash`, `unitCount`
- Test session hash change detection
- Test empty data handling
- Test error handling

**Run tests in Docker**:
```bash
docker-compose -f bfis-service/docker-compose.yml run --rm bfis-service-dev npm test
```

## Key Implementation Details

### Binary Format

- **First 8 bytes**: `uint64` updateTime (milliseconds, little-endian)
- **Remainder**: Variable-length unit/weapon data
- **Data encoding**: Incremental using `DataIndexes` enum (see `frontend/react/src/constants/constants.ts:485`)
- **End marker**: `DataIndexes.endOfData` (255) indicates end of unit/weapon data

### Session Hash Tracking

- Extract `sessionHash` from every JSON response (mission, logs, etc.)
- Check after each fetch - abort immediately if changed
- Reset `lastTimes` on session hash change (forces full refresh)

### Error Handling

- **HTTP errors**: Log `bfis-snapshot-http-error`, throw error
- **Decode errors**: Log `bfis-snapshot-decode-error`, throw error
- **Session hash change**: Log `bfis-session-reset`, reset state, throw error
- **No retries**: Let caller handle retry timing

### Logging

All operations must log structured JSON events:
- Success: `bfis-snapshot-read-ok` with size metrics
- Errors: `bfis-snapshot-http-error`, `bfis-snapshot-decode-error`
- Warnings: `bfis-snapshot-empty-data`
- Session: `bfis-session-reset`

## Testing Strategy

### Unit Tests

Test individual components:
- `DataExtractor` methods (already has tests)
- `decodeUnits()` with synthetic buffers
- `decodeWeapons()` with synthetic buffers
- `SnapshotReader.readOnce()` with mocked fetch

### Integration Tests

Test end-to-end flow:
- Real HTTP requests to Olympus (in Docker)
- Verify snapshot structure
- Verify logging events
- Verify session hash detection

### Test Data

Create synthetic binary buffers matching Olympus format:
- Reference: `frontend/server/src/demo/demo.ts:234-354` (demo data generator)
- Use `DataExtractor` in reverse to create test buffers

## Common Pitfalls

1. **Forgetting to check session hash after each fetch** - Can lead to mixed data from different missions
2. **Not handling empty data** - Empty arrays are valid, but should log warning
3. **Incorrect binary decoding order** - Must match frontend pattern exactly
4. **Not updating lastTimes** - Breaks incremental polling
5. **Mutating snapshots** - Snapshots must be immutable (FR-018)

## Next Steps

After implementing snapshot ingestion:

1. **Wire into main loop**: Call `readOnce()` from main BFIS loop at configured intervals
2. **Add decision logic**: Use snapshots for decision-making (separate spec)
3. **Add command adapter**: Send commands back to Olympus (separate spec)
4. **Add NDJSON logging**: Log decisions with snapshot metadata (separate spec)

## References

- **Spec**: `docs/integration/bfis/spec-001.md`
- **Integration Strategy**: `docs/integration/bfis/bfis_olympus_integration_strategy.md`
- **Endpoint Inventory**: `docs/integration/bfis/bfis_olympus_endpoint_inventory.md`
- **Frontend Decoding**: `frontend/react/src/unit/unitsmanager.ts`, `frontend/react/src/weapon/weaponsmanager.ts`
- **DataExtractor**: `frontend/react/src/server/dataextractor.ts`
- **DataIndexes**: `frontend/react/src/constants/constants.ts:485`

## Getting Help

- Review existing code in `bfis-service/src/snapshot/`
- Check Olympus frontend code for decoding patterns
- Refer to constitution: `docs/CONSTITUTION.md`
- Check agent guidelines: `AGENTS.md`

