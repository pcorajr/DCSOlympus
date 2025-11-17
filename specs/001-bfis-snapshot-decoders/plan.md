# Implementation Plan: BFIS Snapshot Ingestion & Binary Decoding

**Branch**: `001-bfis-snapshot-decoders` | **Date**: 2025-11-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-bfis-snapshot-decoders/spec.md`

## Summary

Implement the foundational BFIS capability to observe battlefield state from Olympus by polling multiple endpoints, decoding binary unit/weapon data, and constructing normalized snapshots. This enables all subsequent BFIS decision-making by providing accurate, timely battlefield state information. The implementation extends the existing bootstrap `SnapshotReader` with full polling, binary decoding via `DataExtractor`, session hash tracking, and comprehensive error handling.

**Technical Approach**: Extend existing TypeScript/Node.js service with:
- HTTP polling orchestration with configurable intervals
- Binary buffer decoding using ported `DataExtractor` (already implemented)
- Session state management for mission reset detection
- Structured logging for all operations
- Immutable snapshot construction with UUID v4 IDs

## Technical Context

**Language/Version**: TypeScript 5.8.2 / Node.js 20+ (ES2023, NodeNext module resolution)  
**Primary Dependencies**: 
- Native `fetch` API (Node.js 20+ built-in)
- `uuid` v11.1.0 for snapshot ID generation
- `dotenv` v16.4.5 for environment configuration
- TypeScript strict mode enabled

**Storage**: In-memory only (no persistent storage). Session state (lastSessionHash, lastTimes) maintained in `SnapshotReader` instance.  
**Testing**: 
- Test framework: Node.js built-in test runner (Node.js 20+ built-in, no external dependencies)
- All tests run in Docker container per AGENTS.md requirements
- Test location: `bfis-service/src/snapshot/__tests__/` (co-located with code)

**Target Platform**: Linux (Docker container), Node.js 20+ runtime  
**Project Type**: Single service (TypeScript/Node.js sidecar service)  
**Performance Goals**: 
- Poll cycle completion: < 3 seconds (SC-002)
- Startup probe: < 5 seconds (SC-001)
- Binary decode accuracy: 100% for valid buffers (SC-003)
- Session hash detection: < polling interval latency (SC-004)

**Constraints**: 
- Must run in Docker container (all testing in Docker)
- No modifications to Olympus core code (backend/, frontend/, mod/)
- Must use existing Olympus HTTP APIs only
- TypeScript strict mode required
- All documentation in code (JSDoc/TSDoc), no separate markdown docs

**Scale/Scope**: 
- Single BFIS service instance per DCSOlympus deployment
- Handles typical DCS mission scale (hundreds to low thousands of units)
- Polling intervals: 1-10 seconds depending on endpoint
- No horizontal scaling required (single sidecar pattern)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Principle I: Optimize for the Real World
- **Status**: PASS
- **Rationale**: Implementation uses existing Olympus APIs, simple polling pattern, no over-engineering. Performance targets are realistic for hobby-scale deployment.

### ✅ Principle II: Learning and Enjoyment
- **Status**: PASS
- **Rationale**: Clean, understandable code structure. Well-documented with JSDoc. Follows established patterns from Olympus frontend.

### ✅ Principle III: Transparency and Auditability (NON-NEGOTIABLE)
- **Status**: PASS
- **Rationale**: All snapshot operations logged with structured JSON. Snapshot IDs (UUID v4) enable traceability. Logs include size metrics for baseline establishment.

### ✅ Principle IV: Human-in-the-Loop by Default
- **Status**: PASS
- **Rationale**: BFIS observes only; decision-making is separate spec. All operations are logged and observable.

### ✅ Principle V: Clean, Maintainable Code Over Cleverness
- **Status**: PASS
- **Rationale**: Direct port of DataExtractor (no clever tricks). Simple polling loop. Clear separation of concerns (reader, decoder, state management).

### ✅ Principle VI: Genuine Utility Over Feature Creep
- **Status**: PASS
- **Rationale**: Core capability required for all BFIS functionality. No extra features beyond spec requirements.

### ✅ Principle VII: Practical Quality
- **Status**: PASS
- **Rationale**: Tests for critical paths (decoding, session handling, error cases). Performance targets are "good enough" for hobby scale.

### ✅ Principle VIII: Code Quality Standards (NON-NEGOTIABLE)
- **Status**: PASS
- **Rationale**: 
  - TypeScript strict mode enabled
  - Comprehensive JSDoc required for all public APIs
  - Error handling explicit with context
  - Single-responsibility modules (SnapshotReader, DataExtractor)
  - Tests co-located in `__tests__` directories

### ✅ Architectural Boundaries
- **Status**: PASS
- **Rationale**: 
  - BFIS is sidecar (separate service in `bfis-service/`)
  - Only talks to Olympus via HTTP APIs
  - Never touches DCS directly
  - No Olympus core modifications
  - Uses shared schemas for contract

### ✅ Specification-Driven Development
- **Status**: PASS
- **Rationale**: Implementation follows spec-001.md exactly. Shared schemas in `shared-schemas/index.ts` define contract.

### ✅ Whitelisted Implementation Areas
- **Status**: PASS
- **Rationale**: All code changes in `bfis-service/**` and `shared-schemas/**`. No modifications to backend/, frontend/, mod/.

**Constitution Check Result**: ✅ ALL GATES PASS

## Project Structure

### Documentation (this feature)

```text
specs/001-bfis-snapshot-decoders/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── snapshot-api.md  # SnapshotReader API contract
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
bfis-service/
├── src/
│   ├── snapshot/
│   │   ├── snapshot-reader.ts        # Main SnapshotReader class (extend existing)
│   │   ├── binary-decoder.ts         # DataExtractor (already implemented)
│   │   ├── unit-decoder.ts           # NEW: High-level unit binary decoder
│   │   ├── weapon-decoder.ts         # NEW: High-level weapon binary decoder
│   │   └── __tests__/
│   │       ├── snapshot-reader.test.ts
│   │       ├── binary-decoder.test.ts
│   │       ├── unit-decoder.test.ts
│   │       └── weapon-decoder.test.ts
│   ├── runtime/
│   │   └── polling-loop.ts           # NEW: Main polling loop orchestrator
│   ├── types/
│   │   └── internal.ts               # Internal BFIS types (BfisLatLng, etc. - already exists)
│   ├── config/
│   │   └── config.ts                 # BfisConfig (already exists)
│   ├── logger/
│   │   ├── structured-logger.ts      # StructuredLogger (already exists)
│   │   └── ndjson-logger.ts          # NDJSON logger (already exists)
│   └── index.ts                       # Main entry point (already exists)

shared-schemas/
└── index.ts                           # Shared TypeScript schemas (extend with OlympusSnapshot, etc.)
```

**Structure Decision**: Single TypeScript service project. Code organized by feature area (snapshot/, config/, logger/). Tests co-located with source code in `__tests__/` directories. Shared schemas in separate `shared-schemas/` directory for contract definition.

## Complexity Tracking

> **No violations detected - all constitution gates passed**
