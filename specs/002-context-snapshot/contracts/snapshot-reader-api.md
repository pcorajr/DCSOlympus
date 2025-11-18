# API Contract: SnapshotReader.readContextOnce()

**Date**: 2025-11-17  
**Feature**: 002-context-snapshot  
**Component**: `bfis-service/src/snapshot/snapshot-reader.ts`

## Overview

This document defines the API contract for the new `readContextOnce()` method added to `SnapshotReader`. This is an **internal API** for BFIS use only (not exposed as HTTP endpoint).

## Method Signature

```typescript
/**
 * Read a full context snapshot from Olympus.
 *
 * Builds on readOnce() to include mission + units (base snapshot)
 * and attaches normalized airbases, bullseyes, spots, drawings,
 * logs, and a basic weapons summary.
 *
 * Per FR-007: Assembles all context data together with mission and units
 * data into a single unified context snapshot object.
 *
 * Per FR-008, FR-009: Handles partial endpoint failures gracefully -
 * if individual context endpoints fail, logs errors and continues with
 * available data, producing snapshot with empty arrays for failed slices.
 *
 * Per FR-012, FR-013: Detects session hash changes and clears caches,
 * treating all context slices as fresh data for new session.
 *
 * Per FR-015: Produces deterministic output - same input always produces
 * same normalized output (same ordering, same field presence).
 *
 * Per FR-016: Logs successful context snapshot creation with structured
 * metadata including snapshot ID, session hash, and counts for each
 * context slice type.
 *
 * @returns Complete BfisContextSnapshot with all context data
 * @throws Error only if base snapshot creation fails (mission/units endpoints fail)
 *   - Individual context endpoint failures do not throw (graceful degradation)
 *
 * @see FR-007, FR-008, FR-009, FR-012, FR-013, FR-015, FR-016
 */
async readContextOnce(): Promise<BfisContextSnapshot>
```

## Input Contract

**Parameters**: None

**Preconditions**:
- `SnapshotReader` instance must be initialized with valid `BfisConfig`
- Olympus endpoints must be accessible (network connectivity)
- Authentication credentials must be valid (per `BfisConfig.olympusAuth`)

## Output Contract

**Return Type**: `Promise<BfisContextSnapshot>`

**Postconditions**:
- Returned snapshot is immutable (frozen/sealed)
- `base` field contains valid `OlympusSnapshot` (from `readOnce()`)
- All context array fields (`airbases`, `bullseyes`, `spots`, `drawings`, `logs`) are present (never null/undefined, may be empty arrays)
- `weaponsSummary` is always present (never null/undefined)
- All normalized arrays are sorted by ID (ascending) for deterministic output
- Structured log event `bfis-context-snapshot-ok` is emitted with metadata

## Error Contract

### Error Types

1. **Base Snapshot Failure**: If `readOnce()` fails (mission/units endpoints fail)
   - **Thrown as**: `Error` with descriptive message
   - **Logged as**: Existing events from `readOnce()` (`bfis-snapshot-http-error`, `bfis-snapshot-decode-error`)
   - **Behavior**: Method throws, no context snapshot returned

2. **Individual Context Endpoint HTTP Errors**
   - **Thrown as**: Not thrown (graceful degradation)
   - **Logged as**: `bfis-snapshot-http-error` extended with `endpoint` field (e.g., `"airbases"`, `"bullseyes"`)
   - **Behavior**: Snapshot still created with empty array for failed slice

3. **Individual Context Endpoint Parse/Normalization Errors**
   - **Thrown as**: Not thrown (graceful degradation)
   - **Logged as**: `bfis-snapshot-decode-error` extended with `endpoint` field
   - **Behavior**: Snapshot still created with empty array for failed slice

4. **Missing Critical Fields (ID)**
   - **Thrown as**: Not thrown (graceful degradation)
   - **Logged as**: Structured warning (event name TBD, but extends existing pattern)
   - **Behavior**: Normalization attempted with available data, entry may be skipped or use fallback ID

### Error Handling Strategy

- **Partial failures are non-fatal**: Individual context endpoint failures do not prevent snapshot creation
- **Base snapshot failure is fatal**: If mission/units fail, entire context snapshot fails
- **All errors logged**: Every failure is logged with structured events for observability
- **No silent failures**: All error conditions produce log events

## Performance Contract

### Timing Guarantees

- **Context snapshot creation**: < 3 seconds (SC-006)
- Same target as `readOnce()` base snapshot creation
- Additional JSON endpoints are lightweight and should complete well within this window

### Resource Usage

- **Memory**: O(n) where n = total context entries across all slices
- **Network**: Sequential requests to all endpoints (no parallel fetching in MVP)
- **CPU**: Normalization is O(n log n) per slice due to sorting

## Logging Contract

### Structured Log Events

All log events follow the pattern: `{ ts, level, event, ...metadata }`

**Success Event**:
- `bfis-context-snapshot-ok`: Context snapshot created successfully
  - **Metadata**: `snapshotId`, `sessionHash`, `unitCount`, `airbaseCount`, `bullseyeCount`, `spotCount`, `drawingCount`, `logCount`, `weaponsActiveCount`

**Error Events** (extended from spec-001):
- `bfis-snapshot-http-error`: HTTP request failed for context endpoint
  - **Extended metadata**: `endpoint` (e.g., `"airbases"`, `"bullseyes"`), plus existing error details
- `bfis-snapshot-decode-error`: Parse/normalization failed for context endpoint
  - **Extended metadata**: `endpoint`, plus existing error context
- `bfis-snapshot-empty-data`: Context endpoint returned empty/minimal payload
  - **Extended metadata**: `endpoint`, `entryCount` (for size warnings at 1000+)

## Session Handling Contract

### Session Hash Changes

- **Detection**: Session hash checked after mission fetch (same as `readOnce()`)
- **Behavior**: When `sessionHash` changes:
  - Clear all internal caches (`unitCache`, `lastTimes`)
  - Treat all context slices as fresh data (no carryover from previous mission)
  - Log `bfis-session-reset` event (from spec-001)
- **Per FR-012, FR-013**: All context slices are treated as new data with no merging

## Deterministic Output Contract

Per FR-015:
- **Same input → same output**: Given identical raw Olympus responses, `readContextOnce()` always produces identical `BfisContextSnapshot`
- **Same ordering**: All normalized arrays sorted by ID (ascending)
- **Same field presence**: No random omissions or additions
- **Same data types**: No type coercion variations

## Thread Safety

**Not thread-safe**: `SnapshotReader` is designed for single-threaded Node.js execution. Multiple instances can be created for concurrent polling if needed, but each instance maintains its own state.

## Usage Example

```typescript
import { SnapshotReader } from "./snapshot-reader.js";
import type { BfisConfig } from "../config/config.js";
import type { StructuredLogger } from "../logger/structured-logger.js";

const config: BfisConfig = loadConfig();
const logger = createStructuredLogger(config.generalLogPath, config.logLevel);
const reader = new SnapshotReader(config, logger);

try {
  const contextSnapshot = await reader.readContextOnce();
  
  // Access base snapshot
  console.log(`Mission: ${contextSnapshot.base.missionId}`);
  console.log(`Units: ${contextSnapshot.base.units.length}`);
  
  // Access context slices
  console.log(`Airbases: ${contextSnapshot.airbases.length}`);
  console.log(`Bullseyes: ${contextSnapshot.bullseyes.length}`);
  console.log(`Spots: ${contextSnapshot.spots.length}`);
  console.log(`Drawings: ${contextSnapshot.drawings.length}`);
  console.log(`Logs: ${contextSnapshot.logs.length}`);
  console.log(`Active weapons: ${contextSnapshot.weaponsSummary.activeCount}`);
  
} catch (error) {
  // Only thrown if base snapshot fails (mission/units endpoints)
  console.error("Failed to create context snapshot:", error);
}
```

## Backward Compatibility

- **`readOnce()` unchanged**: Existing `readOnce()` method signature and behavior remain unchanged
- **No breaking changes**: This is a pure extension, no modifications to existing APIs
- **Internal types only**: `BfisContextSnapshot` and `Normalized*` types are internal (not exported from shared schemas yet)

