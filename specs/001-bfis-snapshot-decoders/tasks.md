# Tasks: BFIS Snapshot Ingestion & Binary Decoding

**Input**: Design documents from `/specs/001-bfis-snapshot-decoders/`  
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅

**Tests**: Tests are included per spec-001.md testing expectations (spec-001.md:321-338). All tests must run in Docker container per AGENTS.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., [US1], [US2], [US3], [US4])
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and shared schema definitions

- [X] T001 [P] Extend shared schemas with OlympusSnapshot interfaces in shared-schemas/index.ts
- [X] T002 [P] Create DataIndexes enum constants in bfis-service/src/snapshot/data-indexes.ts
- [X] T003 [P] Create coalition conversion helper function in bfis-service/src/snapshot/coalition-helper.ts

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create unit decoder module structure in bfis-service/src/snapshot/unit-decoder.ts
- [X] T005 Create weapon decoder module structure in bfis-service/src/snapshot/weapon-decoder.ts
- [X] T006 Add session state tracking fields to SnapshotReader class in bfis-service/src/snapshot/snapshot-reader.ts
- [X] T006a [P] Review and update probeMissionOnce JSDoc and logging to align with FR-002 and constitution in bfis-service/src/snapshot/snapshot-reader.ts
- [X] T006b Create polling loop module in bfis-service/src/runtime/polling-loop.ts with readOnce() at configured intervals, session hash handling, and error logging/backoff

**Note**: FR-002 (initial connectivity probe) is already implemented via `probeMissionOnce()` method. Task T006a ensures documentation alignment.

**Checkpoint**: Foundation ready - user story implementation can now begin

---

## Phase 3: User Story 1 - BFIS Observes Battlefield State (Priority: P1) 🎯 MVP

**Goal**: BFIS successfully connects to Olympus, authenticates, and retrieves mission data to construct basic snapshots with mission metadata.

**Independent Test**: Verify that BFIS successfully connects to Olympus, authenticates, retrieves mission data, and constructs a snapshot with missionId, serverId, sessionHash, and time. Can be tested independently without unit/weapon decoding.

### Tests for User Story 1

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T007 [P] [US1] Create test file for probeMissionOnce in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T008 [P] [US1] Add test: probeMissionOnce logs bfis-olympus-probe-ok on success in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T009 [P] [US1] Add test: probeMissionOnce throws error on auth failure in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T010 [P] [US1] Add test: readOnce constructs snapshot with mission data in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts

### Implementation for User Story 1

- [ ] T011 [US1] Implement fetchMission helper method in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T012 [US1] Parse mission JSON response to extract missionId, serverId, sessionHash, time in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T013 [US1] Implement basic readOnce method to fetch mission endpoint only in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T014 [US1] Generate UUID v4 snapshotId using uuid package in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T015 [US1] Construct basic OlympusSnapshot with mission data (empty units array for now) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T016 [US1] Log bfis-snapshot-read-ok event with snapshotId, sessionHash, unitCount=0 in bfis-service/src/snapshot/snapshot-reader.ts

**Checkpoint**: At this point, User Story 1 should be fully functional - BFIS can connect, authenticate, and create basic snapshots with mission metadata

---

## Phase 4: User Story 2 - BFIS Decodes Binary Battlefield Data (Priority: P1)

**Goal**: BFIS decodes binary-encoded unit and weapon data from Olympus into structured OlympusUnit objects.

**Independent Test**: Provide synthetic binary buffers matching Olympus format and verify correct decoding into structured unit/weapon data. Can be tested independently with mock buffers.

### Tests for User Story 2

- [ ] T017 [P] [US2] Create test file for unit decoder in bfis-service/src/snapshot/__tests__/unit-decoder.test.ts
- [ ] T018 [P] [US2] Add test: decodeUnits extracts updateTime from buffer in bfis-service/src/snapshot/__tests__/unit-decoder.test.ts
- [ ] T019 [P] [US2] Add test: decodeUnits extracts unitId, category, coalition, position in bfis-service/src/snapshot/__tests__/unit-decoder.test.ts
- [ ] T020 [P] [US2] Add test: decodeUnits handles empty buffer gracefully in bfis-service/src/snapshot/__tests__/unit-decoder.test.ts
- [ ] T021 [P] [US2] Create test file for weapon decoder in bfis-service/src/snapshot/__tests__/weapon-decoder.test.ts
- [ ] T022 [P] [US2] Add test: decodeWeapons extracts updateTime and weapon data in bfis-service/src/snapshot/__tests__/weapon-decoder.test.ts

### Implementation for User Story 2

- [ ] T023 [US2] Implement decodeUnits function with DataExtractor loop pattern in bfis-service/src/snapshot/unit-decoder.ts
- [ ] T024 [US2] Implement DataIndexes switch for unit field extraction (category, coalition, name, position, unitID, groupID) in bfis-service/src/snapshot/unit-decoder.ts
- [ ] T025 [US2] Convert BfisLatLng to OlympusUnitPosition in unit decoder in bfis-service/src/snapshot/unit-decoder.ts
- [ ] T026 [US2] Convert uint32 unitId/groupId to strings in unit decoder in bfis-service/src/snapshot/unit-decoder.ts
- [ ] T027 [US2] Convert coalition enum (uint8) to OlympusCoalition type in bfis-service/src/snapshot/unit-decoder.ts
- [ ] T028 [US2] Implement decodeWeapons function with DataExtractor loop pattern in bfis-service/src/snapshot/weapon-decoder.ts
- [ ] T029 [US2] Integrate unit decoder into SnapshotReader.readOnce in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T030 [US2] Integrate weapon decoder into SnapshotReader.readOnce in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T031 [US2] Add units array to OlympusSnapshot construction in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T032 [US2] Update bfis-snapshot-read-ok log to include unitCount and buffer sizes in bfis-service/src/snapshot/snapshot-reader.ts

**Checkpoint**: At this point, User Story 2 should be complete - BFIS can decode binary unit/weapon data into structured objects

---

## Phase 5: User Story 3 - BFIS Handles Mission Resets and State Changes (Priority: P2)

**Goal**: BFIS detects session hash changes and resets internal state to avoid using stale data from previous missions.

**Independent Test**: Simulate session hash changes between polls and verify that BFIS detects the change, logs session reset event, clears cached state, and performs full data refresh.

### Tests for User Story 3

- [ ] T033 [P] [US3] Add test: session hash change detected between polls in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T034 [P] [US3] Add test: bfis-session-reset event logged on hash change in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T035 [P] [US3] Add test: lastTimes reset to empty on session hash change in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T036 [P] [US3] Add test: session hash change mid-poll cycle aborts immediately in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts

### Implementation for User Story 3

- [ ] T037 [US3] Implement checkSessionHash method to detect changes in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T038 [US3] Add session hash check after each endpoint fetch in readOnce in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T039 [US3] Implement session reset logic (clear lastTimes, log event) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T040 [US3] Throw error on session hash change to trigger retry in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T041 [US3] Update lastSessionHash after successful poll in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T042 [US3] Generate new snapshotId on session reset (independent of previous) in bfis-service/src/snapshot/snapshot-reader.ts

**Checkpoint**: At this point, User Story 3 should be complete - BFIS handles mission resets gracefully

---

## Phase 6: User Story 4 - BFIS Polls Multiple Data Sources at Appropriate Intervals (Priority: P2)

**Goal**: BFIS retrieves data from all Olympus endpoints (mission, units, weapons, logs, airbases, bullseyes, spots, drawings) and uses time-based query parameters for incremental updates.

**Independent Test**: Verify that BFIS polls each endpoint at configured intervals, uses time query parameters for incremental updates, and updates lastTime state from responses.

### Tests for User Story 4

- [ ] T043 [P] [US4] Add test: readOnce fetches all endpoints in specified order in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T044 [P] [US4] Add test: time query parameter used for units/weapons/logs endpoints in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T045 [P] [US4] Add test: lastTimes updated from response time fields in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts
- [ ] T046 [P] [US4] Add test: full refresh (time=0) on initial poll in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts

### Implementation for User Story 4

- [ ] T047 [US4] Implement fetchUnits helper method with time query parameter in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T048 [US4] Implement fetchWeapons helper method with time query parameter in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T049 [US4] Implement fetchLogs helper method with time query parameter in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T050 [US4] Implement fetchAirbases helper method in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T051 [US4] Implement fetchBullseyes helper method in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T052 [US4] Implement fetchSpots helper method in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T053 [US4] Implement fetchDrawings helper method in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T054 [US4] Update readOnce to fetch all endpoints in specified order (FR-016) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T054a [US4] Integrate polling loop into main entry point (replace heartbeat with loop.start()) in bfis-service/src/index.ts
- [ ] T055 [US4] Extract updateTime from binary buffers (first 8 bytes uint64) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T056 [US4] Update lastTimes from response time fields and binary updateTime in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T057 [US4] Use time=0 for full refresh on initial poll or session reset in bfis-service/src/snapshot/snapshot-reader.ts

**Checkpoint**: At this point, User Story 4 should be complete - BFIS polls all endpoints with incremental updates

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, logging, edge cases, and validation

- [ ] T058 [P] Implement HTTP error handling with structured logging (bfis-snapshot-http-error) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T059 [P] Implement binary decode error handling with structured logging (bfis-snapshot-decode-error) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T060 [P] Implement empty data detection and warning logging (bfis-snapshot-empty-data) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T061 [P] Add data size metrics (buffer sizes, unit count) to bfis-snapshot-read-ok logs in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T061a [P] Implement baseline establishment for large data detection (first N snapshots, configurable via BFIS_LARGE_DATA_BASELINE_SAMPLES) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T061b [P] Implement large data warning logic (configurable multiplier via BFIS_LARGE_DATA_MULTIPLIER, default 2x baseline) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T061c [P] Add incremental update logging (bfis-binary-fetch event with mode: full|incremental, bytes, endpoint) for SC-006 measurement in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T062 [P] Implement partial failure handling (fail entire snapshot, no partial snapshots) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T063 [P] Add input validation for OlympusSnapshot fields (UUID format, coordinate ranges) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T064 [P] Ensure snapshot immutability (no mutation after creation) in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T065 [P] Add comprehensive JSDoc comments to all public methods per constitution in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T066 [P] Add comprehensive JSDoc comments to unit-decoder.ts in bfis-service/src/snapshot/unit-decoder.ts
- [ ] T067 [P] Add comprehensive JSDoc comments to weapon-decoder.ts in bfis-service/src/snapshot/weapon-decoder.ts
- [ ] T068 [P] Run all tests in Docker container to verify Docker testing setup in bfis-service/
- [ ] T069 [P] Verify all structured log events match spec requirements in bfis-service/src/snapshot/snapshot-reader.ts
- [ ] T070 [P] Add test for incremental update size reduction (SC-006) comparing full vs incremental fetch sizes in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories. Task T006b (polling loop) is foundational infrastructure that User Story 4 will integrate with.
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User Story 1 (P1) can start after Foundational
  - User Story 2 (P1) depends on User Story 1 (needs basic snapshot structure)
  - User Story 3 (P2) depends on User Story 1 (needs session hash tracking)
  - User Story 4 (P2) depends on User Stories 1-2 (needs all endpoint fetching)
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Depends on User Story 1 (needs snapshot structure and mission fetching) - Can be tested independently with mock buffers
- **User Story 3 (P2)**: Depends on User Story 1 (needs session hash from mission response) - Can be tested independently by mocking session hash changes
- **User Story 4 (P2)**: Depends on User Stories 1-2 (needs all endpoints and decoding) - Can be tested independently with mocked endpoints. Task T054a depends on T006b (polling loop must exist before integration)

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- Helper methods before main methods
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- **Phase 1**: All tasks marked [P] can run in parallel (T001, T002, T003)
- **Phase 2**: Tasks T004, T005, T006a can run in parallel; T006b depends on T006 (session state)
- **Phase 3 (US1)**: Tests (T007-T010) can run in parallel
- **Phase 4 (US2)**: Tests (T017-T022) can run in parallel
- **Phase 5 (US3)**: Tests (T033-T036) can run in parallel
- **Phase 6 (US4)**: Tests (T043-T046) can run in parallel
- **Phase 7**: All tasks marked [P] can run in parallel (T058-T070)

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task T007: "Create test file for probeMissionOnce in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts"
Task T008: "Add test: probeMissionOnce logs bfis-olympus-probe-ok on success in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts"
Task T009: "Add test: probeMissionOnce throws error on auth failure in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts"
Task T010: "Add test: readOnce constructs snapshot with mission data in bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts"
```

## Parallel Example: User Story 2

```bash
# Launch all decoder tests together:
Task T017: "Create test file for unit decoder in bfis-service/src/snapshot/__tests__/unit-decoder.test.ts"
Task T021: "Create test file for weapon decoder in bfis-service/src/snapshot/__tests__/weapon-decoder.test.ts"
```

---

## Implementation Strategy

### MVP First (User Stories 1-2 Only)

1. Complete Phase 1: Setup (shared schemas, DataIndexes, helpers)
2. Complete Phase 2: Foundational (decoder structures, session state)
3. Complete Phase 3: User Story 1 (mission fetching, basic snapshots)
4. Complete Phase 4: User Story 2 (binary decoding, unit/weapon extraction)
5. **STOP and VALIDATE**: Test User Stories 1-2 independently
6. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Basic snapshot capability (MVP core)
3. Add User Story 2 → Test independently → Full snapshot with units/weapons (MVP complete)
4. Add User Story 3 → Test independently → Session reset handling
5. Add User Story 4 → Test independently → All endpoints polling
6. Add Polish → Final validation and error handling
7. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (mission fetching)
   - Developer B: User Story 2 (binary decoding) - can start after US1 snapshot structure
3. After US1-2 complete:
   - Developer A: User Story 3 (session handling)
   - Developer B: User Story 4 (all endpoints)
4. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- All tests must run in Docker container per AGENTS.md
- Reference Olympus frontend code for decoding patterns:
  - `frontend/react/src/unit/unitsmanager.ts:234-266` (UnitsManager.update)
  - `frontend/react/src/unit/unit.ts:590-831` (Unit.setData)
  - `frontend/react/src/weapon/weaponsmanager.ts:58-89` (WeaponsManager.update)
  - `frontend/react/src/constants/constants.ts:485` (DataIndexes enum)
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

