# Research: BFIS Minimal Hostility Awareness

**Date**: 2025-11-22  
**Feature**: 003-hostility-awareness

## Overview

This document captures research findings and design decisions for implementing minimal hostility awareness in BFIS. The feature extends existing `SnapshotReader` infrastructure to detect when hostilities have started by examining weapons data.

## Research Questions

### RQ-1: How to integrate HostilityDetector with existing SnapshotReader?

**Decision**: Create `HostilityDetector` as a separate class, instantiated once per `SnapshotReader` instance. `SnapshotReader.readContextOnce()` calls `HostilityDetector.detect()` after assembling the base context snapshot but before returning, passing the weapon cache and session hash.

**Rationale**: 
- Follows single-responsibility principle - detection logic separate from snapshot assembly
- Maintains existing `SnapshotReader` API (no breaking changes)
- Allows independent testing of hostility detection logic
- Matches existing BFIS module pattern (separate modules for different concerns)

**Alternatives considered**:
- Embed detection logic directly in `SnapshotReader`: Rejected - violates single-responsibility, harder to test
- Separate service/process: Rejected - overkill for MVP, adds complexity and latency
- Plugin/strategy pattern: Rejected - unnecessary abstraction for single detection method

**Implementation pattern**: 
```typescript
// In SnapshotReader.readContextOnce(), after assembling contextSnapshot:
const hostilityAwareness = this.hostilityDetector.detect(
  this.weaponCache,
  baseSnapshot.sessionHash
);
contextSnapshot.hostility = hostilityAwareness;
```

### RQ-2: How to manage in-memory state lifecycle?

**Decision**: Maintain state in `HostilityDetector` instance fields (`hostilitiesStarted`, `hostilitiesStartTime`, `lastSessionHash`). State persists for the lifetime of the `HostilityDetector` instance (which matches `SnapshotReader` instance lifetime).

**Rationale**:
- Simple and sufficient for MVP - no persistence needed
- State automatically cleared when service restarts (acceptable limitation per spec)
- Session-based reset handled by comparing `sessionHash` on each call
- No external dependencies (no database, no file I/O)

**Alternatives considered**:
- Persist to disk/database: Rejected - out of scope for MVP, adds complexity
- Redis/external cache: Rejected - unnecessary for single-instance service
- Stateless with external storage: Rejected - violates "in-memory only" requirement

**State management pattern**:
```typescript
class HostilityDetector {
  private hostilitiesStarted: boolean = false;
  private hostilitiesStartTime?: number;
  private lastSessionHash: string | null = null;
  
  detect(weaponCache: Map<number, DecodedWeapon>, sessionHash: string): HostilityAwareness {
    // Reset on session change
    if (this.lastSessionHash !== null && this.lastSessionHash !== sessionHash) {
      this.hostilitiesStarted = false;
      this.hostilitiesStartTime = undefined;
    }
    // ... detection logic
  }
}
```

### RQ-3: How to handle weapon cache access and errors?

**Decision**: Pass weapon cache as parameter to `detect()` method. If weapon cache is empty (due to error or no weapons), treat as "no hostilities detected" (`hostilitiesStarted: false`). Errors are already handled by `SnapshotReader` (returns empty buffer, logs structured events).

**Rationale**:
- Minimal coupling - `HostilityDetector` doesn't need direct access to `SnapshotReader`
- Error handling already implemented in `SnapshotReader.fetchWeapons()` (per spec-001)
- Graceful degradation - empty cache from errors results in safe default (false)
- Matches existing BFIS error handling pattern (fail gracefully, log errors)

**Alternatives considered**:
- Inject `SnapshotReader` into `HostilityDetector`: Rejected - creates tight coupling
- Expose weapon cache as public property: Rejected - breaks encapsulation
- Throw errors on empty cache: Rejected - violates graceful failure requirement

**Error handling pattern**:
```typescript
// SnapshotReader already handles errors:
const weaponsPromise = this.fetchWeapons(weaponsLastTime)
  .catch(err => {
    this.logger?.error("bfis-snapshot-http-error", {...});
    return new ArrayBuffer(0); // Empty buffer on error
  });

// HostilityDetector receives empty cache on error:
if (weaponCache.size === 0) {
  return { hostilitiesStarted: false, ... }; // Safe default
}
```

### RQ-4: How to structure logging for hostility events?

**Decision**: Use existing structured logger (`createStructuredLogger`) with event names following BFIS naming convention: `bfis-hostilities-started`, `bfis-hostilities-reset`, `bfis-hostilities-status` (debug level).

**Rationale**:
- Consistent with existing BFIS logging patterns (`bfis-snapshot-http-error`, `bfis-session-reset`)
- Structured JSON logs enable machine parsing and analysis
- Event names clearly indicate hostility-related events
- Debug-level status logs avoid noise while providing visibility

**Alternatives considered**:
- Separate logger instance: Rejected - unnecessary, existing logger sufficient
- Different event naming: Rejected - should follow BFIS conventions
- No debug logs: Rejected - need visibility for troubleshooting

**Logging pattern**:
```typescript
// On first detection:
this.logger?.info("bfis-hostilities-started", {
  sessionHash,
  hostilitiesStartTime,
  weaponCount: weaponCache.size,
});

// On session reset:
this.logger?.info("bfis-hostilities-reset", {
  previousSessionHash: this.lastSessionHash,
  newSessionHash: sessionHash,
});

// Debug status (if already started):
this.logger?.debug("bfis-hostilities-status", {
  sessionHash,
  hostilitiesStarted: true,
  hostilitiesStartTime,
  weaponCount: weaponCache.size,
});
```

### RQ-5: Where to define HostilityAwareness type?

**Decision**: Define `HostilityAwareness` as internal type in `bfis-service/src/context/types.ts` alongside `BfisContextSnapshot`. Extend `BfisContextSnapshot` interface to include `hostility: HostilityAwareness` field.

**Rationale**:
- Consistent with existing pattern - `BfisContextSnapshot` is already internal type in `context/types.ts`
- Not part of shared contract - hostility awareness is BFIS-internal, not exposed to Olympus
- Type co-location - related types in same file improves maintainability
- No shared schema changes - maintains separation of concerns

**Alternatives considered**:
- Add to `shared-schemas/index.ts`: Rejected - not part of BFIS ⇄ Olympus contract
- Separate types file: Rejected - unnecessary, fits naturally with context types
- Inline in `hostility-detector.ts`: Rejected - needs to be accessible for `BfisContextSnapshot`

**Type definition pattern**:
```typescript
// In bfis-service/src/context/types.ts:

export interface HostilityAwareness {
  hostilitiesStarted: boolean;
  hostilitiesStartTime?: number;
  sessionHash: string;
}

export interface BfisContextSnapshot {
  // ... existing fields ...
  hostility: HostilityAwareness; // NEW
}
```

### RQ-6: How to determine earliest weapon timestamp?

**Decision**: Iterate through all weapons in cache, find minimum `updateTime`. If cache is empty, `hostilitiesStartTime` remains `undefined`.

**Rationale**:
- Simple and efficient - O(n) iteration where n is weapon count (typically small)
- Uses existing weapon data structure (`DecodedWeapon.updateTime`)
- Handles multiple weapons correctly (per spec requirement)
- No additional data structures needed

**Alternatives considered**:
- Track timestamp on first detection only: Rejected - doesn't handle case where multiple weapons exist on first detection
- Use most recent timestamp: Rejected - violates spec requirement (earliest, not latest)
- Maintain separate timestamp tracking: Rejected - unnecessary complexity

**Implementation pattern**:
```typescript
if (!this.hostilitiesStarted && weaponCache.size > 0) {
  let earliestTime = Number.MAX_SAFE_INTEGER;
  for (const weapon of weaponCache.values()) {
    if (weapon.updateTime < earliestTime) {
      earliestTime = weapon.updateTime;
    }
  }
  this.hostilitiesStarted = true;
  this.hostilitiesStartTime = earliestTime;
}
```

## Summary

All research questions resolved. Implementation approach:
1. Create `HostilityDetector` class in new `hostility/` module
2. Integrate into `SnapshotReader.readContextOnce()` after context assembly
3. Maintain in-memory state with session-based reset
4. Use existing structured logger for events
5. Define types in `context/types.ts` as internal types
6. Handle errors gracefully (empty cache = no hostilities)

No external dependencies or complex patterns required. Feature builds cleanly on existing BFIS infrastructure.

