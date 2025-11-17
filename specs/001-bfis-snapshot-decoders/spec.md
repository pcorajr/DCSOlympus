# Feature Specification: BFIS Snapshot Ingestion & Binary Decoding

**Feature Branch**: `001-bfis-snapshot-decoders`  
**Created**: 2025-11-16  
**Status**: Draft  
**Input**: User description: "@spec-001.md  already created spec folder :specs/001-bfis-snapshot-decoders"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - BFIS Observes Battlefield State (Priority: P1)

BFIS must be able to read the current state of the battlefield from Olympus to make informed decisions. This includes reading unit positions, mission context, and other battlefield data through authenticated API calls.

**Why this priority**: This is the foundational capability that enables all BFIS decision-making. Without the ability to observe the battlefield, BFIS cannot function.

**Independent Test**: Can be fully tested by verifying that BFIS successfully connects to Olympus, authenticates, and retrieves mission data. Delivers the capability for BFIS to see the battlefield state.

**Acceptance Scenarios**:

1. **Given** BFIS service is starting up, **When** it attempts to connect to Olympus, **Then** it successfully authenticates and verifies connectivity
2. **Given** BFIS is running, **When** it polls Olympus for mission data, **Then** it receives and processes the current mission state including mission ID, server ID, and session hash
3. **Given** BFIS receives battlefield data, **When** it processes the response, **Then** it constructs an internal snapshot representation that accurately reflects Olympus' reported state

---

### User Story 2 - BFIS Decodes Binary Battlefield Data (Priority: P1)

BFIS must be able to decode binary-encoded unit and weapon data from Olympus to understand the current positions and status of all entities on the battlefield.

**Why this priority**: Units and weapons are the core entities BFIS needs to observe. The binary format is the primary data source for this information, so decoding capability is essential.

**Independent Test**: Can be fully tested by providing synthetic binary buffers matching Olympus format and verifying correct decoding into structured unit/weapon data. Delivers the ability to extract meaningful information from binary data streams.

**Acceptance Scenarios**:

1. **Given** BFIS receives a binary units buffer from Olympus, **When** it decodes the buffer, **Then** it extracts all unit information including positions, IDs, coalitions, and types
2. **Given** BFIS receives a binary weapons buffer from Olympus, **When** it decodes the buffer, **Then** it extracts all weapon information correctly
3. **Given** BFIS encounters a binary decode error, **When** it processes the error, **Then** it logs the error with sufficient context and allows retry on next poll cycle

---

### User Story 3 - BFIS Handles Mission Resets and State Changes (Priority: P2)

BFIS must detect when missions restart or reset (indicated by session hash changes) and appropriately reset its internal state to avoid using stale data from previous missions.

**Why this priority**: Mission resets are common in DCS scenarios. BFIS must handle these gracefully to maintain data integrity and avoid making decisions based on outdated information.

**Independent Test**: Can be fully tested by simulating session hash changes between polls and verifying that BFIS resets its state and performs full data refresh. Delivers resilience against mission state changes.

**Acceptance Scenarios**:

1. **Given** BFIS has been polling a mission, **When** the session hash changes between polls, **Then** BFIS detects the change, logs a session reset event, and clears cached state
2. **Given** BFIS detects a session hash change, **When** it performs the next poll, **Then** it requests full data refresh (time=0) for all endpoints
3. **Given** BFIS resets its state, **When** it continues polling, **Then** it generates new snapshot IDs independent of previous snapshots

---

### User Story 4 - BFIS Polls Multiple Data Sources at Appropriate Intervals (Priority: P2)

BFIS must retrieve data from multiple Olympus endpoints (mission, units, weapons, logs, airbases, bullseyes, spots, drawings) at configurable intervals optimized for each data type's update frequency.

**Why this priority**: Different battlefield data changes at different rates. Efficient polling reduces load on Olympus while ensuring BFIS has timely information for decision-making.

**Independent Test**: Can be fully tested by verifying that BFIS polls each endpoint at its configured interval and uses time-based query parameters for incremental updates where supported. Delivers efficient data collection.

**Acceptance Scenarios**:

1. **Given** BFIS is running with default polling configuration, **When** it operates continuously, **Then** it polls units/weapons every 2 seconds, logs every 1 second, and mission data every 5 seconds
2. **Given** BFIS has previously polled an endpoint, **When** it polls again, **Then** it uses the last known time parameter to request only incremental updates
3. **Given** BFIS receives a response with a time field, **When** it processes the response, **Then** it updates its internal lastTime state for that endpoint

---

### Edge Cases

- What happens when Olympus is unreachable or returns network errors?
- How does system handle authentication failures (401/403)?
- What happens when binary buffer format is corrupted or unexpected?
- How does system handle partial failures (some endpoints succeed, others fail)?
- What happens when session hash changes mid-poll cycle?
- How does system handle very large binary buffers or high unit counts?
- What happens when time query parameters result in no new data?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate with Olympus using Basic Auth and role-based command mode headers
- **FR-002**: System MUST perform an initial connectivity probe on startup to verify Olympus availability and credentials
- **FR-003**: System MUST poll Olympus endpoints at configurable intervals (units/weapons: 2000ms default, logs: 1000ms default, mission: 5000ms default)
- **FR-004**: System MUST decode binary-encoded unit data from Olympus units endpoint into structured unit objects
- **FR-005**: System MUST decode binary-encoded weapon data from Olympus weapons endpoint into structured weapon objects
- **FR-006**: System MUST extract the leading 8-byte update time (uint64) from binary buffers before decoding data
- **FR-007**: System MUST construct an internal snapshot object that includes snapshot ID, mission ID, server ID, session hash, timestamp, and decoded units array
- **FR-008**: System MUST track session hash from every Olympus response and detect changes
- **FR-009**: System MUST reset internal state (lastTime values, caches) when session hash changes
- **FR-010**: System MUST use time-based query parameters for units, weapons, and logs endpoints to support incremental updates
- **FR-011**: System MUST update lastTime state from response time fields and binary buffer leading uint64 values
- **FR-012**: System MUST log all snapshot operations using structured logging (bfis-olympus-probe-ok, bfis-snapshot-read-ok, bfis-session-reset, bfis-snapshot-http-error, bfis-snapshot-decode-error)
- **FR-013**: System MUST handle HTTP errors gracefully without crashing, logging errors with URL, status, and message context
- **FR-014**: System MUST handle binary decode errors by logging with context and allowing retry on next poll cycle
- **FR-015**: System MUST generate unique snapshot IDs for each snapshot, independent of previous snapshots
- **FR-016**: System MUST fetch endpoints in specified order: mission, units (binary), weapons (binary), logs, then airbases/bullseyes/spots/drawings
- **FR-017**: System MUST perform full data refresh (time=0) when session hash changes or on initial poll
- **FR-018**: System MUST maintain immutable snapshot objects that are not mutated after creation

### Key Entities *(include if feature involves data)*

- **OlympusSnapshot**: Represents a point-in-time view of the battlefield state as reported by Olympus. Contains mission metadata (ID, server ID, session hash, timestamp), array of units, and optional events. Immutable once created.

- **OlympusUnit**: Represents a single unit on the battlefield. Contains unit ID, optional group ID, name, coalition (BLUE/RED/NEUTRAL/UNKNOWN), category, unit type, position (lat/lon/altitude), and optional status.

- **DataExtractor**: Internal utility for decoding binary buffers. Provides low-level extraction methods (numbers, strings, structs) that higher-level decoders use. Maintains seek position and reads little-endian numeric values.

- **Session State**: Tracks last known session hash and lastTime values per endpoint (units, weapons, logs). Used to detect mission resets and support incremental polling.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: BFIS successfully connects to Olympus and authenticates within 5 seconds of service startup
- **SC-002**: BFIS retrieves and decodes a complete battlefield snapshot (including all units) within 3 seconds of initiating a poll cycle
- **SC-003**: BFIS correctly decodes binary unit/weapon buffers matching Olympus format with 100% accuracy for valid buffers
- **SC-004**: BFIS detects session hash changes and resets state within one poll cycle (detection latency < polling interval)
- **SC-005**: BFIS handles network errors and authentication failures without service crashes, logging all errors with sufficient context for debugging
- **SC-006**: BFIS processes incremental updates (using time query parameters) reducing data transfer by at least 50% compared to full refreshes when no changes occur
- **SC-007**: All snapshot operations produce structured log events that can be parsed and analyzed programmatically
- **SC-008**: BFIS maintains snapshot data integrity - snapshots accurately reflect Olympus' reported state at the time of polling with no data corruption or loss

