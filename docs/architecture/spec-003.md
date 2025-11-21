BFIS Minimal Hostility Awareness (MVP Spec)

1. Purpose & Scope

Goal: Add minimal hostility awareness to BFIS by detecting when real hostilities have started in a mission. This provides a simple boolean signal that combat has begun, without attempting to track ongoing attacks, identify targets, or assess threat levels.

This spec covers:

- Extending the context snapshot from spec-002 to include a hostility awareness signal.
- Detecting the first weapon fired in a mission session to determine when hostilities have started.
- Maintaining a one-time flag per mission session that resets on session hash changes.
- Logging and instrumentation for hostility detection events.
- Simple output format: a boolean flag plus optional metadata (timestamp of first weapon).

Out of scope for this spec (handled separately or deferred):

- Player attack detection ("is the player being attacked right now?").
- Threat assessment or severity levels.
- Target identification or trajectory analysis.
- Ongoing attack tracking or weapon-to-unit correlation.
- Log-based detection (logs are unreliable in current captures).
- BFIS decision logic that uses hostility awareness (separate spec).

This spec builds directly on **spec-002 – BFIS Context Snapshot** and assumes weapons data is already being decoded and available in the context snapshot.

---

2. High-Level Behavior

2.1 Core behavior (hostilities started detection)

At MVP, BFIS extends the context snapshot to include a simple hostility awareness signal:

- On each poll, after assembling the `BfisContextSnapshot`:
  - BFIS examines the weapons data from the snapshot.
  - If any weapon has been fired (exists in the weapons cache with `alive: true` or `alive: false`), hostilities are considered started.
  - A one-time flag `hostilitiesStarted` is set to `true` for the current mission session.
  - The timestamp of the first weapon detected is recorded as `hostilitiesStartTime`.

Key behavior:

- **One-time detection**: Once hostilities are detected, the flag remains `true` for the entire mission session.
- **Session reset**: When `sessionHash` changes (mission reset/new mission), the flag resets to `false` and detection starts fresh.
- **Simple trigger**: Any weapon fired (any coalition, any type) triggers hostilities started.
- **No target analysis**: This spec does not attempt to determine who is shooting at whom, only that weapons have been fired.

2.2 Detection method

The detection method is intentionally simple for MVP:

- **Primary signal**: Presence of any weapon in the weapons cache (from `/olympus/weapons` binary decoder).
- **Weapon state**: Both `alive: true` (active weapons) and `alive: false` (destroyed weapons) count as "weapon fired".
- **Rationale**: Once a weapon appears in the cache, it means a weapon was fired at some point. Destroyed weapons (`alive: false`) still indicate hostilities occurred.

Alternative approaches considered but deferred:

- **First enemy weapon only**: More precise but requires coalition comparison logic (deferred to post-MVP).
- **First weapon targeting player coalition**: Requires player detection and trajectory analysis (deferred to post-MVP).
- **Log-based detection**: Logs are empty in current captures, cannot rely on them (deferred).

2.3 Session handling

Session handling builds on spec-001 and spec-002:

- `sessionHash` continues to be the authoritative indicator of mission resets.
- When `sessionHash` changes:
  - BFIS resets the `hostilitiesStarted` flag to `false`.
  - BFIS clears the `hostilitiesStartTime` timestamp.
  - Detection starts fresh for the new mission session.
- The hostility state is maintained in-memory only (not persisted across service restarts).

---

3. Inputs

3.1 Configuration

BFIS reuses the configuration model from spec-001 and spec-002 (`BfisConfig` in `bfis-service/src/config/config.ts`):

- No new configuration values are required for this spec.
- Hostility detection uses existing weapons polling interval (`weaponsMs`, default 2000ms).
- Existing logging configuration applies (`generalLogPath`, `logLevel`).

3.2 Data sources

The following data sources, already available from spec-002, are used:

- **Weapons data**: From `/olympus/weapons` binary endpoint, decoded via `weapon-decoder.ts`.
- **Weapon cache**: In-memory cache maintained by `SnapshotReader` (Map<number, DecodedWeapon>).
- **Session hash**: From `/olympus/mission` endpoint, used to detect mission resets.

Data source priority (from research findings):

1. **Primary**: Weapons data (reliable, real-time, complete position/heading/speed/coalition data).
2. **Not used**: Logs (empty in captures, unreliable).
3. **Not used**: Unit data (not needed for simple "weapon fired" detection).

3.3 Weapon data structure

Weapons are decoded from binary format as defined in spec-001:

```ts
export interface DecodedWeapon {
  weaponId: number;
  category: string; // "Missile", "Bomb", "Shell"
  alive: boolean;
  coalition: OlympusCoalition; // "BLUE", "RED", "NEUTRAL", "UNKNOWN"
  name: string; // Weapon type name (e.g., "SA9M333", "BDU_33")
  position: BfisLatLng;
  speed: number; // m/s
  heading: number; // radians
  updateTime: number; // ms since epoch
}
```

For hostility detection, we only need:
- Presence of weapon in cache (indicates weapon was fired).
- `updateTime` (to determine first weapon timestamp).
- `alive` status (both true and false count as "weapon fired").

---

4. Outputs

4.1 HostilityAwareness (internal)

This spec introduces an **internal** hostility awareness type used by BFIS:

```ts
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
   */
  sessionHash: string;
}
```

4.2 Extended BfisContextSnapshot

The `BfisContextSnapshot` from spec-002 is extended to include hostility awareness:

```ts
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
   */
  hostility: HostilityAwareness;
}
```

4.3 Output format rationale

The output format is intentionally minimal for MVP:

- **Boolean flag**: Simple yes/no answer to "have hostilities started?"
- **Timestamp**: Optional metadata for debugging and analysis.
- **No metadata bloat**: No weapon lists, no threat counts, no target analysis.

This can be extended in future specs if needed (e.g., first weapon details, weapon counts, coalition breakdown).

---

5. Interfaces & Modules

5.1 HostilityDetector

Location: `bfis-service/src/hostility/hostility-detector.ts` (new module)

A new module responsible for hostility detection logic:

```ts
export class HostilityDetector {
  private hostilitiesStarted: boolean = false;
  private hostilitiesStartTime?: number;
  private lastSessionHash: string | null = null;

  /**
   * Update hostility awareness based on current weapons cache and session hash.
   * 
   * @param weaponCache - Map of weaponId to DecodedWeapon from SnapshotReader
   * @param sessionHash - Current session hash from mission data
   * @returns HostilityAwareness object with current state
   */
  detect(weaponCache: Map<number, DecodedWeapon>, sessionHash: string): HostilityAwareness {
    // Reset on session hash change
    if (this.lastSessionHash !== null && this.lastSessionHash !== sessionHash) {
      this.hostilitiesStarted = false;
      this.hostilitiesStartTime = undefined;
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
    }

    return {
      hostilitiesStarted: this.hostilitiesStarted,
      hostilitiesStartTime: this.hostilitiesStartTime,
      sessionHash,
    };
  }
}
```

Implementation notes:

- Maintains state in-memory (not persisted).
- Resets on session hash change.
- Uses weapon cache size > 0 as trigger (simple and reliable).
- Finds earliest `updateTime` from all weapons to determine start time.

5.2 SnapshotReader extension

Location: `bfis-service/src/snapshot/snapshot-reader.ts`

SnapshotReader is extended to include hostility detection:

- Existing `readContextOnce()` method is extended to:
  - After assembling the base context snapshot, call `HostilityDetector.detect()`.
  - Pass the weapon cache (`this.weaponCache`) and current `sessionHash`.
  - Attach the returned `HostilityAwareness` to the `BfisContextSnapshot`.

No new public API methods are required; hostility awareness is included in the existing `readContextOnce()` return value.

5.3 Logging

HostilityDetector should use the structured logger for hostility-specific events:

- On hostilities detected (first time):

  ```ts
  logger.info("bfis-hostilities-started", {
    sessionHash,
    hostilitiesStartTime,
    weaponCount: weaponCache.size,
  });
  ```

- On session reset (hostilities flag reset):

  ```ts
  logger.info("bfis-hostilities-reset", {
    previousSessionHash: this.lastSessionHash,
    newSessionHash: sessionHash,
  });
  ```

- On each poll (if hostilities already started):

  ```ts
  logger.debug("bfis-hostilities-status", {
    sessionHash,
    hostilitiesStarted: true,
    hostilitiesStartTime,
    weaponCount: weaponCache.size,
  });
  ```

This provides visibility into when hostilities start and when the flag resets.

---

6. Success Criteria

For this spec to be considered complete:

- **SC-HOST-001**: On a healthy Olympus instance with weapons fired, `readContextOnce()` successfully returns a `BfisContextSnapshot` that includes:
  - Valid `hostility.hostilitiesStarted: true` after the first weapon is detected.
  - Valid `hostility.hostilitiesStartTime` timestamp (ms since epoch) of the first weapon.
  - Valid `hostility.sessionHash` matching the current mission session.

- **SC-HOST-002**: When no weapons have been fired (empty weapon cache), BFIS:
  - Returns `hostility.hostilitiesStarted: false`.
  - Returns `hostility.hostilitiesStartTime: undefined`.
  - Does not log false positives.

- **SC-HOST-003**: When `sessionHash` changes (mission reset), BFIS:
  - Resets `hostilitiesStarted` to `false`.
  - Clears `hostilitiesStartTime`.
  - Logs `bfis-hostilities-reset` event.
  - Starts fresh detection for the new mission session.

- **SC-HOST-004**: Hostility detection is deterministic:
  - Given the same weapon cache and session hash, it always produces the same `HostilityAwareness` output.
  - The `hostilitiesStartTime` is the earliest `updateTime` from all weapons in the cache.

- **SC-HOST-005**: The `HostilityAwareness` type and `HostilityDetector` class are documented in code (JSDoc/TSDoc), describing:
  - The detection method (weapon cache presence).
  - Session reset behavior.
  - Intended use as a simple boolean signal for downstream decision logic.

- **SC-HOST-006**: All hostility-related events are logged with structured events:
  - `bfis-hostilities-started` when first weapon detected.
  - `bfis-hostilities-reset` when session hash changes.
  - `bfis-hostilities-status` for debug visibility.

---

7. Error & Edge Cases

7.1 Empty weapon cache

- **Scenario**: Weapon cache is empty (no weapons fired yet).
- **Behavior**: `hostilitiesStarted: false`, `hostilitiesStartTime: undefined`.
- **No error**: This is expected initial state.

7.2 Session hash changes

- **Scenario**: Mission resets or new mission loads (sessionHash changes).
- **Behavior**: Hostility state resets to `false`, `hostilitiesStartTime` cleared, detection starts fresh.
- **Logging**: `bfis-hostilities-reset` event logged with old and new session hash.

7.3 Weapon cache with only dead weapons

- **Scenario**: All weapons in cache have `alive: false` (destroyed).
- **Behavior**: Still counts as hostilities started (weapon was fired, then destroyed).
- **Rationale**: Destroyed weapons still indicate combat occurred.

7.4 Multiple weapons in cache

- **Scenario**: Multiple weapons exist in cache (e.g., 2 SA-10 missiles).
- **Behavior**: `hostilitiesStarted: true`, `hostilitiesStartTime` is the earliest `updateTime` from all weapons.
- **Rationale**: First weapon fired determines start time, not most recent.

7.5 Service restart

- **Scenario**: BFIS service restarts mid-mission.
- **Behavior**: Hostility state is lost (in-memory only), detection starts fresh from current weapon cache.
- **Limitation**: If weapons were fired before restart, they may still be in cache (depends on Olympus state), so detection may be immediate.
- **Future**: Could persist state to disk, but out of scope for MVP.

---

8. Testing & Instrumentation Expectations

8.1 Unit tests

HostilityDetector tests should:

- Verify `hostilitiesStarted: false` when weapon cache is empty.
- Verify `hostilitiesStarted: true` when weapon cache has weapons.
- Verify `hostilitiesStartTime` is earliest `updateTime` from all weapons.
- Verify reset on session hash change.
- Verify state persistence across multiple `detect()` calls with same session hash.

Location: `bfis-service/src/hostility/__tests__/hostility-detector.test.ts`

8.2 Integration tests

SnapshotReader integration tests should:

- Verify `BfisContextSnapshot.hostility` is populated correctly.
- Verify hostility state resets when `sessionHash` changes between polls.
- Verify logging events (`bfis-hostilities-started`, `bfis-hostilities-reset`) are emitted.

Location: `bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts` (extend existing tests)

8.3 Manual testing

Manual test scenarios:

1. **Fresh mission**: Start mission, verify `hostilitiesStarted: false`, fire weapon, verify `hostilitiesStarted: true`.
2. **Mission reset**: Start mission, fire weapon, reset mission, verify flag resets to `false`.
3. **Multiple weapons**: Fire multiple weapons, verify `hostilitiesStartTime` is earliest weapon timestamp.
4. **Dead weapons**: Fire weapon, let it be destroyed, verify flag remains `true`.

---

9. Implementation Notes

9.1 Detection simplicity

The detection method is intentionally simple for MVP:

- **No coalition analysis**: Any weapon (any coalition) triggers hostilities.
- **No target analysis**: No attempt to determine who is shooting at whom.
- **No trajectory analysis**: No heading/proximity calculations.
- **No time windows**: Once detected, flag remains true for entire session.

This can be extended in future specs if needed.

9.2 Weapon cache access

The `HostilityDetector` needs access to the weapon cache from `SnapshotReader`:

- Option 1: Pass weapon cache as parameter to `detect()` method (chosen).
- Option 2: Inject `SnapshotReader` into `HostilityDetector` (more coupling).
- Option 3: Expose weapon cache as public property (breaks encapsulation).

Option 1 is chosen for minimal coupling and clear data flow.

9.3 State management

Hostility state is maintained in `HostilityDetector` instance:

- **In-memory only**: Not persisted to disk or database.
- **Per-instance**: Each `HostilityDetector` instance maintains its own state.
- **Session-based**: State resets on session hash change.

For MVP, this is sufficient. Future enhancements could persist state across restarts if needed.

---

10. Research Findings Summary

Based on research spike analysis of 184 live mission captures:

- **Weapons data is reliable**: 41 captures with active weapons, complete position/heading/speed/coalition data.
- **Logs are unreliable**: No logs captured in any of 184 snapshots (cannot rely on log-based detection).
- **Simple detection works**: Presence of weapons in cache is sufficient signal for "hostilities started".
- **Session reset works**: `sessionHash` changes correctly indicate mission resets.

Key limitations accepted for MVP:

- **No target data**: Weapon binary stream does not include `targetID` or `targetPosition` fields.
- **No player attack detection**: Requires trajectory analysis (deferred to post-MVP).
- **No log-based detection**: Logs are empty/unreliable in current setup.

These limitations are acceptable for MVP scope (simple "hostilities started" boolean).

---

11. Future Enhancements (Post-MVP)

Potential extensions beyond MVP:

- **Player attack detection**: Detect when player units are under attack (requires trajectory analysis).
- **Threat severity levels**: Categorize threat level (none/low/medium/high) based on weapon count and proximity.
- **Coalition-specific detection**: Only count weapons from enemy coalition (requires coalition comparison).
- **Time-windowed detection**: Reset flag after X seconds of no weapons (requires time-based logic).
- **Log-based detection**: Use log entries as additional signal (if logs become reliable).
- **Persistence**: Persist hostility state across service restarts (requires disk/database storage).

These are explicitly out of scope for MVP and will be handled in future specs if needed.



