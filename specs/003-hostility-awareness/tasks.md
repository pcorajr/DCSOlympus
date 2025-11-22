# Implementation Tasks: BFIS Minimal Hostility Awareness

**Feature**: 003-hostility-awareness  
**Branch**: `003-hostility-awareness`  
**Date**: 2025-11-22  
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Summary

This document breaks down the implementation into actionable, dependency-ordered tasks organized by user story. Each user story can be implemented and tested independently, enabling incremental delivery.

**Total Tasks**: 31  
**User Stories**: 3 (US1: P1, US2: P2, US3: P1)  
**MVP Scope**: US1 + US3 (core detection + integration) - 15 tasks

## Dependencies

**Story Completion Order**:
1. **US1** (P1) - Detect Hostilities Started → **US3** (P1) - Provide in Context Snapshot
2. **US2** (P2) - Reset on Mission Change (can be implemented in parallel with US1, but tested after)

**Implementation Strategy**: MVP first (US1 + US3), then enhancement (US2)

## Phase 1: Setup

**Goal**: Create project structure and module directories

**Independent Test**: Verify directories exist and are accessible

- [ ] T001 Create hostility module directory structure at `bfis-service/src/hostility/`
- [ ] T002 Create test directory at `bfis-service/src/hostility/__tests__/`

## Phase 2: Foundational

**Goal**: Define type system for hostility awareness

**Independent Test**: Types compile without errors, can be imported

- [ ] T003 [P] Define `HostilityAwareness` interface in `bfis-service/src/context/types.ts` with fields: `hostilitiesStarted` (boolean), `hostilitiesStartTime` (number | undefined), `sessionHash` (string)
- [ ] T004 [P] Extend `BfisContextSnapshot` interface in `bfis-service/src/context/types.ts` to include `hostility: HostilityAwareness` field

## Phase 3: User Story 1 - Detect Hostilities Started (P1)

**Goal**: Implement core hostility detection logic that identifies when the first weapon is fired

**Independent Test**: When any weapon appears in weapons cache, system correctly identifies hostilities started and sets flag to true. Can be fully tested by verifying weapon cache detection logic.

**Acceptance Criteria**:
- Empty weapon cache → `hostilitiesStarted: false`
- Weapon cache with weapons → `hostilitiesStarted: true`, `hostilitiesStartTime` set to earliest weapon timestamp
- Multiple weapons → `hostilitiesStartTime` is earliest timestamp
- Destroyed weapons (`alive: false`) → still count as hostilities started
- Flag remains `true` once detected (even if cache becomes empty later)

- [ ] T005 [US1] Create `HostilityDetector` class in `bfis-service/src/hostility/hostility-detector.ts` with constructor accepting optional `StructuredLogger`
- [ ] T006 [US1] Implement private state fields in `HostilityDetector`: `hostilitiesStarted` (boolean), `hostilitiesStartTime` (number | undefined), `lastSessionHash` (string | null)
- [ ] T007 [US1] Implement `detect()` method signature in `HostilityDetector` accepting `weaponCache: Map<number, DecodedWeapon>` and `sessionHash: string`, returning `HostilityAwareness`
- [ ] T008 [US1] Implement weapon cache detection logic in `detect()`: if `hostilitiesStarted` is false and `weaponCache.size > 0`, set flag to true
- [ ] T009 [US1] Implement earliest timestamp calculation in `detect()`: iterate through all weapons, find minimum `updateTime`, set as `hostilitiesStartTime`
- [ ] T010 [US1] Implement empty cache handling in `detect()`: if cache is empty, return `hostilitiesStarted: false` (graceful degradation per FR-013)
- [ ] T011 [US1] Implement one-time detection principle in `detect()`: once `hostilitiesStarted` is true, keep it true for entire session (per FR-004)

## Phase 4: User Story 2 - Reset on Mission Change (P2)

**Goal**: Reset hostility awareness state when mission session changes

**Independent Test**: Start mission, fire weapon (hostilities detected), reset mission, verify flag resets to false. Can be fully tested by verifying session hash change detection.

**Acceptance Criteria**:
- Session hash change → `hostilitiesStarted` resets to `false`, `hostilitiesStartTime` cleared
- New session starts fresh detection
- Reset event logged when session hash changes

- [ ] T012 [US2] Implement session hash change detection in `HostilityDetector.detect()`: compare `lastSessionHash` with current `sessionHash`
- [ ] T013 [US2] Implement state reset logic in `HostilityDetector.detect()`: when session hash changes, reset `hostilitiesStarted` to false and clear `hostilitiesStartTime`
- [ ] T014 [US2] Implement missing/invalid session hash handling in `HostilityDetector.detect()`: treat empty string as new session (per FR-014)
- [ ] T015 [US2] Implement `bfis-hostilities-reset` logging event in `HostilityDetector.detect()` when session hash changes (per FR-010)

## Phase 5: User Story 3 - Provide Hostility Awareness in Context Snapshot (P1)

**Goal**: Integrate hostility detection into context snapshot assembly

**Independent Test**: Call `readContextOnce()` and verify `hostility` field is present and populated correctly. Can be fully tested by verifying snapshot integration.

**Acceptance Criteria**:
- `BfisContextSnapshot` includes `hostility` field
- `hostility` field contains valid `HostilityAwareness` object
- `hostility.sessionHash` matches `base.sessionHash`
- Field always present (never null/undefined)

- [ ] T016 [US3] Add `HostilityDetector` import to `bfis-service/src/snapshot/snapshot-reader.ts`
- [ ] T017 [US3] Add `hostilityDetector` field to `SnapshotReader` class in `bfis-service/src/snapshot/snapshot-reader.ts` initialized in constructor
- [ ] T018 [US3] Integrate `HostilityDetector.detect()` call in `SnapshotReader.readContextOnce()` after context snapshot assembly, passing `this.weaponCache` and `baseSnapshot.sessionHash`
- [ ] T019 [US3] Attach `HostilityAwareness` result to `BfisContextSnapshot.hostility` field before returning from `readContextOnce()`

## Phase 6: Polish & Cross-Cutting Concerns

**Goal**: Complete implementation with logging, error handling, and tests

**Independent Test**: All edge cases handled, logging events emitted, tests pass

- [ ] T020 [P] Implement `bfis-hostilities-started` logging event in `HostilityDetector.detect()` when hostilities first detected (per FR-009)
- [ ] T021 [P] Implement `bfis-hostilities-status` debug logging in `HostilityDetector.detect()` when hostilities already started (optional visibility)
- [ ] T022 [P] Add comprehensive JSDoc/TSDoc comments to `HostilityDetector` class and methods per constitution Principle VIII
- [ ] T023 [P] Add comprehensive JSDoc/TSDoc comments to `HostilityAwareness` interface per constitution Principle VIII
- [ ] T024 [P] Create unit tests in `bfis-service/src/hostility/__tests__/hostility-detector.test.ts` for empty cache scenario
- [ ] T025 [P] Create unit tests in `bfis-service/src/hostility/__tests__/hostility-detector.test.ts` for weapon detection scenario
- [ ] T026 [P] Create unit tests in `bfis-service/src/hostility/__tests__/hostility-detector.test.ts` for multiple weapons earliest timestamp scenario
- [ ] T027 [P] Create unit tests in `bfis-service/src/hostility/__tests__/hostility-detector.test.ts` for session hash change reset scenario
- [ ] T028 [P] Create unit tests in `bfis-service/src/hostility/__tests__/hostility-detector.test.ts` for one-time detection principle (flag stays true)
- [ ] T029 [P] Create unit tests in `bfis-service/src/hostility/__tests__/hostility-detector.test.ts` for missing/invalid session hash handling
- [ ] T030 [P] Create integration tests verifying `BfisContextSnapshot.hostility` populated correctly in snapshot reader tests
- [ ] T031 [P] Verify all tests run in Docker container per constitution (update test scripts if needed)

## Parallel Execution Opportunities

### Phase 2 (Foundational)
- **T003** and **T004** can run in parallel (different type definitions in same file, but independent)

### Phase 3 (US1)
- Tasks T005-T011 are sequential (each builds on previous)

### Phase 4 (US2)
- Tasks T012-T015 are sequential (each builds on previous)
- Can be implemented in parallel with Phase 3 if different developers

### Phase 5 (US3)
- Tasks T016-T019 are sequential (integration tasks)

### Phase 6 (Polish)
- **T020-T023** can run in parallel (documentation tasks)
- **T024-T031** can run in parallel (test tasks, different test cases)

## Implementation Strategy

### MVP First (Incremental Delivery)

**MVP Scope**: US1 + US3 (core detection + integration)
- Complete Phase 1 (Setup)
- Complete Phase 2 (Foundational)
- Complete Phase 3 (US1 - Detect Hostilities Started)
- Complete Phase 5 (US3 - Provide in Context Snapshot)
- Complete Phase 6 (Polish - at minimum T020, T022, T023, T024, T025, T030)

**MVP Deliverable**: System can detect hostilities and include awareness in context snapshot. Session reset (US2) can be added in next increment.

### Full Implementation

After MVP:
- Complete Phase 4 (US2 - Reset on Mission Change)
- Complete remaining Phase 6 tasks (all tests, all logging)

## Task Count Summary

- **Phase 1 (Setup)**: 2 tasks
- **Phase 2 (Foundational)**: 2 tasks
- **Phase 3 (US1)**: 7 tasks
- **Phase 4 (US2)**: 4 tasks
- **Phase 5 (US3)**: 4 tasks
- **Phase 6 (Polish)**: 12 tasks

**Total**: 31 tasks

## Notes

- All tasks must include comprehensive JSDoc/TSDoc per constitution
- All tests must run in Docker container per constitution
- Tasks marked with [P] can be parallelized
- Tasks marked with [US1], [US2], [US3] belong to specific user stories
- File paths are absolute from repository root
- Each task is specific enough for LLM implementation without additional context

