# Quick Start: BFIS Context Snapshot

**Feature**: 002-context-snapshot  
**Date**: 2025-11-17

## Overview

This guide provides a quick start for implementing the BFIS Context Snapshot feature. This extends the existing `SnapshotReader` to include rich battlefield context (airbases, bullseyes, spots, drawings, logs, weapons) alongside mission and units data.

## Prerequisites

- Spec-001 (BFIS Snapshot Ingestion & Binary Decoding) must be complete
- `SnapshotReader` class with all endpoint fetch methods implemented
- TypeScript 5.8.2+ with strict mode
- Node.js 20+ runtime
- Docker container for testing

## Implementation Steps

### Step 1: Create Context Normalization Module

Create `bfis-service/src/context/` directory:

```bash
mkdir -p bfis-service/src/context/__tests__
```

### Step 2: Define Internal Types

Create `bfis-service/src/context/types.ts` with:
- `BfisContextSnapshot` interface
- `NormalizedAirbase` interface
- `NormalizedBullseye` interface
- `NormalizedSpot` interface
- `NormalizedDrawing` interface
- `NormalizedLogEntry` interface
- `WeaponsSummary` interface

See [data-model.md](./data-model.md) for complete field definitions.

### Step 3: Implement Normalization Functions

Create `bfis-service/src/context/normalizers.ts` with:

```typescript
export function normalizeAirbases(raw: unknown): NormalizedAirbase[]
export function normalizeBullseyes(raw: unknown): NormalizedBullseye[]
export function normalizeSpots(raw: unknown): NormalizedSpot[]
export function normalizeDrawings(raw: unknown): NormalizedDrawing[]
export function normalizeLogs(raw: unknown): NormalizedLogEntry[]
export function buildWeaponsSummary(decodedWeapons: unknown): WeaponsSummary
```

**Key Requirements**:
- Sort all arrays by ID (ascending) for deterministic output (FR-015)
- Preserve only fields needed for decision-making (FR-020)
- Handle missing critical fields (ID) gracefully - log warning, attempt normalization (FR-011)
- Handle missing optional fields silently - no warnings (FR-011)
- Throw descriptive errors on malformed data (caught by SnapshotReader)

### Step 4: Extend SnapshotReader

Add `readContextOnce()` method to `bfis-service/src/snapshot/snapshot-reader.ts`:

```typescript
async readContextOnce(): Promise<BfisContextSnapshot> {
  // 1. Get base snapshot (reuse readOnce())
  const baseSnapshot = await this.readOnce();
  
  // 2. Fetch all context endpoints (already implemented)
  const [airbasesData, bullseyesData, spotsData, drawingsData, logsData, weaponsBuffer] = 
    await Promise.all([
      this.fetchAirbases().catch(handleError("airbases")),
      this.fetchBullseyes().catch(handleError("bullseyes")),
      this.fetchSpots().catch(handleError("spots")),
      this.fetchDrawings().catch(handleError("drawings")),
      this.fetchLogs(this.lastTimes.logs || 0).catch(handleError("logs")),
      this.fetchWeapons(this.lastTimes.weapons || 0).catch(handleError("weapons")),
    ]);
  
  // 3. Decode weapons (if available)
  const decodedWeapons = weaponsBuffer ? await decodeWeapons(weaponsBuffer) : null;
  
  // 4. Normalize all context data
  const airbases = normalizeAirbases(airbasesData?.airbases);
  const bullseyes = normalizeBullseyes(bullseyesData?.bullseyes);
  const spots = normalizeSpots(spotsData?.spots);
  const drawings = normalizeDrawings(drawingsData?.drawings);
  const logs = normalizeLogs(logsData?.logs);
  const weaponsSummary = buildWeaponsSummary(decodedWeapons);
  
  // 5. Check for size warnings (1000+ entries)
  checkSizeWarnings({ airbases, bullseyes, spots, drawings, logs });
  
  // 6. Assemble and return context snapshot
  const contextSnapshot: BfisContextSnapshot = {
    base: baseSnapshot,
    airbases,
    bullseyes,
    spots,
    drawings,
    logs,
    weaponsSummary,
  };
  
  // 7. Log success event
  this.logger?.info("bfis-context-snapshot-ok", {
    snapshotId: baseSnapshot.snapshotId,
    sessionHash: baseSnapshot.sessionHash,
    unitCount: baseSnapshot.units.length,
    airbaseCount: airbases.length,
    bullseyeCount: bullseyes.length,
    spotCount: spots.length,
    drawingCount: drawings.length,
    logCount: logs.length,
    weaponsActiveCount: weaponsSummary.activeCount,
  });
  
  return contextSnapshot;
}
```

**Error Handling Helper**:
```typescript
function handleError(endpoint: string) {
  return (error: Error) => {
    // Log structured error with endpoint context
    this.logger?.error("bfis-snapshot-http-error", {
      endpoint,
      error: error.message,
      // ... other error details
    });
    // Return null to indicate failure (will result in empty array)
    return null;
  };
}
```

### Step 5: Add Structured Logging

Ensure all error/warning events extend existing event names with `endpoint` field:
- `bfis-snapshot-http-error` + `endpoint: "airbases"`
- `bfis-snapshot-decode-error` + `endpoint: "bullseyes"`
- `bfis-snapshot-empty-data` + `endpoint: "spots"` + `entryCount: 1500` (for size warnings)

### Step 6: Write Tests

Create `bfis-service/src/context/__tests__/normalizers.test.ts`:

```typescript
import { describe, test, assert } from "node:test";
import { normalizeAirbases, normalizeBullseyes, /* ... */ } from "../normalizers.js";

describe("normalizeAirbases", () => {
  test("normalizes valid airbase data", () => {
    const raw = { airbases: [{ id: "2", name: "Base A" }, { id: "1", name: "Base B" }] };
    const result = normalizeAirbases(raw.airbases);
    
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].id, "1"); // Sorted by ID
    assert.strictEqual(result[1].id, "2");
  });
  
  test("handles missing ID gracefully", () => {
    const raw = { airbases: [{ name: "Base A" }] }; // Missing ID
    // Should log warning but still attempt normalization
    // Implementation decides: skip entry or use fallback ID
  });
  
  test("produces deterministic output", () => {
    const raw = { airbases: [{ id: "2" }, { id: "1" }] };
    const result1 = normalizeAirbases(raw.airbases);
    const result2 = normalizeAirbases(raw.airbases);
    
    assert.deepStrictEqual(result1, result2); // Same output
  });
});
```

Extend `bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts`:

```typescript
describe("readContextOnce", () => {
  test("creates context snapshot with all data types", async () => {
    const snapshot = await reader.readContextOnce();
    
    assert.ok(snapshot.base); // Base snapshot present
    assert.ok(Array.isArray(snapshot.airbases));
    assert.ok(Array.isArray(snapshot.bullseyes));
    // ... verify all slices present
  });
  
  test("handles partial endpoint failures gracefully", async () => {
    // Mock airbases endpoint to fail
    // Verify snapshot still created with empty airbases array
  });
});
```

### Step 7: Run Tests in Docker

All tests must run in Docker container:

```bash
docker-compose exec bfis-service npm test
```

## Verification Checklist

- [ ] All normalization functions implemented
- [ ] All functions sort by ID (ascending)
- [ ] Critical field (ID) handling with warnings
- [ ] Optional field handling (no warnings)
- [ ] `readContextOnce()` method added to SnapshotReader
- [ ] Error handling for partial failures
- [ ] Structured logging with extended event names
- [ ] Size warnings at 1000+ entries
- [ ] Tests written and passing in Docker
- [ ] Performance target met (< 3 seconds)
- [ ] Deterministic output verified

## Common Pitfalls

1. **Forgetting to sort**: All normalized arrays must be sorted by ID
2. **Throwing on partial failures**: Individual endpoint failures should not throw
3. **Missing size warnings**: Log warnings at 1000+ entries per slice
4. **Testing on host**: All tests must run in Docker container
5. **Breaking readOnce()**: Ensure existing `readOnce()` method unchanged

## Next Steps

After implementation:
1. Run full test suite in Docker
2. Verify performance targets (< 3 seconds)
3. Check structured logs for all events
4. Validate deterministic output with identical inputs
5. Proceed to `/speckit.tasks` for task breakdown

## References

- [Specification](./spec.md)
- [Data Model](./data-model.md)
- [API Contract](./contracts/snapshot-reader-api.md)
- [Research](./research.md)

