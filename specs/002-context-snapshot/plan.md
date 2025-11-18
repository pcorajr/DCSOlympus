# Implementation Plan: BFIS Context Snapshot

**Branch**: `002-context-snapshot` | **Date**: 2025-11-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-context-snapshot/spec.md`

## Summary

Extend BFIS snapshot ingestion to include rich battlefield context data (airbases, bullseyes, spots, drawings, logs, and weapons state) alongside mission and units data. This creates a unified `BfisContextSnapshot` that provides complete operational awareness for future decision-making. The implementation extends the existing `SnapshotReader` class with context normalization helpers, a new `readContextOnce()` method, and enhanced error handling for partial endpoint failures.

**Technical Approach**: Extend existing TypeScript/Node.js service with:
- Context normalization functions for each data type (airbases, bullseyes, spots, drawings, logs)
- Weapons summary derivation from existing weapons decoder
- New `readContextOnce()` method that assembles unified context snapshot
- Enhanced error handling allowing partial failures (graceful degradation)
- Deterministic sorting and field filtering for stable output
- Extended structured logging with context-specific metadata

## Technical Context

**Language/Version**: TypeScript 5.8.2 / Node.js 20+ (ES2023, NodeNext module resolution)  
**Primary Dependencies**: 
- Native `fetch` API (Node.js 20+ built-in)
- `uuid` v11.1.0 for snapshot ID generation (already in use)
- `dotenv` v16.4.5 for environment configuration (already in use)
- TypeScript strict mode enabled
- Existing `SnapshotReader` class with all endpoint fetch methods already implemented

**Storage**: In-memory only (no persistent storage). Context snapshots are ephemeral, created on-demand during polling cycles.  
**Testing**: 
- Test framework: Node.js built-in test runner (Node.js 20+ built-in, no external dependencies)
- All tests run in Docker container per AGENTS.md requirements
- Test location: `bfis-service/src/snapshot/__tests__/` (co-located with code)
- Test location for normalizers: `bfis-service/src/context/__tests__/` or `bfis-service/src/snapshot/__tests__/` (depending on module location)

**Target Platform**: Linux (Docker container), Node.js 20+ runtime  
**Project Type**: Single service (TypeScript/Node.js sidecar service)  
**Performance Goals**: 
- Context snapshot creation: < 3 seconds (SC-006, same as spec-001 base snapshot)
- All context endpoints fetched and normalized within polling interval
- Deterministic normalization: 100% consistent output for identical inputs (SC-004)

**Constraints**: 
- Must run in Docker container (all testing in Docker)
- No modifications to Olympus core code (backend/, frontend/, mod/)
- Must use existing Olympus HTTP APIs only
- TypeScript strict mode required
- All documentation in code (JSDoc/TSDoc), no separate markdown docs
- Must extend existing `SnapshotReader` without breaking `readOnce()` API
- Must handle partial endpoint failures gracefully (FR-008, FR-009)

**Scale/Scope**: 
- Single BFIS service instance per DCSOlympus deployment
- Handles typical DCS mission scale (hundreds to low thousands of context entries)
- Size warnings logged at 1000+ entries per slice type (FR-017)
- Polling intervals: 1-10 seconds depending on endpoint (reuses spec-001 intervals)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Principle I: Optimize for the Real World
- **Status**: PASS
- **Rationale**: Builds on existing `SnapshotReader` infrastructure. Reuses all endpoint fetch methods. Simple normalization functions with minimal processing. Performance target (3 seconds) matches spec-001, ensuring no degradation.

### ✅ Principle II: Learning and Enjoyment
- **Status**: PASS
- **Rationale**: Clean extension pattern. Well-documented normalization functions. Follows established patterns from spec-001.

### ✅ Principle III: Transparency and Auditability (NON-NEGOTIABLE)
- **Status**: PASS
- **Rationale**: All context operations logged with structured JSON. New `bfis-context-snapshot-ok` event with full metadata. Errors logged with endpoint context. Size warnings for monitoring.

### ✅ Principle IV: Human-in-the-Loop by Default
- **Status**: PASS
- **Rationale**: BFIS observes and normalizes only; decision-making is separate spec. All operations are logged and observable. Graceful degradation allows human intervention when endpoints fail.

### ✅ Principle V: Clean, Maintainable Code Over Cleverness
- **Status**: PASS
- **Rationale**: Simple normalization functions (one per context type). Deterministic sorting by ID. No complex transformations. Clear separation: normalization vs. snapshot assembly.

### ✅ Principle VI: Genuine Utility Over Feature Creep
- **Status**: PASS
- **Rationale**: Core capability required for complete battlefield awareness. No extra features beyond spec requirements. Minimal field preservation (only what's needed for decisions).

### ✅ Principle VII: Practical Quality
- **Status**: PASS
- **Rationale**: Tests for critical paths (normalization, error handling, partial failures). Performance targets are "good enough" for hobby scale. Deterministic output ensures testability.

### ✅ Principle VIII: Code Quality Standards (NON-NEGOTIABLE)
- **Status**: PASS
- **Rationale**: 
  - TypeScript strict mode enabled
  - Comprehensive JSDoc required for all public APIs and normalizer functions
  - Error handling explicit with context (partial failures logged but don't crash)
  - Single-responsibility modules (one normalizer per context type)
  - Tests co-located in `__tests__` directories

### ✅ Architectural Boundaries
- **Status**: PASS
- **Rationale**: 
  - BFIS is sidecar (separate service in `bfis-service/`)
  - Only talks to Olympus via HTTP APIs (all endpoints already exist)
  - Never touches DCS directly
  - No Olympus core modifications
  - Extends existing `SnapshotReader` without breaking changes

### ✅ Specification-Driven Development
- **Status**: PASS
- **Rationale**: 
  - Implementation follows spec-002.md exactly
  - Builds on spec-001 foundation
  - Shared schemas will be extended (internal types, not exported yet)
  - All requirements traceable to functional requirements

## Project Structure

### Documentation (this feature)

```text
specs/002-context-snapshot/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
bfis-service/
├── src/
│   ├── snapshot/
│   │   ├── snapshot-reader.ts          # Extend with readContextOnce() method
│   │   ├── unit-decoder.ts             # Existing (spec-001)
│   │   ├── weapon-decoder.ts          # Existing (spec-001)
│   │   └── __tests__/
│   │       └── snapshot-reader.test.ts # Extend with context snapshot tests
│   └── context/                        # NEW: Context normalization module
│       ├── normalizers.ts              # All normalization functions
│       └── __tests__/
│           └── normalizers.test.ts     # Normalization tests
└── shared-schemas/
    └── index.ts                        # Add internal BfisContextSnapshot type (not exported yet)
```

**Structure Decision**: Create new `bfis-service/src/context/` directory for context normalization functions. This keeps normalization logic separate from snapshot reading logic, following single-responsibility principle. Alternative of co-locating in `snapshot/` was considered but rejected to maintain clear separation between "reading" and "normalizing" concerns.

## Complexity Tracking

> **No violations detected - all constitution checks pass**
