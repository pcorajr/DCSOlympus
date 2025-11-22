# API Contract: HostilityDetector

**Feature**: 003-hostility-awareness  
**Date**: 2025-11-22  
**Type**: Internal API (BFIS service only)

## Overview

`HostilityDetector` is an internal class that detects when hostilities have started in a mission session by examining weapons data. It maintains in-memory state per mission session and integrates with `SnapshotReader` to provide hostility awareness in context snapshots.

## Class: HostilityDetector

**Location**: `bfis-service/src/hostility/hostility-detector.ts`  
**Visibility**: Internal (exported from module, used by `SnapshotReader`)

### Constructor

```typescript
constructor(logger?: StructuredLogger)
```

**Parameters**:
- `logger` (optional): Structured logger instance for event logging. If not provided, no logging occurs.

**Returns**: `HostilityDetector` instance

**Behavior**:
- Initializes with default state: `hostilitiesStarted: false`, `hostilitiesStartTime: undefined`, `lastSessionHash: null`
- Stores logger reference for event logging

### Method: detect

```typescript
detect(
  weaponCache: Map<number, DecodedWeapon>,
  sessionHash: string
): HostilityAwareness
```

**Purpose**: Update hostility awareness based on current weapons cache and session hash.

**Parameters**:
- `weaponCache`: Map of weaponId to DecodedWeapon from SnapshotReader. May be empty (no weapons or endpoint error).
- `sessionHash`: Current session hash from mission data. May be empty string if missing/invalid.

**Returns**: `HostilityAwareness` object with current state

**Behavior**:

1. **Session Reset Check**:
   - If `lastSessionHash !== null` and `lastSessionHash !== sessionHash`:
     - Reset `hostilitiesStarted` to `false`
     - Clear `hostilitiesStartTime` (set to `undefined`)
     - Log `bfis-hostilities-reset` event (if logger provided)
   - Update `lastSessionHash` to current `sessionHash`

2. **Hostility Detection**:
   - If `hostilitiesStarted` is `false` and `weaponCache.size > 0`:
     - Find earliest `updateTime` from all weapons in cache
     - Set `hostilitiesStarted` to `true`
     - Set `hostilitiesStartTime` to earliest timestamp
     - Log `bfis-hostilities-started` event (if logger provided)

3. **Status Logging** (if hostilities already started):
   - Log `bfis-hostilities-status` at debug level (if logger provided)

4. **Return**:
   - Return `HostilityAwareness` object with current state

**Error Handling**:
- Empty weapon cache (from errors or no weapons) → `hostilitiesStarted: false` (graceful degradation)
- Missing/invalid session hash → treated as new session (reset state, proceed with detection)
- Invalid weapon data → ignored (weapon cache filtering handled by SnapshotReader)

**Side Effects**:
- Modifies internal state (`hostilitiesStarted`, `hostilitiesStartTime`, `lastSessionHash`)
- Logs structured events (if logger provided)

**Thread Safety**: Not thread-safe. Intended for single-threaded Node.js event loop. One instance per `SnapshotReader`.

## Logging Events

### bfis-hostilities-started

**Level**: `info`  
**When**: First time hostilities are detected (weapon cache becomes non-empty)

**Payload**:
```typescript
{
  sessionHash: string;
  hostilitiesStartTime: number;  // milliseconds since epoch
  weaponCount: number;            // weaponCache.size
}
```

### bfis-hostilities-reset

**Level**: `info`  
**When**: Session hash changes (mission reset detected)

**Payload**:
```typescript
{
  previousSessionHash: string | null;
  newSessionHash: string;
}
```

### bfis-hostilities-status

**Level**: `debug`  
**When**: Hostilities already started, called on subsequent polls

**Payload**:
```typescript
{
  sessionHash: string;
  hostilitiesStarted: true;
  hostilitiesStartTime: number;  // milliseconds since epoch
  weaponCount: number;            // weaponCache.size
}
```

## Extended API: BfisContextSnapshot

**Location**: `bfis-service/src/context/types.ts`  
**Extension**: Adds `hostility` field to existing `BfisContextSnapshot` from spec-002

### Field: hostility

**Type**: `HostilityAwareness`  
**Required**: Yes (always present, never null/undefined)  
**Description**: Hostility awareness signal for this snapshot

**Contract**:
- Always present in `BfisContextSnapshot` returned from `SnapshotReader.readContextOnce()`
- `hostility.sessionHash` must match `base.sessionHash` (consistency guarantee)
- Populated during snapshot assembly, before snapshot is returned

## Integration Contract

### SnapshotReader Integration

**Location**: `bfis-service/src/snapshot/snapshot-reader.ts`  
**Method**: `readContextOnce()`

**Integration Point**:
```typescript
// After assembling base contextSnapshot:
const hostilityAwareness = this.hostilityDetector.detect(
  this.weaponCache,
  baseSnapshot.sessionHash
);
contextSnapshot.hostility = hostilityAwareness;
```

**Contract**:
- `HostilityDetector` instance created once per `SnapshotReader` instance (in constructor or lazy initialization)
- `detect()` called on every `readContextOnce()` invocation
- Weapon cache passed from `SnapshotReader.weaponCache` (private field)
- Session hash from `baseSnapshot.sessionHash`
- Result attached to `contextSnapshot.hostility` before return

**Error Handling**:
- If `detect()` throws (should not happen), snapshot assembly fails (caller handles retry)
- Empty weapon cache handled gracefully by `HostilityDetector` (returns `hostilitiesStarted: false`)

## Guarantees

### Deterministic Behavior

- **Same inputs → same outputs**: Given identical `weaponCache` and `sessionHash`, `detect()` always produces identical `HostilityAwareness` output
- **Earliest timestamp**: `hostilitiesStartTime` is always the earliest `updateTime` from all weapons in cache
- **One-time detection**: Once `hostilitiesStarted` is `true`, it remains `true` for entire session (even if cache becomes empty)

### State Consistency

- **Session alignment**: `hostility.sessionHash` always matches `base.sessionHash` in same snapshot
- **State reset**: State resets when `sessionHash` changes (mission reset)
- **In-memory only**: State not persisted, lost on service restart

### Error Resilience

- **Graceful degradation**: Empty cache from errors → `hostilitiesStarted: false` (safe default)
- **Missing session hash**: Treated as new session, detection proceeds
- **No exceptions**: `detect()` does not throw (handles all error cases internally)

## Testing Contract

### Unit Test Requirements

- Test empty weapon cache → `hostilitiesStarted: false`
- Test weapon cache with weapons → `hostilitiesStarted: true`, `hostilitiesStartTime` set
- Test multiple weapons → `hostilitiesStartTime` is earliest timestamp
- Test session hash change → state resets
- Test state persistence across multiple calls (same session)
- Test destroyed weapons (`alive: false`) → still count as hostilities started
- Test missing/invalid session hash → treated as new session

### Integration Test Requirements

- Test `BfisContextSnapshot.hostility` populated correctly
- Test `hostility.sessionHash` matches `base.sessionHash`
- Test state reset on session hash change between polls
- Test logging events emitted correctly

## Notes

- Internal API only - not exposed to external consumers
- No breaking changes to existing `BfisContextSnapshot` consumers (new field is additive)
- Thread safety not required (single-threaded Node.js event loop)
- State lifecycle matches `SnapshotReader` instance lifecycle

