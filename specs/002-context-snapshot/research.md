# Research: BFIS Context Snapshot

**Date**: 2025-11-17  
**Feature**: 002-context-snapshot  
**Status**: Complete

## Overview

This document captures research and technical decisions for implementing context snapshot functionality in BFIS. All clarifications from the specification phase have been resolved, and this document consolidates the technical approach.

## Technical Decisions

### Decision 1: Module Organization for Normalization Functions

**Decision**: Create new `bfis-service/src/context/` directory for context normalization functions.

**Rationale**: 
- Maintains clear separation between "reading" (SnapshotReader) and "normalizing" (context normalizers) concerns
- Follows single-responsibility principle from constitution
- Allows independent testing of normalization logic
- Makes it easy to extend with additional context types in future

**Alternatives Considered**:
- Co-locating normalizers in `bfis-service/src/snapshot/` alongside SnapshotReader
  - **Rejected**: Would mix concerns - SnapshotReader handles HTTP/state, normalizers handle data transformation
- Creating separate file in snapshot directory (`snapshot/context-normalizers.ts`)
  - **Rejected**: Less clear organization, harder to scale if more context processing logic is added

### Decision 2: Error Handling Strategy for Partial Failures

**Decision**: Allow partial endpoint failures - if one context endpoint fails, continue processing others and include available data in snapshot.

**Rationale**:
- Real-world resilience: network issues or endpoint failures shouldn't break entire snapshot
- Graceful degradation: BFIS can still make decisions with partial context
- Observability: all errors logged with structured events for monitoring
- Matches FR-008, FR-009 requirements

**Alternatives Considered**:
- Fail-fast: if any endpoint fails, fail entire snapshot
  - **Rejected**: Too brittle for real-world operations. Would cause unnecessary snapshot failures.
- Retry failed endpoints before continuing
  - **Rejected**: Adds complexity and latency. Better to log error and continue, let next poll cycle retry.

### Decision 3: Deterministic Sorting Strategy

**Decision**: Sort all normalized context arrays by ID/identifier in ascending order.

**Rationale**:
- Ensures deterministic output (FR-015 requirement)
- Makes snapshots comparable/diffable across polls
- ID/identifier is the critical field (always present per clarifications)
- Simple, consistent approach across all context types

**Alternatives Considered**:
- Preserve Olympus order (no sorting)
  - **Rejected**: Non-deterministic, makes testing and comparison difficult
- Type-specific sorting (e.g., airbases by name, spots by timestamp)
  - **Rejected**: Inconsistent approach, harder to maintain. ID sorting is universal.

### Decision 4: Field Preservation Strategy

**Decision**: Preserve only fields needed for decision-making, not all possible Olympus fields.

**Rationale**:
- Keeps normalized structures minimal and focused (FR-020)
- Reduces memory footprint
- Makes data model clear and intentional
- Easier to maintain and evolve

**Alternatives Considered**:
- Preserve all Olympus fields (pass-through approach)
  - **Rejected**: Unbounded payloads, unclear what's actually used, harder to maintain
- Preserve only critical fields (ID only)
  - **Rejected**: Too minimal - need coordinates, coalition, basic metadata for decisions

### Decision 5: Log Event Naming Strategy

**Decision**: Extend existing event names from spec-001 with endpoint/context fields rather than creating new event names.

**Rationale**:
- Maintains consistency with existing logging patterns
- Reduces event name proliferation
- Easier to query/filter logs by endpoint
- Matches clarification answer

**Alternatives Considered**:
- Create new event names for each context-specific event (e.g., `bfis-context-airbase-error`)
  - **Rejected**: Too many event names, harder to maintain consistency
- Use generic event names with detailed metadata
  - **Rejected**: Less discoverable, harder to filter by event type

### Decision 6: Internal vs. Shared Schema Types

**Decision**: Define `BfisContextSnapshot` and `Normalized*` types as internal types (in `bfis-service/src/types/` or similar), not exported from `shared-schemas/index.ts` yet.

**Rationale**:
- Spec explicitly states these are "internal" types for now
- Allows iteration on structure before committing to shared contract
- Keeps shared schemas stable while BFIS evolves
- Can promote to shared schemas later if Olympus needs them

**Alternatives Considered**:
- Export from shared-schemas immediately
  - **Rejected**: Premature - these are BFIS-internal structures. Olympus doesn't need to know about them.
- Define inline in SnapshotReader
  - **Rejected**: Better to have dedicated types file for maintainability and reuse

## Integration Points

### Existing Code Dependencies

1. **SnapshotReader class** (`bfis-service/src/snapshot/snapshot-reader.ts`)
   - All endpoint fetch methods already exist: `fetchMission()`, `fetchUnits()`, `fetchWeapons()`, `fetchLogs()`, `fetchAirbases()`, `fetchBullseyes()`, `fetchSpots()`, `fetchDrawings()`
   - Session handling logic (`lastSessionHash`, `lastTimes`) already implemented
   - Error handling patterns established

2. **Weapons decoder** (`bfis-service/src/snapshot/weapon-decoder.ts`)
   - Already decodes weapons binary data
   - Can derive `WeaponsSummary` from decoded weapons structure

3. **Structured logger** (`bfis-service/src/logger/structured-logger.ts`)
   - Already provides structured logging interface
   - Existing event names: `bfis-snapshot-http-error`, `bfis-snapshot-decode-error`, `bfis-snapshot-empty-data`

4. **Shared schemas** (`shared-schemas/index.ts`)
   - `OlympusSnapshot` type already defined (base snapshot)
   - Can reference but not modify for this spec

### Olympus API Endpoints

All required endpoints are already available:
- `GET /olympus/mission` - JSON
- `GET /olympus/units?time={t}` - Binary
- `GET /olympus/weapons?time={t}` - Binary
- `GET /olympus/logs?time={t}` - JSON
- `GET /olympus/airbases` - JSON
- `GET /olympus/bullseyes` - JSON
- `GET /olympus/spots` - JSON
- `GET /olympus/drawings` - JSON

All endpoints return common metadata fields: `time`, `sessionHash`, `load`, `frameRate`.

## Performance Considerations

### Latency Target
- **3 seconds** for complete context snapshot creation (SC-006)
- Same target as spec-001 base snapshot ensures no performance degradation
- Additional JSON endpoints are lightweight and should complete well within this window

### Data Volume
- Size warnings logged at **1000+ entries per slice type** (FR-017)
- All data normalized and included regardless of size
- Warnings help monitor for anomalies without blocking operations

### Deterministic Processing
- Sorting by ID ensures O(n log n) complexity per context slice
- Minimal field extraction keeps processing fast
- No complex transformations or aggregations

## Testing Strategy

### Unit Tests
- Normalization functions: test each normalizer with various input shapes
- Edge cases: empty arrays, missing fields, malformed data
- Deterministic output: same input → same output verification

### Integration Tests
- Full context snapshot creation with real Olympus endpoints
- Partial failure scenarios (some endpoints fail)
- Session hash change handling
- Performance: verify < 3 second target

### Test Location
- Normalizers: `bfis-service/src/context/__tests__/normalizers.test.ts`
- SnapshotReader extension: `bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts` (extend existing)

## Open Questions Resolved

All clarifications from specification phase have been resolved:
1. ✅ Performance target: 3 seconds (same as spec-001)
2. ✅ Size warning threshold: 1000+ entries per slice type
3. ✅ Critical fields: Only ID/identifier is critical
4. ✅ Sorting criteria: Sort by ID/identifier (ascending)
5. ✅ Log event naming: Extend existing events with endpoint fields

## Next Steps

1. Implement normalization functions in `bfis-service/src/context/normalizers.ts`
2. Extend `SnapshotReader` with `readContextOnce()` method
3. Add internal type definitions for `BfisContextSnapshot` and `Normalized*` types
4. Write comprehensive tests
5. Update structured logging with context-specific events

