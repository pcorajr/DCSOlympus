# Implementation Plan: Multi-Agent LLM Architecture for BFIS

**Branch**: `004-bfis-llm-architecture` | **Date**: 2025-01-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-bfis-llm-architecture/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a multi-agent LLM architecture for BFIS consisting of three specialized agents (Intel, Commander, Writer) orchestrated by a LangGraph-based state machine. The Intel agent observes and summarizes battlefield state, the Commander agent makes tactical decisions, and the Writer agent translates decisions into executable Olympus commands. The system supports both LLM-driven intelligent decision-making and rules-based fallback, with configurable command execution (logging-only or live execution).

## Technical Context

**Language/Version**: TypeScript 5.8.2 (strict mode required per constitution)  
**Primary Dependencies**: 
- LangChain.js / LangGraph (multi-agent orchestration)
- Existing BFIS infrastructure: SnapshotReader, StructuredLogger, config system
- LLM providers: Ollama, LLMstudio (MVP), extensible to OpenAI/Anthropic (future)
- Turf.js (spatial analysis for unit clustering)
- Lodash (data aggregation for summaries)

**Storage**: In-memory only (no persistent storage for MVP)
- Agent state cached in memory during cycles
- Previous snapshot cache for change detection (cleared on session hash changes)
- Logs written to files under `bfis-service/logs/` (structured JSON + NDJSON decision logs)

**Testing**: Node.js built-in test framework (`node:test`)
- **CRITICAL**: ALL tests MUST run in Docker container (per constitution)
- Unit tests for individual agents (Intel, Commander, Writer)
- Integration tests for full orchestrator cycles
- Mock LLM responses for deterministic testing
- Test files co-located in `__tests__/` directories

**Target Platform**: Linux server (Docker container)
- Runs alongside Olympus service
- Communicates via HTTP APIs (REST + binary streams)
- No direct DCS access (Olympus is gateway)

**Project Type**: Single service (BFIS sidecar)
- Lives in `bfis-service/` directory
- Own package.json, Dockerfile, runtime
- Follows existing BFIS module organization patterns

**Performance Goals**: 
- Decision cycles complete in < 5 seconds for 95% of cycles (SC-001)
- Change detection accuracy ≥ 95% (SC-002)
- Decision production rate ≥ 90% when battlefield state available (SC-003)
- Command translation success ≥ 95% (SC-004)

**Constraints**: 
- Must not modify Olympus core code (`backend/**`, `frontend/**`, `mod/**`)
- Must not duplicate Olympus mission-state logic (consume results only)
- No persistent state stores, message queues, or WebSockets (MVP uses in-process polling)
- Sequential decision cycles only (one completes before next starts)
- Maximum 10 actions per decision (configurable, default 10)
- Cycle timeout: 30 seconds (configurable, default 30s)

**Scale/Scope**: 
- Handles battlefield snapshots with up to 1000+ units (with filtering/aggregation)
- Token budget: ~8500 tokens per cycle (max), ~6000 average with caching
- Supports multiple LLM providers (Ollama, LLMstudio, future: OpenAI, Anthropic)
- Configurable execution mode (logging-only or live execution)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Architectural Boundaries
- **PASS**: All agent code lives in `bfis-service/src/agents/` (whitelisted area)
- **PASS**: No modifications to Olympus core code (`backend/**`, `frontend/**`, `mod/**`)
- **PASS**: BFIS only talks to Olympus via existing HTTP APIs (no direct DCS access)
- **PASS**: Follows single conversation pattern: Read state → Understand intent → Decide → Command → Log

### ✅ Code Quality Standards
- **PASS**: TypeScript strict mode required (already enforced in project)
- **PASS**: All documentation in code (JSDoc/TSDoc) - no separate markdown docs
- **PASS**: Comprehensive JSDoc for all public APIs, classes, functions, types
- **PASS**: Error handling explicit with context for debugging
- **PASS**: Testing in Docker container only (per constitution requirement)

### ✅ Specification-Driven Development
- **PASS**: Architecture described in `docs/architecture/spec-004.md`
- **PASS**: Types defined in `bfis-service/src/agents/types.ts` (single source of truth)
- **PASS**: Integration points documented in spec-004.md
- **PASS**: NDJSON decision logs required (per BFIS integration strategy)

### ✅ Human-in-the-Loop
- **PASS**: Configurable execution mode allows safe testing (logging-only)
- **PASS**: Rules-based fallback ensures system never fails catastrophically
- **PASS**: All decisions include reasoning notes for transparency

### ⚠️ Potential Complexity Concerns
- **Multi-agent orchestration**: Justified - natural separation of concerns (Intel/Commander/Writer) aligns with existing BFIS architecture
- **LangGraph dependency**: Justified - purpose-built for multi-agent workflows, TypeScript support, integrates with existing LLM infrastructure
- **State management**: Justified - immutable state pattern required for agent coordination, in-memory only (no persistent storage)

## Project Structure

### Documentation (this feature)

```text
specs/004-bfis-llm-architecture/
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
│   ├── agents/                    # NEW: Multi-agent architecture
│   │   ├── intel-agent.ts         # Intel agent: observes & summarizes battlefield
│   │   ├── commander-agent.ts     # Commander agent: makes tactical decisions
│   │   ├── writer-agent.ts         # Writer agent: translates decisions to commands
│   │   ├── orchestrator.ts         # LangGraph orchestrator: coordinates agents
│   │   ├── types.ts                # Agent-specific types (already exists)
│   │   ├── tools/
│   │   │   ├── snapshot-tools.ts  # Intel agent tools (get_current_snapshot, etc.)
│   │   │   └── index.ts            # Tool exports
│   │   └── __tests__/              # Agent tests (Docker-only)
│   │       ├── intel-agent.test.ts
│   │       ├── commander-agent.test.ts
│   │       ├── writer-agent.test.ts
│   │       ├── orchestrator.test.ts
│   │       └── tools/
│   │           └── snapshot-tools.test.ts
│   ├── snapshot/                   # EXISTING: Snapshot ingestion (spec-001)
│   ├── context/                     # EXISTING: Context normalization (spec-002)
│   ├── decider/                     # EXISTING: Decision logic (will be refactored)
│   ├── config/                      # EXISTING: Configuration management
│   ├── logger/                      # EXISTING: Structured logging
│   └── runtime/                     # EXISTING: Polling loop (will integrate orchestrator)
└── logs/                            # EXISTING: Log files (structured + NDJSON)
```

**Structure Decision**: Follows existing BFIS module organization pattern. All agent code lives under `bfis-service/src/agents/` mirroring existing patterns (`snapshot/`, `context/`, `decider/`). Tests co-located in `__tests__/` directories. No new top-level directories required.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Multi-agent orchestration framework (LangGraph) | Natural separation of Intel/Commander/Writer agents requires coordination | Single monolithic LLM would be harder to test, debug, and maintain. Three specialized agents align with existing BFIS architecture (SnapshotReader, Decider, CommandAdapter) |
| State machine pattern | Agents must pass data through immutable state for coordination | Direct function calls would create tight coupling and make error handling/retry logic complex. State machine enables clear error propagation and recovery. |

## Phase 0: Research & Technology Decisions ✅

**Status**: Complete

**Output**: [research.md](./research.md)

**Key Decisions**:
- LangGraph for multi-agent orchestration
- In-memory state management (no persistent storage)
- Sequential decision cycles
- Rules-based fallback with conservative actions
- Configurable command execution mode
- LLM provider abstraction

## Phase 1: Design & Contracts ✅

**Status**: Complete

**Outputs**:
- [data-model.md](./data-model.md) - Entity definitions, relationships, validation rules
- [contracts/agent-interfaces.md](./contracts/agent-interfaces.md) - Agent interface contracts
- [quickstart.md](./quickstart.md) - Implementation and testing guide

**Key Artifacts**:
- Data model: TacticalSummary, SnapshotDelta, MissionContext, AgentState, etc.
- Agent interfaces: Intel, Commander, Writer, Orchestrator
- Integration contracts: SnapshotReader, LLM Client, Command Adapter, Logger
- State machine contract: LangGraph nodes and edges

## Next Steps

**Phase 2**: Task breakdown (via `/speckit.tasks` command)
- Break down implementation into concrete tasks
- Organize by user stories and dependencies
- Create task file for development tracking

**Ready for**: `/speckit.tasks` - Create task breakdown for implementation
