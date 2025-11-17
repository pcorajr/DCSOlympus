# Research: BFIS Snapshot Ingestion & Binary Decoding

**Date**: 2025-11-16  
**Feature**: 001-bfis-snapshot-decoders  
**Status**: Complete

## Overview

This document resolves all technical unknowns and design decisions for implementing BFIS snapshot ingestion and binary decoding. All decisions are based on existing Olympus codebase patterns, constitution requirements, and best practices.

## Research Topics

### 1. Unit/Weapon Binary Format Structure

**Question**: How are units and weapons encoded in the binary buffer format?

**Decision**: Follow the existing Olympus frontend pattern exactly:
- Buffer format: First 8 bytes = `uint64` updateTime (milliseconds), remainder = variable-length unit/weapon data
- Data encoding: Incremental/differential format using `DataIndexes` enum
- Decoding pattern: Loop through buffer extracting unit/weapon IDs, then data fields via `DataIndexes` switch statements

**Rationale**: 
- Olympus frontend already implements this in `UnitsManager.update()` and `WeaponsManager.update()`
- Binary format is optimized for bandwidth (only changed fields sent)
- DataExtractor already ported to BFIS matches frontend implementation

**Alternatives Considered**:
- Request new JSON endpoints from Olympus → Rejected: violates "no new Olympus endpoints" constraint, adds latency
- Custom binary format → Rejected: would break compatibility with existing Olympus

**Implementation Pattern** (from `frontend/react/src/unit/unitsmanager.ts:234`):
```typescript
// 1. Extract updateTime (first 8 bytes)
const updateTime = Number(dataExtractor.extractUInt64());

// 2. Loop through buffer extracting units
while (dataExtractor.getSeekPosition() < buffer.byteLength) {
  const unitId = dataExtractor.extractUInt32();
  
  // 3. For new units, extract category first
  if (!unitExists(unitId)) {
    const datumIndex = dataExtractor.extractUInt8();
    if (datumIndex === DataIndexes.category) {
      const category = dataExtractor.extractString();
      createUnit(unitId, category);
    }
  }
  
  // 4. Update unit data using DataIndexes switch
  updateUnitData(unitId, dataExtractor);
}
```

**DataIndexes Enum** (from `frontend/react/src/constants/constants.ts:485`):
- Key indexes: `category`, `alive`, `coalition`, `name`, `unitName`, `unitID`, `groupID`, `position`, `speed`, `heading`, `state`, `endOfData` (255)
- Full enum has 50+ fields; BFIS MVP needs core subset matching `OlympusUnit` interface

**References**:
- `frontend/react/src/unit/unitsmanager.ts:234-266` (UnitsManager.update)
- `frontend/react/src/weapon/weaponsmanager.ts:58-89` (WeaponsManager.update)
- `frontend/react/src/unit/unit.ts:590-831` (Unit.setData switch statement)
- `frontend/react/src/weapon/weapon.ts:65-99` (Weapon.setData switch statement)

---

### 2. Polling Orchestration Pattern

**Question**: How to manage multiple endpoints with different polling intervals?

**Decision**: Sequential polling within `readOnce()` method, with caller managing timing intervals. No complex scheduler needed for MVP.

**Rationale**:
- Simpler than async scheduler (reduces complexity per Constitution Principle V)
- Caller (main loop) can control timing and handle errors gracefully
- Matches existing bootstrap pattern (`probeMissionOnce` is synchronous)
- Performance targets (< 3s poll cycle) achievable with sequential fetches

**Alternatives Considered**:
- Parallel fetching with Promise.all → Rejected: violates spec requirement for sequential order (mission → units → weapons → logs → others)
- Dedicated polling scheduler → Rejected: over-engineering for MVP, adds unnecessary complexity
- WebSocket/streaming → Rejected: out of scope, violates "no new Olympus endpoints" constraint

**Implementation Pattern**:
```typescript
async readOnce(): Promise<OlympusSnapshot> {
  // Fetch in specified order (FR-016)
  const mission = await this.fetchMission();
  const units = await this.fetchUnits();
  const weapons = await this.fetchWeapons();
  const logs = await this.fetchLogs();
  // ... other endpoints
  
  // Construct snapshot
  return this.constructSnapshot(mission, units, weapons, logs, ...);
}
```

**Timing Management**: Caller (future decision loop) will call `readOnce()` at appropriate intervals based on `BfisConfig.polling` settings.

---

### 3. Session Hash Change Detection During Poll Cycle

**Question**: How to detect and handle session hash changes between endpoints in the same poll cycle?

**Decision**: Check session hash after each endpoint fetch. If hash differs from `lastSessionHash`, abort immediately, reset state, throw error to trigger retry.

**Rationale**:
- Ensures data consistency (no mixing data from different missions)
- Matches spec clarification: "Abort current poll immediately, reset state, retry full poll cycle"
- Simple to implement: compare hash after each fetch

**Alternatives Considered**:
- Continue poll, detect at end → Rejected: violates data consistency requirement
- Log warning but continue → Rejected: spec requires abort and retry

**Implementation Pattern**:
```typescript
async readOnce(): Promise<OlympusSnapshot> {
  const mission = await this.fetchMission();
  this.checkSessionHash(mission.sessionHash); // May throw
  
  const units = await this.fetchUnits();
  this.checkSessionHash(units.sessionHash); // May throw
  
  // ... continue for all endpoints
}
```

---

### 4. Error Handling and Retry Patterns

**Question**: How should errors be handled and retried?

**Decision**: 
- HTTP errors: Log with context, throw error (caller handles retry on next poll cycle)
- Decode errors: Log with context, throw error (caller handles retry)
- Partial failures: Fail entire snapshot (per spec clarification)
- No automatic retries within `readOnce()` - let caller decide retry timing

**Rationale**:
- Matches spec: "throw, let caller decide" (spec-001.md:205)
- Keeps `readOnce()` simple and predictable
- Caller can implement backoff/retry logic if needed (post-MVP)

**Alternatives Considered**:
- Automatic retry with exponential backoff → Rejected: adds complexity, better handled at caller level
- Return partial snapshots → Rejected: violates spec clarification (fail entire snapshot)

**Implementation Pattern**:
```typescript
async fetchUnits(): Promise<ArrayBuffer> {
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      this.logger?.error("bfis-snapshot-http-error", {
        url, status: res.status, message: res.statusText
      });
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    return await res.arrayBuffer();
  } catch (err) {
    this.logger?.error("bfis-snapshot-http-error", {
      url, message: err instanceof Error ? err.message : String(err)
    });
    throw err;
  }
}
```

---

### 5. Testing Framework Choice

**Question**: Which testing framework should BFIS use?

**Decision**: Node.js built-in test runner (available in Node.js 20+). No external test framework dependencies.

**Rationale**:
- Node.js 20+ has built-in test runner (no additional dependencies)
- Matches "optimize for real world" principle (use what's available)
- All tests run in Docker container per AGENTS.md
- Sufficient for unit tests and integration tests

**Alternatives Considered**:
- Jest → Rejected: adds dependency, Node.js built-in is sufficient
- Mocha/Chai → Rejected: adds dependencies, unnecessary for MVP
- Vitest → Rejected: adds dependency, overkill for simple service

**Test Structure**:
```typescript
// bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
import { test } from "node:test";
import assert from "node:assert";

test("probeMissionOnce logs bfis-olympus-probe-ok on success", async () => {
  // Test implementation
});
```

**References**:
- Node.js 20+ test runner: https://nodejs.org/api/test.html
- AGENTS.md: "All testing MUST be performed using the Docker container"

---

### 6. Snapshot ID Generation

**Question**: How to generate unique snapshot IDs?

**Decision**: UUID v4 (random UUID) using `uuid` package v11.1.0 (already in dependencies).

**Rationale**:
- Matches spec clarification: "UUID v4 (random UUID)"
- Package already in `package.json`
- Provides uniqueness without coordination
- Standard format for traceability

**Implementation**:
```typescript
import { randomUUID } from "uuid";

const snapshotId = randomUUID(); // Returns UUID v4 string
```

---

### 7. Empty Data Handling

**Question**: How to handle empty responses (zero units, empty logs)?

**Decision**: Treat as valid snapshot but log warning. Empty data is acceptable (e.g., no units in mission, no new logs since last poll).

**Rationale**:
- Matches spec clarification: "Treat as valid snapshot but log warning"
- Empty data is a valid state, not an error
- Warning helps identify unusual but acceptable conditions

**Implementation Pattern**:
```typescript
if (units.length === 0) {
  this.logger?.warn("bfis-snapshot-empty-data", {
    endpoint: "units",
    snapshotId
  });
}
// Continue with empty array - valid snapshot
```

---

### 8. Large Data Handling and Baseline Logging

**Question**: How to handle very large binary buffers or high unit counts?

**Decision**: Process any size, log data sizes (buffer size in bytes, unit count) in every snapshot read event to establish baseline patterns. Future enhancement: log warnings for unusually large data once baseline is established.

**Rationale**:
- Matches spec clarification: "Process any size, log data sizes to establish baseline"
- No hard limits needed (let Olympus control data size)
- Baseline logging enables future anomaly detection

**Implementation Pattern**:
```typescript
this.logger?.info("bfis-snapshot-read-ok", {
  snapshotId,
  sessionHash,
  unitCount: units.length,
  unitsBufferSize: unitsBuffer.byteLength,
  weaponsBufferSize: weaponsBuffer.byteLength,
  // ... other size metrics
});
```

---

## Summary of Technical Decisions

| Topic | Decision | Rationale |
|-------|----------|-----------|
| Binary format | Follow Olympus frontend pattern exactly | Compatibility, existing implementation |
| Polling orchestration | Sequential within `readOnce()`, caller manages timing | Simplicity, matches spec order requirement |
| Session hash detection | Check after each fetch, abort on change | Data consistency |
| Error handling | Log and throw, caller handles retry | Simplicity, matches spec |
| Testing framework | Node.js built-in test runner | No dependencies, sufficient for MVP |
| Snapshot IDs | UUID v4 via `uuid` package | Matches spec, already in dependencies |
| Empty data | Valid but log warning | Matches spec clarification |
| Large data | Process any size, log sizes for baseline | Matches spec clarification |

## Implementation Readiness

✅ **All technical unknowns resolved**  
✅ **All decisions align with constitution**  
✅ **All decisions match spec requirements**  
✅ **Reference implementations identified in Olympus codebase**

**Next Steps**: Proceed to Phase 1 (Design & Contracts)

