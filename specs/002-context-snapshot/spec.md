# Feature Specification: BFIS Context Snapshot

**Feature Branch**: `002-context-snapshot`  
**Created**: 2025-11-17  
**Status**: Draft  
**Input**: User description: "Extend BFIS' 'see the battlefield' capability from just mission + units to a richer, unified snapshot that also carries Olympus' context data (airbases, bullseyes, spots, drawings, logs, and basic weapons state) as a single, consumable picture — without yet making decisions or inferring hostilities."

## Clarifications

### Session 2025-11-17

- Q: What is the maximum acceptable latency for creating a complete context snapshot (all endpoints fetched and normalized)? → A: 3 seconds (same target as spec-001 base snapshot creation)
- Q: At what data volume thresholds should BFIS log size warnings for context payloads? → A: Log warnings at 1000+ entries per slice type (moderate threshold)
- Q: Which fields are considered "critical" (must be present) vs. optional for each normalized context type? → A: Only ID/identifier is critical; all other fields optional. Log warnings when critical fields are missing.
- Q: What sorting criteria should be used to ensure deterministic ordering of normalized context data? → A: Sort by ID/identifier (ascending) for all context types
- Q: Should context-specific warnings/errors use new event names or extend existing ones from spec-001? → A: Extend existing event names with endpoint/context fields

## User Scenarios & Testing *(mandatory)*

### User Story 1 - BFIS Observes Complete Battlefield Context (Priority: P1)

BFIS needs to observe the complete battlefield picture in a single snapshot, including not just units and mission data, but also contextual information like airbases, bullseyes, spots, drawings, logs, and weapons state. This unified view enables BFIS to understand the full operational context when making decisions.

**Why this priority**: This is the foundation for all future decision-making capabilities. Without complete context, BFIS cannot make informed decisions about battlefield situations. This story delivers the core data ingestion capability that all other features depend on.

**Independent Test**: Can be fully tested by verifying that BFIS successfully retrieves and normalizes all context data types (airbases, bullseyes, spots, drawings, logs, weapons) from Olympus endpoints and assembles them into a single unified snapshot object. This delivers a complete battlefield picture in one data structure.

**Acceptance Scenarios**:

1. **Given** BFIS is connected to a running Olympus instance with active mission data, **When** BFIS requests a context snapshot, **Then** BFIS receives a unified snapshot containing mission metadata, units, airbases, bullseyes, spots, drawings, logs, and weapons summary
2. **Given** BFIS has successfully retrieved a context snapshot, **When** BFIS requests another snapshot from the same mission session, **Then** BFIS receives an updated snapshot with current state (including incremental log entries since last poll)
3. **Given** BFIS receives a context snapshot, **When** BFIS processes the snapshot, **Then** all context data types are normalized into stable, deterministic structures that can be reliably consumed by downstream decision logic

---

### User Story 2 - BFIS Handles Context Data Errors Gracefully (Priority: P2)

When individual context endpoints fail or return unexpected data, BFIS must handle these errors gracefully without crashing or losing the entire snapshot. Partial failures should be logged clearly while allowing successful context slices to be included.

**Why this priority**: In real-world operations, network issues, endpoint failures, or data format changes can occur. BFIS must remain operational even when some context sources are unavailable, ensuring resilience and observability.

**Independent Test**: Can be fully tested by simulating various failure scenarios (HTTP errors, parse errors, empty responses) for individual context endpoints and verifying that BFIS logs structured errors, continues operation, and produces valid snapshots with available data. This delivers operational resilience and clear error visibility.

**Acceptance Scenarios**:

1. **Given** BFIS is polling context endpoints, **When** the airbases endpoint returns an HTTP error, **Then** BFIS logs a structured error with endpoint name and details, and produces a snapshot with empty airbases array while other context data is included
2. **Given** BFIS is polling context endpoints, **When** the logs endpoint returns malformed JSON, **Then** BFIS logs a structured decode error with endpoint context, and produces a snapshot with empty logs array while other context data is included
3. **Given** BFIS is polling context endpoints, **When** the spots endpoint returns an empty array, **Then** BFIS logs a structured warning about empty data, and produces a valid snapshot with empty spots array

---

### User Story 3 - BFIS Maintains Session Consistency for Context Data (Priority: P3)

When mission sessions change (detected via sessionHash), BFIS must treat all context data as fresh for the new session, clearing any cached state and starting with a clean slate. This ensures context snapshots accurately reflect the current mission state.

**Why this priority**: Mission resets change the entire operational context. BFIS must recognize these transitions and avoid mixing data from different missions, ensuring decision-making is based on accurate, current mission state.

**Independent Test**: Can be fully tested by simulating a mission reset (sessionHash change) and verifying that BFIS clears internal caches, treats all context slices as fresh, and produces snapshots that only contain data from the new mission session. This delivers accurate mission state tracking.

**Acceptance Scenarios**:

1. **Given** BFIS has been polling context snapshots from Mission A, **When** Olympus reports a new sessionHash (mission reset), **Then** BFIS clears all internal caches and produces a fresh context snapshot containing only data from the new mission
2. **Given** BFIS detects a sessionHash change, **When** BFIS processes the first context snapshot of the new session, **Then** all context slices (airbases, bullseyes, spots, drawings, logs, weapons) are treated as new data with no carryover from the previous mission

---

### Edge Cases

- What happens when all context endpoints fail simultaneously? BFIS should log all errors and produce a snapshot with only the base mission + units data (from spec-001), with all context slices as empty arrays
- How does system handle extremely large context payloads (e.g., thousands of log entries, hundreds of drawings)? BFIS should normalize and include all data, logging structured size warnings when any context slice contains 1000+ entries to help monitor for anomalies
- What happens when context endpoints return data in unexpected formats (e.g., object instead of array)? BFIS should log a decode error and treat that slice as empty, while continuing to process other context slices
- How does system handle rapid session changes (sessionHash flips multiple times quickly)? BFIS should detect each change and clear caches appropriately, ensuring no data mixing between sessions
- What happens when context endpoints return partial data (e.g., some fields missing)? BFIS should normalize available fields and include the partial data. If ID/identifier fields are missing (critical fields), BFIS should log structured warnings but still attempt to normalize with available data. All other fields are optional and missing optional fields do not trigger warnings.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST retrieve and normalize airbase data from Olympus into a stable, typed structure that preserves key identifiers, coalition information, and position data
- **FR-002**: System MUST retrieve and normalize bullseye data from Olympus into a stable, typed structure that preserves coordinates and coalition associations
- **FR-003**: System MUST retrieve and normalize spot data (laser/IR markers) from Olympus into a stable, typed structure that preserves position and type information
- **FR-004**: System MUST retrieve and normalize drawing data (map annotations) from Olympus into a stable, typed structure that preserves geometry and label information
- **FR-005**: System MUST retrieve and normalize log entries from Olympus into a stable, typed structure that preserves timestamps, categories, and message content needed for future event derivation
- **FR-006**: System MUST derive a basic weapons summary from decoded weapons data that includes last update time and active weapon count
- **FR-007**: System MUST assemble all context data (airbases, bullseyes, spots, drawings, logs, weapons summary) together with mission and units data into a single unified context snapshot object
- **FR-008**: System MUST handle HTTP errors from individual context endpoints by logging structured errors using existing event names from spec-001 (e.g., `bfis-snapshot-http-error`) extended with endpoint name and context details, and continuing to process other endpoints
- **FR-009**: System MUST handle parse/normalization errors from individual context endpoints by logging structured decode errors using existing event names from spec-001 (e.g., `bfis-snapshot-decode-error`) extended with endpoint context and error details, and continuing to process other endpoints
- **FR-010**: System MUST log structured warnings when context endpoints return empty or minimal payloads using existing event names from spec-001 (e.g., `bfis-snapshot-empty-data`) extended with endpoint field indicating the specific context slice, while still producing valid snapshots with empty arrays for those slices
- **FR-011**: System MUST handle partial data from context endpoints by normalizing available fields and including partial data in snapshots. When ID/identifier fields (critical fields) are missing, System MUST log structured warnings but still attempt normalization with available data. All other fields are optional and missing optional fields do not trigger warnings
- **FR-012**: System MUST detect mission session changes via sessionHash and clear all internal caches (unit cache, lastTimes) when sessionHash changes
- **FR-013**: System MUST treat context slices as fresh data when sessionHash changes, with no merging or carryover from previous missions
- **FR-014**: System MUST fetch log entries incrementally using time query parameters to avoid duplicate log processing
- **FR-015**: System MUST produce deterministic normalization output - given the same raw Olympus response, normalization functions must always produce the same output (same ordering, same field presence). All normalized context arrays MUST be sorted by ID/identifier in ascending order to ensure consistent ordering across snapshots
- **FR-016**: System MUST log successful context snapshot creation using event name `bfis-context-snapshot-ok` with structured metadata including snapshot ID, session hash, unit count, and counts for each context slice type (airbaseCount, bullseyeCount, spotCount, drawingCount, logCount, weaponsActiveCount)
- **FR-017**: System MUST log structured size warnings when any context slice contains 1000+ entries using existing event names from spec-001 (e.g., `bfis-snapshot-empty-data`) extended with endpoint field and entryCount, to help monitor for anomalies
- **FR-018**: System MUST preserve key identifiers and coordinates from context data needed for future decision-making (e.g., airbase ID, coalition, position; bullseye coordinates; spot positions; drawing geometry)
- **FR-019**: System MUST preserve sufficient log metadata (timestamp, category, message fields) to support future event derivation and hostility detection
- **FR-020**: System MUST avoid duplicating every possible Olympus field in normalized structures, focusing only on data needed for decisions and summaries

### Key Entities *(include if feature involves data)*

- **BfisContextSnapshot**: The unified snapshot object that contains all battlefield context in one place. Includes base mission/units snapshot plus normalized slices for airbases, bullseyes, spots, drawings, logs, and weapons summary. Represents "what Olympus reports right now" across all dimensions.

- **NormalizedAirbase**: A normalized airbase structure containing key identifiers, coalition information, and position data extracted from Olympus airbase endpoints. Focuses on fields needed for decision-making.

- **NormalizedBullseye**: A normalized bullseye structure containing coordinates and coalition associations extracted from Olympus bullseye endpoints. Used as reference points for tactical decisions.

- **NormalizedSpot**: A normalized spot structure containing position and type information for laser/IR markers extracted from Olympus spot endpoints. Represents current tactical markers on the battlefield.

- **NormalizedDrawing**: A normalized drawing structure containing geometry and label information for map annotations extracted from Olympus drawing endpoints. Represents tactical zones, lines, and labels.

- **NormalizedLogEntry**: A normalized log entry structure containing timestamp, category, and message content extracted from Olympus log endpoints. Preserves metadata needed for future event derivation.

- **WeaponsSummary**: A basic weapons state summary containing last update time and active weapon count. Derived from decoded weapons data without full hostility interpretation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On a healthy Olympus instance, BFIS successfully produces unified context snapshots containing all context data types (airbases, bullseyes, spots, drawings, logs, weapons summary) in 100% of polling attempts when all endpoints are available
- **SC-002**: When individual context endpoints fail (HTTP or parse errors), BFIS continues operation and produces valid snapshots with available data in 100% of failure scenarios, with all errors logged within 1 second of occurrence
- **SC-003**: When context endpoints return empty but valid payloads, BFIS produces valid snapshots with empty arrays for those slices in 100% of cases, with structured warnings logged for monitoring
- **SC-004**: All context normalization functions produce deterministic output - given identical raw Olympus responses, normalization produces identical normalized output (same field presence, same ordering) in 100% of test cases
- **SC-005**: When mission session changes are detected (sessionHash change), BFIS clears caches and produces fresh snapshots with no data carryover from previous sessions in 100% of session transitions
- **SC-006**: Context snapshot creation completes within 3 seconds of initiating a poll cycle (same target as spec-001 base snapshot creation), allowing BFIS to maintain real-time battlefield awareness without falling behind mission state updates
- **SC-007**: All context data types are normalized into stable, typed structures that can be reliably consumed by downstream decision logic without additional transformation in 100% of successful snapshots

