# Implementation Plan: BFIS Minimal Hostility Awareness

**Branch**: `003-hostility-awareness` | **Date**: 2025-11-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-hostility-awareness/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Add minimal hostility awareness to BFIS by detecting when real hostilities have started in a mission. This provides a simple boolean signal that combat has begun by examining weapons data in the context snapshot. The implementation extends the existing `BfisContextSnapshot` structure with a `hostility` field containing `HostilityAwareness` state, and introduces a new `HostilityDetector` class that maintains in-memory state per mission session. Detection is based on the presence of any weapon in the weapons cache (from existing `SnapshotReader.weaponCache`), with state resetting when the mission session hash changes.

## Technical Context

**Language/Version**: TypeScript 5.8.2, Node.js 20 (ES2023 target, NodeNext module resolution)  
**Primary Dependencies**: None (uses existing BFIS infrastructure: `SnapshotReader`, `structured-logger`, `shared-schemas`)  
**Storage**: In-memory only (no persistence - state maintained in `HostilityDetector` instance, lost on service restart)  
**Testing**: Jest or similar Node.js test framework (tests run in Docker container per constitution)  
**Target Platform**: Linux server (Docker container, Node.js 20 runtime)  
**Project Type**: Single service (BFIS sidecar service)  
**Performance Goals**: Detection must complete within existing snapshot polling cycle (< 3s total per spec-002), no additional latency overhead  
**Constraints**: Must integrate seamlessly with existing `SnapshotReader.readContextOnce()` flow, maintain backward compatibility with `BfisContextSnapshot` consumers, handle weapon endpoint failures gracefully  
**Scale/Scope**: Single BFIS service instance per Olympus instance, handles one mission session at a time, state resets on session hash change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0 Check

✅ **Whitelisted Implementation Area**: Feature adds code to `bfis-service/src/hostility/` (whitelisted area)  
✅ **No Olympus Core Modifications**: No changes to `backend/`, `frontend/`, or `mod/` directories  
✅ **Sidecar Pattern**: BFIS only reads from Olympus via existing HTTP APIs (weapons endpoint already used)  
✅ **Specification-Driven**: Feature is fully specified in `spec.md` with clear requirements and success criteria  
✅ **Documentation in Code**: All new code must include comprehensive JSDoc/TSDoc (per constitution Principle VIII)  
✅ **Type Safety**: TypeScript strict mode required, types defined in `shared-schemas` or internal types  
✅ **Testing in Docker**: All tests must run in Docker container (per constitution Principle VIII)  
✅ **Single Conversation Pattern**: Feature extends existing snapshot → decision → command → log pattern  
✅ **No Duplication**: Uses existing `SnapshotReader` and weapon cache, does not rebuild Olympus functionality  

**Status**: ✅ PASS - All gates satisfied. Feature aligns with constitution principles.

### Post-Phase 1 Check

*To be re-evaluated after design artifacts are created*

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
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
│   ├── hostility/                    # NEW: Hostility detection module
│   │   ├── hostility-detector.ts     # NEW: HostilityDetector class
│   │   └── __tests__/
│   │       └── hostility-detector.test.ts  # NEW: Unit tests
│   ├── context/
│   │   └── types.ts                  # MODIFY: Add HostilityAwareness type, extend BfisContextSnapshot
│   └── snapshot/
│       └── snapshot-reader.ts       # MODIFY: Integrate HostilityDetector in readContextOnce()
└── build/                            # Generated TypeScript output

shared-schemas/
└── index.ts                          # NO CHANGE: HostilityAwareness is internal type, not shared
```

**Structure Decision**: Single service project structure. New `hostility/` module follows existing BFIS module pattern (similar to `snapshot/`, `context/`, `logger/`). Hostility detection integrates into existing `SnapshotReader.readContextOnce()` flow without requiring new public APIs. Types are internal to BFIS (in `context/types.ts`), not exported to shared schemas, maintaining separation of concerns.

## Phase 0: Research Complete

✅ **research.md** generated with all design decisions resolved:
- Integration approach with SnapshotReader
- State management (in-memory, session-based)
- Error handling patterns
- Logging structure
- Type definitions location
- Timestamp determination logic

## Phase 1: Design Complete

✅ **data-model.md** generated with entity definitions:
- HostilityAwareness type
- Extended BfisContextSnapshot
- Validation rules
- State transitions
- Data flow

✅ **contracts/** generated:
- hostility-detector-api.md - Internal API contract

✅ **quickstart.md** generated:
- Step-by-step implementation guide
- Code examples
- Testing approach

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations - feature follows existing BFIS patterns and architecture.
