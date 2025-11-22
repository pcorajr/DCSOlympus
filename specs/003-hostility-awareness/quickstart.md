# Quick Start: BFIS Minimal Hostility Awareness

**Feature**: 003-hostility-awareness  
**Date**: 2025-11-22

## Overview

This guide provides a quick start for implementing BFIS minimal hostility awareness. This feature extends the existing `BfisContextSnapshot` to include a hostility awareness signal that detects when hostilities have started in a mission session.

## Prerequisites

- Spec-002 (BFIS Context Snapshot) must be complete
- `SnapshotReader` class with `readContextOnce()` method implemented
- `BfisContextSnapshot` type defined in `bfis-service/src/context/types.ts`
- TypeScript 5.8.2+ with strict mode
- Node.js 20+ runtime
- Docker container for testing

## Implementation Steps

### Step 1: Create Hostility Module Directory

Create the hostility detection module directory:

```bash
mkdir -p bfis-service/src/hostility/__tests__
```

### Step 2: Define HostilityAwareness Type

Add `HostilityAwareness` interface to `bfis-service/src/context/types.ts`:

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
```

### Step 3: Extend BfisContextSnapshot

Add `hostility` field to `BfisContextSnapshot` interface in `bfis-service/src/context/types.ts`:

```typescript
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

### Step 4: Implement HostilityDetector Class

Create `bfis-service/src/hostility/hostility-detector.ts`:

```typescript
import type { StructuredLogger } from "../logger/structured-logger.js";
import type { DecodedWeapon } from "../snapshot/weapon-decoder.js";
import type { HostilityAwareness } from "../context/types.js";

/**
 * Detects when hostilities have started in a mission session.
 * 
 * Examines weapons data from the snapshot to determine if any weapons
 * have been fired. Maintains in-memory state per mission session.
 * 
 * @see FR-001, FR-002, FR-003, FR-004, FR-005
 */
export class HostilityDetector {
  private hostilitiesStarted: boolean = false;
  private hostilitiesStartTime?: number;
  private lastSessionHash: string | null = null;
  private readonly logger?: StructuredLogger;

  /**
   * Create a new HostilityDetector instance.
   * 
   * @param logger - Optional structured logger for event logging
   */
  constructor(logger?: StructuredLogger) {
    this.logger = logger;
  }

  /**
   * Update hostility awareness based on current weapons cache and session hash.
   * 
   * @param weaponCache - Map of weaponId to DecodedWeapon from SnapshotReader
   * @param sessionHash - Current session hash from mission data
   * @returns HostilityAwareness object with current state
   */
  detect(
    weaponCache: Map<number, DecodedWeapon>,
    sessionHash: string
  ): HostilityAwareness {
    // Reset on session hash change
    if (this.lastSessionHash !== null && this.lastSessionHash !== sessionHash) {
      this.hostilitiesStarted = false;
      this.hostilitiesStartTime = undefined;
      
      this.logger?.info("bfis-hostilities-reset", {
        previousSessionHash: this.lastSessionHash,
        newSessionHash: sessionHash,
      });
    }
    this.lastSessionHash = sessionHash;

    // Detect if any weapon exists in cache (indicates weapon was fired)
    if (!this.hostilitiesStarted && weaponCache.size > 0) {
      // Find earliest weapon updateTime
      let earliestTime = Number.MAX_SAFE_INTEGER;
      for (const weapon of weaponCache.values()) {
        if (weapon.updateTime < earliestTime) {
          earliestTime = weapon.updateTime;
        }
      }
      
      this.hostilitiesStarted = true;
      this.hostilitiesStartTime = earliestTime;

      this.logger?.info("bfis-hostilities-started", {
        sessionHash,
        hostilitiesStartTime: earliestTime,
        weaponCount: weaponCache.size,
      });
    } else if (this.hostilitiesStarted) {
      // Debug log for status when already started
      this.logger?.debug("bfis-hostilities-status", {
        sessionHash,
        hostilitiesStarted: true,
        hostilitiesStartTime: this.hostilitiesStartTime,
        weaponCount: weaponCache.size,
      });
    }

    return {
      hostilitiesStarted: this.hostilitiesStarted,
      hostilitiesStartTime: this.hostilitiesStartTime,
      sessionHash,
    };
  }
}
```

**Key Implementation Notes**:
- Handle missing/invalid session hash by treating as new session (empty string is valid)
- Empty weapon cache (from errors) results in `hostilitiesStarted: false` (graceful degradation)
- Once `hostilitiesStarted` is `true`, it remains `true` for entire session (one-time detection)
- Both `alive: true` and `alive: false` weapons count as hostilities started

### Step 5: Integrate with SnapshotReader

Modify `bfis-service/src/snapshot/snapshot-reader.ts`:

1. **Add import**:
```typescript
import { HostilityDetector } from "../hostility/hostility-detector.js";
```

2. **Add field to SnapshotReader class**:
```typescript
export class SnapshotReader {
  // ... existing fields ...
  private readonly hostilityDetector: HostilityDetector;

  constructor(config: BfisConfig, logger?: StructuredLogger) {
    // ... existing initialization ...
    this.hostilityDetector = new HostilityDetector(logger);
  }
}
```

3. **Integrate in readContextOnce()**:
```typescript
async readContextOnce(): Promise<BfisContextSnapshot> {
  // ... existing snapshot assembly code ...
  
  // After assembling contextSnapshot, add hostility awareness:
  const hostilityAwareness = this.hostilityDetector.detect(
    this.weaponCache,
    baseSnapshot.sessionHash
  );
  
  const contextSnapshot: BfisContextSnapshot = {
    // ... existing fields ...
    hostility: hostilityAwareness,
  };
  
  return contextSnapshot;
}
```

### Step 6: Create Unit Tests

Create `bfis-service/src/hostility/__tests__/hostility-detector.test.ts`:

```typescript
import { HostilityDetector } from "../hostility-detector.js";
import type { DecodedWeapon } from "../../snapshot/weapon-decoder.js";

describe("HostilityDetector", () => {
  let detector: HostilityDetector;

  beforeEach(() => {
    detector = new HostilityDetector();
  });

  it("should return false when weapon cache is empty", () => {
    const result = detector.detect(new Map(), "session1");
    expect(result.hostilitiesStarted).toBe(false);
    expect(result.hostilitiesStartTime).toBeUndefined();
  });

  it("should detect hostilities when weapon cache has weapons", () => {
    const weaponCache = new Map<number, DecodedWeapon>();
    weaponCache.set(1, {
      weaponId: 1,
      updateTime: 1000,
      // ... other required fields
    } as DecodedWeapon);

    const result = detector.detect(weaponCache, "session1");
    expect(result.hostilitiesStarted).toBe(true);
    expect(result.hostilitiesStartTime).toBe(1000);
  });

  it("should use earliest weapon timestamp when multiple weapons exist", () => {
    const weaponCache = new Map<number, DecodedWeapon>();
    weaponCache.set(1, { weaponId: 1, updateTime: 2000 } as DecodedWeapon);
    weaponCache.set(2, { weaponId: 2, updateTime: 1000 } as DecodedWeapon);

    const result = detector.detect(weaponCache, "session1");
    expect(result.hostilitiesStarted).toBe(true);
    expect(result.hostilitiesStartTime).toBe(1000); // Earliest
  });

  it("should reset state when session hash changes", () => {
    const weaponCache = new Map<number, DecodedWeapon>();
    weaponCache.set(1, { weaponId: 1, updateTime: 1000 } as DecodedWeapon);

    // First session - hostilities detected
    detector.detect(weaponCache, "session1");
    
    // Second session - should reset
    const result = detector.detect(new Map(), "session2");
    expect(result.hostilitiesStarted).toBe(false);
    expect(result.hostilitiesStartTime).toBeUndefined();
  });

  it("should keep flag true even if cache becomes empty after detection", () => {
    const weaponCache = new Map<number, DecodedWeapon>();
    weaponCache.set(1, { weaponId: 1, updateTime: 1000 } as DecodedWeapon);

    // Detect hostilities
    detector.detect(weaponCache, "session1");
    
    // Cache becomes empty - flag should remain true
    const result = detector.detect(new Map(), "session1");
    expect(result.hostilitiesStarted).toBe(true);
    expect(result.hostilitiesStartTime).toBe(1000);
  });

  it("should handle missing/invalid session hash", () => {
    const result = detector.detect(new Map(), "");
    expect(result.hostilitiesStarted).toBe(false);
    expect(result.sessionHash).toBe("");
  });
});
```

### Step 7: Run Tests in Docker

All tests must run in Docker container per constitution:

```bash
# Build Docker image
docker build -t bfis-service .

# Run tests
docker run --rm bfis-service npm test
```

## Verification

### Manual Testing

1. **Start BFIS service** and verify it connects to Olympus
2. **Start a mission** with no weapons fired
3. **Check snapshot** - `hostility.hostilitiesStarted` should be `false`
4. **Fire a weapon** in the mission
5. **Check snapshot** - `hostility.hostilitiesStarted` should be `true`, `hostility.hostilitiesStartTime` should be set
6. **Reset mission** - `hostility.hostilitiesStarted` should reset to `false`

### Log Verification

Check structured logs for events:
- `bfis-hostilities-started` when first weapon detected
- `bfis-hostilities-reset` when mission resets
- `bfis-hostilities-status` (debug level) on subsequent polls

## Next Steps

After implementation:
1. Run all unit tests
2. Run integration tests with `SnapshotReader`
3. Verify logging events are emitted correctly
4. Test error scenarios (weapon endpoint failures, missing session hash)
5. Update documentation if needed

## Notes

- All code must include comprehensive JSDoc/TSDoc per constitution
- Tests must run in Docker container (not on host)
- State is in-memory only (lost on service restart)
- No breaking changes to existing `BfisContextSnapshot` consumers

