# Agent Interfaces: Multi-Agent LLM Architecture

**Date**: 2025-01-27  
**Feature**: Multi-Agent LLM Architecture for BFIS  
**Phase**: Phase 1 - Design & Contracts

## Overview

This document defines the interfaces and contracts for the three specialized agents (Intel, Commander, Writer) and the orchestrator. These are TypeScript interfaces that ensure type safety when passing data between agents.

## Intel Agent Interface

**File**: `bfis-service/src/agents/intel-agent.ts`

**Purpose**: Observe battlefield state and generate tactical summaries with change detection.

### Methods

#### `process(currentSnapshot: BfisContextSnapshot, previousSnapshot: BfisContextSnapshot | null): Promise<IntelAgentOutput>`

Processes battlefield snapshot and generates tactical summary with optional change detection.

**Input**:
- `currentSnapshot: BfisContextSnapshot` - Current battlefield state (required)
- `previousSnapshot: BfisContextSnapshot | null` - Previous snapshot for change detection (null if first observation)

**Output**: `Promise<IntelAgentOutput>`
- `summary: TacticalSummary` - Tactical summary (required)
- `changes?: SnapshotDelta` - Detected changes (null if no previous snapshot)
- `timestamp: string` - ISO 8601 timestamp
- `rawSnapshot?: BfisContextSnapshot` - Raw snapshot (optional)

**Errors**:
- Throws on snapshot fetch failure (non-recoverable)
- Returns partial summary on processing errors (recoverable)
- Logs errors with context before throwing/returning

**Tools Available**:
- `get_current_snapshot()` - Fetches current snapshot from SnapshotReader
- `get_snapshot_summary(snapshot)` - Generates tactical summary from snapshot
- `detect_changes(current, previous)` - Compares snapshots for changes

## Commander Agent Interface

**File**: `bfis-service/src/agents/commander-agent.ts`

**Purpose**: Make tactical decisions based on battlefield intelligence.

### Methods

#### `makeDecision(input: CommanderAgentInput): Promise<BfisDecision>`

Makes tactical decision based on Intel summary and mission context.

**Input**: `CommanderAgentInput`
- `intelSummary: TacticalSummary` - Tactical summary (required)
- `changes?: SnapshotDelta` - Optional changes
- `missionContext: MissionContext` - Mission metadata (required)
- `previousDecision?: BfisDecision` - Previous decision (optional)
- `playerIntent?: string` - Player intent for Copilot mode (optional)

**Output**: `Promise<BfisDecision>`
- `decisionId: string` - Unique decision identifier
- `actions: BfisAction[]` - List of actions (1-10, per FR-014)
- `reasoningNotes: string` - Explanation of decision (required per FR-004)
- `timestamp: string` - ISO 8601 timestamp

**Errors**:
- Falls back to rules-based decision-making on LLM failure (per FR-009)
- Rules-based fallback produces conservative defensive actions only
- Fallback timeout: 2 seconds (per SC-006)

**Constraints**:
- Must not produce aggressive actions (attacks) before hostilities begin (per FR-010)
- Maximum 10 actions per decision (configurable, default 10, per FR-014)
- Must include reasoning notes explaining why actions were chosen (per FR-004)

## Writer Agent Interface

**File**: `bfis-service/src/agents/writer-agent.ts`

**Purpose**: Translate decisions into executable Olympus commands.

### Methods

#### `executeCommands(input: WriterAgentInput): Promise<CommandResult[]>`

Translates decision actions into Olympus commands and executes or logs them.

**Input**: `WriterAgentInput`
- `decision: BfisDecision` - Decision from Commander (required)
- `availableCommands: string[]` - Available command mappings

**Output**: `Promise<CommandResult[]>`
- Array of command results, one per action
- Each result contains: `commandHash`, `status`, optional `error`

**Errors**:
- Unknown action types: Log warning, skip action, continue with remaining
- Invalid command parameters: Log error, skip command, continue with remaining
- Command execution failures: Retry once (2 total attempts), then log and continue

**Command Mapping**:
- SPAWN → spawnAircrafts, spawnHelicopters, etc.
- MOVE → setPath, landAt, etc.
- ATTACK → attackUnit, bombPoint, etc.
- Reference: `docs/integration/bfis/bfis_action_command_mapping.md`

**Execution Mode**:
- Logging mode: Translate and log commands, mark as "LOGGED" status
- Execution mode: Translate, validate, execute via Command Adapter (future), track command hashes

## Orchestrator Interface

**File**: `bfis-service/src/agents/orchestrator.ts`

**Purpose**: Coordinate three agents to complete full decision cycles.

### Methods

#### `runCycle(initialState: AgentState): Promise<AgentState>`

Runs a complete decision cycle from snapshot to command execution.

**Input**: `AgentState`
- `currentSnapshot: BfisContextSnapshot | null` - Current snapshot (required)
- `previousSnapshot: BfisContextSnapshot | null` - Previous snapshot (null if first)
- `cycleId: string` - Unique cycle identifier (UUID)
- `cycleStartTime: string` - ISO 8601 timestamp

**Output**: `Promise<AgentState>`
- Complete state after cycle execution
- `cycleEndTime: string` - ISO 8601 timestamp when cycle completed
- All agent outputs populated: `intelOutput`, `decision`, `commandResults`
- `error: AgentError | null` - Error state if any agent failed

**Cycle Flow**:
1. Intel agent: Process snapshot → generate summary + changes
2. Commander agent: Make decision from Intel output
3. Writer agent: Translate decision → execute/log commands
4. Orchestrator: Finalize state, log cycle completion

**Error Handling**:
- Intel errors: Continue with empty intel if recoverable, abort if fatal
- Commander errors: Continue with fallback decision if recoverable, abort if fatal
- Writer errors: Continue with partial command execution if recoverable, abort if fatal

**Constraints**:
- Sequential cycles only (one completes before next starts, per FR-016)
- Cycle timeout: 30 seconds (configurable, default 30s, per FR-013)
- Must log cycle completion with timing and errors (per FR-012)

## Integration Contracts

### SnapshotReader Contract

**Interface**: `SnapshotReader.readContextOnce(): Promise<BfisContextSnapshot>`

**Used By**: Intel agent (via snapshot tools)

**Contract**:
- Returns complete `BfisContextSnapshot` with all context data
- Throws on HTTP errors, decode errors, network timeouts
- Retry logic handled by SnapshotReader (not agents)

### LLM Client Contract

**Interface**: `LLMClient.invoke(prompt: string, options: LLMOptions): Promise<LLMResponse>`

**Used By**: Commander agent (and potentially Intel/Writer for future enhancements)

**Contract**:
- Provider-agnostic LLM calls
- Supports Ollama, LLMstudio (MVP), extensible to OpenAI/Anthropic
- Configuration from `config.ts` (LLM provider, baseUrl, model)
- Graceful degradation: Start in rules-only mode if LLM unavailable

### Command Adapter Contract (Future)

**Interface**: `CommandAdapter.execute(command: OlympusCommand): Promise<CommandResult>`

**Used By**: Writer agent (future implementation)

**Contract**:
- Sends commands via `PUT /olympus` endpoint
- Tracks command hashes and status via `GET /olympus/commands`
- For MVP: Writer may only log commands (logging mode)

### Structured Logger Contract

**Interface**: `StructuredLogger.info/error/warn(event: string, data: object): void`

**Used By**: All agents and orchestrator

**Contract**:
- Structured JSON logging
- Logs written to files under `bfis-service/logs/`
- Event names follow pattern: `bfis-{agent}-{event}` (e.g., `bfis-intel-summary-generated`)

## State Machine Contract

**Framework**: LangGraph (`@langchain/langgraph`)

**State Schema**: `AgentState` (immutable)

**Nodes**:
1. `intelNode` - Intel agent processes snapshot
2. `commanderNode` - Commander agent makes decision
3. `writerNode` - Writer agent maps commands
4. `checkErrorNode` - Error checking after each agent

**Edges**:
- `START → intelNode`
- `intelNode → checkErrorNode`
- `checkErrorNode → commanderNode` (if no error) OR `END` (if fatal error)
- `commanderNode → checkErrorNode`
- `checkErrorNode → writerNode` (if no error) OR `END` (if fatal error)
- `writerNode → checkErrorNode`
- `checkErrorNode → END`

**State Updates**:
- Immutable pattern: Agents return new state objects, not mutations
- LangGraph merges returned state with existing state
- Previous state preserved for error recovery

