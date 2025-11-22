# Research: Multi-Agent LLM Architecture for BFIS

**Date**: 2025-01-27  
**Feature**: Multi-Agent LLM Architecture for BFIS  
**Phase**: Phase 0 - Research & Technology Decisions

## Technology Choices

### Decision: LangGraph for Multi-Agent Orchestration

**Decision**: Use LangGraph (from LangChain.js) for orchestrating the three agents (Intel, Commander, Writer).

**Rationale**:
- Built specifically for multi-agent workflows with state management
- Agents can pass messages/context between each other via immutable state
- Supports tool calling (Intel agent needs snapshot tools)
- Handles conversation loops and decision cycles
- TypeScript support via LangChain.js (aligns with existing BFIS TypeScript codebase)
- Integrates with LLM providers BFIS already supports (Ollama, LLMstudio)
- Error handling and recovery built into state machine pattern

**Alternatives Considered**:
- **AutoGen (Microsoft)**: Designed for multi-agent conversations, supports tool/function calling, has TypeScript bindings. **Rejected**: Less mature TypeScript support, more complex setup, LangGraph better aligned with LangChain ecosystem BFIS already uses.
- **CrewAI**: Role-based agent system, built-in task delegation, supports tools and memory. **Rejected**: Python-first with Node.js integrations (less native), more opinionated framework that may not fit BFIS architecture.
- **Custom state machine**: Build own orchestrator with simple state management. **Rejected**: Would duplicate functionality that LangGraph provides, increases maintenance burden, error handling would be more complex.

**Implementation Notes**:
- Use `@langchain/langgraph` for graph definition
- Use `@langchain/core/tools` for tool registration
- State updates use immutable patterns (return new state objects)
- Follow LangChain.js TypeScript patterns for type safety

### Decision: In-Memory State Management (No Persistent Storage)

**Decision**: Agent state and previous snapshot cache stored in memory only, cleared on session hash changes.

**Rationale**:
- MVP scope explicitly excludes persistent state stores (per spec-004.md)
- Session-based caching sufficient for change detection
- Simplifies deployment (no database setup required)
- Fast access for decision cycles (< 5 second target)
- Session hash changes trigger cache clears (mission resets)

**Alternatives Considered**:
- **Redis cache**: Persistent cache across service restarts. **Rejected**: Adds infrastructure complexity, not required for MVP, session-based caching sufficient.
- **File-based checkpointing**: Save state to disk for recovery. **Rejected**: MVP scope excludes persistent storage, adds I/O overhead, session resets make checkpoints invalid anyway.

**Implementation Notes**:
- Previous snapshot cached in `AgentState.previousSnapshot`
- Cache key: `sessionHash` (ensures cache cleared on mission reset)
- Max cache size: 10 snapshots (FIFO eviction if needed)
- Cache cleared immediately on `sessionHash` change detection

### Decision: Sequential Decision Cycles

**Decision**: Process decision cycles sequentially (one cycle completes before next starts).

**Rationale**:
- Simplifies state management (no race conditions)
- Aligns with polling-based approach (cycles triggered by polling loop)
- 5-second cycle target allows sequential processing without blocking
- Easier to debug and trace (linear execution)
- Prevents conflicting decisions from overlapping cycles

**Alternatives Considered**:
- **Concurrent cycles**: Multiple cycles run in parallel. **Rejected**: Would require complex state synchronization, risk of conflicting commands, harder to debug, no clear benefit given 5-second target.
- **Configurable concurrency**: Allow sequential or concurrent based on config. **Rejected**: Adds complexity without clear use case, sequential sufficient for MVP.

**Implementation Notes**:
- Polling loop triggers orchestrator after snapshot fetch
- Orchestrator blocks until cycle completes
- New cycle requests queued if previous cycle still running
- Cycle timeout: 30 seconds (configurable, default 30s)

### Decision: Rules-Based Fallback with Conservative Actions

**Decision**: When LLM decision-making fails, fall back to rules-based logic producing conservative defensive actions only (protect key assets, no aggressive moves).

**Rationale**:
- Ensures BFIS never fails catastrophically (always produces valid decision)
- Conservative actions minimize risk of harmful decisions
- Aligns with hostility status constraints (no attacks before hostilities)
- Simple to implement and test independently
- Provides graceful degradation when LLM unavailable

**Alternatives Considered**:
- **No-op decision**: Return empty actions with reasoning. **Rejected**: Less useful than defensive actions, doesn't address battlefield imbalances.
- **Last known good decision**: Repeat previous decision. **Rejected**: May be stale, doesn't adapt to current battlefield state.
- **Simple balance restoration**: Spawn units to equalize coalition counts. **Rejected**: Too aggressive, may violate hostility constraints.

**Implementation Notes**:
- Fallback logic in separate rules module (unit-testable)
- Produces actions that: protect BLUE key assets (airbases), spawn defensive units near threats, never attack before hostilities begin
- Fallback triggered on: LLM API failure, LLM response parsing failure, LLM timeout
- Fallback timeout: 2 seconds (per SC-006)

### Decision: Configurable Command Execution Mode

**Decision**: Support both logging-only and live execution modes, configurable at runtime.

**Rationale**:
- Allows safe testing before affecting live battlefield
- Aligns with architecture doc: "For early MVP builds, Writer may only log mapped commands"
- Enables gradual rollout (test with logging, then enable execution)
- Critical for debugging and development

**Alternatives Considered**:
- **Always execute**: Commands always sent to Olympus. **Rejected**: Too risky for MVP, no way to test safely.
- **Always log**: Never execute commands. **Rejected**: Doesn't deliver full value, need execution for production use.

**Implementation Notes**:
- Configuration flag: `commandExecutionMode: "log" | "execute"`
- Logging mode: Translate and log all commands, mark as "LOGGED" status
- Execution mode: Translate, validate, execute via Command Adapter (future), track command hashes
- Default: "log" for MVP, switch to "execute" when ready

### Decision: LLM Provider Abstraction

**Decision**: Use existing LLM client abstraction, support Ollama/LLMstudio for MVP, extensible to OpenAI/Anthropic.

**Rationale**:
- BFIS already has LLM client abstraction (`llm-client.ts`)
- Supports provider-agnostic LLM calls
- MVP supports local LLMs (Ollama, LLMstudio) - no API costs
- Future extensibility to cloud providers (OpenAI, Anthropic) without code changes

**Alternatives Considered**:
- **Direct LLM API calls**: Call Ollama/OpenAI directly from each agent. **Rejected**: Duplicates abstraction, harder to switch providers, violates DRY principle.
- **Single provider only**: Support only Ollama. **Rejected**: Limits flexibility, cloud providers may be needed for better models.

**Implementation Notes**:
- All agents use `LLMClient` from `bfis-service/src/intent/llm-client.ts`
- Configuration from `config.ts` (lines 68-79)
- Agent-specific settings (temperature, max tokens) in agent config
- Graceful degradation: Start in rules-only mode if LLM unavailable at startup

## Integration Patterns

### SnapshotReader Integration

**Pattern**: Intel agent calls `SnapshotReader.readContextOnce()` to fetch current battlefield state.

**Rationale**:
- Reuses existing snapshot infrastructure (spec-001, spec-002)
- No duplication of snapshot fetching logic
- Consistent error handling and retry logic
- Type-safe with `BfisContextSnapshot` interface

**Implementation**:
- Intel agent tools wrap `SnapshotReader.readContextOnce()`
- Returns complete `BfisContextSnapshot` with all context data
- Error handling: Log and propagate to agent error state

### Command Mapping Integration

**Pattern**: Writer agent maps `BfisAction` types to Olympus command names using action-to-command mapping documentation.

**Rationale**:
- Command mapping documented in `bfis_action_command_mapping.md`
- Writer agent translates high-level actions to concrete API calls
- Validation ensures command parameters are correct before execution

**Implementation**:
- Reference: `docs/integration/bfis/bfis_action_command_mapping.md`
- SPAWN → spawnAircrafts, spawnHelicopters, etc.
- MOVE → setPath, landAt, etc.
- ATTACK → attackUnit, bombPoint, etc.
- Unknown actions: Log warning, skip, continue with remaining actions

### Polling Loop Integration

**Pattern**: Orchestrator called from polling loop after snapshot fetch, replaces direct decider calls.

**Rationale**:
- Maintains existing polling infrastructure
- Orchestrator runs full agent cycle with snapshot
- Next poll cycle observes results via updated snapshot (feedback loop)

**Implementation**:
- Polling loop calls `SnapshotReader.readContextOnce()`
- Polling loop builds `AgentState` (including previousSnapshot cache)
- Orchestrator runs multi-agent cycle with that state
- Writer agent executes or logs commands
- Next poll cycle observes results via updated snapshot

## Performance Considerations

### Token Budget Management

**Strategy**: Per-agent token limits with caching to reduce token usage.

**Rationale**:
- Total cycle budget: ~8500 tokens (max), ~6000 average with caching
- Intel agent: ~2500 tokens per cycle (summary generation)
- Commander agent: ~4000 tokens per cycle (decision making)
- Writer agent: ~2000 tokens per cycle (command mapping)

**Optimization**:
- Cache tactical summaries for unchanged snapshots (TTL: 5 seconds)
- Filter large snapshots (> 1000 units) to relevant subsets
- Use structured JSON instead of natural language (fewer tokens)
- Truncate summaries if exceeding limits

### Latency Optimization

**Strategy**: Parallel processing within agents where possible, sequential agent execution.

**Rationale**:
- 5-second target for 95% of cycles
- Snapshot fetch: < 1 second
- Intel processing: < 1 second
- Commander processing: < 2 seconds (LLM call)
- Writer processing: < 1 second

**Optimization**:
- Intel agent: Parallel unit counting and spatial analysis
- Commander agent: Single LLM call (no parallelization needed)
- Writer agent: Parallel command translation (multiple actions)
- Caching reduces redundant processing

## Error Handling Strategy

### Agent Error Propagation

**Pattern**: Errors propagate through `AgentState.error` field, orchestrator checks after each node.

**Rationale**:
- Centralized error state management
- Recoverable vs fatal errors determine cycle continuation
- Errors logged with full context for debugging

**Implementation**:
- Each agent sets `state.error` on failure
- Orchestrator checks `state.error` after each node
- Recoverable errors: Continue with degraded functionality
- Fatal errors: Abort cycle, return partial results

### Retry Strategy

**Pattern**: Command execution retries once (2 total attempts), then log and continue.

**Rationale**:
- Handles transient network errors
- Prevents infinite retry loops
- Balances reliability with responsiveness

**Implementation**:
- Initial attempt + one retry = 2 total attempts
- If retry fails: Log error, mark command as FAILED, continue to next cycle
- No retry for: Invalid parameters, unknown action types, decode errors

## Testing Strategy

### Unit Testing

**Pattern**: Test individual agents with mocked dependencies.

**Rationale**:
- Agents can be tested independently
- Mock LLM responses for deterministic testing
- Mock SnapshotReader for Intel agent tests
- Fast execution, no external dependencies

**Implementation**:
- Intel agent: Mock `SnapshotReader`, test summary generation and change detection
- Commander agent: Mock LLM client, test decision generation and fallback
- Writer agent: Mock command adapter, test command mapping and validation
- All tests in Docker container (per constitution)

### Integration Testing

**Pattern**: Test full orchestrator cycles with mocked LLM and snapshot data.

**Rationale**:
- Validates agent coordination
- Tests error propagation through state machine
- Ensures end-to-end flow correctness

**Implementation**:
- Mock `SnapshotReader` with test fixtures
- Mock LLM client with deterministic responses
- Test full cycle: Intel → Commander → Writer
- Test error scenarios: Agent failures, LLM timeouts, invalid data

