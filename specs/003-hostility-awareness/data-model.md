# Data Model: BFIS Minimal Hostility Awareness

**Date**: 2025-11-22  
**Feature**: 003-hostility-awareness

## Overview

This document defines the data entities, relationships, and validation rules for BFIS minimal hostility awareness functionality. All types are internal to BFIS (not part of shared schemas).

## Entity Definitions

### 1. HostilityAwareness (Internal Type)

**Location**: `bfis-service/src/context/types.ts`  
**Purpose**: Represents the current hostility detection state for a mission session. Provides a simple boolean signal that combat has begun, plus optional metadata for debugging and analysis.

**Fields**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hostilitiesStarted` | `boolean` | Yes | Whether hostilities have started in the current mission session. Set to `true` when first weapon detected, remains `true` for entire session until `sessionHash` changes. |
| `hostilitiesStartTime` | `number \| undefined` | No | Timestamp in milliseconds since epoch when hostilities were first detected. `undefined` if hostilities have not started yet. Reset to `undefined` when `sessionHash` changes. |
| `sessionHash` | `string` | Yes | Session hash identifying the mission session this state belongs to. Used to detect mission resets and reset the hostility flag. May be empty string if session hash is missing/invalid. |

**Validation Rules**:
- `hostilitiesStarted` must be `false` if `hostilitiesStartTime` is `undefined`
- `hostilitiesStarted` must be `true` if `hostilitiesStartTime` is defined
- `sessionHash` must always be present (never `null` or `undefined`, may be empty string)
- `hostilitiesStartTime` must be a valid timestamp (positive number, milliseconds since epoch) if defined

**State Transitions**:
- **Initial state**: `hostilitiesStarted: false`, `hostilitiesStartTime: undefined`, `sessionHash: <current>`
- **On first weapon detected**: `hostilitiesStarted: true`, `hostilitiesStartTime: <earliest weapon timestamp>`, `sessionHash: <current>`
- **On session hash change**: Reset to initial state with new `sessionHash`
- **On weapon cache empty after detection**: State remains unchanged (flag stays `true` per one-time detection principle)

**Relationships**:
- Part of `BfisContextSnapshot` (one-to-one relationship)
- Derived from `SnapshotReader.weaponCache` (Map<number, DecodedWeapon>)
- Associated with `OlympusSnapshot.sessionHash` (string)

### 2. BfisContextSnapshot (Extended Internal Type)

**Location**: `bfis-service/src/context/types.ts`  
**Purpose**: Unified snapshot containing all battlefield context. Extended from spec-002 to include hostility awareness signal.

**Fields** (existing from spec-002):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `base` | `OlympusSnapshot` | Yes | Core Olympus snapshot from shared schemas |
| `airbases` | `NormalizedAirbase[]` | Yes | Normalized airbase context |
| `bullseyes` | `NormalizedBullseye[]` | Yes | Normalized bullseye reference points |
| `spots` | `NormalizedSpot[]` | Yes | Normalized laser/IR spots |
| `drawings` | `NormalizedDrawing[]` | Yes | Normalized map drawings/annotations |
| `logs` | `NormalizedLogEntry[]` | Yes | Normalized log entries |
| `weaponsSummary` | `WeaponsSummary` | Yes | Basic weapons state summary |

**New Field** (this spec):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hostility` | `HostilityAwareness` | Yes | Hostility awareness signal for this snapshot. Always present, indicates whether hostilities have started in the current mission session. |

**Validation Rules**:
- `hostility` must always be present (never `null` or `undefined`)
- `hostility.sessionHash` must match `base.sessionHash` (consistency check)
- All existing validation rules from spec-002 still apply

**State Transitions**: Immutable once created. New snapshots created on each `readContextOnce()` call. `hostility` field populated during snapshot assembly.

### 3. DecodedWeapon (Existing Type - Reference Only)

**Location**: `bfis-service/src/snapshot/weapon-decoder.ts` (or similar)  
**Purpose**: Represents a decoded weapon from the `/olympus/weapons` binary endpoint. Used as input to hostility detection.

**Relevant Fields for Hostility Detection**:

| Field | Type | Description |
|-------|------|-------------|
| `weaponId` | `number` | Unique weapon identifier |
| `alive` | `boolean` | Whether weapon is active (`true`) or destroyed (`false`) |
| `updateTime` | `number` | Timestamp in milliseconds since epoch when weapon was last updated |

**Usage in Hostility Detection**:
- Presence of any weapon in cache (regardless of `alive` status) indicates hostilities started
- `updateTime` used to determine earliest weapon timestamp for `hostilitiesStartTime`
- Both `alive: true` and `alive: false` weapons count as "weapon fired"

## Data Flow

### Detection Flow

1. **Input**: `SnapshotReader.readContextOnce()` assembles base context snapshot
2. **Weapon Cache**: `SnapshotReader.weaponCache` (Map<number, DecodedWeapon>) contains current weapons
3. **Session Hash**: `baseSnapshot.sessionHash` identifies current mission session
4. **Detection**: `HostilityDetector.detect(weaponCache, sessionHash)` called
5. **Output**: `HostilityAwareness` object returned
6. **Integration**: `HostilityAwareness` attached to `BfisContextSnapshot.hostility`
7. **Return**: Complete `BfisContextSnapshot` returned to caller

### State Persistence Flow

1. **Initialization**: `HostilityDetector` instance created with `SnapshotReader`
2. **State Storage**: In-memory fields (`hostilitiesStarted`, `hostilitiesStartTime`, `lastSessionHash`)
3. **State Updates**: Modified on each `detect()` call based on weapon cache and session hash
4. **Session Reset**: State reset when `sessionHash` changes
5. **Service Restart**: State lost (in-memory only), detection starts fresh

## Validation Rules Summary

### HostilityAwareness Validation

- ✅ `hostilitiesStarted` is boolean
- ✅ `hostilitiesStartTime` is undefined OR positive number (milliseconds since epoch)
- ✅ `sessionHash` is string (may be empty)
- ✅ If `hostilitiesStarted` is `true`, `hostilitiesStartTime` must be defined
- ✅ If `hostilitiesStarted` is `false`, `hostilitiesStartTime` must be undefined

### BfisContextSnapshot Validation

- ✅ `hostility` field always present (never null/undefined)
- ✅ `hostility.sessionHash` matches `base.sessionHash` (consistency)
- ✅ All existing spec-002 validation rules still apply

### Error Handling Validation

- ✅ Empty weapon cache (from errors or no weapons) → `hostilitiesStarted: false`
- ✅ Missing/invalid session hash → treated as new session (reset state)
- ✅ Weapon cache becomes empty after detection → `hostilitiesStarted` remains `true`

## Type Definitions

```typescript
/**
 * Hostility awareness signal for a mission session.
 * 
 * Provides a simple boolean signal that combat has begun, without attempting
 * to track ongoing attacks, identify targets, or assess threat levels.
 * 
 * @see FR-001, FR-002, FR-003
 */
export interface HostilityAwareness {
  /**
   * Whether hostilities have started in the current mission session.
   * 
   * Set to true when the first weapon is detected, remains true for the
   * entire mission session until sessionHash changes.
   */
  hostilitiesStarted: boolean;

  /**
   * Timestamp (ms since epoch) when hostilities were first detected.
   * 
   * Undefined if hostilities have not started yet.
   * Reset to undefined when sessionHash changes.
   */
  hostilitiesStartTime?: number;

  /**
   * Session hash this hostility state is associated with.
   * 
   * Used to detect mission resets and reset the hostility flag.
   * May be empty string if session hash is missing/invalid.
   */
  sessionHash: string;
}

/**
 * Extended BfisContextSnapshot with hostility awareness.
 * 
 * @see FR-006
 */
export interface BfisContextSnapshot {
  // ... existing fields from spec-002 ...
  base: OlympusSnapshot;
  airbases: NormalizedAirbase[];
  bullseyes: NormalizedBullseye[];
  spots: NormalizedSpot[];
  drawings: NormalizedDrawing[];
  logs: NormalizedLogEntry[];
  weaponsSummary: WeaponsSummary;

  /**
   * Hostility awareness signal for this snapshot.
   * 
   * Indicates whether hostilities have started in the current mission session.
   * Always present, never null/undefined.
   */
  hostility: HostilityAwareness;
}
```

## Notes

- All types are internal to BFIS (not exported from `shared-schemas/index.ts`)
- Types extend existing `BfisContextSnapshot` from spec-002
- No breaking changes to existing `BfisContextSnapshot` consumers (new field is additive)
- State is in-memory only (not persisted, lost on service restart)
- Detection is deterministic (same inputs → same outputs)

