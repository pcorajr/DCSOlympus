# Feature Specification: BFIS Minimal Hostility Awareness

**Feature Branch**: `003-hostility-awareness`  
**Created**: 2025-11-22  
**Status**: Draft  
**Input**: User description: "Add minimal hostility awareness to BFIS by detecting when real hostilities have started in a mission. This provides a simple boolean signal that combat has begun, without attempting to track ongoing attacks, identify targets, or assess threat levels."

## Clarifications

### Session 2025-11-22

- Q: When the weapons endpoint fails (HTTP error, decode error, or network timeout), how should hostility detection behave? → A: Treat endpoint failures as "no hostilities detected" - empty cache from errors results in `hostilitiesStarted: false` (fail gracefully)
- Q: If `sessionHash` is missing or invalid when hostility detection is invoked, how should the system behave? → A: Treat missing/invalid session hash as a new session - reset hostility state and proceed with detection using empty/null as the session identifier
- Q: If hostilities have been detected (`hostilitiesStarted: true`) but the weapon cache later becomes empty (all weapons removed), should the flag remain `true` or reset to `false`? → A: Keep flag `true` once detected - even if weapon cache becomes empty later, `hostilitiesStarted` remains `true` for the entire session (one-time detection principle)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Detect Hostilities Started (Priority: P1)

BFIS needs to detect when hostilities have begun in a mission session by identifying when the first weapon is fired. This provides a simple boolean signal that combat has started, enabling downstream decision logic to respond appropriately.

**Why this priority**: This is the core functionality - without the ability to detect when hostilities start, the feature cannot deliver value. All other functionality depends on this detection capability.

**Independent Test**: Can be fully tested by verifying that when any weapon appears in the weapons cache, the system correctly identifies that hostilities have started and sets the flag to true. This delivers immediate value by providing a clear signal that combat has begun.

**Acceptance Scenarios**:

1. **Given** a mission session with no weapons fired yet, **When** BFIS polls the context snapshot, **Then** the hostility awareness signal indicates `hostilitiesStarted: false`
2. **Given** a mission session with no weapons fired, **When** the first weapon is fired and appears in the weapons cache, **Then** BFIS detects hostilities started and sets `hostilitiesStarted: true` with the timestamp of the first weapon
3. **Given** a mission session where hostilities have already been detected, **When** BFIS polls the context snapshot again, **Then** the `hostilitiesStarted` flag remains `true` for the entire session
4. **Given** a weapon cache containing multiple weapons, **When** BFIS detects hostilities, **Then** the `hostilitiesStartTime` reflects the earliest weapon timestamp from all weapons in the cache

---

### User Story 2 - Reset on Mission Change (Priority: P2)

BFIS needs to reset the hostility awareness state when a mission session changes (mission reset or new mission loaded), ensuring that each mission session has its own independent hostility detection state.

**Why this priority**: Without proper session reset handling, the hostility flag could persist incorrectly across mission changes, leading to false positives in new missions. This is critical for accurate detection per mission.

**Independent Test**: Can be fully tested by starting a mission, firing a weapon (hostilities detected), then resetting the mission and verifying the flag resets to false. This delivers value by ensuring accurate per-session detection.

**Acceptance Scenarios**:

1. **Given** a mission session where hostilities have been detected (`hostilitiesStarted: true`), **When** the mission session hash changes (mission reset), **Then** BFIS resets `hostilitiesStarted` to `false` and clears `hostilitiesStartTime`
2. **Given** a mission reset has occurred, **When** BFIS polls the new mission session, **Then** hostility detection starts fresh for the new session
3. **Given** a mission reset occurs, **When** the reset is detected, **Then** BFIS logs a structured event indicating the hostility state reset

---

### User Story 3 - Provide Hostility Awareness in Context Snapshot (Priority: P1)

BFIS needs to include hostility awareness information in the context snapshot so that downstream components can access this signal as part of the standard snapshot data structure.

**Why this priority**: The hostility awareness signal must be accessible through the existing context snapshot interface to enable integration with decision logic and other BFIS components. Without this, the detection capability cannot be utilized.

**Independent Test**: Can be fully tested by calling the context snapshot read method and verifying the hostility awareness field is present and populated correctly. This delivers value by making the signal available through the standard data interface.

**Acceptance Scenarios**:

1. **Given** a context snapshot is requested, **When** BFIS assembles the snapshot, **Then** the snapshot includes a `hostility` field containing the current hostility awareness state
2. **Given** a context snapshot with hostility awareness, **When** the snapshot is examined, **Then** the hostility field contains `hostilitiesStarted` (boolean), `hostilitiesStartTime` (optional timestamp), and `sessionHash` (string)
3. **Given** hostilities have not started, **When** a context snapshot is requested, **Then** the hostility field indicates `hostilitiesStarted: false` and `hostilitiesStartTime: undefined`

---

### Edge Cases

- What happens when the weapon cache is empty? System returns `hostilitiesStarted: false` - this is expected initial state, not an error
- How does system handle weapons endpoint failures (HTTP errors, decode errors, network timeouts)? System treats endpoint failures as "no hostilities detected" - empty cache from errors results in `hostilitiesStarted: false` (fail gracefully to maintain system availability)
- How does system handle missing or invalid session hash? System treats missing/invalid session hash as a new session - resets hostility state and proceeds with detection using empty/null as the session identifier
- How does system handle weapons that are destroyed (`alive: false`)? Destroyed weapons still count as hostilities started since they indicate a weapon was fired
- What happens when multiple weapons exist in cache? System uses the earliest weapon timestamp as `hostilitiesStartTime`
- How does system handle service restart mid-mission? Hostility state is lost (in-memory only), detection starts fresh from current weapon cache state
- What happens when session hash changes but no weapons have been fired yet? System resets state to `false` and starts fresh detection
- What happens if weapon cache becomes empty after hostilities have been detected? System keeps `hostilitiesStarted: true` - the flag remains `true` for the entire session once detected, even if all weapons are later removed from cache (one-time detection principle)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST detect when hostilities have started by examining weapons data in the context snapshot
- **FR-002**: System MUST set a one-time `hostilitiesStarted` flag to `true` when the first weapon is detected in a mission session
- **FR-003**: System MUST record the timestamp of the first weapon detected as `hostilitiesStartTime`
- **FR-004**: System MUST maintain the `hostilitiesStarted` flag as `true` for the entire mission session once detected
- **FR-005**: System MUST reset `hostilitiesStarted` to `false` and clear `hostilitiesStartTime` when the mission session hash changes
- **FR-006**: System MUST include hostility awareness information in the `BfisContextSnapshot` structure
- **FR-007**: System MUST treat both active weapons (`alive: true`) and destroyed weapons (`alive: false`) as indicators that hostilities have started
- **FR-008**: System MUST use the earliest weapon timestamp from all weapons in cache when determining `hostilitiesStartTime`
- **FR-009**: System MUST log structured events when hostilities are first detected (`bfis-hostilities-started`)
- **FR-010**: System MUST log structured events when hostility state resets due to session hash change (`bfis-hostilities-reset`)
- **FR-011**: System MUST maintain hostility state in-memory only (not persisted across service restarts)
- **FR-012**: System MUST associate hostility state with the current mission session hash
- **FR-013**: System MUST handle weapons endpoint failures gracefully - when weapons endpoint fails (HTTP error, decode error, network timeout), treat empty cache as "no hostilities detected" (`hostilitiesStarted: false`) to maintain system availability
- **FR-014**: System MUST handle missing or invalid session hash by treating it as a new session - reset hostility state and proceed with detection using empty/null as the session identifier

### Key Entities *(include if feature involves data)*

- **HostilityAwareness**: Represents the current hostility detection state for a mission session. Contains `hostilitiesStarted` (boolean indicating if combat has begun), `hostilitiesStartTime` (optional timestamp in milliseconds since epoch of first weapon detected), and `sessionHash` (string identifying the mission session this state belongs to)

- **BfisContextSnapshot** (extended): The context snapshot structure that includes all mission state information. Extended to include a `hostility` field of type `HostilityAwareness` that provides the hostility awareness signal for the current snapshot

- **Weapon Cache**: In-memory collection of weapons data from the weapons decoder. Used as the primary signal source for detecting when hostilities have started. Contains weapons with their metadata including `updateTime` which is used to determine the earliest weapon timestamp

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: System correctly identifies hostilities started when the first weapon appears in the weapons cache, with detection occurring on the next available snapshot update cycle
- **SC-002**: System maintains accurate hostility state across multiple snapshot polls within the same mission session (100% consistency rate)
- **SC-003**: System correctly resets hostility state when mission session changes (100% accuracy on session hash change detection)
- **SC-004**: System provides hostility awareness information in every context snapshot request (100% availability in snapshot data)
- **SC-005**: System logs all hostility detection events with structured event data (100% event coverage for hostilities-started and hostilities-reset events)
- **SC-006**: System correctly identifies the earliest weapon timestamp when multiple weapons exist in cache (100% accuracy in timestamp selection)
- **SC-007**: System handles empty weapon cache without errors, returning appropriate false state (zero error rate for empty cache scenarios)

