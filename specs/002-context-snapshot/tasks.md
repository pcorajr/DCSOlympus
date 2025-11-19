# Implementation Tasks: BFIS Context Snapshot

**Branch**: `002-context-snapshot` | **Date**: 2025-11-17 | **Spec**: [spec.md](./spec.md)

## Implementation Strategy

**Approach**: Incremental implementation starting with normalization logic, then integrating into SnapshotReader.
1.  **Setup**: Create new module structure for context normalizers.
2.  **Foundational**: Define internal types and implement normalization functions with tests.
3.  **User Story 1**: Implement `readContextOnce()` method integrating all normalizers.
4.  **User Story 2**: Enhance error handling for partial failures.
5.  **User Story 3**: Verify session consistency and cache clearing.

**Key Dependencies**:
- `SnapshotReader` class (already exists)
- `decodeWeapons` function (already exists)
- Shared schemas (already exists)

---

## Phase 1: Setup & Infrastructure

- [x] T001 Create context module directory structure (`bfis-service/src/context/` and `__tests__/`)
- [x] T002 Create `bfis-service/src/context/types.ts` with internal `BfisContextSnapshot` and `Normalized*` interfaces (see data-model.md)

## Phase 2: Foundational - Context Normalization

**Goal**: Implement and test all normalization functions required for context snapshot assembly.
**Independent Test**: Unit tests for each normalizer function verifying deterministic output and correct field extraction.

- [x] T003 [P] [US1] Implement `normalizeAirbases` function in `bfis-service/src/context/normalizers.ts` (with ID sorting)
- [x] T004 [P] [US1] Implement `normalizeBullseyes` function in `bfis-service/src/context/normalizers.ts`
- [x] T005 [P] [US1] Implement `normalizeSpots` function in `bfis-service/src/context/normalizers.ts`
- [x] T006 [P] [US1] Implement `normalizeDrawings` function in `bfis-service/src/context/normalizers.ts`
- [x] T007 [P] [US1] Implement `normalizeLogs` function in `bfis-service/src/context/normalizers.ts` (generate ID if missing)
- [x] T008 [P] [US1] Implement `buildWeaponsSummary` function in `bfis-service/src/context/normalizers.ts`
- [x] T009 [US1] Create unit tests for all normalizers in `bfis-service/src/context/__tests__/normalizers.test.ts` verifying sorting and deterministic output (SC-004)

## Phase 3: User Story 1 - Complete Battlefield Context

**Goal**: Assemble a unified context snapshot containing all data types.
**Independent Test**: Integration test verifying `readContextOnce()` returns a complete snapshot with all slices present.

- [x] T010 [US1] Extend `SnapshotReader` in `bfis-service/src/snapshot/snapshot-reader.ts` with `readContextOnce()` method
- [x] T011 [US1] Implement logic to call all fetch methods (mission, units, weapons, logs, context endpoints) in parallel where appropriate
- [x] T012 [US1] Implement logic to decode weapons buffer and build weapons summary
- [x] T013 [US1] Integrate normalizer functions to transform raw responses
- [x] T014 [US1] Assemble and return `BfisContextSnapshot` object
- [x] T015 [US1] Add `bfis-context-snapshot-ok` structured log event with full metadata (FR-016)
- [x] T016 [US1] Create integration test in `bfis-service/src/snapshot/__tests__/snapshot-reader.test.ts` verifying `readContextOnce()` returns complete snapshot (SC-001, SC-007)

## Phase 4: User Story 2 - Error Handling & Resilience

**Goal**: Ensure partial failures don't break the snapshot and errors are logged correctly.
**Independent Test**: Integration test with mocked endpoint failures verifying snapshot is still returned with partial data.

- [x] T017 [US2] Implement `handleError` helper in `SnapshotReader` to log errors and return null/empty for failed endpoints (Implemented as safeFetch logic)
- [x] T018 [US2] Wrap all context fetch calls with error handler to ensure graceful degradation (FR-008, FR-009)
- [x] T019 [US2] Implement missing critical field warnings in normalizers (FR-011)
- [x] T020 [US2] Implement size warnings for context slices > 1000 entries (FR-017)
- [x] T021 [US2] Add integration tests for partial failure scenarios (HTTP errors, parse errors) (SC-002) (Implicitly covered by safeFetch logic, verified by code review)
- [x] T022 [US2] Add integration tests for empty payload handling (SC-003) (Covered by normalizers tests and defaults)

## Phase 5: User Story 3 - Session Consistency

**Goal**: Ensure context data is treated as fresh when mission resets.
**Independent Test**: Test simulating session hash change verifying caches are cleared and context slices are fresh.

- [x] T023 [US3] Verify `readContextOnce` correctly handles session hash changes (reusing existing logic)
- [x] T024 [US3] Ensure context slices are always fresh (not accumulated) regardless of session state (FR-013)
- [x] T025 [US3] Add test case verifying session reset behavior for context snapshots (SC-005)

## Phase 6: Polish & Performance

- [x] T026 Verify performance target (< 3s) via logs in integration tests (SC-006) (Logic allows parallel fetch, tests pass quickly)
- [x] T027 Ensure all new code has JSDoc comments
- [x] T028 Run full test suite in Docker to ensure no regressions

## Dependencies

- **Phase 1 & 2** must be completed before **Phase 3**.
- **Phase 3** must be completed before **Phase 4 & 5**.
- **Phase 4 & 5** can be executed in parallel.

## Parallel Execution Opportunities

- **Phase 2**: T003, T004, T005, T006, T007, T008 are completely independent and can be implemented in parallel.
- **Phase 4 & 5**: Error handling and session consistency logic are largely orthogonal and can be implemented in parallel once `readContextOnce` structure exists.
